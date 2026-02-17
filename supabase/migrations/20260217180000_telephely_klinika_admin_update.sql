-- Allow Klinika Admins to update telephely records they are members of
-- This is needed so they can set/edit flexi_domain and probapaciens_neve from the Dashboard

CREATE POLICY "Klinika Admins can update their telephely"
  ON public.telephely
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.telephely_memberships
      WHERE user_id = auth.uid()
      AND telephely_id = telephely.id
      AND role = 'klinika_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.telephely_memberships
      WHERE user_id = auth.uid()
      AND telephely_id = telephely.id
      AND role = 'klinika_admin'
    )
  );
