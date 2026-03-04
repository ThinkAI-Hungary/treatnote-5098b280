-- ============================================================
-- Add UPDATE RLS policy for klinika_admin on licenses table
-- ============================================================

CREATE POLICY "Klinika admins can update licenses in their telephely"
ON public.licenses FOR UPDATE TO authenticated
USING (
  telephely_id IN (
    SELECT tm.telephely_id 
    FROM public.telephely_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.role = 'klinika_admin'
  )
  OR
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
      )
  )
)
WITH CHECK (
  telephely_id IN (
    SELECT tm.telephely_id 
    FROM public.telephely_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.role = 'klinika_admin'
  )
  OR
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
      )
  )
);
