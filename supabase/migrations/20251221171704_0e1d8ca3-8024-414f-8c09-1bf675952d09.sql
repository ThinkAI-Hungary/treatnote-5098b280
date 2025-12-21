-- Add fogalom column to feltoltott_pdf table for storing the reference text
ALTER TABLE public.feltoltott_pdf 
ADD COLUMN fogalom TEXT;