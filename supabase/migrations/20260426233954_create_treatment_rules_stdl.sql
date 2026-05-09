-- =============================================
-- TREATMENT RULES MODULE (STANDALONE) - Database Schema
-- =============================================

-- 1. treatment_rules_stdl: Fő szabály tábla (Standalone)
CREATE TABLE public.treatment_rules_stdl (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.telephely(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  trigger_words TEXT[] DEFAULT '{}',
  semantic_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. rule_visits_stdl: Vizitek (egy szabályhoz több tartozhat)
CREATE TABLE public.rule_visits_stdl (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.treatment_rules_stdl(id) ON DELETE CASCADE,
  visit_number INTEGER NOT NULL DEFAULT 1,
  duration_days INTEGER DEFAULT 0,
  healing_months INTEGER DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. rule_items_stdl: Tételek (egy vizithez több tartozhat)
CREATE TABLE public.rule_items_stdl (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.rule_visits_stdl(id) ON DELETE CASCADE,
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
CREATE INDEX idx_treatment_rules_stdl_clinic ON public.treatment_rules_stdl(clinic_id);
CREATE INDEX idx_rule_visits_stdl_rule ON public.rule_visits_stdl(rule_id);
CREATE INDEX idx_rule_items_stdl_visit ON public.rule_items_stdl(visit_id);

-- =============================================
-- RLS POLICIES
-- =============================================

-- treatment_rules_stdl RLS
ALTER TABLE public.treatment_rules_stdl ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic rules stdl" ON public.treatment_rules_stdl
  FOR SELECT USING (
    clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid())
    OR
    clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Klinika admins can insert rules stdl" ON public.treatment_rules_stdl
  FOR INSERT WITH CHECK (
    (clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can update rules stdl" ON public.treatment_rules_stdl
  FOR UPDATE USING (
    (clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can delete rules stdl" ON public.treatment_rules_stdl
  FOR DELETE USING (
    (clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

-- rule_visits_stdl RLS
ALTER TABLE public.rule_visits_stdl ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view visits for their rules stdl" ON public.rule_visits_stdl
  FOR SELECT USING (
    rule_id IN (
      SELECT id FROM public.treatment_rules_stdl 
      WHERE clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Klinika admins can insert visits stdl" ON public.rule_visits_stdl
  FOR INSERT WITH CHECK (
    rule_id IN (
      SELECT id FROM public.treatment_rules_stdl 
      WHERE clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can update visits stdl" ON public.rule_visits_stdl
  FOR UPDATE USING (
    rule_id IN (
      SELECT id FROM public.treatment_rules_stdl 
      WHERE clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can delete visits stdl" ON public.rule_visits_stdl
  FOR DELETE USING (
    rule_id IN (
      SELECT id FROM public.treatment_rules_stdl 
      WHERE clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

-- rule_items_stdl RLS
ALTER TABLE public.rule_items_stdl ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items stdl" ON public.rule_items_stdl
  FOR SELECT USING (
    visit_id IN (
      SELECT rv.id FROM public.rule_visits_stdl rv
      JOIN public.treatment_rules_stdl tr ON rv.rule_id = tr.id
      WHERE tr.clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR tr.clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Klinika admins can insert items stdl" ON public.rule_items_stdl
  FOR INSERT WITH CHECK (
    visit_id IN (
      SELECT rv.id FROM public.rule_visits_stdl rv
      JOIN public.treatment_rules_stdl tr ON rv.rule_id = tr.id
      WHERE tr.clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR tr.clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can update items stdl" ON public.rule_items_stdl
  FOR UPDATE USING (
    visit_id IN (
      SELECT rv.id FROM public.rule_visits_stdl rv
      JOIN public.treatment_rules_stdl tr ON rv.rule_id = tr.id
      WHERE tr.clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR tr.clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

CREATE POLICY "Klinika admins can delete items stdl" ON public.rule_items_stdl
  FOR DELETE USING (
    visit_id IN (
      SELECT rv.id FROM public.rule_visits_stdl rv
      JOIN public.treatment_rules_stdl tr ON rv.rule_id = tr.id
      WHERE tr.clinic_id IN (SELECT telephely_id FROM public.profiles WHERE user_id = auth.uid()) OR tr.clinic_id IN (SELECT current_telephely_id FROM public.profiles WHERE user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'klinika_admin')
    )
  );

-- Trigger az updated_at automatikus frissítésére
CREATE TRIGGER update_treatment_rules_stdl_updated_at
  BEFORE UPDATE ON public.treatment_rules_stdl
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.treatment_rules_stdl;
