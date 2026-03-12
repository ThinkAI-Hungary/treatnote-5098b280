

# Fix: Clear Test-Mode Stripe Customer ID

## Problem
The `companies` table still holds `stripe_customer_id = 'cus_TxAtduBd2WBosH'` from test mode. The `create-checkout-session` edge function reuses this ID, but it doesn't exist in Stripe live mode.

## Solution
Run a single SQL migration to clear all test-mode Stripe metadata from the `companies` table:

```sql
UPDATE companies
SET stripe_customer_id = NULL,
    stripe_subscription_id = NULL,
    stripe_subscription_item_id = NULL,
    subscription_status = 'inactive',
    subscription_price_id = NULL,
    seats = 0,
    current_period_end = NULL,
    cancel_at_period_end = false
WHERE stripe_customer_id LIKE 'cus_%';
```

This forces the edge function to create a **new** live-mode Stripe customer on the next checkout attempt. No code changes needed — the `create-checkout-session` function already handles the "no customer yet" path.

## Also clear test licenses
```sql
DELETE FROM licenses WHERE license_type = 'paid';
```

Test-mode licenses reference test subscriptions that no longer exist.

## Risk
Low. Only affects test-mode billing data. Company records, users, and all non-billing data are untouched.

