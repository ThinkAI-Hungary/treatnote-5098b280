import { useState } from 'react';
import { Minus, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { updateSeats } from '@/hooks/useBillingDetails';

interface LicenseGridProps {
    companyId: string;
    totalSeats: number;
    usedSeats: number;
    onUpdate?: () => void;
    readOnly?: boolean;
}

export function LicenseGrid({ companyId, totalSeats, usedSeats, onUpdate, readOnly = false }: LicenseGridProps) {
    const [count, setCount] = useState(totalSeats);
    const [saving, setSaving] = useState(false);
    const hasChanges = count !== totalSeats;

    const displayCount = Math.min(totalSeats, 50);
    const filled = Math.min(usedSeats, totalSeats);

    async function handleSave() {
        setSaving(true);
        try {
            await updateSeats(companyId, count);
            toast.success(`Licencek frissítve: ${count}`);
            onUpdate?.();
        } catch (err: any) {
            toast.error(err?.message || 'Hiba történt');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-5">
            {/* Visual grid */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{usedSeats} / {totalSeats} licenc kiosztva</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {totalSeats - usedSeats} szabad
                    </span>
                </div>

                {/* Grid of dots */}
                <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: displayCount }).map((_, i) => (
                        <div
                            key={i}
                            className={`w-5 h-5 rounded-md transition-all duration-300 ${i < filled
                                    ? 'bg-primary shadow-[0_0_6px_hsl(270_70%_60%/0.4)]'
                                    : 'bg-muted/60 border border-border/60'
                                }`}
                            style={{ animationDelay: `${i * 20}ms` }}
                        />
                    ))}
                    {totalSeats > 50 && (
                        <div className="w-5 h-5 rounded-md bg-muted/40 border border-dashed border-border/60 flex items-center justify-center">
                            <span className="text-[8px] text-muted-foreground">+{totalSeats - 50}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Seat count adjuster */}
            {!readOnly && (
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-muted/40 rounded-xl p-1 border border-border/60">
                        <button
                            className="w-8 h-8 rounded-lg hover:bg-background flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                            disabled={saving || count <= Math.max(1, usedSeats)}
                            onClick={() => setCount((c) => Math.max(Math.max(1, usedSeats), c - 1))}
                        >
                            <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-12 text-center font-bold text-lg">{count}</span>
                        <button
                            className="w-8 h-8 rounded-lg hover:bg-background flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                            disabled={saving || count >= 500}
                            onClick={() => setCount((c) => Math.min(500, c + 1))}
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <span className="text-xs text-muted-foreground">
                        {count !== totalSeats ? (
                            count > totalSeats
                                ? `+${count - totalSeats} licenc hozzáadódik (arányos elszámolással)`
                                : `−${totalSeats - count} licenc eltávolítás`
                        ) : 'Jelenlegi szám'}
                    </span>

                    {hasChanges && (
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={saving}
                            className="ml-auto"
                        >
                            {saving ? 'Mentés...' : 'Mentés'}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
