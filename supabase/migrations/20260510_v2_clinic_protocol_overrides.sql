-- ============================================================
-- TreatNote V2 — Clinic Protocol Overrides
-- Stores per-clinic customizations of global protocol templates
-- ============================================================

-- Overrides table: stores only the diff from global defaults
CREATE TABLE IF NOT EXISTS v2_clinic_protocol_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telephely_id UUID NOT NULL REFERENCES telephely(id) ON DELETE CASCADE,
  protocol_slug TEXT NOT NULL,

  -- Override settings
  is_disabled BOOLEAN DEFAULT false,
  excluded_actions TEXT[] DEFAULT '{}',
  added_actions TEXT[] DEFAULT '{}',
  custom_triggers TEXT[],  -- null = use defaults

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(telephely_id, protocol_slug)
);

CREATE INDEX IF NOT EXISTS idx_v2_overrides_telephely ON v2_clinic_protocol_overrides(telephely_id);

-- RLS
ALTER TABLE v2_clinic_protocol_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their telephely overrides"
  ON v2_clinic_protocol_overrides FOR SELECT
  USING (
    telephely_id IN (
      SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their telephely overrides"
  ON v2_clinic_protocol_overrides FOR ALL
  USING (
    telephely_id IN (
      SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages all overrides"
  ON v2_clinic_protocol_overrides FOR ALL
  USING (auth.role() = 'service_role');

-- Add setup_completed_at to telephely
ALTER TABLE telephely
  ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

COMMENT ON TABLE v2_clinic_protocol_overrides IS 'Per-clinic protocol customizations (diff from global defaults)';
COMMENT ON COLUMN v2_clinic_protocol_overrides.is_disabled IS 'If true, this protocol is disabled for the clinic';
COMMENT ON COLUMN v2_clinic_protocol_overrides.excluded_actions IS 'Atomic action slugs removed from this protocol';
COMMENT ON COLUMN v2_clinic_protocol_overrides.added_actions IS 'Atomic action slugs added to this protocol';
COMMENT ON COLUMN v2_clinic_protocol_overrides.custom_triggers IS 'Custom trigger phrases (null = use global defaults)';
COMMENT ON COLUMN telephely.setup_completed_at IS 'When the clinic completed the protocol setup wizard';

-- Store clinical interview answers for re-runnability
ALTER TABLE telephely
  ADD COLUMN IF NOT EXISTS clinical_interview_answers JSONB;

COMMENT ON COLUMN telephely.clinical_interview_answers IS 'Stored answers from the clinical interview wizard (for re-running)';

