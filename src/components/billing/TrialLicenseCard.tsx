import { useState, useEffect } from 'react';
import { Clock, Gift } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface TrialLicense {
    id: string;
    expires_at: string;
    status: string;
}

function useCountdown(expiresAt: string | null) {
    const [remaining, setRemaining] = useState<{ days: number; hours: number; minutes: number; seconds: number; expired: boolean } | null>(null);

    useEffect(() => {
        if (!expiresAt) return;

        const tick = () => {
            const diff = new Date(expiresAt).getTime() - Date.now();
            if (diff <= 0) {
                setRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
                return;
            }
            const days = Math.floor(diff / 86_400_000);
            const hours = Math.floor((diff % 86_400_000) / 3_600_000);
            const minutes = Math.floor((diff % 3_600_000) / 60_000);
            const seconds = Math.floor((diff % 60_000) / 1_000);
            setRemaining({ days, hours, minutes, seconds, expired: false });
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);

    return remaining;
}

function TimeBlock({ value, label }: { value: number; label: string }) {
    return (
        <div className="flex flex-col items-center">
            <div className="text-2xl font-bold tabular-nums text-primary w-12 text-center">
                {String(value).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
        </div>
    );
}

export function TrialLicenseCard() {
    const { user } = useAuth();
    const [trial, setTrial] = useState<TrialLicense | null>(null);
    const [loading, setLoading] = useState(true);
    const countdown = useCountdown(trial?.expires_at ?? null);

    useEffect(() => {
        if (!user) return;
        (async () => {
            const { data } = await supabase
                .from('licenses')
                .select('id, expires_at, status')
                .eq('assigned_user_id', user.id)
                .eq('license_type', 'trial')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            setTrial(data ?? null);
            setLoading(false);
        })();
    }, [user]);

    if (loading || !trial) return null;

    const isExpired = countdown?.expired || trial.status === 'expired';

    return (
        <Card className={`border-2 ${isExpired ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5 dark:bg-primary/10'}`}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Gift className={`h-4 w-4 ${isExpired ? 'text-destructive' : 'text-primary'}`} />
                    Ingyenes próbaidőszak
                    <Badge
                        className={`ml-auto text-[10px] px-1.5 h-4 ${isExpired
                            ? 'bg-destructive/10 text-destructive border-destructive/20'
                            : 'bg-primary/10 text-primary border-primary/20'
                            }`}
                    >
                        {isExpired ? 'Lejárt' : 'Aktív'}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isExpired ? (
                    <p className="text-sm text-destructive">
                        A próbaidőszak lejárt. Az előfizetés megvásárlásával folytathatja a rendszer használatát.
                    </p>
                ) : countdown ? (
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">Hátralévő idő:</p>
                        <div className="flex items-end gap-1">
                            <TimeBlock value={countdown.days} label="nap" />
                            <span className="text-xl font-bold text-primary/60 mb-4">:</span>
                            <TimeBlock value={countdown.hours} label="óra" />
                            <span className="text-xl font-bold text-primary/60 mb-4">:</span>
                            <TimeBlock value={countdown.minutes} label="perc" />
                            <span className="text-xl font-bold text-primary/60 mb-4">:</span>
                            <TimeBlock value={countdown.seconds} label="mp" />
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Lejár: {new Date(trial.expires_at).toLocaleString('hu-HU')}
                        </p>
                    </div>
                ) : (
                    <div className="h-12 bg-muted/40 rounded animate-pulse" />
                )}
            </CardContent>
        </Card>
    );
}
