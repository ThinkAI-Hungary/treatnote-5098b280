-- ============================================================
-- Migration: Telephely-scoped licenses
-- 1. Add telephely_id to licenses
-- 2. Backfill to first telephely per company
-- 3. Auto-assign trigger on telephely_memberships INSERT
-- 4. Auto-free trigger on telephely_memberships DELETE
-- 5. Update RLS to check telephely membership
-- ============================================================

-- Step 1: Add telephely_id column
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS telephely_id uuid REFERENCES public.telephely(id) ON DELETE CASCADE;

-- Step 2: Backfill – set telephely_id to the first (oldest) telephely of the company
UPDATE public.licenses l
SET telephely_id = (
  SELECT t.id
  FROM public.telephely t
  WHERE t.company_id = l.company_id
  ORDER BY t.created_at ASC
  LIMIT 1
)
WHERE telephely_id IS NULL;

-- Step 3: Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_licenses_telephely_id ON public.licenses(telephely_id);

-- ============================================================
-- Step 4: Auto-assign trigger – when a user joins a telephely,
-- find a free license for that telephely and assign it.
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_assign_license_on_join()
RETURNS TRIGGER AS $$
DECLARE
  free_license_id uuid;
BEGIN
  -- Find the oldest free, unexpired license in this telephely
  SELECT id INTO free_license_id
  FROM public.licenses
  WHERE telephely_id = NEW.telephely_id
    AND status = 'available'
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF free_license_id IS NOT NULL THEN
    UPDATE public.licenses
    SET assigned_user_id = NEW.user_id,
        status = 'assigned',
        updated_at = now()
    WHERE id = free_license_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_assign_license ON public.telephely_memberships;
CREATE TRIGGER trg_auto_assign_license
  AFTER INSERT ON public.telephely_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_license_on_join();

-- ============================================================
-- Step 5: Auto-free trigger – when a user is removed from a
-- telephely, release their license for that telephely.
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_free_license_on_leave()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.licenses
  SET assigned_user_id = NULL,
      status = 'available',
      updated_at = now()
  WHERE telephely_id = OLD.telephely_id
    AND assigned_user_id = OLD.user_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_free_license ON public.telephely_memberships;
CREATE TRIGGER trg_auto_free_license
  AFTER DELETE ON public.telephely_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_free_license_on_leave();

-- ============================================================
-- Step 6: Update RLS – users can view licenses for telephelyek
-- they are members of. Admins see all via company.
-- ============================================================
DROP POLICY IF EXISTS "Users can view their company licenses" ON public.licenses;
DROP POLICY IF EXISTS "Users can view licenses for their telephely" ON public.licenses;

CREATE POLICY "Users can view licenses for their telephely"
ON public.licenses FOR SELECT TO authenticated
USING (
  telephely_id IN (
    SELECT tm.telephely_id
    FROM public.telephely_memberships tm
    WHERE tm.user_id = auth.uid()
  )
  OR
  -- Company-level admins (global admins) see all licenses in their company
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
);
