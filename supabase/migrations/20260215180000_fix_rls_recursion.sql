-- Fix RLS Recursion and Restore Visibility

-- 1. Create a security definer helper to check membership without recursion
-- This function skips RLS and allows us to check membership safely
CREATE OR REPLACE FUNCTION public.check_is_telephely_admin(_user_id uuid, _telephely_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.telephely_memberships
    WHERE user_id = _user_id
    AND telephely_id = _telephely_id
    AND role = 'klinika_admin'
  );
$$;

-- 2. Drop existing recursive policies on telephely_memberships
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.telephely_memberships;
DROP POLICY IF EXISTS "Klinika Admins can view memberships for their telephely" ON public.telephely_memberships;
DROP POLICY IF EXISTS "Klinika Admins can manage memberships" ON public.telephely_memberships;
DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.telephely_memberships;

-- 3. Redefine non-recursive policies for telephely_memberships
CREATE POLICY "System Admins can manage all memberships"
  ON public.telephely_memberships
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Users can view their own memberships"
  ON public.telephely_memberships
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Klinika Admins can view memberships for their telephely"
  ON public.telephely_memberships
  FOR SELECT
  USING (check_is_telephely_admin(auth.uid(), telephely_id));

-- 4. Fix Telephely policies to avoid recursion
DROP POLICY IF EXISTS "Users can view telephelys they are members of" ON public.telephely;
DROP POLICY IF EXISTS "Admins can view all telephelys" ON public.telephely;
DROP POLICY IF EXISTS "Admins can manage telephely" ON public.telephely;
DROP POLICY IF EXISTS "Users can view their company's telephely" ON public.telephely;

CREATE POLICY "System Admins can manage all telephelys"
  ON public.telephely
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "View telephely if member"
  ON public.telephely
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.telephely_memberships
      WHERE user_id = auth.uid()
      AND telephely_id = telephely.id
    )
  );
