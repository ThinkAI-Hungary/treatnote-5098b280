
-- Step 1: Rename sajat_feltoltes to alapszabaly and change type to boolean
ALTER TABLE treatment_rules 
  ADD COLUMN alapszabaly boolean NOT NULL DEFAULT false;

-- Migrate existing data: sajat_feltoltes=1 means it was from PDF upload (szabalyepito-teszt-webhook)
-- Per new requirements: PDF upload = false, szótárból generált = true
-- Old sajat_feltoltes=1 meant "uploaded via PDF" so alapszabaly should be false for those
-- Old sajat_feltoltes=0 means "other methods" (including szotar-rules-webhook) - but we can't distinguish
-- So we keep all existing as false (default), the szotar-rules-webhook will set true going forward
UPDATE treatment_rules SET alapszabaly = false;

-- Drop the old column
ALTER TABLE treatment_rules DROP COLUMN sajat_feltoltes;

-- Step 2: Add aktiv column
ALTER TABLE treatment_rules
  ADD COLUMN aktiv boolean NOT NULL DEFAULT true;
