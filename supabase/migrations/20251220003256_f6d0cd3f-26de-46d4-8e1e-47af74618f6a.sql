-- Create table for storing uploaded PDF files
CREATE TABLE public.feltoltott_pdf (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  telephely_id UUID REFERENCES public.telephely(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.feltoltott_pdf ENABLE ROW LEVEL SECURITY;

-- Klinika admins can view PDFs in their company/telephely
CREATE POLICY "Klinika admins can view their PDFs"
ON public.feltoltott_pdf
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'klinika_admin') AND 
   EXISTS (
     SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid()
     AND p.company_id = feltoltott_pdf.company_id
     AND p.telephely_id = feltoltott_pdf.telephely_id
   ))
);

-- Klinika admins can insert PDFs for their company/telephely
CREATE POLICY "Klinika admins can insert their PDFs"
ON public.feltoltott_pdf
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'klinika_admin') AND 
   EXISTS (
     SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid()
     AND p.company_id = feltoltott_pdf.company_id
     AND p.telephely_id = feltoltott_pdf.telephely_id
   ))
);

-- Klinika admins can delete PDFs from their company/telephely
CREATE POLICY "Klinika admins can delete their PDFs"
ON public.feltoltott_pdf
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'klinika_admin') AND 
   EXISTS (
     SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid()
     AND p.company_id = feltoltott_pdf.company_id
     AND p.telephely_id = feltoltott_pdf.telephely_id
   ))
);

-- Create storage bucket for PDF files
INSERT INTO storage.buckets (id, name, public)
VALUES ('szabalyok-pdf', 'szabalyok-pdf', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for viewing PDFs
CREATE POLICY "Klinika admins can view PDF files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'szabalyok-pdf' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'klinika_admin')
  )
);

-- Storage policy for uploading PDFs
CREATE POLICY "Klinika admins can upload PDF files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'szabalyok-pdf' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'klinika_admin')
  )
);

-- Storage policy for deleting PDFs
CREATE POLICY "Klinika admins can delete PDF files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'szabalyok-pdf' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'klinika_admin')
  )
);