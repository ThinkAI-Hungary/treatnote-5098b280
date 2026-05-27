-- Add 'disabled' column to v2_clinic_mappings and v2_clinic_mappings_stdl
-- When disabled=true, the mapping is treated as if it doesn't exist in the pipeline.
ALTER TABLE v2_clinic_mappings ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false;
ALTER TABLE v2_clinic_mappings_stdl ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false;
