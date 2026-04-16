
-- Add new match statuses for after-game flow
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'awaiting_score';
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'score_submitted';
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'review_requested';
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'draw';
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'closed_as_draw';
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'auto_closed';

-- Add team column to match_players (team_a or team_b)
ALTER TABLE public.match_players ADD COLUMN IF NOT EXISTS team text;

-- Add deadline_at to matches (24hr deadline for score resolution)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS deadline_at timestamptz;

-- Create score_submissions table
CREATE TABLE public.score_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  team_a_set_1 integer,
  team_b_set_1 integer,
  team_a_set_2 integer,
  team_b_set_2 integer,
  team_a_set_3 integer,
  team_b_set_3 integer,
  result_type text NOT NULL DEFAULT 'draw',
  comment text,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.score_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view submissions" ON public.score_submissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Match players can create submissions" ON public.score_submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Submitters can update own submissions" ON public.score_submissions
  FOR UPDATE TO authenticated USING (auth.uid() = submitted_by);

CREATE POLICY "Admins can manage all submissions" ON public.score_submissions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Create score_reviews table
CREATE TABLE public.score_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.score_submissions(id) ON DELETE CASCADE,
  reviewed_by uuid NOT NULL,
  action text NOT NULL DEFAULT 'validated',
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.score_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view reviews" ON public.score_reviews
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Match players can create reviews" ON public.score_reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reviewed_by);

CREATE POLICY "Admins can manage all reviews" ON public.score_reviews
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
