-- Allow admins to update companies (needed for is_active deactivation toggle).
-- Previously only INSERT/SELECT/DELETE were covered by admin policies.
CREATE POLICY "Admins can update companies"
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
