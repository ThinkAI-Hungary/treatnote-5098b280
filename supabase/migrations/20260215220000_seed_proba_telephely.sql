
-- Seed Próba Telephely and Dictionary Data
DO $$
DECLARE
    v_company_id uuid;
    v_telephely_id uuid;
    v_user_id uuid;
    v_rule_id uuid;
    v_visit_id uuid;
BEGIN
    -- 1. Ensure Company exists
    SELECT id INTO v_company_id FROM companies WHERE name = 'Próba cég';
    
    IF v_company_id IS NULL THEN
        INSERT INTO companies (name, slug)
        VALUES ('Próba cég', 'proba-ceg')
        RETURNING id INTO v_company_id;
    END IF;

    -- 2. Ensure Telephely exists
    SELECT id INTO v_telephely_id FROM telephely WHERE name = 'Próba telephely' AND company_id = v_company_id;
    
    IF v_telephely_id IS NULL THEN
        INSERT INTO telephely (name, company_id)
        VALUES ('Próba telephely', v_company_id)
        RETURNING id INTO v_telephely_id;
    END IF;

    -- 3. Seed Szotar Data (Corrected)
    -- Insert/Update main szotar record
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'szotar') THEN
        -- Get a valid user ID for created_by (e.g., the first user created)
        SELECT id INTO v_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
        
        -- If no user found (unlikely), generate a dummy UUID just to satisfy the constraint
        IF v_user_id IS NULL THEN
            v_user_id := gen_random_uuid();
        END IF;

        INSERT INTO szotar (telephely_id, content, created_by)
        VALUES (v_telephely_id, '["Ez a próba telephely szótára."]'::jsonb, v_user_id)
        ON CONFLICT (telephely_id) DO NOTHING;
    END IF;

    -- 4. Seed Szotar Kezelesek (10 examples)
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'szotar_kezelesek') THEN
        -- Clear existing for this telephely to avoid duplicates if re-running without conflict keys
        DELETE FROM szotar_kezelesek WHERE telephely_id = v_telephely_id;

        INSERT INTO szotar_kezelesek (telephely_id, category, name) VALUES
        (v_telephely_id, 'Vizsgálat', 'Státuszfelvétel'),
        (v_telephely_id, 'Vizsgálat', 'Konzultáció'),
        (v_telephely_id, 'Konzerváló fogászat', 'Esztétikus tömés (egy felszínű)'),
        (v_telephely_id, 'Konzerváló fogászat', 'Esztétikus tömés (két felszínű)'),
        (v_telephely_id, 'Konzerváló fogászat', 'Esztétikus tömés (három felszínű)'),
        (v_telephely_id, 'Gyökérkezelés', 'Trepanálás'),
        (v_telephely_id, 'Gyökérkezelés', 'Gyökértömés'),
        (v_telephely_id, 'Sebészet', 'Fogeltávolítás'),
        (v_telephely_id, 'Sebészet', 'Sutura'),
        (v_telephely_id, 'Profilaxis', 'Fogkőeltávolítás');
    END IF;
    
    -- 5. Seed Treatment Rules (Corrected)
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'treatment_rules') THEN
        -- Clear existing rules for this telephely
        DELETE FROM treatment_rules WHERE clinic_id = v_telephely_id;

        -- Create a sample rule: "Gyökérkezelés (2 ülés)"
        INSERT INTO treatment_rules (clinic_id, name, category, trigger_words)
        VALUES (v_telephely_id, 'Gyökérkezelés (2 ülés)', 'Gyökérkezelés', ARRAY['gyökérkezelés', 'trepanálás'])
        RETURNING id INTO v_rule_id;

        -- Visit 1: Trepanálás
        INSERT INTO rule_visits (rule_id, visit_number, duration_days, healing_months)
        VALUES (v_rule_id, 1, 1, 0)
        RETURNING id INTO v_visit_id;

        INSERT INTO rule_items (visit_id, name, quantity, unit, scaling, target_tooth_type)
        VALUES 
            (v_visit_id, 'Trepanálás', 1, 'darab', 'fix', 'all'),
            (v_visit_id, 'Gyökértűmés', 1, 'darab', 'fix', 'all');

        -- Visit 2: Gyökértömés (7 days later)
        INSERT INTO rule_visits (rule_id, visit_number, duration_days, healing_months)
        VALUES (v_rule_id, 2, 7, 0)
        RETURNING id INTO v_visit_id;

        INSERT INTO rule_items (visit_id, name, quantity, unit, scaling, target_tooth_type)
        VALUES (v_visit_id, 'Végleges gyökértömés', 1, 'darab', 'fix', 'all');
        
        -- Create another sample rule: "Fogeltávolítás"
        INSERT INTO treatment_rules (clinic_id, name, category, trigger_words)
        VALUES (v_telephely_id, 'Fogeltávolítás', 'Sebészet', ARRAY['húzás', 'eltávolítás', 'extractio'])
        RETURNING id INTO v_rule_id;

        -- Visit 1: Eltávolítás
        INSERT INTO rule_visits (rule_id, visit_number, duration_days, healing_months)
        VALUES (v_rule_id, 1, 1, 3) -- 3 months healing
        RETURNING id INTO v_visit_id;

        INSERT INTO rule_items (visit_id, name, quantity, unit, scaling, target_tooth_type)
        VALUES 
            (v_visit_id, 'Fogeltávolítás', 1, 'darab', 'fix', 'all'),
            (v_visit_id, 'Sutura', 1, 'darab', 'fix', 'all');
    END IF;
END $$;
