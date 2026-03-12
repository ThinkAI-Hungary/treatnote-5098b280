

# Fix Stripe Live Mode Migration

## Root Cause

The `get-billing-details` and `get-prices` edge functions crash because they try to `stripe.prices.retrieve(YEARLY_PRICE_ID)` — but the yearly price ID (`price_1SzFbZDG9IVOU80soy18oPwM`) does not exist in Stripe live mode. This causes an unhandled Stripe error that manifests as the "Deno.core.runMicrotasks()" crash in the logs.

## Required Changes

### 1. Update Supabase Secrets (manual step)

Three secrets need updating in [Supabase Edge Function settings](https://supabase.com/dashboard/project/bpjzgapmoyhtgryglcke/settings/functions):

| Secret | New Value |
|--------|-----------|
| `STRIPE_SECRET_KEY` | Your `sk_live_...` key |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_51Qs3EADG9IVOU80szgaUNBt0syctsIeBDhWqOH4hQYdvcMvc6LtFJ907TajX2g7VlFu0p53c8Q3RsiPwWZCl4dWg00CNwbQczf` |
| `STRIPE_WEBHOOK_SIGNING_SECRET` | `whsec_lVM0VM299KUMnflVp1nn3tc9JdXpvjOL` |

### 2. Fix `get-billing-details/index.ts`

Remove or make the yearly price retrieval optional. Since yearly is not used, skip it entirely and return a null/placeholder for `prices.yearly`:

```text
// Replace the parallel price fetch (lines 63-71):
const monthlyPrice = await stripe.prices.retrieve(MONTHLY_PRICE_ID);

const prices = {
    monthly: { price_id: monthlyPrice.id, unit_amount: monthlyPrice.unit_amount, currency: monthlyPrice.currency },
    yearly: null,
};
```

### 3. Fix `get-prices/index.ts`

Same issue — remove yearly retrieval:

```text
// Replace the parallel fetch (lines 30-46):
const monthlyPrice = await stripe.prices.retrieve(MONTHLY_PRICE_ID);

return new Response(JSON.stringify({
    monthly: {
        price_id: monthlyPrice.id,
        unit_amount: monthlyPrice.unit_amount,
        currency: monthlyPrice.currency,
        interval: monthlyPrice.recurring?.interval,
    },
    yearly: null,
}), ...);
```

### 4. Fix `create-checkout-session/index.ts`

Remove `YEARLY_PRICE_ID` from `VALID_PRICES` (line 14):

```text
const VALID_PRICES = [MONTHLY_PRICE_ID];
```

### 5. Fix `useBillingDetails.ts` (frontend)

Remove the hardcoded `YEARLY_PRICE_ID` and update the `BillingDetails` type to allow `prices.yearly` to be null:

```text
prices: {
    monthly: { price_id: string; unit_amount: number; currency: string };
    yearly: { price_id: string; unit_amount: number; currency: string } | null;
};
```

### 6. Fix `switch-plan/index.ts` and `switch-license-interval/index.ts`

These reference the yearly price ID for interval switching. Since yearly is disabled, add a guard that returns an error if yearly is requested.

## Files to modify

| File | Change |
|------|--------|
| `supabase/functions/get-billing-details/index.ts` | Skip yearly price retrieval |
| `supabase/functions/get-prices/index.ts` | Skip yearly price retrieval |
| `supabase/functions/create-checkout-session/index.ts` | Remove yearly from VALID_PRICES |
| `src/hooks/useBillingDetails.ts` | Allow yearly to be null, remove hardcoded yearly ID |
| `supabase/functions/switch-plan/index.ts` | Guard against yearly requests |
| `supabase/functions/switch-license-interval/index.ts` | Guard against yearly requests |

## Risk

Low — removing an unused price path. Monthly billing continues working unchanged. The critical fix is the `get-billing-details` crash which blocks the entire Elofizetes tab.

