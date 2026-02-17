-- Backfill telephely_memberships from existing profiles
-- This ensures existing users can still access their assigned telephelys

INSERT INTO public.telephely_memberships (user_id, telephely_id, role)
SELECT 
    p.user_id,
    p.telephely_id,
    COALESCE(ur.role, 'user'::app_role) as role
FROM public.profiles p
LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
WHERE p.telephely_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM public.telephely_memberships tm 
    WHERE tm.user_id = p.user_id 
      AND tm.telephely_id = p.telephely_id
  );

-- Also set current_telephely_id for users who don't have it set
UPDATE public.profiles
SET current_telephely_id = telephely_id
WHERE current_telephely_id IS NULL
  AND telephely_id IS NOT NULL;
