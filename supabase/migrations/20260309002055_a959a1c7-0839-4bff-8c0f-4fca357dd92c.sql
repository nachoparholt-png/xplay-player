-- Create function to handle team switch and delete active stakes
CREATE OR REPLACE FUNCTION public.handle_player_team_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If this is an update and the team has changed
  IF TG_OP = 'UPDATE' AND OLD.team IS DISTINCT FROM NEW.team THEN
    -- Delete any active stakes this player has on this match
    DELETE FROM public.match_stakes 
    WHERE user_id = NEW.user_id 
      AND match_id = NEW.match_id 
      AND status = 'active';
      
    -- Log the deletion as a refund transaction
    INSERT INTO public.points_transactions (
      user_id,
      amount,
      balance_before,
      balance_after,
      transaction_type,
      related_match_id,
      reason
    )
    SELECT 
      ms.user_id,
      ms.points_staked, -- Positive amount for refund
      p.padel_park_points,
      p.padel_park_points + ms.points_staked,
      'refunded'::points_transaction_type,
      ms.match_id,
      'Automatic refund due to team switch'
    FROM public.match_stakes ms
    JOIN public.profiles p ON p.user_id = ms.user_id
    WHERE ms.user_id = NEW.user_id 
      AND ms.match_id = NEW.match_id 
      AND ms.status = 'active';
      
    -- Refund the points to user's balance
    UPDATE public.profiles 
    SET padel_park_points = padel_park_points + (
      SELECT COALESCE(SUM(points_staked), 0)
      FROM public.match_stakes 
      WHERE user_id = NEW.user_id 
        AND match_id = NEW.match_id 
        AND status = 'active'
    )
    WHERE user_id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on match_players table
DROP TRIGGER IF EXISTS trigger_handle_player_team_change ON public.match_players;
CREATE TRIGGER trigger_handle_player_team_change
  AFTER UPDATE ON public.match_players
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_player_team_change();