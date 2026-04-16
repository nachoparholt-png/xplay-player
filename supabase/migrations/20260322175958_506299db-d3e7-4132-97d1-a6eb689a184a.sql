
-- 1. tournament_bet_config
CREATE TABLE public.tournament_bet_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  allocation_pts int NOT NULL DEFAULT 500,
  tier_config jsonb NOT NULL DEFAULT '[
    {"label":"T1","minProb":0.30,"maxProb":1.00,"k":1.10,"maxMult":5},
    {"label":"T2","minProb":0.10,"maxProb":0.30,"k":1.15,"maxMult":12},
    {"label":"T3","minProb":0.05,"maxProb":0.10,"k":1.20,"maxMult":25},
    {"label":"T4","minProb":0.02,"maxProb":0.05,"k":1.35,"maxMult":60},
    {"label":"T5","minProb":0.01,"maxProb":0.02,"k":1.50,"maxMult":120},
    {"label":"T6","minProb":0.00,"maxProb":0.01,"k":1.50,"maxMult":150}
  ]'::jsonb,
  house_reserve_pts int NOT NULL DEFAULT 100000,
  risk_threshold numeric(4,2) NOT NULL DEFAULT 0.60,
  close_threshold numeric(4,2) NOT NULL DEFAULT 1.00,
  max_stake_per_stage int NOT NULL DEFAULT 500,
  max_payout_pts int NOT NULL DEFAULT 5000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id)
);

ALTER TABLE public.tournament_bet_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read bet config for tournaments" ON public.tournament_bet_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Creator can manage bet config" ON public.tournament_bet_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_bet_config.tournament_id AND t.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_bet_config.tournament_id AND t.created_by = auth.uid()));

CREATE POLICY "Admins can manage bet config" ON public.tournament_bet_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. tournament_bet_allocations
CREATE TABLE public.tournament_bet_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  team_id uuid NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  total_pts int NOT NULL DEFAULT 0,
  spent_pts int NOT NULL DEFAULT 0,
  won_pts int NOT NULL DEFAULT 0,
  balance_pts int GENERATED ALWAYS AS (total_pts - spent_pts + won_pts) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

ALTER TABLE public.tournament_bet_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own allocations" ON public.tournament_bet_allocations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all allocations" ON public.tournament_bet_allocations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creator can read tournament allocations" ON public.tournament_bet_allocations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_bet_allocations.tournament_id AND t.created_by = auth.uid()));

CREATE POLICY "System can insert allocations" ON public.tournament_bet_allocations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage allocations" ON public.tournament_bet_allocations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. tournament_bet_windows
CREATE TABLE public.tournament_bet_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  opens_at timestamptz,
  closes_at timestamptz,
  total_staked_pts int NOT NULL DEFAULT 0,
  total_potential_payout_pts int NOT NULL DEFAULT 0,
  total_actual_payout_pts int NOT NULL DEFAULT 0,
  house_pnl_pts int GENERATED ALWAYS AS (total_staked_pts - total_actual_payout_pts) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, stage)
);

ALTER TABLE public.tournament_bet_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read bet windows" ON public.tournament_bet_windows
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Creator can manage windows" ON public.tournament_bet_windows
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_bet_windows.tournament_id AND t.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_bet_windows.tournament_id AND t.created_by = auth.uid()));

CREATE POLICY "Admins can manage windows" ON public.tournament_bet_windows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. tournament_bet_odds
CREATE TABLE public.tournament_bet_odds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  stage text NOT NULL,
  true_probability numeric(8,6) NOT NULL,
  tier_label text NOT NULL,
  k_factor numeric(5,3) NOT NULL,
  house_probability numeric(8,6) NOT NULL,
  odds_multiplier numeric(8,4) NOT NULL,
  is_capped boolean NOT NULL DEFAULT false,
  is_offered boolean NOT NULL DEFAULT true,
  worst_case_payout_pts int NOT NULL DEFAULT 0,
  line_status text NOT NULL DEFAULT 'open',
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, team_id, stage)
);

ALTER TABLE public.tournament_bet_odds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read bet odds" ON public.tournament_bet_odds
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage odds" ON public.tournament_bet_odds
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creator can manage odds" ON public.tournament_bet_odds
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_bet_odds.tournament_id AND t.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_bet_odds.tournament_id AND t.created_by = auth.uid()));

-- 5. tournament_bets
CREATE TABLE public.tournament_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  window_id uuid NOT NULL REFERENCES public.tournament_bet_windows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  team_id uuid NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  stage text NOT NULL,
  stake_pts int NOT NULL,
  odds_multiplier numeric(8,4) NOT NULL,
  potential_payout_pts int NOT NULL,
  status text NOT NULL DEFAULT 'active',
  actual_payout_pts int,
  placed_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

ALTER TABLE public.tournament_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own bets" ON public.tournament_bets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can place bets" ON public.tournament_bets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all bets" ON public.tournament_bets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creator can read tournament bets" ON public.tournament_bets
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_bets.tournament_id AND t.created_by = auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_bet_windows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_bet_odds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_bets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_bet_allocations;
