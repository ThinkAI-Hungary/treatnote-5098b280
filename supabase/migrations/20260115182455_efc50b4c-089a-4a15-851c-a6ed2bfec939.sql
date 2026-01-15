-- Create szotar_kezelesek table for storing treatment names per telephely
CREATE TABLE public.szotar_kezelesek (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telephely_id UUID NOT NULL REFERENCES public.telephely(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups by telephely
CREATE INDEX idx_szotar_kezelesek_telephely_id ON public.szotar_kezelesek(telephely_id);

-- Create unique constraint to prevent duplicate treatment names per telephely
CREATE UNIQUE INDEX idx_szotar_kezelesek_unique_name ON public.szotar_kezelesek(telephely_id, name);

-- Enable Row Level Security
ALTER TABLE public.szotar_kezelesek ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view treatments for their telephely
CREATE POLICY "Users can view their telephely treatments"
ON public.szotar_kezelesek
FOR SELECT
USING (telephely_id IN (
  SELECT profiles.telephely_id FROM profiles WHERE profiles.user_id = auth.uid()
));

-- Klinika admins can insert treatments
CREATE POLICY "Klinika admins can insert treatments"
ON public.szotar_kezelesek
FOR INSERT
WITH CHECK (
  (telephely_id IN (SELECT profiles.telephely_id FROM profiles WHERE profiles.user_id = auth.uid()))
  AND (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY(ARRAY['admin'::app_role, 'klinika_admin'::app_role])))
);

-- Klinika admins can update treatments
CREATE POLICY "Klinika admins can update treatments"
ON public.szotar_kezelesek
FOR UPDATE
USING (
  (telephely_id IN (SELECT profiles.telephely_id FROM profiles WHERE profiles.user_id = auth.uid()))
  AND (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY(ARRAY['admin'::app_role, 'klinika_admin'::app_role])))
);

-- Klinika admins can delete treatments
CREATE POLICY "Klinika admins can delete treatments"
ON public.szotar_kezelesek
FOR DELETE
USING (
  (telephely_id IN (SELECT profiles.telephely_id FROM profiles WHERE profiles.user_id = auth.uid()))
  AND (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY(ARRAY['admin'::app_role, 'klinika_admin'::app_role])))
);

-- Trigger for updated_at
CREATE TRIGGER update_szotar_kezelesek_updated_at
BEFORE UPDATE ON public.szotar_kezelesek
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();