
-- ═══════════════════════════════════════════════════════════
-- match_bet_config: Single-row global betting configuration
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.match_bet_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  house_reserve_pts integer NOT NULL DEFAULT 50000,
  min_stake integer NOT NULL DEFAULT 1,
  max_stake integer NOT NULL DEFAULT 15,
  max_payout_pts integer NOT NULL DEFAULT 500,
  risk_threshold numeric NOT NULL DEFAULT 0.60,
  close_threshold numeric NOT NULL DEFAULT 0.85,
  tier_config jsonb NOT NULL DEFAULT '[
    {"label":"T1","minProb":0.70,"maxProb":1.00,"k":1.10,"maxMult":1.80},
    {"label":"T2","minProb":0.55,"maxProb":0.70,"k":1.18,"maxMult":2.50},
    {"label":"T3","minProb":0.40,"maxProb":0.55,"k":1.25,"maxMult":4.00},
    {"label":"T4","minProb":0.25,"maxProb":0.40,"k":1.35,"maxMult":6.00},
    {"label":"T5","minProb":0.12,"maxProb":0.25,"k":1.50,"maxMult":10.00},
    {"label":"T6","minProb":0.00,"maxProb":0.12,"k":1.70,"maxMult":15.00}
  ]'::jsonb,
  high_pot_boost_pts integer NOT NULL DEFAULT 50,
  high_pot_max_per_match integer NOT NULL DEFAULT 3,
  max_exposure_pct numeric NOT NULL DEFAULT 0.30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.match_bet_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bet config"
  ON public.match_bet_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read bet config"
  ON public.match_bet_config FOR SELECT
  TO authenticated
  USING (true);

-- ═══════════════════════════════════════════════════════════
-- match_bet_markets: One row per match with locked odds
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.match_bet_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  team_a_elo numeric NOT NULL DEFAULT 1500,
  team_b_elo numeric NOT NULL DEFAULT 1500,
  team_a_true_prob numeric NOT NULL DEFAULT 0.50,
  team_b_true_prob numeric NOT NULL DEFAULT 0.50,
  team_a_multiplier numeric NOT NULL DEFAULT 2.00,
  team_b_multiplier numeric NOT NULL DEFAULT 2.00,
  team_a_tier text NOT NULL DEFAULT 'T3',
  team_b_tier text NOT NULL DEFAULT 'T3',
  team_a_line_status text NOT NULL DEFAULT 'open',
  team_b_line_status text NOT NULL DEFAULT 'open',
  team_a_total_staked integer NOT NULL DEFAULT 0,
  team_b_total_staked integer NOT NULL DEFAULT 0,
  team_a_potential_payout integer NOT NULL DEFAULT 0,
  team_b_potential_payout integer NOT NULL DEFAULT 0,
  high_pot_active boolean NOT NULL DEFAULT false,
  high_pot_count integer NOT NULL DEFAULT 0,
  high_pot_pool_pts integer NOT NULL DEFAULT 0,
  config_snapshot jsonb,
  settled_winner text,
  house_pnl_pts integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id)
);

ALTER TABLE public.match_bet_markets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read markets"
  ON public.match_bet_markets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage markets"
  ON public.match_bet_markets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ═══════════════════════════════════════════════════════════
-- match_bets: Individual user bets
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.match_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.match_bet_markets(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  team text NOT NULL,
  stake_pts integer NOT NULL,
  locked_multiplier numeric NOT NULL,
  potential_payout_pts integer NOT NULL,
  actual_payout_pts integer,
  status text NOT NULL DEFAULT 'active',
  placed_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (market_id, user_id)
);

ALTER TABLE public.match_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bets"
  ON public.match_bets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can place bets"
  ON public.match_bets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all bets"
  ON public.match_bets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage bets"
  ON public.match_bets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default config row
INSERT INTO public.match_bet_config (id) VALUES (gen_random_uuid());
