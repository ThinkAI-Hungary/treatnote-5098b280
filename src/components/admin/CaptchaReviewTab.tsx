import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
    Loader2, CheckCircle2, Clock, ChevronLeft, ChevronRight, Save,
    Brain, ChevronDown, ChevronUp, AlertTriangle, BookOpen, RefreshCw, Dumbbell, SkipForward, X,
} from 'lucide-react';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { cn } from '@/lib/utils';

const OPENAI_API_KEY = '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';
const OPENAI_MODEL = 'gpt-4.1';

// ── Module-level analysis state (survives navigation) ─────────────────────────
type AnalyzeProgress = { done: number; total: number } | null;
const _analysis = {
    running: false,
    progress: null as AnalyzeProgress,
    abort: false,
    listeners: new Set<() => void>(),
    notify() { this.listeners.forEach(fn => fn()); },
    subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};

interface CaptchaVector {
    id: string;
    created_at: string;
    domain: string;
    session_id: string;
    attempt_round: number;
    challenge_text: string;
    challenge_type: string | null;
    grid_size: number;
    grid_screenshot_url: string | null;
    ai_phase1_tiles: number[] | null;
    ai_phase2_tiles: number[] | null;
    ai_final_tiles: number[];
    human_tiles: number[] | null;
    reviewed_at: string | null;
    ai_error_analysis: string | null;
    analysis_done_at: string | null;
}

interface CaptchaLesson {
    id: string;
    category: string;
    grid_size: number;
    lesson_rules: string;
    source_count: number;
    updated_at: string;
}

// ── Grid Reviewer Modal ──────────────────────────────────────────────────────

function GridReviewer({
    entry,
    onSave,
    onClose,
}: {
    entry: CaptchaVector;
    onSave: (id: string, humanTiles: number[]) => Promise<void>;
    onClose: () => void;
}) {
    const [humanTiles, setHumanTiles] = useState<Set<number>>(
        new Set(entry.human_tiles ?? [])
    );
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [imgError, setImgError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const gridCols = entry.grid_size === 9 ? 3 : 4;
    const gridRows = gridCols;
    const aiSet = new Set(entry.ai_final_tiles);

    useEffect(() => {
        if (!entry.grid_screenshot_url) { setImgError('Nincs screenshot'); return; }
        const path = entry.grid_screenshot_url.includes('/captcha-grids/')
            ? entry.grid_screenshot_url.split('/captcha-grids/')[1]?.split('?')[0]
            : null;
        if (!path) { setImgUrl(entry.grid_screenshot_url); return; }
        supabase.storage.from('captcha-grids').createSignedUrl(path, 3600).then(({ data, error }) => {
            if (error || !data?.signedUrl) {
                setImgUrl(entry.grid_screenshot_url);
                console.warn('createSignedUrl error:', error?.message);
            } else {
                setImgUrl(data.signedUrl);
            }
        });
    }, [entry.grid_screenshot_url]);

    const toggleTile = (tile: number) => {
        setHumanTiles(prev => {
            const next = new Set(prev);
            next.has(tile) ? next.delete(tile) : next.add(tile);
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        await onSave(entry.id, Array.from(humanTiles).sort((a, b) => a - b));
        setSaving(false);
    };

    const aiOnly = [...aiSet].filter(t => !humanTiles.has(t));
    const humanOnly = [...humanTiles].filter(t => !aiSet.has(t));
    const bothAgree = [...aiSet].filter(t => humanTiles.has(t));

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-primary/20 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-primary/10 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">
                            {entry.domain} · Round {entry.attempt_round} · {entry.grid_size === 9 ? '3×3' : '4×4'} grid · {entry.challenge_type}
                        </p>
                        <h3 className="font-semibold text-foreground">{entry.challenge_text}</h3>
                    </div>
                    <Button size="sm" variant="ghost" onClick={onClose} className="shrink-0">✕</Button>
                </div>

                <div className="p-4">
                    {imgUrl && !imgError ? (
                        <div className="relative aspect-square w-full max-w-sm mx-auto rounded-lg overflow-hidden border border-primary/20">
                            <img src={imgUrl} alt="CAPTCHA grid" className="w-full h-full object-cover" onError={() => setImgError('Kép betöltési hiba')} />
                            <div
                                className="absolute inset-0"
                                style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gridTemplateRows: `repeat(${gridRows}, 1fr)` }}
                            >
                                {Array.from({ length: entry.grid_size }, (_, i) => {
                                    const tile = i + 1;
                                    const isAI = aiSet.has(tile);
                                    const isHuman = humanTiles.has(tile);
                                    return (
                                        <button
                                            key={tile}
                                            onClick={() => toggleTile(tile)}
                                            className={cn(
                                                "border transition-all duration-150 flex items-end justify-start p-0.5 text-xs font-bold cursor-pointer",
                                                isHuman && isAI && "border-green-400/80 bg-green-500/25",
                                                isHuman && !isAI && "border-blue-400/80 bg-blue-500/25",
                                                !isHuman && isAI && "border-orange-400/80 bg-orange-500/15",
                                                !isHuman && !isAI && "border-white/10 hover:border-white/30 bg-transparent",
                                            )}
                                        >
                                            {isHuman && (
                                                <span className={cn("rounded px-0.5 leading-none", isAI ? "text-green-300 bg-green-900/60" : "text-blue-300 bg-blue-900/60")}>
                                                    {tile}
                                                </span>
                                            )}
                                            {!isHuman && isAI && (
                                                <span className="text-orange-300 bg-orange-900/60 rounded px-0.5 leading-none opacity-70">{tile}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : imgError ? (
                        <div className="aspect-square max-w-sm mx-auto rounded-lg bg-muted/30 flex flex-col items-center justify-center gap-2 border border-primary/10">
                            <span className="text-2xl">🖼️</span>
                            <p className="text-xs text-muted-foreground">{imgError}</p>
                        </div>
                    ) : (
                        <div className="aspect-square max-w-sm mx-auto rounded-lg bg-muted/30 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    )}
                </div>

                <div className="px-4 pb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500/40 border border-green-400/60 inline-block" /> AI + Te egyezik ({bothAgree.length})</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-500/20 border border-orange-400/50 inline-block" /> Csak AI ({aiOnly.length})</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500/25 border border-blue-400/60 inline-block" /> Csak Te ({humanOnly.length})</span>
                </div>

                <div className="px-4 pb-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/20 rounded-lg p-2">
                        <p className="text-muted-foreground mb-1">AI végső kiválasztás</p>
                        <p className="font-mono text-foreground">[{entry.ai_final_tiles.join(', ')}]</p>
                    </div>
                    <div className="bg-muted/20 rounded-lg p-2">
                        <p className="text-muted-foreground mb-1">Te most</p>
                        <p className="font-mono text-foreground">[{Array.from(humanTiles).sort((a, b) => a - b).join(', ')}]</p>
                    </div>
                </div>

                {entry.ai_error_analysis && (
                    <div className="mx-4 mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/80">
                        <p className="font-semibold text-amber-300 mb-1 flex items-center gap-1"><Brain className="w-3 h-3" /> AI Elemzés</p>
                        <p className="leading-relaxed">{entry.ai_error_analysis}</p>
                    </div>
                )}

                <div className="p-4 border-t border-primary/10 flex justify-between gap-3">
                    <Button variant="outline" size="sm" onClick={onClose} className="border-primary/20">Mégse</Button>
                    <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Mentés
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── Trainer Mode ─────────────────────────────────────────────────────────────

type TrainerMode = 'db' | 'live';

interface LiveEntry {
    id: string;
    challenge_text: string;
    challenge_type: string;
    grid_size: number;
    signed_url: string;
    ai_tiles?: number[];
    error?: string;
}

function CaptchaTrainer({ onClose }: { onClose: () => void }) {
    const [mode, setMode] = useState<TrainerMode>('live');
    const [feederOk, setFeederOk] = useState<boolean | null>(null);
    const [captureType, setCaptureType] = useState<'any' | 'single_image' | 'multi_image'>('any');
    const [aiMode, setAiMode] = useState(false);
    const [aiScore, setAiScore] = useState({ correct: 0, total: 0 });

    // DB mode state
    const [queue, setQueue] = useState<CaptchaVector[]>([]);
    const [dbIdx, setDbIdx] = useState(0);
    const [dbDone, setDbDone] = useState(0);
    const [dbLoading, setDbLoading] = useState(false);

    // Live mode state
    const [liveEntry, setLiveEntry] = useState<LiveEntry | null>(null);
    const [liveFetching, setLiveFetching] = useState(false);
    const [liveError, setLiveError] = useState<string | null>(null);
    const [liveDone, setLiveDone] = useState(0);

    // Shared state
    const [selectedTiles, setSelectedTiles] = useState<Set<number>>(new Set());
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const gridSize = mode === 'live' ? (liveEntry?.grid_size ?? 16) : (queue[dbIdx]?.grid_size ?? 16);
    const gridCols = gridSize === 9 ? 3 : 4;
    const challengeText = mode === 'live' ? (liveEntry?.challenge_text ?? '') : (queue[dbIdx]?.challenge_text ?? '');

    // Check feeder server on mount
    useEffect(() => {
        fetch('/captcha-feeder/status', { method: 'POST' })
            .then(r => { setFeederOk(r.ok); })
            .catch(() => { setFeederOk(false); });
    }, []);

    // Load DB queue
    useEffect(() => {
        if (mode !== 'db') return;
        setDbLoading(true);
        supabase.from('captcha_vector').select('*')
            .is('reviewed_at', null)
            .order('created_at', { ascending: true })
            .limit(200)
            .then(({ data }) => {
                setQueue((data as CaptchaVector[]) || []);
                setDbLoading(false);
            });
    }, [mode]);

    // Fetch live CAPTCHA from feeder (optionally with AI solve)
    const fetchLive = async (type?: string) => {
        setLiveFetching(true);
        setLiveError(null);
        setSelectedTiles(new Set());
        setImgUrl(null);
        try {
            const body: Record<string, string> = {};
            const t = type ?? captureType;
            if (t !== 'any') body.type = t;
            const endpoint = aiMode ? '/captcha-feeder/ai-capture' : '/captcha-feeder/capture';
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!resp.ok) throw new Error(`Feeder error: ${resp.status}`);
            const data: LiveEntry = await resp.json();
            if (data.error) throw new Error(data.error as string);
            setLiveEntry(data);
            setImgUrl(data.signed_url);
            // In AI mode, user starts fresh (AI tiles shown separately in orange)
            setSelectedTiles(new Set());
        } catch (e) {
            setLiveError(String(e));
        } finally {
            setLiveFetching(false);
        }
    };

    // Load DB image when entry changes
    useEffect(() => {
        if (mode !== 'db') return;
        setSelectedTiles(new Set());
        setImgUrl(null);
        const current = queue[dbIdx];
        if (!current?.grid_screenshot_url) return;
        const path = current.grid_screenshot_url.includes('/captcha-grids/')
            ? current.grid_screenshot_url.split('/captcha-grids/')[1]?.split('?')[0]
            : null;
        if (!path) { setImgUrl(current.grid_screenshot_url); return; }
        supabase.storage.from('captcha-grids').createSignedUrl(path, 3600).then(({ data }) => {
            setImgUrl(data?.signedUrl ?? current.grid_screenshot_url);
        });
    }, [mode, dbIdx, queue]);

    // Auto-fetch when switching to live mode, changing type, or toggling AI mode
    useEffect(() => {
        if (mode === 'live' && !liveFetching && feederOk) fetchLive(captureType !== 'any' ? captureType : undefined);
    }, [mode, feederOk, captureType, aiMode]);

    const toggleTile = (tile: number) =>
        setSelectedTiles(prev => { const n = new Set(prev); n.has(tile) ? n.delete(tile) : n.add(tile); return n; });

    const handleSave = async () => {
        setSaving(true);
        const tiles = Array.from(selectedTiles).sort((a, b) => a - b);
        const id = mode === 'live' ? liveEntry?.id : queue[dbIdx]?.id;
        if (id) {
            await supabase.from('captcha_vector').update({
                human_tiles: tiles,
                reviewed_at: new Date().toISOString(),
            }).eq('id', id);
        }
        // Track AI score in AI test mode
        if (mode === 'live' && aiMode && liveEntry?.ai_tiles) {
            const aiSet = new Set(liveEntry.ai_tiles);
            const humanSet = new Set(tiles);
            const isCorrect = aiSet.size === humanSet.size &&
                liveEntry.ai_tiles.every(t => humanSet.has(t));
            setAiScore(s => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));
        }
        setSaving(false);
        if (mode === 'live') { setLiveDone(d => d + 1); fetchLive(); }
        else { setDbDone(d => d + 1); setDbIdx(i => i + 1); }
        toast.success('Mentve!');
    };

    const handleSkip = () => {
        if (mode === 'live') fetchLive();
        else setDbIdx(i => i + 1);
    };

    // Keyboard shortcuts
    useEffect(() => {
        const fn = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !saving && !liveFetching) handleSave();
            if (e.key === 'ArrowRight' && !liveFetching) handleSkip();
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    });

    const dbCurrent = queue[dbIdx];
    const dbTotal = queue.length;
    const isLoading = mode === 'live' ? liveFetching : dbLoading;
    const isDone = mode === 'db' && (!dbCurrent || dbIdx >= dbTotal);

    if (isDone) return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4">
            <CheckCircle2 className="w-12 h-12 text-green-400" />
            <h2 className="text-xl font-semibold">Kész! {dbDone} bejegyzés mentve.</h2>
            <p className="text-muted-foreground text-sm">Nincs több felülvizsgálandó bejegyzés.</p>
            <Button onClick={onClose} className="mt-2">Visszatérés</Button>
        </div>
    );

    const progress = mode === 'db' ? Math.round((dbIdx / Math.max(dbTotal, 1)) * 100) : 0;

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-primary/10 shrink-0">
                <div className="flex items-center gap-3">
                    <Dumbbell className="w-5 h-5 text-green-400" />
                    <span className="font-semibold text-foreground">CAPTCHA Edző mód</span>
                    {mode === 'db' && <span className="text-sm text-muted-foreground">{dbIdx + 1} / {dbTotal}</span>}
                    {mode === 'live' && <span className="text-sm text-green-400">{liveDone} mentve</span>}
                    {mode === 'live' && aiMode && aiScore.total > 0 && (
                        <span className={cn(
                            "text-xs font-mono px-2 py-0.5 rounded-full",
                            aiScore.correct / aiScore.total >= 0.7 ? "bg-green-500/20 text-green-300" : "bg-orange-500/20 text-orange-300"
                        )}>
                            AI: {aiScore.correct}/{aiScore.total} helyes ({Math.round(aiScore.correct / aiScore.total * 100)}%)
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* Mode toggle */}
                    <div className="flex rounded-lg border border-primary/20 overflow-hidden text-xs">
                        <button
                            onClick={() => setMode('db')}
                            className={cn("px-3 py-1.5 transition-colors", mode === 'db' ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            DB mód
                        </button>
                        <button
                            onClick={() => setMode('live')}
                            className={cn("px-3 py-1.5 transition-colors flex items-center gap-1", mode === 'live' ? "bg-green-500/20 text-green-300" : "text-muted-foreground hover:text-foreground")}
                        >
                            <span className={cn("w-1.5 h-1.5 rounded-full", feederOk ? "bg-green-400" : feederOk === false ? "bg-red-400" : "bg-yellow-400")} />
                            Live Google
                        </button>
                    </div>
                    {/* Challenge type + AI mode (live mode only) */}
                    {mode === 'live' && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="flex rounded-lg border border-primary/20 overflow-hidden text-xs">
                                {(['any', 'multi_image', 'single_image'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setCaptureType(t)}
                                        className={cn(
                                            "px-2.5 py-1.5 transition-colors",
                                            captureType === t ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {t === 'any' ? 'Bármely' : t === 'multi_image' ? 'Multi 3×3' : 'Egy kép 4×4'}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => { setAiMode(m => !m); setAiScore({ correct: 0, total: 0 }); }}
                                className={cn(
                                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors",
                                    aiMode ? "border-orange-400/50 bg-orange-500/20 text-orange-300" : "border-primary/20 text-muted-foreground hover:text-foreground"
                                )}
                            >
                                🤖 AI Test
                            </button>
                        </div>
                    )}
                    <span className="text-xs text-muted-foreground hidden sm:block">Enter=Mentés · →=Tovább · Esc=Kilép</span>
                    <Button size="sm" variant="ghost" onClick={onClose}><X className="w-4 h-4" /></Button>
                </div>
            </div>

            {/* Progress bar (DB mode only) */}
            {mode === 'db' && (
                <div className="h-1 bg-muted shrink-0">
                    <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
            )}

            {/* Feeder error banner */}
            {mode === 'live' && feederOk === false && (
                <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Feeder szerver nem fut. Indítsd el: <code className="font-mono bg-red-900/30 px-1 rounded">python scripts/captcha_feeder.py</code>
                </div>
            )}

            {/* Challenge info */}
            {challengeText && (
                <div className="px-4 py-2 bg-muted/20 border-b border-primary/5 shrink-0">
                    {mode === 'db' && dbCurrent && (
                        <p className="text-xs text-muted-foreground">Round {dbCurrent.attempt_round} · {dbCurrent.domain} · {dbCurrent.grid_size === 9 ? '3×3' : '4×4'}</p>
                    )}
                    {mode === 'live' && liveEntry && (
                        <p className="text-xs text-muted-foreground">Google demo · {liveEntry.grid_size === 9 ? '3×3' : '4×4'} · {liveEntry.challenge_type}</p>
                    )}
                    <p className="text-sm font-medium text-foreground">{challengeText}</p>
                </div>
            )}

            {/* Live error */}
            {mode === 'live' && liveError && !liveFetching && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-red-300">
                    <AlertTriangle className="w-8 h-8" />
                    <p className="text-sm">{liveError}</p>
                    <Button onClick={() => fetchLive()} variant="outline" size="sm">Újra próbál</Button>
                </div>
            )}

            {/* Main grid */}
            {(!liveError || liveFetching) && (
                <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                    <div className="flex flex-col items-center gap-4 w-full max-w-lg">
                        <div className="relative aspect-square w-full max-w-md rounded-xl overflow-hidden border-2 border-primary/20 shadow-2xl">
                            {isLoading ? (
                                <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                    {mode === 'live' && <p className="text-xs text-muted-foreground">CAPTCHA betöltése Google demóból...</p>}
                                </div>
                            ) : imgUrl ? (
                                <img src={imgUrl} alt="CAPTCHA grid" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-muted/30 flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                </div>
                            )}
                            {/* Tile overlay */}
                            {!isLoading && imgUrl && (
                                <div
                                    className="absolute inset-0"
                                    style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gridTemplateRows: `repeat(${gridCols}, 1fr)` }}
                                >
                                    {Array.from({ length: gridSize }, (_, i) => {
                                        const tile = i + 1;
                                        const userSel = selectedTiles.has(tile);
                                        const aiSel = aiMode && (liveEntry?.ai_tiles ?? []).includes(tile);
                                        return (
                                            <button
                                                key={tile}
                                                onClick={() => toggleTile(tile)}
                                                className={cn(
                                                    "border-2 transition-all duration-100 flex items-center justify-center text-lg font-bold select-none relative",
                                                    aiSel && userSel
                                                        ? "border-teal-400 bg-teal-500/40 text-teal-100"   // Both agree
                                                        : aiSel
                                                            ? "border-orange-400 bg-orange-500/40 text-orange-100" // AI only
                                                            : userSel
                                                                ? "border-green-400 bg-green-500/40 text-green-100"  // User only
                                                                : "border-white/10 hover:border-white/40 bg-transparent text-white/0 hover:text-white/40",
                                                )}
                                            >
                                                {tile}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Legend + tile info */}
                        <div className="text-center space-y-1">
                            {aiMode && (
                                <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-orange-400 bg-orange-500/40 inline-block" />AI</span>
                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-green-400 bg-green-500/40 inline-block" />Te</span>
                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-teal-400 bg-teal-500/40 inline-block" />Egyez</span>
                                </div>
                            )}
                            {aiMode && liveEntry?.ai_tiles && (
                                <p className="font-mono text-xs text-orange-300">
                                    AI: [{(liveEntry.ai_tiles).join(', ')}]
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">Az én válaszom</p>
                            <p className="font-mono text-sm text-foreground">
                                {selectedTiles.size > 0
                                    ? `[${Array.from(selectedTiles).sort((a, b) => a - b).join(', ')}]`
                                    : '(semmi — Átugrás ha nincs objektum)'}
                            </p>
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3 w-full max-w-xs">
                            <Button
                                variant="outline"
                                className="flex-1 border-primary/20 gap-2"
                                onClick={handleSkip}
                                disabled={isLoading}
                            >
                                <SkipForward className="w-4 h-4" />Átugrás
                            </Button>
                            <Button
                                className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                                onClick={handleSave}
                                disabled={saving || isLoading}
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Mentés
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


export function CaptchaReviewTab() {
    const [entries, setEntries] = useState<CaptchaVector[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<CaptchaVector | null>(null);
    const [showReviewed, setShowReviewed] = useState(false);
    const [page, setPage] = useState(0);
    // Read analysis state from module-level singleton (survives navigation)
    const [analyzing, setAnalyzingLocal] = useState(_analysis.running);
    const [analyzeProgress, setAnalyzeProgressLocal] = useState<AnalyzeProgress>(_analysis.progress);
    const [expandedAnalysis, setExpandedAnalysis] = useState<Set<string>>(new Set());
    const [synthesizing, setSynthesizing] = useState(false);
    const [lessons, setLessons] = useState<CaptchaLesson[]>([]);
    const [showLessons, setShowLessons] = useState(false);
    const [trainerMode, setTrainerMode] = useState(false);
    const PAGE_SIZE = 20;

    // Subscribe to analysis singleton updates
    useEffect(() => {
        return _analysis.subscribe(() => {
            setAnalyzingLocal(_analysis.running);
            setAnalyzeProgressLocal(_analysis.progress);
        });
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        const query = supabase
            .from('captcha_vector')
            .select('*')
            .order('created_at', { ascending: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (!showReviewed) query.is('reviewed_at', null);

        const { data, error } = await query;
        if (error) { toast.error(`Betöltési hiba: ${error.message}`); }
        else { setEntries((data as CaptchaVector[]) || []); }
        setLoading(false);
    }, [page, showReviewed]);

    useEffect(() => { load(); }, [load]);

    const handleSave = async (id: string, humanTiles: number[]) => {
        const { error } = await supabase
            .from('captcha_vector')
            .update({ human_tiles: humanTiles, reviewed_at: new Date().toISOString() })
            .eq('id', id);
        if (error) { toast.error(`Mentési hiba: ${error.message}`); }
        else { toast.success('Elmentve!'); setSelected(null); load(); }
    };

    // ── Semantic Analysis ──────────────────────────────────────────────────
    const getImageBase64 = async (entry: CaptchaVector): Promise<string | null> => {
        if (!entry.grid_screenshot_url) return null;
        try {
            const path = entry.grid_screenshot_url.includes('/captcha-grids/')
                ? entry.grid_screenshot_url.split('/captcha-grids/')[1]?.split('?')[0]
                : null;
            let url = entry.grid_screenshot_url;
            if (path) {
                const { data } = await supabase.storage.from('captcha-grids').createSignedUrl(path, 300);
                if (data?.signedUrl) url = data.signedUrl;
            }
            const resp = await fetch(url);
            if (!resp.ok) return null;
            const blob = await resp.blob();
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.readAsDataURL(blob);
            });
        } catch { return null; }
    };

    const analyzeEntry = async (entry: CaptchaVector): Promise<string | null> => {
        const b64 = await getImageBase64(entry);
        if (!b64) return 'Kép nem érhető el az elemzéshez.';

        const isSingleImage = !!(entry.challenge_type === 'single_image' || (!entry.challenge_type && entry.grid_size === 16));
        const gridLabel = entry.grid_size === 9 ? '3×3 (9 tiles)' : '4×4 (16 tiles)';
        const aiTiles = entry.ai_final_tiles ?? [];
        const humanTiles = entry.human_tiles ?? [];
        const falsePos = aiTiles.filter(t => !humanTiles.includes(t));
        const falseNeg = humanTiles.filter(t => !aiTiles.includes(t));
        const correct = aiTiles.filter(t => humanTiles.includes(t));
        const noAiData = aiTiles.length === 0;

        let prompt: string;

        if (isSingleImage) {
            // ── 4×4 single-image: one large photo chopped into 16 tiles ──────────
            prompt = `You are a reCAPTCHA tile expert. This is a 4×4 grid where ONE large photograph is physically split into 16 tiles.
Tiles are numbered 1–16 left-to-right, top-to-bottom (row 1: tiles 1–4, row 2: 5–8, row 3: 9–12, row 4: 13–16).

Challenge: "${entry.challenge_text}"
${noAiData
                    ? `Correct tiles (human-verified): [${humanTiles.join(', ')}]
No AI guess was made. Analyze what makes each correct tile contain the target.`
                    : `AI selected: [${aiTiles.join(', ')}]
Correct (human): [${humanTiles.join(', ')}]
AI got right: [${correct.join(', ')}]
AI false positives (selected wrong): [${falsePos.join(', ')}]
AI missed: [${falseNeg.join(', ')}]`}

KEY CONTEXT: The object may span multiple adjacent tiles as PARTIAL VIEWS. A tile should be selected if ANY recognizable part of the target is present, even partially at the edge.

Examine the image and respond in this EXACT format (no prose):
${noAiData ? `CORRECT: tile N = [what specific part of the object is visible]
CORRECT: tile N = ...
NON-TARGET: [1-2 visual elements present in non-selected tiles that could cause confusion]
RULE: [concrete visual decision rule for this challenge]
RULE: [another rule]` :
                    `${falsePos.length > 0 ? 'FALSE_POS: tile N = [what was confused with target — be specific about shape/color/texture]' : ''}
${falseNeg.length > 0 ? 'MISSED: tile N = [what part of the target is visible in this tile — be specific]' : ''}
RULE: [concrete visual rule to prevent this error in future]
RULE: [another rule]`}

Max 180 words. Be specific about visible shapes, colors, positions within each tile, not generic.`;
        } else {
            // ── 3×3 multi-image: 9 separate full photos ──────────────────────────
            prompt = `You are a reCAPTCHA expert. This is a 3×3 grid where each tile is a SEPARATE full photograph.
Tiles numbered 1–9 left-to-right, top-to-bottom.

Challenge: "${entry.challenge_text}"
${noAiData
                    ? `Correct tiles (human-verified): [${humanTiles.join(', ')}]
Describe what makes each correct tile recognizable and what misleads in incorrect tiles.`
                    : `AI selected: [${aiTiles.join(', ')}] | Correct: [${humanTiles.join(', ')}]
False positives: [${falsePos.join(', ')}] | Missed: [${falseNeg.join(', ')}]`}
${!noAiData ? `
For false positives [${falsePos.join(', ')}]: what does the scene contain that resembles the target but isn't it? (angle, partial, similar object)
For missed tiles [${falseNeg.join(', ')}]: what makes the target hard to detect? (small, obscured, unusual angle, low contrast)` :
                    `For each correct tile [${humanTiles.join(', ')}]: what visual features make it clearly contain the target?
For non-target tiles: what common confusing elements appear?`}

Format (no prose):
FINDING: tile N = [specific observation about what's in the tile scene]
RULE: [one concrete visual decision rule]
Max 150 words.`;
        }

        try {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: OPENAI_MODEL,
                    max_tokens: 400,
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' } },
                        ],
                    }],
                }),
            });
            const json = await resp.json();
            return json.choices?.[0]?.message?.content?.trim() ?? null;
        } catch (e) {
            return `Elemzési hiba: ${String(e).slice(0, 100)}`;
        }
    };

    const runAnalysis = async () => {
        if (_analysis.running) return;  // already running
        // Fetch all records that have human review but no analysis yet
        const { data, error } = await supabase
            .from('captcha_vector')
            .select('*')
            .not('reviewed_at', 'is', null)
            .is('ai_error_analysis', null)
            .order('created_at', { ascending: true });

        if (error) { toast.error('Lekérdezési hiba'); return; }
        if (!data?.length) { toast.info('Nincs elemzendő bejegyzés (már mind elemzett, vagy nincs felülvizsgált)'); return; }

        _analysis.running = true;
        _analysis.abort = false;
        _analysis.progress = { done: 0, total: data.length };
        _analysis.notify();

        for (let i = 0; i < data.length; i++) {
            if (_analysis.abort) break;
            const entry = data[i] as CaptchaVector;
            const analysis = await analyzeEntry(entry);
            if (analysis) {
                await supabase
                    .from('captcha_vector')
                    .update({ ai_error_analysis: analysis, analysis_done_at: new Date().toISOString() })
                    .eq('id', entry.id);
            }
            _analysis.progress = { done: i + 1, total: data.length };
            _analysis.notify();
        }

        _analysis.running = false;
        _analysis.progress = null;
        _analysis.notify();
        toast.success('Elemzés kész!');
        load();
    };

    const toggleAnalysis = (id: string) => {
        setExpandedAnalysis(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' });

    // ── Category Extractor ─────────────────────────────────────────────────
    const extractCategory = (challengeText: string): string | null => {
        const m = challengeText.match(/with\s+([a-zA-Z\s]+?)(?:\s+[Ii]f|\s+that|$)/);
        return m ? m[1].trim().toLowerCase() : null;
    };

    // ── Load captcha_lessons ───────────────────────────────────────────────
    const loadLessons = async () => {
        const { data, error } = await supabase
            .from('captcha_lessons')
            .select('*')
            .order('category');
        if (!error && data) setLessons(data as CaptchaLesson[]);
    };

    // ── Synthesis ──────────────────────────────────────────────────────────
    const runSynthesis = async () => {
        setSynthesizing(true);
        try {
            // 1. Fetch all reviewed+analyzed entries including tile vectors and type
            const { data, error } = await supabase
                .from('captcha_vector')
                .select('challenge_text, challenge_type, grid_size, ai_error_analysis, ai_final_tiles, human_tiles')
                .not('reviewed_at', 'is', null)
                .not('ai_error_analysis', 'is', null);

            if (error || !data?.length) {
                toast.error('Nincs elemezhető adat a szintézishez.');
                return;
            }

            // 2. Group by (category, grid_size)
            type GroupKey = string;
            const groups: Record<GroupKey, {
                category: string;
                grid_size: number;
                challenge_type: string;
                analyses: string[];
                accuracy: number[];
            }> = {};

            for (const row of data) {
                const cat = extractCategory(row.challenge_text);
                if (!cat) continue;
                const key = `${cat}|${row.grid_size}`;
                const ai: number[] = (row.ai_final_tiles as number[]) ?? [];
                const human: number[] = (row.human_tiles as number[]) ?? [];
                // Compute Jaccard accuracy for this entry
                const union = new Set([...ai, ...human]).size;
                const intersection = ai.filter((t: number) => human.includes(t)).length;
                const acc = union > 0 ? intersection / union : (ai.length === 0 && human.length === 0 ? 1 : 0);

                if (!groups[key]) groups[key] = {
                    category: cat,
                    grid_size: row.grid_size,
                    challenge_type: row.challenge_type ?? (row.grid_size === 16 ? 'single_image' : 'multi_image'),
                    analyses: [],
                    accuracy: [],
                };
                groups[key].analyses.push(row.ai_error_analysis as string);
                groups[key].accuracy.push(acc);
            }

            const groupList = Object.values(groups);
            if (!groupList.length) { toast.error('Nem találtam kategóriákat.'); return; }

            toast.info(`${groupList.length} kategória szintézise folyamatban...`);

            // 3. For each group, call GPT to synthesize
            for (const group of groupList) {
                const { category, grid_size, challenge_type, analyses, accuracy } = group;
                const isSingleImage = challenge_type === 'single_image' || grid_size === 16;
                const gridLabel = grid_size === 9 ? '3×3 grid (9 separate photos)' : '4×4 grid (ONE photo split into 16 tiles)';
                const avgAcc = accuracy.length ? Math.round(accuracy.reduce((a, b) => a + b, 0) / accuracy.length * 100) : 0;

                const synthesisPrompt = `You are writing a VISUAL SOLVER GUIDE for an AI that identifies "${category}" in reCAPTCHA challenges.
Grid type: ${gridLabel}
Based on ${analyses.length} human-reviewed examples. Average AI accuracy so far: ${avgAcc}%.

PRODUCE THIS EXACT STRUCTURE — no intro sentences, no prose:

✅ SELECT TILE IF YOU SEE:
- [Specific visual feature that confirms ${category} is present — concrete, observable]
- [Another positive indicator — mention shapes, colors, textures, structures]
- [More if needed, max 5 bullets]

❌ SKIP TILE IF YOU SEE:
- [Visual pattern that resembles ${category} but is NOT it — explain the difference]
- [Common background element confused with ${category}]
- [Max 4 bullets]
${isSingleImage ? `
🔲 PARTIAL VIEW RULES (this is one photo cut into tiles — pieces of the object appear in adjacent tiles):
- Select if ANY recognizable part of ${category} is visible, even at the tile edge
- [Describe what partial ${category} looks like: specific shape fragment, color pattern, texture detail]
- [Rule for edge tiles vs center tiles]
- [How to handle tiles where object is mostly background + small portion of ${category}]
` : `
📷 FULL PHOTO RULES (each tile is a separate photo):
- [What scene context strongly suggests the target is present]
- [What angles or distances make ${category} hard to spot]
`}
⚖️ BORDERLINE RULE:
- [One concrete sentence: when in doubt, select/skip — and why]

--- PAST ERROR ANALYSES (${analyses.length} entries) ---
${analyses.map((a, i) => `[${i + 1}] ${a}`).join('\n\n')}`;

                try {
                    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${OPENAI_API_KEY}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            model: OPENAI_MODEL,
                            max_tokens: 600,
                            messages: [{ role: 'user', content: synthesisPrompt }],
                        }),
                    });
                    const json = await resp.json();
                    const lessonRules = json.choices?.[0]?.message?.content?.trim();
                    if (!lessonRules) continue;

                    // 4. Upsert into captcha_lessons
                    await supabase.from('captcha_lessons').upsert({
                        category,
                        grid_size,
                        lesson_rules: lessonRules,
                        source_count: analyses.length,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'category,grid_size' });
                } catch (e) {
                    console.error('Synthesis failed for', category, e);
                }
            }

            await loadLessons();
            setShowLessons(true);
            toast.success('Szintézis kész! A leckék frissítve.');
        } finally {
            setSynthesizing(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Lessons Panel */}
            {showLessons && (
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                            <BookOpen className="w-4 h-4" /> Szintézis Leckék ({lessons.length} kategória)
                        </h3>
                        <Button size="sm" variant="ghost" onClick={() => setShowLessons(false)} className="text-muted-foreground h-6 text-xs">✕</Button>
                    </div>
                    {lessons.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Még nincs szintézis. Futtasd a "Szintézis futtatás" gombot.</p>
                    ) : (
                        <div className="space-y-3">
                            {lessons.map(lesson => (
                                <div key={lesson.id} className="rounded-lg bg-purple-900/20 border border-purple-500/10 p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-bold text-purple-300 uppercase tracking-wide">{lesson.category}</span>
                                        <span className="text-xs text-muted-foreground">{lesson.grid_size === 9 ? '3×3' : '4×4'}</span>
                                        <span className="text-xs text-muted-foreground ml-auto">{lesson.source_count} elemzésből · {formatDate(lesson.updated_at)}</span>
                                    </div>
                                    <pre className="text-xs text-purple-100/80 whitespace-pre-wrap leading-relaxed font-sans">{lesson.lesson_rules}</pre>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">CAPTCHA Tanítás</h2>
                    <p className="text-sm text-muted-foreground">
                        Ellenőrizd az AI választásait · Kattints egy sorra a szerkesztéshez
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {analyzing ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { _analysis.abort = true; }}
                            className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2"
                        >
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {analyzeProgress ? `${analyzeProgress.done}/${analyzeProgress.total}` : '...'} — Leállít
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={runAnalysis}
                            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-2"
                        >
                            <Brain className="w-4 h-4" />
                            AI Elemzés futtatás
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={runSynthesis}
                        disabled={synthesizing}
                        className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 gap-2"
                    >
                        {synthesizing
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <BookOpen className="w-4 h-4" />}
                        Szintézis futtatás
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTrainerMode(true)}
                        className="border-green-500/30 text-green-400 hover:bg-green-500/10 gap-2"
                    >
                        <Dumbbell className="w-4 h-4" />
                        Edző mód
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { loadLessons(); setShowLessons(v => !v); }}
                        className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 gap-2"
                    >
                        <BookOpen className="w-4 h-4" />
                        {showLessons ? 'Leckék elrejtése' : 'Leckék megtekintése'}
                    </Button>
                    <Button
                        variant={showReviewed ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setShowReviewed(v => !v); setPage(0); }}
                        className="border-primary/20"
                    >
                        {showReviewed ? 'Összes' : 'Csak nem felülvizsgáltak'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={load} className="border-primary/20">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Table */}
            <AnimatedCard>
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                ) : entries.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                        Nincs adat. Futtass be egy bejelentkezési scriptet hogy adatok kerüljenek ide.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-primary/10 text-left text-muted-foreground text-xs">
                                    <th className="py-2 pr-3 font-medium">Dátum</th>
                                    <th className="py-2 pr-3 font-medium">Domain</th>
                                    <th className="py-2 pr-3 font-medium">Feladat</th>
                                    <th className="py-2 pr-3 font-medium">Grid</th>
                                    <th className="py-2 pr-3 font-medium">AI tiles</th>
                                    <th className="py-2 pr-3 font-medium">Human tiles</th>
                                    <th className="py-2 pr-3 font-medium">Állapot</th>
                                    <th className="py-2 pr-3 font-medium">Elemzés</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((e) => {
                                    const isExpanded = expandedAnalysis.has(e.id);
                                    const hasDiff = e.human_tiles && (
                                        e.ai_final_tiles.some(t => !e.human_tiles!.includes(t)) ||
                                        e.human_tiles.some(t => !e.ai_final_tiles.includes(t))
                                    );
                                    return (
                                        <>
                                            <tr
                                                key={e.id}
                                                onClick={() => setSelected(e)}
                                                className="border-b border-primary/5 hover:bg-primary/5 cursor-pointer transition-colors"
                                            >
                                                <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap text-xs">{formatDate(e.created_at)}</td>
                                                <td className="py-2 pr-3 font-mono text-xs">{e.domain}</td>
                                                <td className="py-2 pr-3 max-w-xs truncate text-foreground text-xs">{e.challenge_text}</td>
                                                <td className="py-2 pr-3">
                                                    <Badge variant="outline" className="border-primary/20 text-xs">
                                                        {e.grid_size === 9 ? '3×3' : '4×4'}
                                                    </Badge>
                                                </td>
                                                <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">[{e.ai_final_tiles.join(', ')}]</td>
                                                <td className="py-2 pr-3 font-mono text-xs">
                                                    {e.human_tiles ? (
                                                        <span className={cn(hasDiff ? 'text-amber-400' : 'text-green-400')}>
                                                            [{e.human_tiles.join(', ')}]
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground/50">—</span>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-3">
                                                    {e.reviewed_at ? (
                                                        <span className="flex items-center gap-1 text-green-400 text-xs">
                                                            <CheckCircle2 className="w-3 h-3" />Felülvizsgálva
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-yellow-400 text-xs">
                                                            <Clock className="w-3 h-3" />Várakozik
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-3" onClick={e.ai_error_analysis ? (ev) => { ev.stopPropagation(); toggleAnalysis(e.id); } : undefined}>
                                                    {e.ai_error_analysis ? (
                                                        <button className="flex items-center gap-1 text-amber-400 text-xs hover:text-amber-300 transition-colors">
                                                            <Brain className="w-3 h-3" />
                                                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                        </button>
                                                    ) : e.reviewed_at ? (
                                                        <span className="text-muted-foreground/40 text-xs flex items-center gap-1">
                                                            <AlertTriangle className="w-3 h-3" />Nincs
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground/20 text-xs">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                            {isExpanded && e.ai_error_analysis && (
                                                <tr key={`${e.id}-analysis`} className="border-b border-primary/5 bg-amber-500/5">
                                                    <td colSpan={8} className="px-4 py-3">
                                                        <div className="flex gap-2">
                                                            <Brain className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                                            <div>
                                                                <p className="text-xs font-semibold text-amber-400 mb-1">
                                                                    AI elemzés ({e.analysis_done_at ? formatDate(e.analysis_done_at) : '—'})
                                                                </p>
                                                                <p className="text-xs text-amber-200/80 leading-relaxed">{e.ai_error_analysis}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </AnimatedCard>

            {/* Pagination */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{entries.length} bejegyzés</p>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="border-primary/20">
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="flex items-center text-xs text-muted-foreground px-2">{page + 1}</span>
                    <Button size="sm" variant="outline" disabled={entries.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)} className="border-primary/20">
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Grid reviewer modal */}
            {selected && (
                <GridReviewer
                    entry={selected}
                    onSave={handleSave}
                    onClose={() => setSelected(null)}
                />
            )}

            {/* Trainer mode */}
            {trainerMode && (
                <CaptchaTrainer onClose={() => { setTrainerMode(false); load(); }} />
            )}
        </div>
    );
}
