-- Add full_name to invitations
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS full_name text;

-- Update handle_invite_acceptance to use full_name from invitation if available
CREATE OR REPLACE FUNCTION public.handle_invite_acceptance()
RETURNS trigger AS $$
DECLARE
  invite_record record;
BEGIN
  -- Check for invitation matching email
  SELECT * INTO invite_record
  FROM public.invitations
  WHERE invited_email = new.email
  AND status = 'pending'
  AND expires_at > now()
  LIMIT 1;

  IF invite_record IS NOT NULL THEN
      -- Valid invite found.
      
      INSERT INTO public.profiles (user_id, full_name)
      VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', invite_record.full_name))
      ON CONFLICT (user_id) DO NOTHING;

      -- 2. Create Membership
      INSERT INTO public.telephely_memberships (user_id, telephely_id, role)
      VALUES (new.id, invite_record.telephely_id, invite_record.role)
      ON CONFLICT (user_id, telephely_id) DO NOTHING;

      -- 3. Mark invite used
      UPDATE public.invitations
      SET status = 'accepted',
          invited_user_id = new.id,
          responded_at = now(),
          used_at = now()
      WHERE id = invite_record.id;
      
      -- 4. Set current telephely
      UPDATE public.profiles
      SET current_telephely_id = invite_record.telephely_id
      WHERE user_id = new.id;
      
  ELSE
      -- No invite found.
      -- Check if "admin_created" flag is present
      IF (new.raw_user_meta_data->>'admin_created')::boolean IS NOT TRUE THEN
          RAISE EXCEPTION 'Registration is invite-only.';
      END IF;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
