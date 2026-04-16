CREATE TRIGGER on_player_team_change
  BEFORE UPDATE ON public.match_players
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_player_team_change();