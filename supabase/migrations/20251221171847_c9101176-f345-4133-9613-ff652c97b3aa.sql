-- Add UPDATE policy for klinika admins to edit their PDFs (fogalom field)
CREATE POLICY "Klinika admins can update their PDFs" 
ON public.feltoltott_pdf 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  (has_role(auth.uid(), 'klinika_admin'::app_role) AND 
   EXISTS (
     SELECT 1 FROM profiles p 
     WHERE p.user_id = auth.uid() 
     AND p.company_id = feltoltott_pdf.company_id 
     AND p.telephely_id = feltoltott_pdf.telephely_id
   ))
);