-- ============================================================================
-- WS5 · MVP hardening (13 Sep 2026) — closes the P0/P1 findings of the
-- pre-App-Store audit. Apply to STAGING first, then PROD (identical file).
--
--  A. Function grants: server-only functions no longer callable by clients;
--     daily_check_in() wrapper replaces client calls to award_points().
--  B. create_notification_for_user(): client callers limited to internal
--     links, stamped with sender_id, rate-limited.
--  C. profiles: no anonymous reads; server-managed columns (points, stats,
--     bonus flags, role) cannot be changed by clients; DOB immutable once set;
--     onboarding_completed requires adult DOB + accepted terms (server-side).
--  D. matches: insert must be own; private matches only visible to people
--     involved; clients cannot change scoring/status fields except organiser
--     cancel; status open/almost_full/full is DERIVED from confirmed players.
--  E. match_players: joining checked server-side (capacity, visibility,
--     approval/invitation); own-row update/delete policies (leave, switch
--     team, claim waitlist spot); approve_join_request() RPC.
--  F. score_submissions: clients may only insert *pending* submissions for
--     matches they play in; status changes are server-only; profile stats
--     trigger fires on 'accepted' (the status the edge functions write).
--  G. Realtime publication: notifications, messages, match tables.
--  H. delete_user_account(): also scrub username, referral_code, push_token.
--  I. pg_cron: auto-cancel job gets a 60s HTTP timeout.
-- ============================================================================

-- ─── helper: is this statement running with server privileges? ─────────────
-- SECURITY INVOKER on purpose: inside a SECURITY DEFINER function the
-- current_user becomes the owner (postgres), so trusted code paths pass;
-- a direct client write runs as 'authenticated'/'anon' and does not.
CREATE OR REPLACE FUNCTION public.xplay_is_privileged()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_user IN ('postgres', 'supabase_admin', 'service_role')
      OR current_setting('role', true) = 'service_role';
$$;
REVOKE EXECUTE ON FUNCTION public.xplay_is_privileged() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.xplay_is_privileged() TO authenticated, service_role;

-- ═══ A. Function grants ══════════════════════════════════════════════════════
DO $$
DECLARE r record;
BEGIN
  -- every trigger function
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
  -- server-only RPCs
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'award_points','claim_court_slot','enroll_coaching_slot','claim_invitation',
      'delete_user_account','redeem_reward_tx','cleanup_expired_match_chats',
      'notify_daily_summary','notify_membership_expiring','get_points_balance',
      'get_xplay_pro_multiplier','get_notif_pref'
    )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Client-facing wrapper for the daily check-in (uses the caller's own id).
CREATE OR REPLACE FUNCTION public.daily_check_in()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  RETURN public.award_points(_uid, 'daily_check_in', NULL, 'daily_check_in');
END $$;
REVOKE EXECUTE ON FUNCTION public.daily_check_in() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.daily_check_in() TO authenticated, service_role;

-- ═══ B. create_notification_for_user — safe for client callers ══════════════
CREATE OR REPLACE FUNCTION public.create_notification_for_user(
  _user_id text, _type text, _title text, _body text,
  _link text DEFAULT NULL, _target_app text DEFAULT 'player', _data jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id uuid;
  target text;
  _sender uuid := auth.uid();
  _recent integer;
BEGIN
  target := CASE
    WHEN _target_app IN ('player','club','all') THEN _target_app
    WHEN _target_app = 'players' THEN 'player'
    ELSE 'player' END;

  -- Requests made with a user's own JWT (the apps notifying other players)
  IF current_setting('role', true) IN ('authenticated', 'anon') THEN
    IF _sender IS NULL THEN
      RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    -- internal deep links only — never an external URL
    IF _link IS NOT NULL AND _link !~ '^/[A-Za-z0-9_/?=&.%-]*$' THEN
      RAISE EXCEPTION 'notification links must be internal paths' USING ERRCODE = '22023';
    END IF;
    -- 120 notifications per sender per hour is far above any real usage
    SELECT COUNT(*) INTO _recent FROM public.notifications
     WHERE data->>'sender_id' = _sender::text AND created_at > now() - interval '1 hour';
    IF _recent >= 120 THEN
      RAISE EXCEPTION 'notification rate limit exceeded' USING ERRCODE = '54000';
    END IF;
    _data := COALESCE(_data, '{}'::jsonb) || jsonb_build_object('sender_id', _sender::text);
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link, target_app, data)
  VALUES (_user_id, _type, _title, _body, _link, target, _data)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- ═══ C. profiles ═════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.guard_profile_client_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.xplay_is_privileged() THEN RETURN NEW; END IF;

  -- server-managed columns: silently keep the stored value
  NEW.padel_park_points  := OLD.padel_park_points;
  NEW.pending_points     := OLD.pending_points;
  NEW.lifetime_earned    := OLD.lifetime_earned;
  NEW.lifetime_spent     := OLD.lifetime_spent;
  NEW.profile_completed_bonus_granted := OLD.profile_completed_bonus_granted;
  NEW.first_match_bonus_granted       := OLD.first_match_bonus_granted;
  NEW.total_matches      := OLD.total_matches;
  NEW.wins               := OLD.wins;
  NEW.losses             := OLD.losses;
  NEW.matches_attended   := OLD.matches_attended;
  NEW.matches_cancelled  := OLD.matches_cancelled;
  NEW.reliability_score  := OLD.reliability_score;
  NEW.rating_matches_counted := OLD.rating_matches_counted;
  NEW.verified_level     := OLD.verified_level;
  NEW.verified_at        := OLD.verified_at;
  NEW.verified_by        := OLD.verified_by;
  NEW.override_reason    := OLD.override_reason;
  NEW.account_status     := OLD.account_status;
  NEW.app_role           := OLD.app_role;
  NEW.referral_code      := OLD.referral_code;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.email              := OLD.email;   -- email changes go through auth, not the profile row

  -- 18+ gate: a date of birth, once recorded, cannot be edited by the user
  IF OLD.date_of_birth IS NOT NULL AND NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth THEN
    RAISE EXCEPTION 'Date of birth cannot be changed' USING ERRCODE = '42501';
  END IF;
  -- terms acceptance cannot be withdrawn by editing the row
  IF OLD.terms_accepted_at IS NOT NULL AND NEW.terms_accepted_at IS NULL THEN
    NEW.terms_accepted_at := OLD.terms_accepted_at;
    NEW.terms_version     := OLD.terms_version;
  END IF;
  -- completing onboarding requires an adult DOB and accepted terms
  IF NEW.onboarding_completed IS TRUE AND OLD.onboarding_completed IS DISTINCT FROM TRUE THEN
    IF NEW.date_of_birth IS NULL
       OR NEW.date_of_birth > (current_date - interval '18 years')::date
       OR NEW.terms_accepted_at IS NULL THEN
      RAISE EXCEPTION 'Onboarding requires a verified adult date of birth and accepted terms'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_profile_client_update ON public.profiles;
CREATE TRIGGER guard_profile_client_update
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_client_update();

-- ═══ D. matches ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS matches_insert ON public.matches;
CREATE POLICY matches_insert ON public.matches
  FOR INSERT TO authenticated WITH CHECK (organizer_id = auth.uid());

DROP POLICY IF EXISTS matches_select ON public.matches;
CREATE POLICY matches_select ON public.matches
  FOR SELECT TO authenticated USING (
    visibility = 'public'
    OR organizer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.match_players mp
                WHERE mp.match_id = matches.id AND mp.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.match_invitations mi
                WHERE mi.match_id = matches.id AND mi.invited_user_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM public.match_join_requests r
                WHERE r.match_id = matches.id AND r.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.clubs c JOIN public.club_memberships cm ON cm.club_id = c.id
                WHERE c.club_name = matches.club AND cm.user_id = auth.uid() AND cm.active = true
                  AND cm.role = ANY (ARRAY['club_owner','club_admin','club_staff']))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE OR REPLACE FUNCTION public.guard_match_client_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.xplay_is_privileged() THEN RETURN NEW; END IF;
  -- scoring / bookkeeping fields are server-owned
  NEW.organizer_id            := OLD.organizer_id;
  NEW.spots_left              := OLD.spots_left;
  NEW.score_winner            := OLD.score_winner;
  NEW.score_deadline_at       := OLD.score_deadline_at;
  NEW.notified_deadline_warning := OLD.notified_deadline_warning;
  NEW.notified_reminder       := OLD.notified_reminder;
  NEW.notified_score_request  := OLD.notified_score_request;
  NEW.created_at              := OLD.created_at;
  -- status: the only client transition is organiser cancel before the game;
  -- open / almost_full / full are derived from confirmed players (see below)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (NEW.status = 'cancelled' AND OLD.status IN ('open','almost_full','full')) THEN
      NEW.status := OLD.status;
      NEW.cancelled_reason := OLD.cancelled_reason;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_match_client_update ON public.matches;
CREATE TRIGGER guard_match_client_update
  BEFORE UPDATE ON public.matches FOR EACH ROW
  EXECUTE FUNCTION public.guard_match_client_update();

-- Derive spots_left AND status from confirmed players (fires on insert,
-- delete and status changes of match_players).
CREATE OR REPLACE FUNCTION public.update_match_spots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mid uuid := COALESCE(NEW.match_id, OLD.match_id); _cnt integer;
BEGIN
  SELECT COUNT(*) INTO _cnt FROM public.match_players
   WHERE match_id = _mid AND status = 'confirmed';
  UPDATE public.matches m
     SET spots_left = GREATEST(m.max_players - _cnt, 0),
         status = CASE
           WHEN m.status IN ('open','almost_full','full') THEN
             CASE WHEN _cnt >= m.max_players     THEN 'full'
                  WHEN _cnt >= m.max_players - 1 THEN 'almost_full'
                  ELSE 'open' END
           ELSE m.status END,
         updated_at = now()
   WHERE m.id = _mid;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_update_match_spots ON public.match_players;
CREATE TRIGGER trg_update_match_spots
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.match_players
  FOR EACH ROW EXECUTE FUNCTION public.update_match_spots();

-- ═══ E. match_players ════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_join_match(_match_id uuid, _status public.match_player_status)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.matches%ROWTYPE; _uid uuid := auth.uid(); _confirmed integer;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  SELECT * INTO m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF m.organizer_id = _uid THEN RETURN true; END IF;                -- organiser seats themself
  IF m.status NOT IN ('open','almost_full','full') THEN RETURN false; END IF;
  IF _status = 'cancelled' THEN RETURN false; END IF;
  IF m.visibility = 'private' THEN
    IF NOT EXISTS (SELECT 1 FROM public.match_join_requests r
                    WHERE r.match_id = _match_id AND r.user_id = _uid AND r.status = 'approved')
       AND NOT EXISTS (SELECT 1 FROM public.match_invitations i
                    WHERE i.match_id = _match_id AND i.invited_user_id = _uid::text
                      AND i.status IN ('pending','accepted')) THEN
      RETURN false;
    END IF;
  END IF;
  IF _status = 'waitlist' THEN RETURN true; END IF;
  SELECT COUNT(*) INTO _confirmed FROM public.match_players
   WHERE match_id = _match_id AND status = 'confirmed';
  RETURN _confirmed < m.max_players;
END $$;
REVOKE EXECUTE ON FUNCTION public.can_join_match(uuid, public.match_player_status) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_join_match(uuid, public.match_player_status) TO authenticated, service_role;

DROP POLICY IF EXISTS match_players_insert ON public.match_players;
CREATE POLICY match_players_insert ON public.match_players
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_join_match(match_id, status));

DROP POLICY IF EXISTS match_players_update ON public.match_players;
CREATE POLICY match_players_update ON public.match_players
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS match_players_delete ON public.match_players;
CREATE POLICY match_players_delete ON public.match_players
  FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_id AND m.organizer_id = auth.uid())
  );

-- waitlist → confirmed ("claim spot") must respect capacity
CREATE OR REPLACE FUNCTION public.guard_match_player_client_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.xplay_is_privileged() THEN RETURN NEW; END IF;
  NEW.match_id := OLD.match_id;
  NEW.user_id  := OLD.user_id;
  NEW.joined_at := OLD.joined_at;
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed'
     AND NOT public.can_join_match(NEW.match_id, 'confirmed') THEN
    RAISE EXCEPTION 'Match is full' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_match_player_client_update ON public.match_players;
CREATE TRIGGER guard_match_player_client_update
  BEFORE UPDATE ON public.match_players FOR EACH ROW
  EXECUTE FUNCTION public.guard_match_player_client_update();

-- Join requests: clients may deny; approval only through approve_join_request()
CREATE OR REPLACE FUNCTION public.guard_join_request_client_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.xplay_is_privileged() THEN RETURN NEW; END IF;
  NEW.match_id := OLD.match_id; NEW.user_id := OLD.user_id;
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Use approve_join_request()' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_join_request_client_update ON public.match_join_requests;
CREATE TRIGGER guard_join_request_client_update
  BEFORE UPDATE ON public.match_join_requests FOR EACH ROW
  EXECUTE FUNCTION public.guard_join_request_client_update();

CREATE OR REPLACE FUNCTION public.approve_join_request(_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  req public.match_join_requests%ROWTYPE;
  m   public.matches%ROWTYPE;
  _confirmed integer; _approved integer; _a integer; _b integer; _team text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO req FROM public.match_join_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status <> 'pending' THEN RETURN jsonb_build_object('approved', req.status = 'approved', 'pending', 0); END IF;
  SELECT * INTO m FROM public.matches WHERE id = req.match_id FOR UPDATE;
  -- caller must be a confirmed player (or the organiser) of this match
  IF m.organizer_id <> _uid AND NOT EXISTS (
       SELECT 1 FROM public.match_players mp
        WHERE mp.match_id = m.id AND mp.user_id = _uid AND mp.status = 'confirmed') THEN
    RAISE EXCEPTION 'Only players in this match can approve' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.match_join_approvals WHERE request_id = req.id AND approver_id = _uid) THEN
    INSERT INTO public.match_join_approvals (request_id, approver_id) VALUES (req.id, _uid);
  END IF;
  SELECT COUNT(*) INTO _confirmed FROM public.match_players
   WHERE match_id = m.id AND status = 'confirmed';
  SELECT COUNT(DISTINCT a.approver_id) INTO _approved
    FROM public.match_join_approvals a
    JOIN public.match_players mp ON mp.match_id = m.id AND mp.user_id = a.approver_id AND mp.status = 'confirmed'
   WHERE a.request_id = req.id;
  IF _approved < _confirmed THEN
    RETURN jsonb_build_object('approved', false, 'pending', _confirmed - _approved);
  END IF;
  IF _confirmed >= m.max_players THEN
    RAISE EXCEPTION 'Match is full' USING ERRCODE = 'P0001';
  END IF;
  SELECT COUNT(*) FILTER (WHERE team = 'A'), COUNT(*) FILTER (WHERE team = 'B') INTO _a, _b
    FROM public.match_players WHERE match_id = m.id AND status = 'confirmed';
  _team := CASE WHEN _a <= _b THEN 'A' ELSE 'B' END;
  INSERT INTO public.match_players (match_id, user_id, team, status)
  VALUES (m.id, req.user_id, _team, 'confirmed')
  ON CONFLICT DO NOTHING;
  UPDATE public.match_join_requests SET status = 'approved' WHERE id = req.id;
  PERFORM public.create_notification_for_user(
    req.user_id::text, 'match_update', 'Request approved! 🎾',
    format('All players approved your request. You''re now in the match at %s!', COALESCE(m.club, 'the club')),
    '/matches/' || m.id::text, 'player', NULL);
  RETURN jsonb_build_object('approved', true, 'pending', 0, 'team', _team);
END $$;
REVOKE EXECUTE ON FUNCTION public.approve_join_request(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.approve_join_request(uuid) TO authenticated, service_role;

-- ═══ F. score_submissions ════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Players can manage their submissions" ON public.score_submissions;
DROP POLICY IF EXISTS score_submissions_insert ON public.score_submissions;
DROP POLICY IF EXISTS score_submissions_select ON public.score_submissions;
CREATE POLICY score_submissions_insert ON public.score_submissions
  FOR INSERT TO authenticated WITH CHECK (
    submitted_by = auth.uid()::text
    AND status = 'pending'
    AND EXISTS (SELECT 1 FROM public.match_players mp
                 WHERE mp.match_id = score_submissions.match_id
                   AND mp.user_id = auth.uid() AND mp.status = 'confirmed')
  );
-- (reads stay limited to the match's confirmed players; no client UPDATE/DELETE)

CREATE OR REPLACE FUNCTION public.update_profile_match_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  winning_team TEXT; team_a_sets INT := 0; team_b_sets INT := 0; player_rec RECORD;
BEGIN
  -- fire once, when a submission becomes final ('accepted' from the edge
  -- functions / auto-accept, 'validated' from the legacy path)
  IF NEW.status NOT IN ('accepted','validated') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('accepted','validated') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE id = NEW.match_id AND status = 'completed'
               AND score_winner IS NOT NULL AND TG_OP = 'INSERT') THEN RETURN NEW; END IF;

  IF NEW.team_a_set_1 IS NOT NULL AND NEW.team_b_set_1 IS NOT NULL THEN
    IF NEW.team_a_set_1 > NEW.team_b_set_1 THEN team_a_sets := team_a_sets + 1;
    ELSIF NEW.team_b_set_1 > NEW.team_a_set_1 THEN team_b_sets := team_b_sets + 1; END IF; END IF;
  IF NEW.team_a_set_2 IS NOT NULL AND NEW.team_b_set_2 IS NOT NULL THEN
    IF NEW.team_a_set_2 > NEW.team_b_set_2 THEN team_a_sets := team_a_sets + 1;
    ELSIF NEW.team_b_set_2 > NEW.team_a_set_2 THEN team_b_sets := team_b_sets + 1; END IF; END IF;
  IF NEW.team_a_set_3 IS NOT NULL AND NEW.team_b_set_3 IS NOT NULL THEN
    IF NEW.team_a_set_3 > NEW.team_b_set_3 THEN team_a_sets := team_a_sets + 1;
    ELSIF NEW.team_b_set_3 > NEW.team_a_set_3 THEN team_b_sets := team_b_sets + 1; END IF; END IF;

  IF NEW.result_type IN ('team_a','team_a_wins','team_a_win','a') THEN winning_team := 'A';
  ELSIF NEW.result_type IN ('team_b','team_b_wins','team_b_win','b') THEN winning_team := 'B';
  ELSIF NEW.result_type = 'draw' THEN winning_team := 'DRAW';
  ELSIF team_a_sets > team_b_sets THEN winning_team := 'A';
  ELSIF team_b_sets > team_a_sets THEN winning_team := 'B';
  ELSE winning_team := 'DRAW'; END IF;

  FOR player_rec IN
    SELECT mp.user_id, UPPER(mp.team) AS team FROM public.match_players mp
     WHERE mp.match_id = NEW.match_id AND mp.status = 'confirmed'
  LOOP
    UPDATE public.profiles SET
      total_matches = COALESCE(total_matches,0) + 1,
      wins   = COALESCE(wins,0)   + CASE WHEN winning_team = player_rec.team THEN 1 ELSE 0 END,
      losses = COALESCE(losses,0) + CASE WHEN winning_team IN ('A','B') AND winning_team <> player_rec.team THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE user_id = player_rec.user_id;
  END LOOP;

  UPDATE public.matches
     SET status = 'completed',
         score_winner = COALESCE(score_winner, CASE winning_team WHEN 'DRAW' THEN 'draw' ELSE winning_team END),
         updated_at = NOW()
   WHERE id = NEW.match_id AND status <> 'completed';
  RETURN NEW;
END $$;

-- ═══ G. Realtime publication ═════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notifications','messages','conversations','match_players','match_invitations','match_join_requests','matches']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ═══ H. delete_user_account — scrub everything identifying ═══════════════════
CREATE OR REPLACE FUNCTION public.delete_user_account(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE profiles SET
    display_name = 'Deleted player', full_name = NULL, username = NULL,
    email = NULL, avatar_url = NULL, bio = NULL, phone = NULL,
    location = NULL, date_of_birth = NULL, preferred_club = NULL,
    push_token = NULL, referral_code = NULL, stripe_customer_id = NULL,
    last_lat = NULL, last_lng = NULL, last_location_at = NULL
  WHERE user_id = _user_id;
  DELETE FROM quiz_responses WHERE user_id = _user_id::text;
  DELETE FROM notifications WHERE user_id = _user_id::text;
  DELETE FROM pro_waitlist WHERE user_id = _user_id;
  DELETE FROM club_memberships WHERE user_id = _user_id;
  UPDATE conversation_participants SET left_at = now() WHERE user_id = _user_id::text AND left_at IS NULL;
  UPDATE xplay_pro_subscriptions SET status = 'canceled' WHERE user_id = _user_id AND status = 'active';
  UPDATE points_transactions SET user_id = 'deleted' WHERE user_id = _user_id::text;
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_user_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_user_account(uuid) TO service_role;

-- ═══ I. pg_cron: give the auto-cancel job a 60s HTTP timeout ═════════════════
DO $$
DECLARE j record;
BEGIN
  SELECT jobid, command INTO j FROM cron.job WHERE jobname = 'auto-cancel-unfilled-matches';
  IF FOUND AND j.command NOT ILIKE '%timeout_milliseconds%' THEN
    PERFORM cron.alter_job(j.jobid, command :=
      regexp_replace(j.command, 'body := ''\{\}''::jsonb', 'body := ''{}''::jsonb, timeout_milliseconds := 60000'));
  END IF;
END $$;

-- ═══ J. profiles: hide the most sensitive columns from other users ═══════════
-- Column-level privileges: authenticated users can read every profile column
-- EXCEPT push_token, stripe_customer_id and date_of_birth. A user reads their
-- own full row through get_my_profile(); platform admins through
-- admin_get_profile(). NOTE: a column added to profiles later must be granted
-- here too, or clients cannot select it.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles'
     AND column_name NOT IN ('push_token','stripe_customer_id','date_of_birth');
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', cols);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.profiles WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_profile(_user_id uuid)
RETURNS SETOF public.profiles LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.profiles WHERE user_id = _user_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_profile(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_get_profile(uuid) TO authenticated, service_role;
