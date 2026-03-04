import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface LicenseStatus {
    hasLicense: boolean;
    loading: boolean;
    licenseId: string | null;
    expiresAt: string | null;
    billingInterval: 'monthly' | 'yearly' | null;
}

/**
 * Checks whether the current user has an active, unexpired license
 * assigned to them for a given telephely.
 *
 * If telephelyId is null/undefined, returns hasLicense=false immediately.
 *
 * Usage:
 *   const { hasLicense, loading } = useHasLicense(currentTelephelyId);
 */
export function useHasLicense(telephelyId: string | null | undefined): LicenseStatus {
    const { user } = useAuth();
    const [status, setStatus] = useState<LicenseStatus>({
        hasLicense: false,
        loading: true,
        licenseId: null,
        expiresAt: null,
        billingInterval: null,
    });

    useEffect(() => {
        if (!user || !telephelyId) {
            setStatus({ hasLicense: false, loading: false, licenseId: null, expiresAt: null, billingInterval: null });
            return;
        }

        let cancelled = false;

        async function check() {
            setStatus(s => ({ ...s, loading: true }));
            try {
                const now = new Date().toISOString();
                const { data, error } = await supabase
                    .from('licenses')
                    .select('id, expires_at, billing_interval')
                    .eq('assigned_user_id', user!.id)
                    .eq('telephely_id', telephelyId)
                    .eq('status', 'assigned')
                    .or(`expires_at.is.null,expires_at.gt.${now}`)
                    .limit(1)
                    .maybeSingle();

                if (cancelled) return;

                if (error || !data) {
                    setStatus({ hasLicense: false, loading: false, licenseId: null, expiresAt: null, billingInterval: null });
                } else {
                    setStatus({
                        hasLicense: true,
                        loading: false,
                        licenseId: data.id,
                        expiresAt: data.expires_at ?? null,
                        billingInterval: (data.billing_interval as 'monthly' | 'yearly') ?? null,
                    });
                }
            } catch {
                if (!cancelled) {
                    setStatus({ hasLicense: false, loading: false, licenseId: null, expiresAt: null, billingInterval: null });
                }
            }
        }

        check();
        return () => { cancelled = true; };
    }, [user, telephelyId]);

    return status;
}
