CREATE OR REPLACE FUNCTION public.handle_player_team_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _stake RECORD;
  _current_points INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.team IS DISTINCT FROM NEW.team THEN
    -- Loop through active stakes to refund before deleting
    FOR _stake IN
      SELECT * FROM public.match_stakes
      WHERE user_id = NEW.user_id
        AND match_id = NEW.match_id
        AND status = 'active'
    LOOP
      -- Get current balance
      SELECT padel_park_points INTO _current_points
      FROM public.profiles
      WHERE user_id = NEW.user_id;

      -- Refund points
      UPDATE public.profiles
      SET padel_park_points = padel_park_points + _stake.points_staked
      WHERE user_id = NEW.user_id;

      -- Log transaction
      INSERT INTO public.points_transactions (
        user_id, amount, balance_before, balance_after,
        transaction_type, related_match_id, related_stake_id, reason
      ) VALUES (
        NEW.user_id, _stake.points_staked, _current_points,
        _current_points + _stake.points_staked,
        'refunded'::points_transaction_type, NEW.match_id, _stake.id,
        'Automatic refund due to team switch'
      );
    END LOOP;

    -- Now delete the stakes
    DELETE FROM public.match_stakes
    WHERE user_id = NEW.user_id
      AND match_id = NEW.match_id
      AND status = 'active';
  END IF;

  RETURN NEW;
END;
$function$;