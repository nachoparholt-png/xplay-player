-- 25 Sep 2026 — three "still open" items from the prod E2E (XPLAY_Prod_E2E_Report_Sep25_2026.md).
-- Applied to STAGING on 25 Sep (as three steps: pii_contacts_tv_token_onboarding_gate,
-- tv_token_separate_table, profiles_contact_more_columns). This file is the combined
-- version for PROD. Deploy the club app (xplayapps.com) from the same commit first:
-- it reads player emails through the new profiles_contact view.
--
-- 1. Other players' email / phone were readable by any signed-in player.
--    Players lose SELECT on profiles.email / profiles.phone. Admins and active
--    club staff / organisers / coaches read them through the view profiles_contact
--    (own row always visible).
-- 2. tournaments.tv_token (secret for the public TV screen) was readable by any
--    player. Both apps select('*') on tournaments, so the column can't simply be
--    hidden: the secret moves to tournament_tv_tokens (no client access) and the
--    old column is left null. Organisers call get_tournament_tv_token().
-- 3. can_join_match() did not check onboarding: an account without a finished
--    onboarding / adult DOB / accepted terms could join a match through the API.

-- ---------------------------------------------------------------- 1. contacts
revoke select (email, phone) on public.profiles from authenticated, anon;

create or replace function public.xplay_can_read_contacts()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_role(auth.uid(), 'admin')
      or exists (
        select 1 from public.club_memberships cm
         where cm.user_id = auth.uid()
           and cm.active = true
           and cm.role in ('club_owner','club_admin','club_staff','coach'));
$$;
revoke all on function public.xplay_can_read_contacts() from public, anon;
grant execute on function public.xplay_can_read_contacts() to authenticated;

drop view if exists public.profiles_contact;
create view public.profiles_contact as
  select p.user_id, p.id, p.display_name, p.full_name, p.avatar_url, p.padel_level, p.level,
         p.padel_park_points, p.app_role, p.created_at,
         p.email, p.phone
    from public.profiles p
   where p.user_id = auth.uid() or public.xplay_can_read_contacts();
revoke all on public.profiles_contact from public, anon;
grant select on public.profiles_contact to authenticated;
comment on view public.profiles_contact is
  'Email/phone of players. Own row always; other rows only for admins and active club staff/organisers/coaches. Players never see other players'' contact details.';

-- ---------------------------------------------------------------- 2. tv_token
create table if not exists public.tournament_tv_tokens (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  rotated_at timestamptz not null default now()
);
alter table public.tournament_tv_tokens enable row level security;
revoke all on public.tournament_tv_tokens from public, anon, authenticated;

insert into public.tournament_tv_tokens (tournament_id, token)
select id, tv_token from public.tournaments where tv_token is not null
on conflict (tournament_id) do nothing;

alter table public.tournaments alter column tv_token drop not null;
alter table public.tournaments alter column tv_token drop default;
update public.tournaments set tv_token = null where tv_token is not null;
comment on column public.tournaments.tv_token is
  'Deprecated, always null. The TV-screen secret lives in tournament_tv_tokens; organisers use get_tournament_tv_token().';

create or replace function public.get_tournament_tv_token(p_tournament_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid;
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.tournament_tv_tokens (tournament_id) values (p_tournament_id)
  on conflict (tournament_id) do nothing;
  select token into v from public.tournament_tv_tokens where tournament_id = p_tournament_id;
  return v;
end $$;
revoke all on function public.get_tournament_tv_token(uuid) from public, anon;
grant execute on function public.get_tournament_tv_token(uuid) to authenticated;

create or replace function public.tournament_rotate_tv_token(p_tournament_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := gen_random_uuid();
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.tournament_tv_tokens (tournament_id, token, rotated_at) values (p_tournament_id, v, now())
  on conflict (tournament_id) do update set token = excluded.token, rotated_at = now();
  return v;
end $$;

CREATE OR REPLACE FUNCTION public.get_tournament_tv(p_token uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  with t as (
    select tr.*, c.club_name as c_name, c.logo_url as c_logo
      from tournaments tr
      join tournament_tv_tokens k on k.tournament_id = tr.id and k.token = p_token
      left join clubs c on c.id = tr.club_id
     where tr.status::text <> 'draft'
  ),
  people as (
    select p.user_id::text as user_id,
           split_part(coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.full_name), ''), 'Player'), ' ', 1) as first,
           p.avatar_url
      from profiles p
     where p.user_id::text in (select tt.player1_id from tournament_teams tt join t on t.id = tt.tournament_id
                         union select tt.player2_id from tournament_teams tt join t on t.id = tt.tournament_id)
  )
  select case when not exists (select 1 from t) then null else jsonb_build_object(
    'server_now', now(),
    'tournament', (select jsonb_build_object(
        'id', t.id, 'name', t.name, 'status', t.status, 'is_live', t.is_live,
        'announcement', t.live_announcement, 'court_count', t.court_count, 'court_labels', t.court_labels,
        'format_type', t.format_type, 'bracket_config', t.bracket_config, 'match_config', t.match_config,
        'scheduled_date', t.scheduled_date, 'scheduled_time', t.scheduled_time,
        'timezone', coalesce(to_jsonb(t)->>'timezone', 'Europe/London'),
        'slug', to_jsonb(t)->>'slug', 'venue_name', to_jsonb(t)->>'venue_name',
        'club_name', coalesce(t.c_name, t.club), 'club_logo', t.c_logo,
        'live_started_at', t.live_started_at, 'updated_at', t.updated_at) from t),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'id', tt.id, 'group_id', tt.group_id,
        'players', jsonb_build_array(
           jsonb_build_object('first', p1.first, 'avatar', p1.avatar_url),
           case when tt.player2_id is not null then jsonb_build_object('first', p2.first, 'avatar', p2.avatar_url) end)
        ))
        from tournament_teams tt join t on t.id = tt.tournament_id
        left join people p1 on p1.user_id = tt.player1_id
        left join people p2 on p2.user_id = tt.player2_id), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'round_type', m.round_type, 'round_number', m.round_number, 'match_number', m.match_number,
        'team_a_id', m.team_a_id, 'team_b_id', m.team_b_id, 'status', m.status,
        'result', case when m.result is null then null else jsonb_build_object(
            'team_a_score', m.result->'team_a_score', 'team_b_score', m.result->'team_b_score',
            'sets', m.result->'sets', 'winner_team_id', m.result->'winner_team_id') end,
        'court_number', m.court_number, 'court_label', m.court_label,
        'scheduled_at', m.scheduled_at, 'started_at', m.started_at, 'completed_at', m.completed_at,
        'estimated_mins', m.estimated_mins) order by m.scheduled_at nulls last, m.match_number)
        from tournament_matches m join t on t.id = m.tournament_id), '[]'::jsonb)
  ) end;
$function$;

-- ---------------------------------------------------------------- 3. onboarding gate
CREATE OR REPLACE FUNCTION public.can_join_match(_match_id uuid, _status match_player_status)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m public.matches%ROWTYPE; _uid uuid := auth.uid(); _confirmed integer;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  -- Only fully onboarded adults who accepted the terms can take a seat.
  IF NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.user_id = _uid
          AND p.onboarding_completed = true
          AND p.terms_accepted_at IS NOT NULL
          AND p.date_of_birth IS NOT NULL
          AND p.date_of_birth <= (current_date - interval '18 years')) THEN
    RETURN false;
  END IF;
  SELECT * INTO m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF m.organizer_id = _uid THEN RETURN true; END IF;
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
  IF NOT public.player_level_fits(_match_id, _uid)
     AND NOT public.join_request_fully_approved(_match_id, _uid) THEN
    RETURN false;
  END IF;
  IF _status = 'waitlist' THEN RETURN true; END IF;
  SELECT COUNT(*) INTO _confirmed FROM public.match_players
   WHERE match_id = _match_id AND status = 'confirmed';
  RETURN _confirmed < m.max_players;
END $function$;
