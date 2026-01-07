-- First check if the user exists and add admin role
DO $$
BEGIN
  -- Insert the admin role
  INSERT INTO public.user_roles (user_id, role)
  SELECT '39a67c01-e230-46f6-84e0-81ffb594e79e', 'admin'::app_role
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = '39a67c01-e230-46f6-84e0-81ffb594e79e' 
    AND role = 'admin'
  );
END $$;