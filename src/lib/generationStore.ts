/**
 * Module-level store for webhook generation state.
 * Survives React component mount/unmount cycles (navigation).
 *
 * Problem: Dashboard keeps szotarGenerating / szabalyokGenerating in useState.
 * When the user navigates away the component unmounts, state + polling refs are
 * lost, and the user can trigger duplicates when they come back.
 *
 * Solution: keep generation flags + polling intervals here, outside React.
 * Dashboard reads/writes through exported helpers and subscribes for re-renders.
 */

import { supabase } from '@/integrations/supabase/client';
import { notifySzotarDataChanged } from '@/lib/szotarEvents';
import { notifyRulesDataChanged } from '@/lib/rulesEvents';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

type Listener = () => void;

// ─── State ───────────────────────────────────────────────────────────────────

let szotarGenerating = false;
let szabalyokGenerating = false;

let szotarPollTimer: ReturnType<typeof setInterval> | null = null;
let rulesPollTimer: ReturnType<typeof setInterval> | null = null;

const listeners = new Set<Listener>();

function notify() {
    listeners.forEach((fn) => fn());
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function isSzotarGenerating() {
    return szotarGenerating;
}

export function isSzabalyokGenerating() {
    return szabalyokGenerating;
}

/** Subscribe; returns unsubscribe fn */
export function subscribeGenerationStore(listener: Listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

// ─── Szótár generation ───────────────────────────────────────────────────────

export async function startSzotarGeneration(
    telephelyId: string,
    companyId: string,
    userId: string,
    refreshSzotar: () => Promise<void>,
    hasSzotar: boolean = false,
) {
    if (szotarGenerating) return; // prevent duplicate
    szotarGenerating = true;
    notify();

    notifySzotarDataChanged();

    try {
        const { data, error } = await supabase.functions.invoke('szotar-webhook', {
            body: {
                telephely_id: telephelyId,
                company_id: companyId,
                user_id: userId,
                regenerate: hasSzotar,
            },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Ismeretlen hiba');
        toast.success('Szótár generálása elindítva!');

        // Start polling (survives navigation)
        if (szotarPollTimer) clearInterval(szotarPollTimer);
        const startedAt = Date.now();

        szotarPollTimer = setInterval(async () => {
            try {
                const { count } = await supabase
                    .from('szotar_kezelesek')
                    .select('id', { count: 'exact', head: true })
                    .eq('telephely_id', telephelyId);

                if ((count || 0) > 0) {
                    if (szotarPollTimer) clearInterval(szotarPollTimer);
                    szotarPollTimer = null;
                    await refreshSzotar();
                    notifySzotarDataChanged();
                    szotarGenerating = false;
                    notify();
                    toast.success('Szótár sikeresen generálva!');

                    // Trigger embeddings in background
                    supabase.functions
                        .invoke('generate-szotar-embeddings', {
                            body: { telephely_id: telephelyId },
                        })
                        .catch(() => { });
                }

                if (Date.now() - startedAt > 180_000) {
                    if (szotarPollTimer) clearInterval(szotarPollTimer);
                    szotarPollTimer = null;
                    szotarGenerating = false;
                    notify();
                    toast.info('A szótár generálása még folyamatban van. Kérjük várjon.');
                }
            } catch {
                // ignore poll errors
            }
        }, 3000);
    } catch (err: any) {
        console.error('Szotar generation error:', err);
        toast.error(err.message || 'Hiba a szótár generálásakor');
        szotarGenerating = false;
        notify();
    }
}

// ─── Szabályok generation ────────────────────────────────────────────────────

export async function startSzabalyokGeneration(
    telephelyId: string,
    userId: string,
    isRegenerate: boolean,
    onRulesCreated: () => void,
) {
    if (szabalyokGenerating) return; // prevent duplicate
    szabalyokGenerating = true;
    notify();

    try {
        const { data, error } = await supabase.functions.invoke('szotar-rules-webhook', {
            body: {
                telephely_id: telephelyId,
                user_id: userId,
                regenerate: isRegenerate,
            },
        });
        if (error) throw new Error(error.message || 'Edge function error');

        if (data?.ok && data.status === 'started' && data.batch_id) {
            toast.success(
                isRegenerate
                    ? 'Szabályok újragenerálása elindult!'
                    : 'Szabályok generálása elindult!',
            );

            // Poll rule_generation_jobs by batch_id (survives navigation)
            if (rulesPollTimer) clearInterval(rulesPollTimer);
            let pollCount = 0;

            rulesPollTimer = setInterval(async () => {
                pollCount++;
                try {
                    const { data: jobs } = await supabase
                        .from('rule_generation_jobs')
                        .select('status')
                        .eq('batch_id', data.batch_id);

                    if (jobs && jobs.length > 0) {
                        const completed = jobs.filter(
                            (j: { status: string }) => j.status === 'completed',
                        ).length;
                        const errors = jobs.filter(
                            (j: { status: string }) => j.status === 'error',
                        ).length;
                        const total = jobs.length;
                        const done = completed + errors;

                        if (done >= total) {
                            if (rulesPollTimer) clearInterval(rulesPollTimer);
                            rulesPollTimer = null;
                            szabalyokGenerating = false;
                            notify();

                            if (completed > 0) {
                                onRulesCreated();
                                notifyRulesDataChanged();
                                toast.success(
                                    `Szabályok generálva! ${completed}/${total} sikeres${errors > 0 ? `, ${errors} hibás` : ''}`,
                                );
                            } else {
                                toast.error(`Minden protokoll hibás (${errors}/${total})`);
                            }
                            return;
                        }
                    }

                    if (pollCount >= 100) {
                        if (rulesPollTimer) clearInterval(rulesPollTimer);
                        rulesPollTimer = null;
                        szabalyokGenerating = false;
                        notify();
                        onRulesCreated();
                        notifyRulesDataChanged();
                        toast.info('Generálás időtúllépés — ellenőrizze az eredményt');
                    }
                } catch {
                    // ignore polling errors
                }
            }, 3000);
            return;
        } else if (data?.ok) {
            toast.success('Kérés elküldve feldolgozásra');
            szabalyokGenerating = false;
            notify();
            return;
        } else {
            toast.error(data?.message || 'Hiba a szabályok generálásakor');
            szabalyokGenerating = false;
            notify();
        }
    } catch (err: any) {
        console.error('Error generating rules:', err);
        toast.error(err.message || 'Hiba a szabályok generálásakor');
        szabalyokGenerating = false;
        notify();
    }
}
