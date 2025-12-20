-- Delete user notbyalongway@gmail.com (id: d222c53b-0180-49cd-a480-60db10ccadc4) completely

-- Delete from invitations (both sent and received)
DELETE FROM public.invitations WHERE invited_user_id = 'd222c53b-0180-49cd-a480-60db10ccadc4';
DELETE FROM public.invitations WHERE invited_by_user_id = 'd222c53b-0180-49cd-a480-60db10ccadc4';

-- Delete user roles
DELETE FROM public.user_roles WHERE user_id = 'd222c53b-0180-49cd-a480-60db10ccadc4';

-- Delete folder access
DELETE FROM public.folder_access WHERE user_id = 'd222c53b-0180-49cd-a480-60db10ccadc4';

-- Delete flexi auth
DELETE FROM public.flexi_auth WHERE user_id = 'd222c53b-0180-49cd-a480-60db10ccadc4';

-- Delete profile
DELETE FROM public.profiles WHERE user_id = 'd222c53b-0180-49cd-a480-60db10ccadc4';

-- Delete from auth.users (this will cascade to any remaining references)
DELETE FROM auth.users WHERE id = 'd222c53b-0180-49cd-a480-60db10ccadc4';