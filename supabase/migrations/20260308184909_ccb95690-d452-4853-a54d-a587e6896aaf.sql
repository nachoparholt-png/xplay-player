
-- Match invitations table
CREATE TABLE public.match_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL,
  invited_user_id UUID NOT NULL,
  team TEXT NOT NULL,
  slot_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(match_id, invited_user_id, status)
);

ALTER TABLE public.match_invitations ENABLE ROW LEVEL SECURITY;

-- Inviter can create invitations
CREATE POLICY "Users can create invitations"
  ON public.match_invitations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = invited_by);

-- Invited user or inviter can view
CREATE POLICY "Users can view their invitations"
  ON public.match_invitations FOR SELECT
  TO authenticated
  USING (auth.uid() = invited_by OR auth.uid() = invited_user_id);

-- Invited user can update (accept/decline)
CREATE POLICY "Invited users can respond"
  ON public.match_invitations FOR UPDATE
  TO authenticated
  USING (auth.uid() = invited_user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_invitations;
-- Also enable realtime on match_players for live court updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_players;
