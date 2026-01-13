-- =============================================
-- TREATMENT RULES MODULE - Database Schema
-- =============================================

-- 1. treatment_rules: Fő szabály tábla
CREATE TABLE treatment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES telephely(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  trigger_words TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. rule_visits: Vizitek (egy szabályhoz több tartozhat)
CREATE TABLE rule_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES treatment_rules(id) ON DELETE CASCADE,
  visit_number INTEGER NOT NULL DEFAULT 1,
  duration_days INTEGER DEFAULT 0,
  healing_months INTEGER DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. rule_items: Tételek (egy vizithez több tartozhat)
CREATE TABLE rule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES rule_visits(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'db',
  scaling TEXT NOT NULL DEFAULT 'per_tooth' 
    CHECK (scaling IN ('per_tooth', 'per_case', 'fix')),
  target_tooth_type TEXT NOT NULL DEFAULT 'all' 
    CHECK (target_tooth_type IN ('all', 'pillar_only', 'pontic_only')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexek a gyorsabb lekérdezéshez
CREATE INDEX idx_treatment_rules_clinic ON treatment_rules(clinic_id);
CREATE INDEX idx_rule_visits_rule ON rule_visits(rule_id);
CREATE INDEX idx_rule_items_visit ON rule_items(visit_id);

-- =============================================
-- RLS POLICIES
-- =============================================

-- treatment_rules RLS
ALTER TABLE treatment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic rules" ON treatment_rules
  FOR SELECT USING (
    clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Klinika admins can insert rules" ON treatment_rules
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can update rules" ON treatment_rules
  FOR UPDATE USING (
    clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can delete rules" ON treatment_rules
  FOR DELETE USING (
    clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

-- rule_visits RLS
ALTER TABLE rule_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view visits for their rules" ON rule_visits
  FOR SELECT USING (
    rule_id IN (
      SELECT id FROM treatment_rules 
      WHERE clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Klinika admins can insert visits" ON rule_visits
  FOR INSERT WITH CHECK (
    rule_id IN (
      SELECT id FROM treatment_rules 
      WHERE clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can update visits" ON rule_visits
  FOR UPDATE USING (
    rule_id IN (
      SELECT id FROM treatment_rules 
      WHERE clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can delete visits" ON rule_visits
  FOR DELETE USING (
    rule_id IN (
      SELECT id FROM treatment_rules 
      WHERE clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

-- rule_items RLS
ALTER TABLE rule_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items" ON rule_items
  FOR SELECT USING (
    visit_id IN (
      SELECT rv.id FROM rule_visits rv
      JOIN treatment_rules tr ON rv.rule_id = tr.id
      WHERE tr.clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Klinika admins can insert items" ON rule_items
  FOR INSERT WITH CHECK (
    visit_id IN (
      SELECT rv.id FROM rule_visits rv
      JOIN treatment_rules tr ON rv.rule_id = tr.id
      WHERE tr.clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can update items" ON rule_items
  FOR UPDATE USING (
    visit_id IN (
      SELECT rv.id FROM rule_visits rv
      JOIN treatment_rules tr ON rv.rule_id = tr.id
      WHERE tr.clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can delete items" ON rule_items
  FOR DELETE USING (
    visit_id IN (
      SELECT rv.id FROM rule_visits rv
      JOIN treatment_rules tr ON rv.rule_id = tr.id
      WHERE tr.clinic_id IN (SELECT telephely_id FROM profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

-- Trigger az updated_at automatikus frissítésére
CREATE TRIGGER update_treatment_rules_updated_at
  BEFORE UPDATE ON treatment_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();