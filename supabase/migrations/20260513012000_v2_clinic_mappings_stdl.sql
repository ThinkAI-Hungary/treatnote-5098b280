-- ============================================================
-- TreatNote V2 Engine — STDL Mappings Table
-- ============================================================

CREATE TABLE IF NOT EXISTS v2_clinic_mappings_stdl (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telephely_id UUID NOT NULL REFERENCES telephely(id) ON DELETE CASCADE,
  stdl_treatment_item_id UUID REFERENCES clinic_treatment_items_stdl(id) ON DELETE CASCADE,
  stdl_treatment_item_name TEXT,
  atomic_action_slug TEXT NOT NULL,
  conditions JSONB DEFAULT '{}',
  confidence REAL DEFAULT 0,
  reviewed BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_v2_mappings_stdl_telephely ON v2_clinic_mappings_stdl(telephely_id);
CREATE INDEX IF NOT EXISTS idx_v2_mappings_stdl_action ON v2_clinic_mappings_stdl(atomic_action_slug);
CREATE INDEX IF NOT EXISTS idx_v2_mappings_stdl_telephely_action ON v2_clinic_mappings_stdl(telephely_id, atomic_action_slug);

-- RLS Policies
ALTER TABLE v2_clinic_mappings_stdl ENABLE ROW LEVEL SECURITY;

-- Users can view mappings for their telephely
CREATE POLICY "Users can view their telephely mappings stdl"
  ON v2_clinic_mappings_stdl FOR SELECT
  USING (
    telephely_id IN (
      SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()
    )
  );

-- Service role manages all mappings
CREATE POLICY "Service role manages all mappings stdl"
  ON v2_clinic_mappings_stdl FOR ALL
  USING (auth.role() = 'service_role');
