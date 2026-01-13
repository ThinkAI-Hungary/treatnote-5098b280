-- Allow klinika_admins to update their own telephely
CREATE POLICY "Klinika admins can update their telephely" 
ON public.telephely 
FOR UPDATE 
USING (
  (id IN (
    SELECT profiles.telephely_id 
    FROM profiles 
    WHERE profiles.user_id = auth.uid()
  )) 
  AND (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = ANY (ARRAY['admin'::app_role, 'klinika_admin'::app_role])
  ))
);