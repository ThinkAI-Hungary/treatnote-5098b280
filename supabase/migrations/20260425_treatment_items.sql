-- ============================================================
-- Migration: Treatment Items Catalog + Plan Items Enhancement
-- ============================================================

-- 1. Create clinic_treatment_items_stdl table
CREATE TABLE IF NOT EXISTS public.clinic_treatment_items_stdl (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telephely_id UUID NOT NULL REFERENCES public.telephely(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  price INTEGER,

  -- Visual cue (AI-classified, admin-editable)
  visual_group TEXT NOT NULL DEFAULT 'diagnostic',
  visual_color TEXT NOT NULL DEFAULT '#64748b',
  visual_icon TEXT NOT NULL DEFAULT 'dot_outline',

  -- Tooth relationship
  is_per_tooth BOOLEAN DEFAULT true,
  applicable_statuses TEXT[],

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(telephely_id, name)
);

-- 2. Add columns to patient_treatment_plan_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patient_treatment_plan_items'
      AND column_name = 'treatment_item_id'
  ) THEN
    ALTER TABLE public.patient_treatment_plan_items
      ADD COLUMN treatment_item_id UUID REFERENCES public.clinic_treatment_items_stdl(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patient_treatment_plan_items'
      AND column_name = 'price_snapshot'
  ) THEN
    ALTER TABLE public.patient_treatment_plan_items
      ADD COLUMN price_snapshot INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patient_treatment_plan_items'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.patient_treatment_plan_items
      ADD COLUMN status TEXT DEFAULT 'planned';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patient_treatment_plan_items'
      AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.patient_treatment_plan_items
      ADD COLUMN notes TEXT;
  END IF;
END $$;

-- 3. RLS for clinic_treatment_items_stdl
ALTER TABLE public.clinic_treatment_items_stdl ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telephely_members_read_treatment_items_stdl"
  ON public.clinic_treatment_items_stdl
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.telephely_memberships tm
      WHERE tm.telephely_id = clinic_treatment_items_stdl.telephely_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "klinika_admin_manage_treatment_items_stdl"
  ON public.clinic_treatment_items_stdl
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.telephely_memberships tm
      WHERE tm.telephely_id = clinic_treatment_items_stdl.telephely_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('klinika_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.telephely_memberships tm
      WHERE tm.telephely_id = clinic_treatment_items_stdl.telephely_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('klinika_admin', 'admin')
    )
  );

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_clinic_treatment_items_stdl_telephely
  ON public.clinic_treatment_items_stdl(telephely_id);

CREATE INDEX IF NOT EXISTS idx_clinic_treatment_items_stdl_category
  ON public.clinic_treatment_items_stdl(telephely_id, category);
