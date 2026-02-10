
-- Phase 1: Extend companies table with Stripe subscription fields
ALTER TABLE public.companies
  ADD COLUMN stripe_customer_id text UNIQUE,
  ADD COLUMN stripe_subscription_id text UNIQUE,
  ADD COLUMN stripe_subscription_item_id text,
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'inactive',
  ADD COLUMN subscription_price_id text,
  ADD COLUMN seats integer NOT NULL DEFAULT 0,
  ADD COLUMN current_period_end timestamptz,
  ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN livemode boolean NOT NULL DEFAULT false;

-- Phase 1: Create stripe_events table for webhook idempotency
CREATE TABLE public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  processed_at timestamptz DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- No RLS policies needed: webhook uses service role which bypasses RLS

-- Phase 1: RLS helper function for subscription gating
CREATE OR REPLACE FUNCTION public.clinic_subscription_active(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id
      AND subscription_status = 'active'
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;
