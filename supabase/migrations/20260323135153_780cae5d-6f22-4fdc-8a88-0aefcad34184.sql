
-- Atomic debit points: returns jsonb with balance_before, balance_after, or error
CREATE OR REPLACE FUNCTION public.debit_points_safe(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  SELECT padel_park_points INTO v_before
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_before IS NULL THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  IF v_before < p_amount THEN
    RETURN jsonb_build_object('error', 'Insufficient balance', 'balance', v_before);
  END IF;

  v_after := v_before - p_amount;

  UPDATE public.profiles
  SET padel_park_points = v_after
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('balance_before', v_before, 'balance_after', v_after);
END;
$$;

-- Atomic credit points
CREATE OR REPLACE FUNCTION public.credit_points(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET padel_park_points = padel_park_points + p_amount
  WHERE user_id = p_user_id;
END;
$$;

-- Atomic increment market totals, returns new line status
CREATE OR REPLACE FUNCTION public.increment_market_totals(
  p_market_id uuid,
  p_team text,
  p_staked integer,
  p_payout integer,
  p_house_reserve integer,
  p_risk_threshold numeric,
  p_close_threshold numeric
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_payout integer;
  v_line_status text;
BEGIN
  IF p_team = 'A' THEN
    UPDATE public.match_bet_markets
    SET team_a_total_staked = team_a_total_staked + p_staked,
        team_a_potential_payout = team_a_potential_payout + p_payout
    WHERE id = p_market_id
    RETURNING team_a_potential_payout INTO v_new_payout;
  ELSE
    UPDATE public.match_bet_markets
    SET team_b_total_staked = team_b_total_staked + p_staked,
        team_b_potential_payout = team_b_potential_payout + p_payout
    WHERE id = p_market_id
    RETURNING team_b_potential_payout INTO v_new_payout;
  END IF;

  IF v_new_payout >= p_house_reserve * p_close_threshold THEN
    v_line_status := 'closed';
  ELSIF v_new_payout >= p_house_reserve * p_risk_threshold THEN
    v_line_status := 'risk';
  ELSE
    v_line_status := 'open';
  END IF;

  IF p_team = 'A' THEN
    UPDATE public.match_bet_markets SET team_a_line_status = v_line_status WHERE id = p_market_id;
  ELSE
    UPDATE public.match_bet_markets SET team_b_line_status = v_line_status WHERE id = p_market_id;
  END IF;

  RETURN v_line_status;
END;
$$;
