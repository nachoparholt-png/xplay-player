
-- Allow tournament players to update matches they're playing in
CREATE POLICY "Tournament players can update matches"
  ON public.tournament_matches
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_teams tt
      WHERE tt.tournament_id = tournament_matches.tournament_id
        AND (tt.player1_id = auth.uid() OR tt.player2_id = auth.uid())
        AND (tt.id::text = tournament_matches.team_a_id OR tt.id::text = tournament_matches.team_b_id)
    )
  );
