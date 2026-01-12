-- Create table for storing extracted "fogalom" entries from PDF processing
CREATE TABLE public.szabalyepito_teszt_extractions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  source_file_name TEXT NOT NULL,
  fogalom TEXT NOT NULL,
  kategoria TEXT,
  trigger_words JSONB,
  parsed_file_name TEXT,
  parsed_json JSONB NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  telephely_id UUID REFERENCES public.telephely(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT szabalyepito_teszt_extractions_event_id_fogalom_key UNIQUE (event_id, fogalom)
);

-- Enable Row Level Security
ALTER TABLE public.szabalyepito_teszt_extractions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view extractions from their company"
ON public.szabalyepito_teszt_extractions
FOR SELECT
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can insert extractions for their company"
ON public.szabalyepito_teszt_extractions
FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Klinika admins and admins can delete extractions"
ON public.szabalyepito_teszt_extractions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'klinika_admin')
  )
  AND company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_szabalyepito_teszt_extractions_company ON public.szabalyepito_teszt_extractions(company_id);
CREATE INDEX idx_szabalyepito_teszt_extractions_event ON public.szabalyepito_teszt_extractions(event_id);