-- Add telephely_id to flexi_auth for per-telephely Flexi-Dent connection isolation
-- Each user must connect their Flexi account separately for every telephely they access.

-- 1. Add telephely_id column (nullable so existing rows are not broken)
ALTER TABLE public.flexi_auth
  ADD COLUMN IF NOT EXISTS telephely_id uuid REFERENCES public.telephely(id) ON DELETE CASCADE;

-- 2. Drop the old single-user unique constraint if it exists
ALTER TABLE public.flexi_auth
  DROP CONSTRAINT IF EXISTS flexi_auth_user_id_key;

-- 3. Add new composite unique constraint: one flexi account per (user, telephely)
ALTER TABLE public.flexi_auth
  DROP CONSTRAINT IF EXISTS flexi_auth_user_telephely_key;

ALTER TABLE public.flexi_auth
  ADD CONSTRAINT flexi_auth_user_telephely_key UNIQUE (user_id, telephely_id);

-- 4. Create index for fast lookup by telephely
CREATE INDEX IF NOT EXISTS flexi_auth_telephely_id_idx
  ON public.flexi_auth (telephely_id);

-- Note: Existing rows will have telephely_id = NULL.
-- Users will need to reconnect their Flexi account for each telephely going forward.
-- Old rows with NULL telephely_id are effectively "orphaned" and can be ignored by the
-- updated queries (which always filter by telephely_id).
