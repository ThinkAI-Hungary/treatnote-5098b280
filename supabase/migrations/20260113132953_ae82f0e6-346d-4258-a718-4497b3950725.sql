-- Create szótár table to store one dictionary per telephely
CREATE TABLE public.szotar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telephely_id uuid NOT NULL REFERENCES public.telephely(id) ON DELETE CASCADE,
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (telephely_id) -- Only one szotar per telephely
);

-- Enable RLS
ALTER TABLE public.szotar ENABLE ROW LEVEL SECURITY;

-- Klinika admins can view their telephely's szótár
CREATE POLICY "Users can view their telephely szotar"
ON public.szotar
FOR SELECT
USING (
  telephely_id IN (
    SELECT profiles.telephely_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  )
);

-- Klinika admins can insert their telephely's szótár
CREATE POLICY "Klinika admins can insert szotar"
ON public.szotar
FOR INSERT
WITH CHECK (
  (telephely_id IN (
    SELECT profiles.telephely_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  ))
  AND
  (EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin'::app_role, 'klinika_admin'::app_role])
  ))
);

-- Klinika admins can update their telephely's szótár
CREATE POLICY "Klinika admins can update szotar"
ON public.szotar
FOR UPDATE
USING (
  (telephely_id IN (
    SELECT profiles.telephely_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  ))
  AND
  (EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin'::app_role, 'klinika_admin'::app_role])
  ))
);

-- Klinika admins can delete their telephely's szótár
CREATE POLICY "Klinika admins can delete szotar"
ON public.szotar
FOR DELETE
USING (
  (telephely_id IN (
    SELECT profiles.telephely_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  ))
  AND
  (EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin'::app_role, 'klinika_admin'::app_role])
  ))
);

-- Create trigger for updated_at
CREATE TRIGGER update_szotar_updated_at
BEFORE UPDATE ON public.szotar
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();