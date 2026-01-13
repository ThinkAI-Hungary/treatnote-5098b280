-- Add flexi_domain column to telephely table
ALTER TABLE public.telephely 
ADD COLUMN flexi_domain text;

-- Add comment for the column
COMMENT ON COLUMN public.telephely.flexi_domain IS 'The FlexiDent domain URL for this clinic location (e.g., mycompany.flexi-dent.hu)';