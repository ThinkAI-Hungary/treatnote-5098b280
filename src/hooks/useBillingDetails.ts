import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const MONTHLY_PRICE_ID = 'price_1TA9kXDG9IVOU80sve6uDycw';

export interface PaymentMethod {
    id: string;
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    is_default: boolean;
}

export interface BillingDetails {
    subscription: {
        status: string | null;
        price_id: string | null;
        seats: number;
        current_period_end: string | null;
        cancel_at_period_end: boolean;
        telephely_id: string | null;
    };
    payment_methods: PaymentMethod[];
    upcoming_invoice: {
        amount_due: number;
        currency: string;
        period_end: number;
        lines: Array<{ description: string; amount: number; period: { start: number; end: number } }>;
    } | null;
    prices: {
        monthly: { price_id: string; unit_amount: number; currency: string };
        yearly: { price_id: string; unit_amount: number; currency: string } | null;
    };
}

export const PRICE_IDS = { monthly: MONTHLY_PRICE_ID, yearly: YEARLY_PRICE_ID };

async function invokeWithAuth(name: string, options: { body?: Record<string, unknown>; method?: string; params?: Record<string, string> } = {}) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const { data, error } = await supabase.functions.invoke(name, {
        body: options.body,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (error) {
        console.error("invokeWithAuth error raw:", error);

        // Try parsing error.context which sometimes is a fetch Response
        if (error.context && typeof error.context.json === 'function') {
            try {
                const body = await error.context.clone().json();
                if (body && body.error) {
                    throw new Error(body.error);
                }
            } catch (e) { }
        }

        // Sometimes error is an object holding { error: "msg" } or similar
        try {
            if ((error as any).message) {
                const maybeJson = JSON.parse((error as any).message);
                if (maybeJson.error) throw new Error(maybeJson.error);
            }
        } catch (e) { }

        throw new Error(error.message || 'Ismeretlen hiba történt a szerver kommunikáció során.');
    }
    return data;
}

export function useBillingDetails(companyId: string | null) {
    const [details, setDetails] = useState<BillingDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!companyId) { setLoading(false); return; }
        setLoading(true);
        setError(null);
        try {
            const data = await invokeWithAuth('get-billing-details', { body: { company_id: companyId } });
            setDetails(data as BillingDetails);
        } catch (err: any) {
            setError(err?.message || 'Betöltési hiba');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { refresh(); }, [refresh]);

    return { details, loading, error, refresh };
}

export async function fetchInvoices(companyId: string) {
    return invokeWithAuth('list-invoices', { body: { company_id: companyId } });
}

export async function cancelSubscription(companyId: string, opts: { immediately?: boolean; reactivate?: boolean } = {}) {
    return invokeWithAuth('cancel-subscription', { body: { company_id: companyId, ...opts } });
}

export async function createSetupIntent(companyId: string) {
    return invokeWithAuth('create-setup-intent', { body: { company_id: companyId } });
}

export async function createEmbeddedCheckout(companyId: string, telephelyId: string, priceId: string, seats: number) {
    return invokeWithAuth('create-checkout-session', { body: { company_id: companyId, telephely_id: telephelyId, price_id: priceId, seats, embedded: true } });
}

export async function createEmbeddedCheckoutMultiple(companyId: string, telephelyId: string, items: { price_id: string, seats: number }[]) {
    return invokeWithAuth('create-checkout-session', { body: { company_id: companyId, telephely_id: telephelyId, items, embedded: true } });
}

export async function updateSeats(companyId: string, newSeats: number) {
    return invokeWithAuth('update-seats', { body: { company_id: companyId, new_seats: newSeats } });
}

export async function switchPlan(companyId: string, newPriceId: string) {
    return invokeWithAuth('switch-plan', { body: { company_id: companyId, new_price_id: newPriceId } });
}

/** Cancel one or more individual licenses (at period end or immediately). */
export async function cancelLicense(
    companyId: string,
    licenseIds: string[],
    opts: {
        immediately?: boolean;
        reactivate?: boolean;
        /** Unified atomic API: pass both to make a single net Stripe quantity update */
        cancel_ids?: string[];
        reactivate_ids?: string[];
    } = {}
) {
    return invokeWithAuth('cancel-license', { body: { company_id: companyId, license_ids: licenseIds, ...opts } });
}

/** Switch one or more licenses between 'monthly' and 'yearly'. */
export async function switchLicenseInterval(
    companyId: string,
    licenseIds: string[],
    interval: 'monthly' | 'yearly'
) {
    // Routes to switch-plan which handles per-license switching when license_ids + interval are provided
    return invokeWithAuth('switch-plan', { body: { company_id: companyId, license_ids: licenseIds, interval } });
}

// Stripe zero-decimal currencies: stored without subunits, so no /100 needed.
// NOTE: HUF is NOT zero-decimal — Stripe stores it in fillér (1 HUF = 100 fillér).
const ZERO_DECIMAL_CURRENCIES = new Set([
    'bif', 'clp', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx',
    'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

export function formatCurrency(amount: number, currency: string): string {
    const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase());
    const value = isZeroDecimal ? amount : amount / 100;
    return new Intl.NumberFormat('hu-HU', {
        style: 'currency',
        currency: currency.toUpperCase(),
        minimumFractionDigits: 0,
    }).format(value);
}

export function formatDate(dateStr: string | null | number): string {
    if (!dateStr) return '—';
    const d = typeof dateStr === 'number' ? new Date(dateStr * 1000) : new Date(dateStr);
    return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
}
