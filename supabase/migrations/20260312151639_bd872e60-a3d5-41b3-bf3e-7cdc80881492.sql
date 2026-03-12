
-- Clear test-mode Stripe metadata from companies
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

-- Remove test-mode paid licenses
DELETE FROM licenses WHERE license_type = 'paid';
