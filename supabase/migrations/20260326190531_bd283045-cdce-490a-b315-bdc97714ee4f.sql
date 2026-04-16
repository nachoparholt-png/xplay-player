
ALTER TABLE public.tournament_bet_config
  ADD COLUMN IF NOT EXISTS pot_share_pct       numeric NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS house_boost_pts     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS organizer_prize_pts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_config         jsonb   NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.tournament_bets
  ADD COLUMN IF NOT EXISTS pool_bonus_pts integer;
