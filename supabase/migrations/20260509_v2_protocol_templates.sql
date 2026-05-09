-- ============================================================
-- TreatNote V2 Engine — Protocol Templates Table
-- ============================================================

CREATE TABLE IF NOT EXISTS v2_protocol_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  name_hu TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'egyeb',
  triggers JSONB NOT NULL DEFAULT '[]',
  atomic_actions JSONB NOT NULL DEFAULT '[]',
  visits JSONB NOT NULL DEFAULT '[]',
  description TEXT,
  is_global BOOLEAN DEFAULT false,
  telephely_id UUID REFERENCES telephely(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_v2_templates_slug ON v2_protocol_templates(slug);
CREATE INDEX IF NOT EXISTS idx_v2_templates_telephely ON v2_protocol_templates(telephely_id);
CREATE INDEX IF NOT EXISTS idx_v2_templates_category ON v2_protocol_templates(category);

-- RLS
ALTER TABLE v2_protocol_templates ENABLE ROW LEVEL SECURITY;

-- Global templates visible to all
CREATE POLICY "Anyone can view global templates"
  ON v2_protocol_templates FOR SELECT
  USING (is_global = true);

-- Users can view their telephely templates
CREATE POLICY "Users can view their telephely templates"
  ON v2_protocol_templates FOR SELECT
  USING (
    telephely_id IN (
      SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()
    )
  );

-- Users can manage their telephely templates
CREATE POLICY "Users can manage their telephely templates"
  ON v2_protocol_templates FOR ALL
  USING (
    telephely_id IN (
      SELECT telephely_id FROM telephely_memberships WHERE user_id = auth.uid()
    )
  );

-- Service role manages all
CREATE POLICY "Service role manages all templates"
  ON v2_protocol_templates FOR ALL
  USING (auth.role() = 'service_role');
