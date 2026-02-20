-- Fix flexi_auth constraint conflicts that break per-telephely isolation.
--
-- Problems identified:
-- 1. `flexi_auth_flexi_username_unique` (migration 20251209225632) – globally unique
--    on flexi_username, so the same Flexi email cannot appear in more than one row
--    even across different telephelyek. This blocked every new per-telephely insert.
-- 2. The original schema had `user_id uuid NOT NULL UNIQUE`, meaning one row per user
--    globally. Our new model needs one row per (user, telephely).
-- 3. Old rows with telephely_id = NULL from before the isolation change keep the
--    flexi_username occupied under constraint (1), so even a fresh connect fails.

-- Drop the global flexi_username unique constraint
ALTER TABLE public.flexi_auth
  DROP CONSTRAINT IF EXISTS flexi_auth_flexi_username_unique;

-- Drop the original single-user-per-row unique (may or may not still exist by name)
ALTER TABLE public.flexi_auth
  DROP CONSTRAINT IF EXISTS flexi_auth_user_id_key;

-- Clean up any legacy rows where telephely_id IS NULL so they don't block inserts
-- (users must reconnect per telephely; old rows are no longer meaningful)
DELETE FROM public.flexi_auth WHERE telephely_id IS NULL;

-- Ensure the correct composite unique is still present (created in prior migration)
ALTER TABLE public.flexi_auth
  DROP CONSTRAINT IF EXISTS flexi_auth_user_telephely_key;

ALTER TABLE public.flexi_auth
  ADD CONSTRAINT flexi_auth_user_telephely_key UNIQUE (user_id, telephely_id);
