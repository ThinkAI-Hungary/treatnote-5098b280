-- Create invitations table for tracking user invitations
CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invited_user_id UUID NOT NULL,
  invited_by_user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  telephely_id UUID NOT NULL REFERENCES public.telephely(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(invited_user_id, company_id, telephely_id)
);

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Users can view their own invitations
CREATE POLICY "Users can view their own invitations"
ON public.invitations FOR SELECT
USING (auth.uid() = invited_user_id);

-- Klinika admins can view invitations they created
CREATE POLICY "Klinika admins can view invitations they created"
ON public.invitations FOR SELECT
USING (auth.uid() = invited_by_user_id);

-- Klinika admins can create invitations
CREATE POLICY "Klinika admins can create invitations"
ON public.invitations FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'klinika_admin') OR 
  public.has_role(auth.uid(), 'admin')
);

-- Users can update their own invitations (accept/decline)
CREATE POLICY "Users can update their own invitations"
ON public.invitations FOR UPDATE
USING (auth.uid() = invited_user_id);

-- Admins can delete invitations
CREATE POLICY "Admins can delete invitations"
ON public.invitations FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin') OR 
  auth.uid() = invited_by_user_id
);