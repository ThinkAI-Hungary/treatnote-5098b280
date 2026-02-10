
-- Drop the overly permissive "Service role manages licenses" policy
-- (service role already bypasses RLS, so this policy is unnecessary)
DROP POLICY IF EXISTS "Service role manages licenses" ON public.licenses;

-- Add proper policies for admin management via authenticated context
CREATE POLICY "Admins can manage all licenses"
ON public.licenses FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'klinika_admin')
  )
  AND company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'klinika_admin')
  )
  AND company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);
