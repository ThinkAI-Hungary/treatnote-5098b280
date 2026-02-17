-- Admin RLS Policies for Cross-Company Access

-- Allow admins to view all companies
DROP POLICY IF EXISTS "Admins can view all companies" ON public.companies;
CREATE POLICY "Admins can view all companies"
  ON public.companies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Allow admins to view all telephelys
DROP POLICY IF EXISTS "Admins can view all telephelys" ON public.telephely;
CREATE POLICY "Admins can view all telephelys"
  ON public.telephely
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Allow admins to insert/update/delete telephely_memberships across all companies
DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.telephely_memberships;
CREATE POLICY "Admins can manage all memberships"
  ON public.telephely_memberships
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Allow admins to view all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );
