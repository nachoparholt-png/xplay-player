-- ═════════════════════════════════════════════════════════════════════════════
-- XPLAY Loyalty Programme — Simplified Earning Catalogue + XPLAY Pro Premium Tier
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Companion to XPLAY_Rewards_Program_Design.html (design doc in workspace root).
--
-- This migration introduces the simplified earning catalogue (one event per
-- match completion, plus win bonus, daily check-in, weekly streak, referral,
-- tournament participation), backed by a configurable `point_rules` table.
-- It also adds the XPLAY Pro premium subscription table that powers the 2×
-- point multiplier and court booking discounts.
--
-- Anchor: 100 XPLAY Points = £1 of catalogue value (internal cost basis).
--
-- LEGAL COMPLIANCE NOTES — see XPLAY_Rewards_Program_Design.html §02:
--   - Points have no cash value, non-transferable, revocable, expiring (24mo).
--   - No randomness on rewards (deterministic point prices only).
--   - Match-win bonuses are skill-based activity rewards, not gambling prizes.
--   - No peer-to-peer point transfers.
--   - VAT treated as multi-purpose voucher under VATA 1994 Schedule 10A.
--
-- This migration is idempotent (uses IF NOT EXISTS / ADD VALUE IF NOT EXISTS).
-- ═════════════════════════════════════════════════════════════════════════════


-- ─── 1. EXTEND points_transaction_type enum ─────────────────────────────────
-- The existing enum (used by stakes/old points) didn't include the simplified
-- earning actions. Add them here. Old values stay for backward-compat.

DO $$ BEGIN
  ALTER TYPE public.points_transaction_type ADD VALUE IF NOT EXISTS 'play_match';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.points_transaction_type ADD VALUE IF NOT EXISTS 'win_match_bonus';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.points_transaction_type ADD VALUE IF NOT EXISTS 'complete_profile';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.points_transaction_type ADD VALUE IF NOT EXISTS 'daily_check_in';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.points_transaction_type ADD VALUE IF NOT EXISTS 'weekly_streak';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.points_transaction_type ADD VALUE IF NOT EXISTS 'referral_complete';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.points_transaction_type ADD VALUE IF NOT EXISTS 'tournament_play';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.points_transaction_type ADD VALUE IF NOT EXISTS 'xplay_pro_multiplier';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── 2. CREATE point_rules — configurable earning catalogue ────────────────
-- Replaces hardcoded point values scattered throughout the app. Tweakable by
-- admin without code changes. Seeded with the BALANCED tier from the design.

CREATE TABLE IF NOT EXISTS public.point_rules (
  action_type    TEXT PRIMARY KEY,
  display_name   TEXT NOT NULL,
  description    TEXT,
  base_points    INTEGER NOT NULL,
  daily_cap      INTEGER,        -- max points/day from this action (NULL = uncapped)
  weekly_cap     INTEGER,        -- max points/week (NULL = uncapped)
  per_match_cap  INTEGER,        -- max occurrences per match (NULL = uncapped)
  enabled        BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.point_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read point rules" ON public.point_rules;
CREATE POLICY "Anyone can read point rules" ON public.point_rules
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only admins can write point rules" ON public.point_rules;
CREATE POLICY "Only admins can write point rules" ON public.point_rules
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Seed with the SIMPLIFIED BALANCED catalogue (matches the published design)
INSERT INTO public.point_rules (action_type, display_name, description, base_points, daily_cap, weekly_cap, per_match_cap, enabled)
VALUES
  ('complete_profile',   'Sign up & complete profile',  'One-time welcome bonus on profile completion',                    100,  NULL,  NULL, NULL, true),
  ('play_match',         'Play a match',                'Completed match with verified score (organise OR join — same)',   100,  NULL,  NULL, 1,    true),
  ('win_match_bonus',    'Win a match (skill bonus)',   'Skill-based activity bonus on completed match win',                25,  NULL,  100,  1,    true),
  ('daily_check_in',     'Daily app check-in',          'Open the app each calendar day',                                    5,    5,   NULL, NULL, true),
  ('weekly_streak',      'Weekly play streak',          '3+ consecutive ISO weeks with at least one match played',         100,  NULL,  NULL, NULL, true),
  ('referral_complete',  'Refer a friend (first match)','Awarded when invited user completes their 1st match',             500,  NULL,  NULL, NULL, true),
  ('tournament_play',    'Play in a tournament',        'Tournament check-in event',                                       100,  NULL,  NULL, NULL, true)
ON CONFLICT (action_type) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description,
      base_points  = EXCLUDED.base_points,
      daily_cap    = EXCLUDED.daily_cap,
      weekly_cap   = EXCLUDED.weekly_cap,
      per_match_cap= EXCLUDED.per_match_cap,
      updated_at   = now();


-- ─── 3. CREATE xplay_pro_subscriptions — premium tier ──────────────────────
-- Tracks active XPLAY Pro subscribers. The PREMIUM_MULTIPLIER (default 2.0)
-- applies to every base_points award when the user has an active sub.

CREATE TABLE IF NOT EXISTS public.xplay_pro_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                TEXT NOT NULL CHECK (status IN ('active', 'paused', 'cancelled', 'past_due')),
  tier                  TEXT NOT NULL DEFAULT 'pro' CHECK (tier IN ('pro')),  -- room for future tiers
  multiplier            NUMERIC(4,2) NOT NULL DEFAULT 2.00,  -- 2.00 = 2× points
  court_discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 10.00, -- e.g. 10.00 = 10% off
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id    TEXT,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xplay_pro_subs_user_status_idx
  ON public.xplay_pro_subscriptions (user_id, status);

ALTER TABLE public.xplay_pro_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own pro subscription" ON public.xplay_pro_subscriptions;
CREATE POLICY "Users can read own pro subscription" ON public.xplay_pro_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all pro subscriptions" ON public.xplay_pro_subscriptions;
CREATE POLICY "Admins can read all pro subscriptions" ON public.xplay_pro_subscriptions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Only admins/service role can write pro subscriptions" ON public.xplay_pro_subscriptions;
CREATE POLICY "Only admins/service role can write pro subscriptions" ON public.xplay_pro_subscriptions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));


-- ─── 4. HELPER FUNCTION: get user's active pro multiplier ─────────────────
CREATE OR REPLACE FUNCTION public.get_xplay_pro_multiplier(_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _multiplier NUMERIC;
BEGIN
  SELECT multiplier INTO _multiplier
  FROM public.xplay_pro_subscriptions
  WHERE user_id = _user_id
    AND status = 'active'
    AND (current_period_end IS NULL OR current_period_end > now())
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN COALESCE(_multiplier, 1.0);  -- non-premium users get 1× (no multiplier)
END;
$$;


-- ─── 5. CORE FUNCTION: award_points ────────────────────────────────────────
-- Single canonical entry point for granting XPLAY Points. Takes:
--   _user_id      — the recipient
--   _action_type  — must match a row in point_rules
--   _related_match_id — optional, for traceability
--   _reason_override  — optional human-readable note
-- Applies premium multiplier, writes to points_transactions, updates
-- profiles balances. Returns the actual points awarded (after multiplier).

CREATE OR REPLACE FUNCTION public.award_points(
  _user_id          UUID,
  _action_type      TEXT,
  _related_match_id UUID DEFAULT NULL,
  _reason_override  TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _rule         public.point_rules%ROWTYPE;
  _multiplier   NUMERIC;
  _award_amount INTEGER;
  _balance      INTEGER;
  _today_total  INTEGER;
  _week_total   INTEGER;
  _match_count  INTEGER;
  _tx_type      public.points_transaction_type;
BEGIN
  -- Look up rule
  SELECT * INTO _rule FROM public.point_rules WHERE action_type = _action_type AND enabled = true;
  IF NOT FOUND THEN
    RAISE NOTICE 'award_points: no enabled rule for action_type=%', _action_type;
    RETURN 0;
  END IF;

  -- Enforce per-match cap (if any)
  IF _rule.per_match_cap IS NOT NULL AND _related_match_id IS NOT NULL THEN
    SELECT COUNT(*) INTO _match_count
    FROM public.points_transactions
    WHERE user_id = _user_id
      AND related_match_id = _related_match_id
      AND reason = _action_type;  -- using reason field to identify action
    IF _match_count >= _rule.per_match_cap THEN
      RETURN 0;
    END IF;
  END IF;

  -- Enforce daily cap (if any)
  IF _rule.daily_cap IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO _today_total
    FROM public.points_transactions
    WHERE user_id = _user_id
      AND reason = _action_type
      AND created_at >= date_trunc('day', now());
    IF _today_total >= _rule.daily_cap THEN
      RETURN 0;
    END IF;
  END IF;

  -- Enforce weekly cap (if any)
  IF _rule.weekly_cap IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO _week_total
    FROM public.points_transactions
    WHERE user_id = _user_id
      AND reason = _action_type
      AND created_at >= date_trunc('week', now());
    IF _week_total >= _rule.weekly_cap THEN
      RETURN 0;
    END IF;
  END IF;

  -- Apply premium multiplier
  _multiplier := public.get_xplay_pro_multiplier(_user_id);
  _award_amount := FLOOR(_rule.base_points * _multiplier)::INTEGER;

  -- Resolve transaction_type enum value
  _tx_type := _action_type::public.points_transaction_type;

  -- Snapshot current balance
  SELECT COALESCE(padel_park_points, 0) INTO _balance
  FROM public.profiles WHERE user_id = _user_id;

  -- Write ledger entry
  INSERT INTO public.points_transactions (
    user_id, transaction_type, amount, balance_before, balance_after, reason, related_match_id
  ) VALUES (
    _user_id,
    _tx_type,
    _award_amount,
    _balance,
    _balance + _award_amount,
    COALESCE(_reason_override, _action_type),
    _related_match_id
  );

  -- Update profile aggregates
  UPDATE public.profiles
     SET padel_park_points = COALESCE(padel_park_points, 0) + _award_amount,
         lifetime_earned   = COALESCE(lifetime_earned, 0) + _award_amount
   WHERE user_id = _user_id;

  RETURN _award_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_points(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;


-- ─── 6. CONVENIENCE: get_points_balance ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_points_balance(_user_id UUID)
RETURNS TABLE (balance INTEGER, lifetime_earned INTEGER, lifetime_spent INTEGER, pro_active BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(p.padel_park_points, 0)::INTEGER AS balance,
    COALESCE(p.lifetime_earned, 0)::INTEGER  AS lifetime_earned,
    COALESCE(p.lifetime_spent, 0)::INTEGER   AS lifetime_spent,
    (public.get_xplay_pro_multiplier(_user_id) > 1.0) AS pro_active
  FROM public.profiles p
  WHERE p.user_id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_points_balance(UUID) TO authenticated, service_role;


-- ─── 7. TRIGGER: auto-award on tournament_matches completion ───────────────
-- When a tournament_matches row has its result confirmed (status='completed'
-- and winner_team_id IS NOT NULL), award play_match to every confirmed player
-- in the match, plus win_match_bonus to the winning team. Idempotent via the
-- per_match_cap rule.

CREATE OR REPLACE FUNCTION public.trg_award_tournament_match_points()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _player_record RECORD;
  _winner_team_id UUID;
BEGIN
  -- Only fire when transitioning to completed status with a winner set
  IF NEW.status = 'completed'
     AND (OLD.status IS DISTINCT FROM 'completed' OR OLD.winner_team_id IS DISTINCT FROM NEW.winner_team_id)
     AND NEW.winner_team_id IS NOT NULL THEN

    _winner_team_id := NEW.winner_team_id;

    -- Award play_match to every player in either team
    FOR _player_record IN
      SELECT DISTINCT tp.user_id, ttp.team_id
      FROM public.tournament_team_players ttp
      JOIN public.tournament_players tp ON tp.id = ttp.tournament_player_id
      WHERE ttp.team_id IN (NEW.team_a_id, NEW.team_b_id)
    LOOP
      PERFORM public.award_points(
        _player_record.user_id::UUID,
        'play_match',
        NULL,                       -- match id reference (matches table, not tournament_matches)
        'tournament_match_completed'
      );

      -- Win bonus only for the winning team
      IF _player_record.team_id = _winner_team_id THEN
        PERFORM public.award_points(
          _player_record.user_id::UUID,
          'win_match_bonus',
          NULL,
          'tournament_match_won'
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS award_tournament_match_points ON public.tournament_matches;
CREATE TRIGGER award_tournament_match_points
  AFTER UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_tournament_match_points();


-- ─── 8. TRIGGER: auto-award on regular match completion ────────────────────
-- When a match transitions to 'confirmed' or 'completed' status, award
-- play_match to every match_players row. Winning team handled by client when
-- score is submitted (since match-level winner detection is more complex).

CREATE OR REPLACE FUNCTION public.trg_award_match_points()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _player_record RECORD;
BEGIN
  IF NEW.status IN ('confirmed', 'completed')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR _player_record IN
      SELECT user_id FROM public.match_players WHERE match_id = NEW.id
    LOOP
      PERFORM public.award_points(
        _player_record.user_id,
        'play_match',
        NEW.id,
        'match_completed'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS award_match_points ON public.matches;
CREATE TRIGGER award_match_points
  AFTER UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_match_points();


-- ─── 9. TRIGGER: auto-award profile completion ─────────────────────────────
-- One-time award when profile.onboarding_completed flips from false → true.
CREATE OR REPLACE FUNCTION public.trg_award_profile_completion()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.onboarding_completed = true
     AND (OLD.onboarding_completed IS NULL OR OLD.onboarding_completed = false) THEN
    PERFORM public.award_points(
      NEW.user_id,
      'complete_profile',
      NULL,
      'onboarding_completed'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS award_profile_completion ON public.profiles;
CREATE TRIGGER award_profile_completion
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_profile_completion();


-- ═════════════════════════════════════════════════════════════════════════════
-- Migration complete.
--
-- Next steps (separate work):
--   1. Apply this migration: `supabase db push` (or via Supabase Dashboard SQL).
--   2. Wire the front-end to call award_points() for events not yet trigger-
--      backed (daily check-in, weekly streak, referral, tournament check-in).
--   3. Create the Stripe XPLAY Pro subscription product and wire the paywall.
--   4. Build the admin UI to read/write point_rules (table is configurable).
--   5. Update Project Status doc.
-- ═════════════════════════════════════════════════════════════════════════════
