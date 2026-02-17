-- Fix RLS policies for Telephely Data (Treatment Rules, Szotar)
-- Switch from checking profiles.telephely_id (home) to telephely_memberships (active/all access)

-- ==========================================================
-- 1. treatment_rules (uses clinic_id)
-- ==========================================================

DROP POLICY IF EXISTS "Users can view their clinic rules" ON treatment_rules;
CREATE POLICY "Users can view their clinic rules" ON treatment_rules
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM telephely_memberships 
      WHERE telephely_id = treatment_rules.clinic_id
    )
    OR 
    (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
  );

DROP POLICY IF EXISTS "Klinika admins can insert rules" ON treatment_rules;
CREATE POLICY "Klinika admins can insert rules" ON treatment_rules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM telephely_memberships 
      WHERE user_id = auth.uid() 
      AND telephely_id = treatment_rules.clinic_id 
      AND role = 'klinika_admin'
    )
    OR 
    (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
  );

DROP POLICY IF EXISTS "Klinika admins can update rules" ON treatment_rules;
CREATE POLICY "Klinika admins can update rules" ON treatment_rules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM telephely_memberships 
      WHERE user_id = auth.uid() 
      AND telephely_id = treatment_rules.clinic_id 
      AND role = 'klinika_admin'
    )
    OR 
    (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
  );

DROP POLICY IF EXISTS "Klinika admins can delete rules" ON treatment_rules;
CREATE POLICY "Klinika admins can delete rules" ON treatment_rules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM telephely_memberships 
      WHERE user_id = auth.uid() 
      AND telephely_id = treatment_rules.clinic_id 
      AND role = 'klinika_admin'
    )
    OR 
    (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
  );

-- ==========================================================
-- 2. rule_visits (linked to treatment_rules)
-- ==========================================================

DROP POLICY IF EXISTS "Users can view visits for their rules" ON rule_visits;
CREATE POLICY "Users can view visits for their rules" ON rule_visits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM treatment_rules
      WHERE treatment_rules.id = rule_visits.rule_id
      AND (
        auth.uid() IN (
          SELECT user_id FROM telephely_memberships 
          WHERE telephely_id = treatment_rules.clinic_id
        )
        OR 
        (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "Klinika admins can insert visits" ON rule_visits;
CREATE POLICY "Klinika admins can insert visits" ON rule_visits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM treatment_rules
      WHERE treatment_rules.id = rule_visits.rule_id
      AND (
          EXISTS (
            SELECT 1 FROM telephely_memberships 
            WHERE user_id = auth.uid() 
            AND telephely_id = treatment_rules.clinic_id 
            AND role = 'klinika_admin'
          )
          OR 
          (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "Klinika admins can update visits" ON rule_visits;
CREATE POLICY "Klinika admins can update visits" ON rule_visits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM treatment_rules
      WHERE treatment_rules.id = rule_visits.rule_id
      AND (
          EXISTS (
            SELECT 1 FROM telephely_memberships 
            WHERE user_id = auth.uid() 
            AND telephely_id = treatment_rules.clinic_id 
            AND role = 'klinika_admin'
          )
          OR 
          (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "Klinika admins can delete visits" ON rule_visits;
CREATE POLICY "Klinika admins can delete visits" ON rule_visits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM treatment_rules
      WHERE treatment_rules.id = rule_visits.rule_id
      AND (
          EXISTS (
            SELECT 1 FROM telephely_memberships 
            WHERE user_id = auth.uid() 
            AND telephely_id = treatment_rules.clinic_id 
            AND role = 'klinika_admin'
          )
          OR 
          (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
      )
    )
  );

-- ==========================================================
-- 3. rule_items (linked to rule_visits)
-- ==========================================================

DROP POLICY IF EXISTS "Users can view items for their visits" ON rule_items;
CREATE POLICY "Users can view items for their visits" ON rule_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rule_visits
      JOIN treatment_rules ON treatment_rules.id = rule_visits.rule_id
      WHERE rule_visits.id = rule_items.visit_id
      AND (
        auth.uid() IN (
          SELECT user_id FROM telephely_memberships 
          WHERE telephely_id = treatment_rules.clinic_id
        )
        OR 
        (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
      )
    )
  );

-- Similar policies for insert/update/delete on items omitted for brevity but should follow pattern if needed.
-- Assuming admins edit rules via parent/child relations mostly, but let's be safe and add them:

DROP POLICY IF EXISTS "Klinika admins can insert items" ON rule_items;
CREATE POLICY "Klinika admins can insert items" ON rule_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM rule_visits
      JOIN treatment_rules ON treatment_rules.id = rule_visits.rule_id
      WHERE rule_visits.id = rule_items.visit_id
      AND (
        EXISTS (
            SELECT 1 FROM telephely_memberships 
            WHERE user_id = auth.uid() 
            AND telephely_id = treatment_rules.clinic_id 
            AND role = 'klinika_admin'
          )
        OR 
        (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "Klinika admins can update items" ON rule_items;
CREATE POLICY "Klinika admins can update items" ON rule_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM rule_visits
      JOIN treatment_rules ON treatment_rules.id = rule_visits.rule_id
      WHERE rule_visits.id = rule_items.visit_id
      AND (
        EXISTS (
            SELECT 1 FROM telephely_memberships 
            WHERE user_id = auth.uid() 
            AND telephely_id = treatment_rules.clinic_id 
            AND role = 'klinika_admin'
          )
        OR 
        (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "Klinika admins can delete items" ON rule_items;
CREATE POLICY "Klinika admins can delete items" ON rule_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM rule_visits
      JOIN treatment_rules ON treatment_rules.id = rule_visits.rule_id
      WHERE rule_visits.id = rule_items.visit_id
      AND (
        EXISTS (
            SELECT 1 FROM telephely_memberships 
            WHERE user_id = auth.uid() 
            AND telephely_id = treatment_rules.clinic_id 
            AND role = 'klinika_admin'
          )
        OR 
        (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
      )
    )
  );

-- ==========================================================
-- 4. Szotar (uses telephely_id)
-- ==========================================================
-- Only proceed if table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'szotar') THEN
        
        -- Select
        DROP POLICY IF EXISTS "Users can view szotar" ON szotar;
        CREATE POLICY "Users can view szotar" ON szotar
          FOR SELECT USING (
            auth.uid() IN (
              SELECT user_id FROM telephely_memberships 
              WHERE telephely_id = szotar.telephely_id
            )
            OR 
            (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
          );

        -- Mod (Admin only)
        DROP POLICY IF EXISTS "Klinika admins can manage szotar" ON szotar;
        CREATE POLICY "Klinika admins can manage szotar" ON szotar
          FOR ALL USING (
            EXISTS (
              SELECT 1 FROM telephely_memberships 
              WHERE user_id = auth.uid() 
              AND telephely_id = szotar.telephely_id 
              AND role = 'klinika_admin'
            )
            OR 
            (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
          );
          
    END IF;
END $$;

-- ==========================================================
-- 5. Szotar Kezelesek (uses telephely_id)
-- ==========================================================
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'szotar_kezelesek') THEN
        
        -- Select
        DROP POLICY IF EXISTS "Users can view szotar_kezelesek" ON szotar_kezelesek;
        CREATE POLICY "Users can view szotar_kezelesek" ON szotar_kezelesek
          FOR SELECT USING (
            auth.uid() IN (
              SELECT user_id FROM telephely_memberships 
              WHERE telephely_id = szotar_kezelesek.telephely_id
            )
            OR 
            (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
          );

        -- Mod (Admin only)
        DROP POLICY IF EXISTS "Klinika admins can manage szotar_kezelesek" ON szotar_kezelesek;
        CREATE POLICY "Klinika admins can manage szotar_kezelesek" ON szotar_kezelesek
          FOR ALL USING (
            EXISTS (
              SELECT 1 FROM telephely_memberships 
              WHERE user_id = auth.uid() 
              AND telephely_id = szotar_kezelesek.telephely_id 
              AND role = 'klinika_admin'
            )
            OR 
            (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
          );
          
    END IF;
END $$;
