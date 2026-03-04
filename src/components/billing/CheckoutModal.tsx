import { useState } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { supabase } from '@/integrations/supabase/client';
import { X } from 'lucide-react';

let cachedStripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(): Promise<Stripe | null> {
    if (!cachedStripePromise) {
        cachedStripePromise = supabase.functions
            .invoke('get-stripe-publishable-key')
            .then(({ data, error }) => {
                if (error || !data?.publishable_key) return null;
                return loadStripe(data.publishable_key);
            });
    }
    return cachedStripePromise;
}

interface CheckoutModalProps {
    clientSecret: string;
    onClose: () => void;
    onComplete?: () => void;
}

export function CheckoutModal({ clientSecret, onClose, onComplete }: CheckoutModalProps) {
    const [done, setDone] = useState(false);

    function handleComplete() {
        setDone(true);
        onComplete?.();
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto w-screen h-screen">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-background/80 backdrop-blur-md z-[9998]"
                onClick={onClose}
            />

            {/* Modal frame */}
            <div
                className="relative z-[9999] w-full max-w-2xl my-auto rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden min-h-[500px]"
                style={{
                    boxShadow: '0 0 60px hsl(270 70% 50% / 0.15), 0 20px 60px hsl(260 40% 10% / 0.4)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-galaxy-header">
                    <div>
                        <h2 className="text-lg font-semibold">Előfizetés indítása</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Biztonságos fizetés a Stripe által</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Stripe Embedded Checkout */}
                {done ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold">Fizetés sikeres!</h3>
                        <p className="text-muted-foreground text-sm max-w-xs">Előfizetésed aktiválva. Kérjük, várj néhány másodpercet amíg frissítjük az adataidat.</p>
                        <button
                            onClick={onClose}
                            className="mt-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
                        >
                            Bezárás
                        </button>
                    </div>
                ) : (
                    <div className="p-1 pb-4">
                        <EmbeddedCheckoutProvider
                            stripe={getStripePromise()}
                            options={{ clientSecret, onComplete: handleComplete }}
                        >
                            <EmbeddedCheckout />
                        </EmbeddedCheckoutProvider>
                    </div>
                )}
            </div>
        </div>
    );
}
