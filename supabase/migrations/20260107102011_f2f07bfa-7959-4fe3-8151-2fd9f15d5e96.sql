-- Add admin role to user aronberes9@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('39a67c01-e230-46f6-84e0-81ffb594e79e', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;