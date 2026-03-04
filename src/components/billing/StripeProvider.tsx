import { useEffect, useMemo, useState } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { supabase } from '@/integrations/supabase/client';

// Fetch the publishable key from the backend (stored in Supabase secrets)
let cachedStripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(): Promise<Stripe | null> {
    if (!cachedStripePromise) {
        cachedStripePromise = supabase.functions
            .invoke('get-stripe-publishable-key')
            .then(({ data, error }) => {
                if (error || !data?.publishable_key) {
                    console.error('[StripeProvider] Could not fetch publishable key:', error);
                    return null;
                }
                return loadStripe(data.publishable_key);
            });
    }
    return cachedStripePromise;
}

interface StripeProviderProps {
    children: React.ReactNode;
    clientSecret?: string;
    mode?: 'payment' | 'setup' | 'subscription';
    isDark?: boolean;
}

function buildAppearance(isDark: boolean): StripeElementsOptions['appearance'] {
    if (isDark) {
        return {
            theme: 'night',
            variables: {
                colorPrimary: 'hsl(270, 70%, 60%)',
                colorBackground: 'hsl(260, 35%, 10%)',
                colorText: 'hsl(0, 0%, 95%)',
                colorDanger: 'hsl(0, 60%, 50%)',
                colorIcon: 'hsl(195, 85%, 50%)',
                fontFamily: 'Inter, system-ui, sans-serif',
                borderRadius: '0.75rem',
                spacingUnit: '4px',
                fontSizeBase: '14px',
            },
            rules: {
                '.Input': {
                    border: '1px solid hsl(260, 30%, 18%)',
                    backgroundColor: 'hsl(260, 40%, 8%)',
                    boxShadow: 'none',
                    color: 'hsl(0, 0%, 95%)',
                },
                '.Input:focus': {
                    border: '1px solid hsl(270, 70%, 60%)',
                    boxShadow: '0 0 0 3px hsl(270, 70%, 60%, 0.15)',
                    outline: 'none',
                },
                '.Input--invalid': {
                    border: '1px solid hsl(0, 60%, 50%)',
                },
                '.Label': {
                    color: 'hsl(260, 15%, 55%)',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    letterSpacing: '0.025em',
                },
                '.Tab': {
                    border: '1px solid hsl(260, 30%, 18%)',
                    backgroundColor: 'hsl(260, 35%, 12%)',
                },
                '.Tab:hover': {
                    backgroundColor: 'hsl(260, 35%, 16%)',
                },
                '.Tab--selected': {
                    border: '1px solid hsl(270, 70%, 60%)',
                    backgroundColor: 'hsl(260, 35%, 14%)',
                },
                '.TabIcon--selected': {
                    fill: 'hsl(270, 70%, 60%)',
                },
                '.TabLabel--selected': {
                    color: 'hsl(270, 70%, 75%)',
                },
                '.CheckboxInput': {
                    border: '1px solid hsl(260, 30%, 25%)',
                    backgroundColor: 'hsl(260, 40%, 8%)',
                },
                '.CheckboxInput--checked': {
                    backgroundColor: 'hsl(270, 70%, 60%)',
                    borderColor: 'hsl(270, 70%, 60%)',
                },
            },
        };
    }

    return {
        theme: 'stripe',
        variables: {
            colorPrimary: 'hsl(268, 60%, 52%)',
            colorBackground: 'hsl(255, 5%, 98.5%)',
            colorText: 'hsl(262, 50%, 13%)',
            colorDanger: 'hsl(0, 68%, 50%)',
            colorIcon: 'hsl(268, 60%, 52%)',
            fontFamily: 'Inter, system-ui, sans-serif',
            borderRadius: '0.75rem',
            spacingUnit: '4px',
            fontSizeBase: '14px',
        },
        rules: {
            '.Input': {
                border: '1px solid hsl(263, 16%, 89%)',
                backgroundColor: 'hsl(255, 8%, 97%)',
                boxShadow: 'none',
            },
            '.Input:focus': {
                border: '1px solid hsl(268, 60%, 52%)',
                boxShadow: '0 0 0 3px hsl(268, 55%, 60%, 0.15)',
                outline: 'none',
            },
            '.Input--invalid': {
                border: '1px solid hsl(0, 68%, 50%)',
            },
            '.Label': {
                color: 'hsl(263, 20%, 44%)',
                fontSize: '0.75rem',
                fontWeight: '500',
                letterSpacing: '0.025em',
            },
            '.Tab': {
                border: '1px solid hsl(263, 16%, 89%)',
                backgroundColor: 'hsl(255, 8%, 97%)',
            },
            '.Tab:hover': {
                backgroundColor: 'hsl(263, 15%, 93%)',
            },
            '.Tab--selected': {
                border: '1px solid hsl(268, 60%, 52%)',
            },
            '.CheckboxInput--checked': {
                backgroundColor: 'hsl(268, 60%, 52%)',
                borderColor: 'hsl(268, 60%, 52%)',
            },
        },
    };
}

export function StripeProvider({ children, clientSecret, isDark = false }: StripeProviderProps) {
    const appearance = useMemo(() => buildAppearance(isDark), [isDark]);

    const options: StripeElementsOptions = {
        appearance,
        ...(clientSecret ? { clientSecret } : {}),
    };

    return (
        <Elements stripe={getStripePromise()} options={options}>
            {children}
        </Elements>
    );
}
