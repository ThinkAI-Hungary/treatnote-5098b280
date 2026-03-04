import { CreditCard, Star, Trash2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PaymentMethod } from '@/hooks/useBillingDetails';

const BRAND_LABELS: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    diners: 'Diners',
};

interface PaymentMethodCardProps {
    pm: PaymentMethod;
    onDelete?: (id: string) => void;
    deleting?: boolean;
    onSetDefault?: (id: string) => void;
    settingDefault?: boolean;
    /** True when there are multiple cards — shows the "set default" star button */
    canSetDefault?: boolean;
}

export function PaymentMethodCard({ pm, onDelete, deleting = false, onSetDefault, settingDefault = false, canSetDefault = false }: PaymentMethodCardProps) {
    const brandLabel = BRAND_LABELS[pm.brand] || pm.brand?.toUpperCase() || 'Kártya';
    const isExpired = new Date() > new Date(pm.exp_year, pm.exp_month - 1);

    return (
        <div
            className={`flex items-center justify-between rounded-xl border p-4 transition-all ${pm.is_default
                ? 'border-primary/40 bg-primary/5 dark:bg-primary/10'
                : 'border-border/60 bg-card/60 hover:border-border hover:bg-card/80'
                }`}
        >
            {/* Card info */}
            <div className="flex items-center gap-4">
                <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-border/60 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-primary" />
                </div>

                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{brandLabel} ···· {pm.last4}</span>
                        {pm.is_default && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 bg-primary/10 text-primary dark:bg-primary/20 border-primary/20">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                Alapértelmezett
                            </Badge>
                        )}
                    </div>
                    <p className={`text-xs mt-0.5 ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`}>
                        Lejárat: {pm.exp_month.toString().padStart(2, '0')}/{pm.exp_year}
                        {isExpired && ' · Lejárt'}
                    </p>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
                {/* Set as default — only for non-default cards when multiple exist */}
                {!pm.is_default && canSetDefault && onSetDefault && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => onSetDefault(pm.id)}
                        disabled={settingDefault || deleting}
                        title="Beállítás alapértelmezettként"
                    >
                        {settingDefault ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                    </Button>
                )}

                {/* Delete — not allowed for the default card */}
                {onDelete && !pm.is_default && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => onDelete(pm.id)}
                        disabled={deleting || settingDefault}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
}
