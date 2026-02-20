-- Add is_active flag to companies for soft-deactivation.
-- Deactivated companies move to a separate section in the Admin Panel.
-- Their users see no cég/telephely data until the company is reactivated.
-- Hard delete is only permitted after deactivation.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
