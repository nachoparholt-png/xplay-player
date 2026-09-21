-- Level gate + "approved to join" (decision 21 Sep 2026, Ignacio)
--
-- Rules
--   1. A player whose level is outside a match's range cannot join directly: they request access.
--   2. EVERY confirmed player currently in the match must approve. An invitation from a
--      confirmed player counts as that player's approval, nobody else's.
--   3. Full approval does NOT seat the player. It gives them the right to take a free spot;
--      several players can be approved at once and the first to join gets the place.
--   4. Approval is computed against the players in the match NOW: if someone new joins,
--      every still-waiting requester needs that new player's approval too.
--   5. One decline ends the request; the player may ask again later.
--
-- match_join_requests.status: 'pending' = waiting or approved-but-not-joined,
-- 'approved' = joined through a request, 'rejected' = declined.

-- ── helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.player_level_fits(_match_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((
    SELECT p.padel_level IS NULL
        OR ((m.level_min IS NULL OR p.padel_level >= m.level_min)
        AND (m.level_max IS NULL OR p.padel_level <= m.level_max))
      FROM public.matches m
      LEFT JOIN public.profiles p ON p.user_id = _user_id
     WHERE m.id = _match_id), false);
$$;

-- how many confirmed players have NOT yet approved this player (approval row, or a live invitation from them)
CREATE OR REPLACE FUNCTION public.join_request_missing_approvals(_match_id uuid, _user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COUNT(*)::int
    FROM public.match_players mp
   WHERE mp.match_id = _match_id AND mp.status = 'confirmed'
     AND NOT EXISTS (
           SELECT 1 FROM public.match_join_approvals a
             JOIN public.match_join_requests r ON r.id = a.request_id
            WHERE r.match_id = _match_id AND r.user_id = _user_id AND r.status = 'pending'
              AND a.approver_id = mp.user_id)
     AND NOT EXISTS (
           SELECT 1 FROM public.match_invitations i
            WHERE i.match_id = _match_id AND i.invited_user_id = _user_id::text
              AND i.invited_by = mp.user_id::text AND i.status IN ('pending','accepted'));
$$;

CREATE OR REPLACE FUNCTION public.join_request_fully_approved(_match_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.match_join_requests r
                  WHERE r.match_id = _match_id AND r.user_id = _user_id AND r.status = 'pending')
     AND public.join_request_missing_approvals(_match_id, _user_id) = 0;
$$;

-- ── the join gate used by the match_players INSERT policy ─────────────────
CREATE OR REPLACE FUNCTION public.can_join_match(_match_id uuid, _status match_player_status)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE m public.matches%ROWTYPE; _uid uuid := auth.uid(); _confirmed integer;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  SELECT * INTO m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF m.organizer_id = _uid THEN RETURN true; END IF;                -- organiser seats themself
  IF m.status NOT IN ('open','almost_full','full') THEN RETURN false; END IF;
  IF _status = 'cancelled' THEN RETURN false; END IF;
  IF m.visibility = 'private' THEN
    IF NOT public.join_request_fully_approved(_match_id, _uid)
       AND NOT EXISTS (SELECT 1 FROM public.match_invitations i
                    WHERE i.match_id = _match_id AND i.invited_user_id = _uid::text
                      AND i.status IN ('pending','accepted')) THEN
      RETURN false;
    END IF;
  END IF;
  -- level gate: outside the range → only with every current player's approval
  IF NOT public.player_level_fits(_match_id, _uid)
     AND NOT public.join_request_fully_approved(_match_id, _uid) THEN
    RETURN false;
  END IF;
  IF _status = 'waitlist' THEN RETURN true; END IF;
  SELECT COUNT(*) INTO _confirmed FROM public.match_players
   WHERE match_id = _match_id AND status = 'confirmed';
  RETURN _confirmed < m.max_players;
END $function$;

-- ── request ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_to_join_match(_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _uid uuid := auth.uid();
  m public.matches%ROWTYPE;
  req public.match_join_requests%ROWTYPE;
  _name text; _level numeric; _missing integer; mp record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF m.status NOT IN ('open','almost_full','full') THEN RAISE EXCEPTION 'This match is no longer open'; END IF;
  IF EXISTS (SELECT 1 FROM public.match_players WHERE match_id = _match_id AND user_id = _uid) THEN
    RAISE EXCEPTION 'You are already in this match';
  END IF;

  SELECT * INTO req FROM public.match_join_requests WHERE match_id = _match_id AND user_id = _uid FOR UPDATE;
  IF FOUND THEN
    IF req.status <> 'pending' THEN                       -- declined (or old) → ask again from scratch
      DELETE FROM public.match_join_approvals WHERE request_id = req.id;
      UPDATE public.match_join_requests SET status = 'pending', created_at = now() WHERE id = req.id;
    ELSE
      RETURN jsonb_build_object('status','pending','missing', public.join_request_missing_approvals(_match_id, _uid));
    END IF;
  ELSE
    INSERT INTO public.match_join_requests (match_id, user_id, status) VALUES (_match_id, _uid, 'pending')
    RETURNING * INTO req;
  END IF;

  SELECT display_name, padel_level INTO _name, _level FROM public.profiles WHERE user_id = _uid;
  FOR mp IN SELECT user_id FROM public.match_players WHERE match_id = _match_id AND status = 'confirmed' LOOP
    PERFORM public.create_notification_for_user(
      mp.user_id::text, 'match_update', 'Join request 🙋',
      format('%s (level %s) asks to join your match at %s. Everyone in the match has to approve.',
             COALESCE(_name,'A player'), COALESCE(to_char(_level,'FM90.0'),'?'), COALESCE(m.club,'the club')),
      '/matches/' || m.id::text, 'player', NULL);
  END LOOP;

  _missing := public.join_request_missing_approvals(_match_id, _uid);
  RETURN jsonb_build_object('status','pending','missing', _missing);
END $function$;

-- ── approve: records the approval, NEVER seats the player ─────────────────
CREATE OR REPLACE FUNCTION public.approve_join_request(_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _uid uuid := auth.uid();
  req public.match_join_requests%ROWTYPE;
  m   public.matches%ROWTYPE;
  _missing integer; _was_missing integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO req FROM public.match_join_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status <> 'pending' THEN
    RETURN jsonb_build_object('approved', false, 'pending', 0, 'closed', true);
  END IF;
  SELECT * INTO m FROM public.matches WHERE id = req.match_id;
  IF NOT EXISTS (SELECT 1 FROM public.match_players mp
                  WHERE mp.match_id = m.id AND mp.user_id = _uid AND mp.status = 'confirmed') THEN
    RAISE EXCEPTION 'Only players in this match can approve' USING ERRCODE = '42501';
  END IF;

  _was_missing := public.join_request_missing_approvals(m.id, req.user_id);
  INSERT INTO public.match_join_approvals (request_id, approver_id) VALUES (req.id, _uid)
  ON CONFLICT (request_id, approver_id) DO NOTHING;
  _missing := public.join_request_missing_approvals(m.id, req.user_id);

  IF _missing = 0 AND _was_missing > 0 THEN
    PERFORM public.create_notification_for_user(
      req.user_id::text, 'match_update', 'You''re approved to join 🎾',
      format('Everyone in the match at %s said yes. Open the match and take a free spot — first approved player to join gets it.',
             COALESCE(m.club,'the club')),
      '/matches/' || m.id::text, 'player', NULL);
  END IF;
  RETURN jsonb_build_object('approved', _missing = 0, 'pending', _missing);
END $function$;

-- ── decline ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decline_join_request(_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); req public.match_join_requests%ROWTYPE; m public.matches%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO req FROM public.match_join_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = req.match_id;
  IF NOT EXISTS (SELECT 1 FROM public.match_players mp
                  WHERE mp.match_id = m.id AND mp.user_id = _uid AND mp.status = 'confirmed') THEN
    RAISE EXCEPTION 'Only players in this match can decline' USING ERRCODE = '42501';
  END IF;
  IF req.status = 'pending' THEN
    UPDATE public.match_join_requests SET status = 'rejected' WHERE id = req.id;
    PERFORM public.create_notification_for_user(
      req.user_id::text, 'match_update', 'Join request declined',
      format('Your request to join the match at %s was declined. You can ask again later.', COALESCE(m.club,'the club')),
      '/matches/' || m.id::text, 'player', NULL);
  END IF;
  RETURN jsonb_build_object('status','rejected');
END $function$;

-- ── what the requester sees ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_join_status(_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); req public.match_join_requests%ROWTYPE; _players integer; _missing integer;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('status','none'); END IF;
  SELECT COUNT(*) INTO _players FROM public.match_players WHERE match_id = _match_id AND status = 'confirmed';
  SELECT * INTO req FROM public.match_join_requests WHERE match_id = _match_id AND user_id = _uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','none','level_fits', public.player_level_fits(_match_id,_uid),'players',_players);
  END IF;
  _missing := CASE WHEN req.status = 'pending' THEN public.join_request_missing_approvals(_match_id,_uid) ELSE 0 END;
  RETURN jsonb_build_object(
    'status', req.status, 'request_id', req.id,
    'level_fits', public.player_level_fits(_match_id,_uid),
    'players', _players, 'missing', _missing,
    'approved_to_join', req.status = 'pending' AND _missing = 0);
END $function$;

-- matches I may join right now (shown on Profile / My matches)
CREATE OR REPLACE FUNCTION public.get_my_approved_joins()
RETURNS TABLE (match_id uuid, club text, match_date date, match_time time, spots_left integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.id, m.club, m.match_date, m.match_time,
         (m.max_players - (SELECT COUNT(*) FROM public.match_players mp
                            WHERE mp.match_id = m.id AND mp.status = 'confirmed'))::int
    FROM public.match_join_requests r
    JOIN public.matches m ON m.id = r.match_id
   WHERE r.user_id = auth.uid() AND r.status = 'pending'
     AND m.status IN ('open','almost_full','full') AND m.match_date >= current_date
     AND public.join_request_missing_approvals(m.id, r.user_id) = 0
   ORDER BY m.match_date, m.match_time;
$$;

-- ── after someone takes a seat ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_join_requests_after_player_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE m public.matches%ROWTYPE; r record; _waiting integer := 0;
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  -- the joiner's own request is done
  UPDATE public.match_join_requests SET status = 'approved'
   WHERE match_id = NEW.match_id AND user_id = NEW.user_id AND status = 'pending';

  SELECT * INTO m FROM public.matches WHERE id = NEW.match_id;
  FOR r IN SELECT user_id FROM public.match_join_requests
            WHERE match_id = NEW.match_id AND status = 'pending' AND user_id <> NEW.user_id LOOP
    _waiting := _waiting + 1;
    -- rule 4: the newcomer has not approved anyone yet
    IF public.join_request_missing_approvals(NEW.match_id, r.user_id) > 0 THEN
      PERFORM public.create_notification_for_user(
        r.user_id::text, 'match_update', 'One more approval needed',
        format('A new player joined the match at %s. They need to approve your request too before you can join.',
               COALESCE(m.club,'the club')),
        '/matches/' || NEW.match_id::text, 'player', NULL);
    END IF;
  END LOOP;
  IF _waiting > 0 AND NEW.user_id <> m.organizer_id THEN
    PERFORM public.create_notification_for_user(
      NEW.user_id::text, 'match_update', 'Players are waiting for your OK',
      format('%s player(s) outside the level range asked to join the match at %s. Open the match to approve or decline.',
             _waiting, COALESCE(m.club,'the club')),
      '/matches/' || NEW.match_id::text, 'player', NULL);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS join_requests_after_player_insert ON public.match_players;
CREATE TRIGGER join_requests_after_player_insert
  AFTER INSERT ON public.match_players
  FOR EACH ROW EXECUTE FUNCTION public.trg_join_requests_after_player_insert();

-- ── grants (WS1 style: nothing for anon, trigger fn not callable) ─────────
REVOKE ALL ON FUNCTION public.trg_join_requests_after_player_insert() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.player_level_fits(uuid,uuid)',
    'public.join_request_missing_approvals(uuid,uuid)',
    'public.join_request_fully_approved(uuid,uuid)',
    'public.request_to_join_match(uuid)',
    'public.approve_join_request(uuid)',
    'public.decline_join_request(uuid)',
    'public.get_my_join_status(uuid)',
    'public.get_my_approved_joins()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
