
CREATE TABLE public.match_time_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_hash text NOT NULL,
  actual_mins integer NOT NULL,
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_time_history_config_hash ON public.match_time_history(config_hash);

ALTER TABLE public.match_time_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read time history"
  ON public.match_time_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert time history"
  ON public.match_time_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
