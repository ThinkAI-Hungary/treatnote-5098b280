-- Add 'disabled' column to v2_clinic_mappings and v2_clinic_mappings_stdl
-- When disabled=true, the mapping is treated as if it doesn't exist in the pipeline.
ALTER TABLE v2_clinic_mappings ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false;
ALTER TABLE v2_clinic_mappings_stdl ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false;

-- Allow users to update mappings for their telephely (needed for disable toggle)
CREATE POLICY "Users can update their telephely mappings"
  ON v2_clinic_mappings FOR UPDATE
  USING (telephely_id IN (SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()))
  WITH CHECK (telephely_id IN (SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their telephely mappings stdl"
  ON v2_clinic_mappings_stdl FOR UPDATE
  USING (telephely_id IN (SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()))
  WITH CHECK (telephely_id IN (SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()));
