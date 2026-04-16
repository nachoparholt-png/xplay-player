
-- Rating history table to track level changes after matches
CREATE TABLE public.rating_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  old_level numeric(4,2) NOT NULL,
  new_level numeric(4,2) NOT NULL,
  level_change numeric(5,3) NOT NULL,
  k_factor numeric(6,3) NOT NULL,
  reliability_before numeric(5,2) NOT NULL,
  reliability_after numeric(5,2) NOT NULL,
  expected_result numeric(5,4) NOT NULL,
  actual_result numeric(3,2) NOT NULL,
  team_avg_level numeric(4,2),
  opponent_avg_level numeric(4,2),
  repeat_match_multiplier numeric(4,2) DEFAULT 1.0,
  provisional boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rating_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rating history" ON public.rating_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all rating history" ON public.rating_history
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service can insert rating history" ON public.rating_history
  FOR INSERT WITH CHECK (true);

-- Add rating-related columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rating_matches_counted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_level_source text DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS initial_level_date timestamptz,
  ADD COLUMN IF NOT EXISTS verified_level numeric(4,2),
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS override_reason text;

-- Index for repeated opponent detection
CREATE INDEX idx_rating_history_user_match ON public.rating_history(user_id, created_at DESC);
CREATE INDEX idx_rating_history_match ON public.rating_history(match_id);
