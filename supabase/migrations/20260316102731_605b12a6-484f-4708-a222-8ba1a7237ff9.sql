
-- Create tournament_teams table
CREATE TABLE public.tournament_teams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_name text NOT NULL DEFAULT '',
  player1_id uuid NOT NULL,
  player2_id uuid,
  player1_side text,
  player2_side text,
  group_id text,
  seed integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view tournament teams
CREATE POLICY "Anyone can view tournament teams"
  ON public.tournament_teams
  FOR SELECT
  TO authenticated
  USING (true);

-- Creator can manage tournament teams
CREATE POLICY "Creator can manage tournament teams"
  ON public.tournament_teams
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_teams.tournament_id
        AND t.created_by = auth.uid()
    )
  );

-- Add suggestion_used and rating_exempt columns to tournaments
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS suggestion_used text,
  ADD COLUMN IF NOT EXISTS rating_exempt boolean NOT NULL DEFAULT false;
