-- Clean up orphaned profile and user_role data from previous deletion
DELETE FROM public.folder_access WHERE user_id = 'b90009e4-a744-415b-8121-d499d2818da4';
DELETE FROM public.user_roles WHERE user_id = 'b90009e4-a744-415b-8121-d499d2818da4';
DELETE FROM public.profiles WHERE user_id = 'b90009e4-a744-415b-8121-d499d2818da4';