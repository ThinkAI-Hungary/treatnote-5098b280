

## Update Monthly Price ID to Live Mode

The old test price ID `price_1TA9kXDG9IVOU80sve6uDycw` needs to be replaced with the new live price ID `price_1TABODDG9IVOU80sYHim2VsD` across 10 files:

### Files to update

| File | Line |
|------|------|
| `src/hooks/useBillingDetails.ts` | 4 |
| `src/components/AppSidebar.tsx` | 344 |
| `supabase/functions/create-checkout-session/index.ts` | 10 |
| `supabase/functions/get-billing-details/index.ts` | 10 |
| `supabase/functions/get-prices/index.ts` | 9 |
| `supabase/functions/switch-plan/index.ts` | 10 |
| `supabase/functions/switch-license/index.ts` | 10 |
| `supabase/functions/switch-license-interval/index.ts` | 10 |
| `supabase/functions/stripe-webhook/index.ts` | 10 |
| `supabase/functions/db-cleanup/index.ts` | 5 |

All are simple string replacements of the price ID constant. After updating, all edge functions will be redeployed automatically.

