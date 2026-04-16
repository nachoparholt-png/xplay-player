
-- Add pot_share_pct to match_bet_config
ALTER TABLE public.match_bet_config ADD COLUMN IF NOT EXISTS pot_share_pct numeric(5,4) NOT NULL DEFAULT 0.10;

-- Add phase, pot tracking, factor locking columns to match_bet_markets
ALTER TABLE public.match_bet_markets
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'pending_opponents',
  ADD COLUMN IF NOT EXISTS total_pot int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pot_share_pct numeric(5,4) NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS factor_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS factor_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS team_a_final_multiplier numeric(8,4),
  ADD COLUMN IF NOT EXISTS team_b_final_multiplier numeric(8,4),
  ADD COLUMN IF NOT EXISTS house_pot_rake_pts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_ready_notified boolean NOT NULL DEFAULT false;

-- Add pot bonus breakdown columns to match_bets
ALTER TABLE public.match_bets
  ADD COLUMN IF NOT EXISTS pot_bonus_pts int,
  ADD COLUMN IF NOT EXISTS pot_rake_pts int,
  ADD COLUMN IF NOT EXISTS factor_payout_pts int;

-- Validation trigger for pot_share_pct on match_bet_config
CREATE OR REPLACE FUNCTION public.validate_pot_share_pct()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.pot_share_pct < 0 OR NEW.pot_share_pct > 0.25 THEN
    RAISE EXCEPTION 'pot_share_pct must be between 0 and 0.25';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_pot_share_pct ON public.match_bet_config;
CREATE TRIGGER trg_validate_pot_share_pct
  BEFORE INSERT OR UPDATE ON public.match_bet_config
  FOR EACH ROW EXECUTE FUNCTION public.validate_pot_share_pct();

-- Atomic RPC: increment_match_pot
CREATE OR REPLACE FUNCTION public.increment_match_pot(p_market_id uuid, p_team text, p_stake int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_team = 'A' THEN
    UPDATE public.match_bet_markets
    SET total_pot = total_pot + p_stake,
        team_a_total_staked = team_a_total_staked + p_stake
    WHERE id = p_market_id;
  ELSIF p_team = 'B' THEN
    UPDATE public.match_bet_markets
    SET total_pot = total_pot + p_stake,
        team_b_total_staked = team_b_total_staked + p_stake
    WHERE id = p_market_id;
  ELSE
    RAISE EXCEPTION 'team must be A or B';
  END IF;
END;
$$;

-- Update existing seed markets to have phase = 'open_dynamic'
UPDATE public.match_bet_markets SET phase = 'open_dynamic' WHERE status = 'open';
