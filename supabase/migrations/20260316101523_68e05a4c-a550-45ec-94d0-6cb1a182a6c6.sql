
-- Create tournament visibility enum (reuse match_visibility pattern)
CREATE TYPE public.tournament_visibility AS ENUM ('public', 'private');

-- Create tournament status enum
CREATE TYPE public.tournament_status AS ENUM ('draft', 'active', 'completed', 'cancelled');

-- Create tournament format enum
CREATE TYPE public.tournament_format AS ENUM ('groups', 'americano', 'king_of_court');

-- Create tournament player status enum
CREATE TYPE public.tournament_player_status AS ENUM ('confirmed', 'cancelled');

-- Tournaments table
CREATE TABLE public.tournaments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  status public.tournament_status NOT NULL DEFAULT 'draft',
  visibility public.tournament_visibility NOT NULL DEFAULT 'public',
  format_type public.tournament_format NOT NULL DEFAULT 'groups',
  tournament_type TEXT NOT NULL DEFAULT 'pairs',
  player_count INTEGER NOT NULL DEFAULT 8,
  court_count INTEGER NOT NULL DEFAULT 2,
  total_time_mins INTEGER,
  match_config JSONB DEFAULT '{}',
  bracket_config JSONB DEFAULT '{}',
  club TEXT,
  scheduled_date DATE,
  scheduled_time TIME,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Public tournaments visible to all authenticated; private only to creator/invited
CREATE POLICY "Anyone can view public tournaments"
  ON public.tournaments FOR SELECT TO authenticated
  USING (visibility = 'public' OR created_by = auth.uid());

CREATE POLICY "Creator can insert tournaments"
  ON public.tournaments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can update own tournaments"
  ON public.tournaments FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can delete own tournaments"
  ON public.tournaments FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- Trigger for updated_at
CREATE TRIGGER update_tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tournament players table
CREATE TABLE public.tournament_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  team_id TEXT,
  status public.tournament_player_status NOT NULL DEFAULT 'confirmed',
  side_preference TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tournament players"
  ON public.tournament_players FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can join tournaments"
  ON public.tournament_players FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participation"
  ON public.tournament_players FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can leave tournaments"
  ON public.tournament_players FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Tournament invitations table (mirrors match_invitations)
CREATE TABLE public.tournament_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL,
  invited_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create tournament invitations"
  ON public.tournament_invitations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = invited_by);

CREATE POLICY "Users can view their tournament invitations"
  ON public.tournament_invitations FOR SELECT TO authenticated
  USING (auth.uid() = invited_by OR auth.uid() = invited_user_id);

CREATE POLICY "Invited users can respond"
  ON public.tournament_invitations FOR UPDATE TO authenticated
  USING (auth.uid() = invited_user_id);

-- Tournament matches table
CREATE TABLE public.tournament_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_type TEXT NOT NULL DEFAULT 'group',
  round_number INTEGER NOT NULL DEFAULT 1,
  match_number INTEGER NOT NULL DEFAULT 1,
  team_a_id TEXT,
  team_b_id TEXT,
  court_number INTEGER,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  match_config JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  estimated_mins INTEGER,
  actual_mins INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tournament matches"
  ON public.tournament_matches FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Creator can manage tournament matches"
  ON public.tournament_matches FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_id AND t.created_by = auth.uid()
  ));

-- Enable realtime for tournament matches
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_matches;

-- Allow invited users to see private tournaments
CREATE POLICY "Invited users can view private tournaments"
  ON public.tournaments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_invitations ti
      WHERE ti.tournament_id = id AND ti.invited_user_id = auth.uid()
    )
  );

-- Allow invited users to see private tournaments they've joined
CREATE POLICY "Players can view their tournaments"
  ON public.tournaments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_players tp
      WHERE tp.tournament_id = id AND tp.user_id = auth.uid()
    )
  );
