-- Allow users to view companies they have a telephely membership for
DROP POLICY IF EXISTS "Users can view companies via membership" ON public.companies;
CREATE POLICY "Users can view companies via membership"
  ON public.companies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.telephely t
      JOIN public.telephely_memberships tm ON t.id = tm.telephely_id
      WHERE t.company_id = companies.id
      AND tm.user_id = auth.uid()
    )
  );

-- Also ensure they can see the telephely itself via membership
DROP POLICY IF EXISTS "Users can view telephelys via membership" ON public.telephely;
CREATE POLICY "Users can view telephelys via membership"
  ON public.telephely
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.telephely_memberships tm
      WHERE tm.telephely_id = telephely.id
      AND tm.user_id = auth.uid()
    )
  );
