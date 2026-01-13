-- Add probapaciens_neve column to telephely table
ALTER TABLE public.telephely 
ADD COLUMN probapaciens_neve TEXT;

-- Add a comment explaining the column
COMMENT ON COLUMN public.telephely.probapaciens_neve IS 'Name of the test patient for this location, used for system tests. Supports Hungarian characters.';