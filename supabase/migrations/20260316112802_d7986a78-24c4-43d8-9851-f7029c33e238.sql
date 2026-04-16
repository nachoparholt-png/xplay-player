
CREATE POLICY "Authenticated can update time history"
  ON public.match_time_history
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
