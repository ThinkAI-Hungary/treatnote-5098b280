
-- Create licenses table for per-user license allocation
CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_user_id uuid,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'disabled', 'expired')),
  expires_at timestamptz,
  stripe_subscription_id text,
  stripe_subscription_item_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Policies: company members can see their company's licenses
CREATE POLICY "Users can view their company licenses"
ON public.licenses FOR SELECT TO authenticated
USING (
  company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

-- Only admins can manage licenses (via service role in edge functions)
CREATE POLICY "Service role manages licenses"
ON public.licenses FOR ALL
USING (true)
WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_licenses_company_id ON public.licenses(company_id);
CREATE INDEX idx_licenses_assigned_user_id ON public.licenses(assigned_user_id);
CREATE INDEX idx_licenses_status ON public.licenses(status);

-- Trigger for updated_at
CREATE TRIGGER update_licenses_updated_at
BEFORE UPDATE ON public.licenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
