
-- Add columns to tournament_bets
ALTER TABLE public.tournament_bets
  ADD COLUMN IF NOT EXISTS odds_at_placement numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS collected_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS auto_collected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_bet_id uuid REFERENCES public.tournament_bets(id) DEFAULT NULL;

-- Make window_id nullable
ALTER TABLE public.tournament_bets
  ALTER COLUMN window_id DROP NOT NULL;

-- Add estimated column to tournament_bet_odds
ALTER TABLE public.tournament_bet_odds
  ADD COLUMN IF NOT EXISTS estimated boolean NOT NULL DEFAULT false;
