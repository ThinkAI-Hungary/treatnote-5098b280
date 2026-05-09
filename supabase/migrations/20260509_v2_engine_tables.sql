-- ============================================================
-- TreatNote V2 Engine — Supabase Schema Migration
-- Tables: v2_clinic_mappings, v2_clinic_defaults, v2_sessions
-- ============================================================

-- 1. Clinic-specific mapping: atomic_action → szótár dictionary entry
CREATE TABLE IF NOT EXISTS v2_clinic_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telephely_id UUID NOT NULL REFERENCES telephely(id) ON DELETE CASCADE,
  szotar_kezeles_id TEXT,
  szotar_kezeles_name TEXT,
  atomic_action_slug TEXT NOT NULL,
  conditions JSONB DEFAULT '{}',
  confidence REAL DEFAULT 0,
  reviewed BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_v2_mappings_telephely ON v2_clinic_mappings(telephely_id);
CREATE INDEX IF NOT EXISTS idx_v2_mappings_action ON v2_clinic_mappings(atomic_action_slug);
CREATE INDEX IF NOT EXISTS idx_v2_mappings_telephely_action ON v2_clinic_mappings(telephely_id, atomic_action_slug);

-- 2. Per-clinic parameter overrides (e.g., default crown material, canal counts)
CREATE TABLE IF NOT EXISTS v2_clinic_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telephely_id UUID NOT NULL UNIQUE REFERENCES telephely(id) ON DELETE CASCADE,
  overrides JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Audit trail for V2 pipeline executions
CREATE TABLE IF NOT EXISTS v2_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telephely_id UUID NOT NULL REFERENCES telephely(id),
  doctor_id UUID,
  patient_ref TEXT,
  transcript TEXT,
  llm_raw_response TEXT,
  pipeline_output JSONB,
  clinical_validation_report JSONB,
  timing JSONB,
  tokens_used INTEGER,
  review_status TEXT DEFAULT 'pending_quick',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_v2_sessions_telephely ON v2_sessions(telephely_id);
CREATE INDEX IF NOT EXISTS idx_v2_sessions_created ON v2_sessions(created_at DESC);

-- 4. RLS Policies
ALTER TABLE v2_clinic_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_clinic_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_sessions ENABLE ROW LEVEL SECURITY;

-- v2_clinic_mappings: users can read mappings for their telephely
CREATE POLICY "Users can view their telephely mappings"
  ON v2_clinic_mappings FOR SELECT
  USING (
    telephely_id IN (
      SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()
    )
  );

-- v2_clinic_mappings: service role can manage all
CREATE POLICY "Service role manages all mappings"
  ON v2_clinic_mappings FOR ALL
  USING (auth.role() = 'service_role');

-- v2_clinic_defaults: users can read defaults for their telephely
CREATE POLICY "Users can view their telephely defaults"
  ON v2_clinic_defaults FOR SELECT
  USING (
    telephely_id IN (
      SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages all defaults"
  ON v2_clinic_defaults FOR ALL
  USING (auth.role() = 'service_role');

-- v2_sessions: users can view sessions for their telephely
CREATE POLICY "Users can view their telephely sessions"
  ON v2_sessions FOR SELECT
  USING (
    telephely_id IN (
      SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages all sessions"
  ON v2_sessions FOR ALL
  USING (auth.role() = 'service_role');
