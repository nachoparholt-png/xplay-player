
-- Tournament skill categories
CREATE TABLE public.tournament_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  min_rating numeric NOT NULL,
  max_rating numeric NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read categories" ON public.tournament_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage categories" ON public.tournament_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tournament approval requests
CREATE TABLE public.tournament_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  player_rating numeric,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);

ALTER TABLE public.tournament_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own requests" ON public.tournament_approval_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own requests" ON public.tournament_approval_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creator can view tournament requests" ON public.tournament_approval_requests
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_approval_requests.tournament_id
    AND t.created_by = auth.uid()
  ));

CREATE POLICY "Creator can update tournament requests" ON public.tournament_approval_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_approval_requests.tournament_id
    AND t.created_by = auth.uid()
  ));

CREATE POLICY "Admins can manage all requests" ON public.tournament_approval_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add skill category columns to tournaments
ALTER TABLE public.tournaments
  ADD COLUMN skill_category_id uuid REFERENCES public.tournament_categories(id),
  ADD COLUMN require_admin_approval boolean NOT NULL DEFAULT false;

-- Seed default categories
INSERT INTO public.tournament_categories (label, min_rating, max_rating, color, sort_order) VALUES
  ('Beginner', 0.5, 1.5, '#22c55e', 1),
  ('Improver', 2.0, 3.0, '#3b82f6', 2),
  ('Intermediate', 3.5, 4.5, '#a855f7', 3),
  ('Advanced', 5.0, 5.5, '#f97316', 4),
  ('Elite', 6.0, 6.5, '#ef4444', 5),
  ('Pro', 7.0, 7.0, '#eab308', 6);
