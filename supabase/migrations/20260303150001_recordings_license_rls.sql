-- ============================================================
-- RLS: Gate recordings (hangfelvétel) behind active license
-- Users can only INSERT recordings if they have an active,
-- unexpired license assigned to them in their current telephely.
-- ============================================================

-- First check if the recordings table exists before adding policy
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recordings'
  ) THEN
    -- Drop old policy if any
    DROP POLICY IF EXISTS "license_required_for_recordings" ON public.recordings;

    EXECUTE $policy$
      CREATE POLICY "license_required_for_recordings"
      ON public.recordings FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.licenses l
          JOIN public.profiles p ON p.user_id = auth.uid()
          WHERE l.assigned_user_id = auth.uid()
            AND l.telephely_id = p.current_telephely_id
            AND l.status = 'assigned'
            AND (l.expires_at IS NULL OR l.expires_at > now())
        )
      )
    $policy$;
  END IF;
END;
$$;
