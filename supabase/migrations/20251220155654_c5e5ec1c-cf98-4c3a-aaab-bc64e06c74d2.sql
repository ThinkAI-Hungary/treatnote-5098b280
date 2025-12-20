-- Add invitation_token column to invitations table for email-based invitations
ALTER TABLE public.invitations 
ADD COLUMN IF NOT EXISTS invitation_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS invited_email TEXT;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(invitation_token);

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(invited_email);