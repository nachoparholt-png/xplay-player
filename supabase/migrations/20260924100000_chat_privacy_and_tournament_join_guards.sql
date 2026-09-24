-- 24 Sep 2026 — E2E report blockers #2 (chat privacy) and #3 (tournament join guards)
-- Apply to STAGING first, then PROD (before or together with the app build that uses the chat RPCs).
-- Safe to re-run.

-- =====================================================================
-- PART A — CHAT
-- Before: any signed-in user could insert themselves into ANY conversation
-- (conversation_participants INSERT only checked user_id = auth.uid()) and
-- then read it; messages INSERT had no membership check; get_last_messages
-- returned the last message of any conversation id passed to it.
-- After: chats are joined/created only through server functions that check
-- the caller belongs (confirmed player / organiser of the match, or one of
-- the two people in a direct chat).
-- =====================================================================

create or replace function public.is_conversation_participant(_conv uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.conversation_participants
                 where conversation_id = _conv and user_id = auth.uid()::text);
$$;

create or replace function public.is_active_conversation_member(_conv uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.conversation_participants
                 where conversation_id = _conv and user_id = auth.uid()::text and left_at is null);
$$;

-- caller is organiser / confirmed player of the match, or an admin
create or replace function public.chat_can_use_match(_match_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.matches m where m.id = _match_id and m.organizer_id = auth.uid())
      or exists (select 1 from public.match_players mp
                 where mp.match_id = _match_id and mp.user_id = auth.uid() and mp.status = 'confirmed')
      or public.has_role(auth.uid(), 'admin');
$$;

-- Open (create if needed) the match chat, make sure every confirmed player is in it,
-- re-activate the caller if they had left. Returns the conversation id.
create or replace function public.open_match_chat(_match_id uuid, _title text default null)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  _uid text := auth.uid()::text;
  _conv uuid;
  _m record;
  _name text;
  _was_active boolean;
  _created boolean := false;
begin
  if _uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not public.chat_can_use_match(_match_id) then
    raise exception 'Only players in this match can open its chat' using errcode = '42501';
  end if;
  select id, club, court, match_date, organizer_id into _m from public.matches where id = _match_id;

  select id into _conv from public.conversations
   where match_id = _match_id and type = 'match' order by created_at limit 1;

  if _conv is null then
    insert into public.conversations (type, match_id, title)
    values ('match', _match_id,
            coalesce(nullif(btrim(_title), ''), _m.club || coalesce(' — ' || _m.court, '')))
    returning id into _conv;
    _created := true;
  end if;

  select (left_at is null) into _was_active from public.conversation_participants
   where conversation_id = _conv and user_id = _uid;

  -- everyone currently confirmed in the match (+ organiser) is in the chat
  insert into public.conversation_participants (conversation_id, user_id)
  select _conv, x.uid from (
    select mp.user_id::text uid from public.match_players mp where mp.match_id = _match_id and mp.status = 'confirmed'
    union select _m.organizer_id::text
    union select _uid
  ) x
  where x.uid is not null
    and not exists (select 1 from public.conversation_participants cp where cp.conversation_id = _conv and cp.user_id = x.uid);

  update public.conversation_participants set left_at = null
   where conversation_id = _conv and user_id = _uid and left_at is not null;

  select coalesce(nullif(btrim(display_name), ''), 'A player') into _name from public.profiles where user_id = auth.uid();

  if _created then
    insert into public.messages (conversation_id, message_text, message_type)
    values (_conv, 'Match chat created 🎾', 'system_message'),
           (_conv, coalesce((select nullif(btrim(display_name), '') from public.profiles where user_id = _m.organizer_id), 'Someone') || ' created this match', 'system_message');
  elsif _was_active is distinct from true and _uid <> _m.organizer_id::text then
    insert into public.messages (conversation_id, message_text, message_type)
    values (_conv, _name || ' joined the match', 'system_message');
  end if;

  return _conv;
end $$;

-- Mark a player as having left the match chat. Self, the match organiser or an admin.
create or replace function public.leave_match_chat(_match_id uuid, _user_id uuid default null, _reason text default 'left')
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  _target uuid := coalesce(_user_id, auth.uid());
  _conv uuid;
  _name text;
  _n int;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if _target <> auth.uid()
     and not exists (select 1 from public.matches where id = _match_id and organizer_id = auth.uid())
     and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select id into _conv from public.conversations where match_id = _match_id and type = 'match' order by created_at limit 1;
  if _conv is null then return; end if;
  update public.conversation_participants set left_at = now()
   where conversation_id = _conv and user_id = _target::text and left_at is null;
  get diagnostics _n = row_count;
  if _n = 0 then return; end if;
  select coalesce(nullif(btrim(display_name), ''), 'A player') into _name from public.profiles where user_id = _target;
  insert into public.messages (conversation_id, message_text, message_type)
  values (_conv, case _reason when 'removed' then _name || ' was removed from the match'
                              when 'cancelled' then _name || ' cancelled their registration'
                              else _name || ' left the match' end, 'system_message');
end $$;

-- System line in a match chat (e.g. "Match cancelled by the organizer"). Organiser / player / admin.
create or replace function public.post_match_system_message(_match_id uuid, _text text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare _conv uuid;
begin
  if not public.chat_can_use_match(_match_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if _text is null or length(btrim(_text)) = 0 or length(_text) > 200 then raise exception 'Invalid message'; end if;
  select id into _conv from public.conversations where match_id = _match_id and type = 'match' order by created_at limit 1;
  if _conv is null then return; end if;
  insert into public.messages (conversation_id, message_text, message_type) values (_conv, btrim(_text), 'system_message');
end $$;

-- Open (create if needed) the 1:1 chat between the caller and another player.
create or replace function public.open_direct_chat(_other_user_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  _me text := auth.uid()::text;
  _other text := _other_user_id::text;
  _conv uuid;
begin
  if _me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if _other_user_id is null or _other = _me then raise exception 'Invalid player'; end if;
  if not exists (select 1 from public.profiles where user_id = _other_user_id) then raise exception 'Player not found'; end if;

  select c.id into _conv from public.conversations c
   where c.type = 'direct'
     and exists (select 1 from public.conversation_participants a where a.conversation_id = c.id and a.user_id = _me)
     and exists (select 1 from public.conversation_participants b where b.conversation_id = c.id and b.user_id = _other)
     and (select count(*) from public.conversation_participants p where p.conversation_id = c.id) = 2
   order by c.created_at limit 1;

  if _conv is null then
    insert into public.conversations (type) values ('direct') returning id into _conv;
    insert into public.conversation_participants (conversation_id, user_id) values (_conv, _me), (_conv, _other);
  else
    update public.conversation_participants set left_at = null where conversation_id = _conv and user_id = _me and left_at is not null;
  end if;
  return _conv;
end $$;

-- last-message preview: only for conversations the caller is in
create or replace function public.get_last_messages(conv_ids uuid[])
returns table(conversation_id uuid, message_text text, created_at timestamptz, sender_id text, message_type text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select distinct on (m.conversation_id)
         m.conversation_id, m.message_text, m.created_at, m.sender_id, m.message_type::text
    from public.messages m
   where m.conversation_id = any(conv_ids)
     and exists (select 1 from public.conversation_participants cp
                  where cp.conversation_id = m.conversation_id and cp.user_id = auth.uid()::text)
   order by m.conversation_id, m.created_at desc;
$$;

revoke all on function public.open_match_chat(uuid, text), public.leave_match_chat(uuid, uuid, text),
  public.post_match_system_message(uuid, text), public.open_direct_chat(uuid),
  public.is_conversation_participant(uuid), public.is_active_conversation_member(uuid),
  public.chat_can_use_match(uuid) from public, anon;
grant execute on function public.open_match_chat(uuid, text), public.leave_match_chat(uuid, uuid, text),
  public.post_match_system_message(uuid, text), public.open_direct_chat(uuid),
  public.is_conversation_participant(uuid), public.is_active_conversation_member(uuid),
  public.chat_can_use_match(uuid) to authenticated;

-- policies
drop policy if exists conversations_insert on public.conversations;              -- created only via RPC
drop policy if exists conv_participants_insert on public.conversation_participants; -- added only via RPC
drop policy if exists conv_participants_select on public.conversation_participants;
create policy conv_participants_select on public.conversation_participants
  for select to authenticated
  using (user_id = auth.uid()::text or public.is_conversation_participant(conversation_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid()::text
              and message_type = 'user_message'
              and public.is_active_conversation_member(conversation_id));

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (sender_id = auth.uid()::text)
  with check (sender_id = auth.uid()::text and public.is_conversation_participant(conversation_id));

revoke insert, update, truncate, references, trigger on public.conversation_participants from anon, authenticated;
revoke insert, truncate, references, trigger on public.conversations from anon;

-- =====================================================================
-- PART B — TOURNAMENTS
-- Before: tournament_players INSERT only checked user_id = auth.uid(), so a
-- player could enter a PAID tournament without paying, go over capacity,
-- join drafts / closed / private tournaments, and flip a withdrawn entry back
-- to confirmed. +100 XP was given on JOIN (kept after withdrawing).
-- After: players can self-join only free, open, not-full tournaments (paid
-- entries come from the payment functions, which use the service role);
-- organisers/club staff manage entries; the 100 XP is given when the
-- tournament is completed.
-- =====================================================================

create or replace function public.tournament_self_join_allowed(_tournament_id uuid, _uid uuid)
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  t record;
  _invited boolean;
  _partner_of_confirmed boolean;
  _free int;
begin
  select * into t from public.tournaments where id = _tournament_id;
  if not found then return false; end if;
  if t.status::text <> 'active' then return false; end if;              -- drafts, completed, cancelled
  if coalesce(t.is_live, false) or t.started_at is not null then return false; end if;
  if t.registration_deadline is not null and now() > t.registration_deadline then return false; end if;

  _invited := exists (select 1 from public.tournament_invitations i
                       where i.tournament_id = _tournament_id and i.invited_user_id = _uid::text
                         and i.status in ('pending', 'accepted'));
  _partner_of_confirmed := exists (select 1 from public.tournament_players p
                       where p.tournament_id = _tournament_id and p.partner_user_id = _uid::text
                         and p.status = 'confirmed' and p.user_id <> _uid::text);

  if t.visibility::text in ('private', 'invite_only') and not (_invited or _partner_of_confirmed) then return false; end if;
  -- paid tournaments: the entry is created by the payment functions after Stripe confirms.
  -- Exception kept from the pairs flow: the partner named by a confirmed (paid) entry.
  if coalesce(t.ticket_price_cents, 0) > 0 and not _partner_of_confirmed then return false; end if;

  select s.free into _free from public.tournament_seat_counts(_tournament_id) s;
  if coalesce(_free, 0) <= 0 then return false; end if;
  return true;
end $$;
revoke all on function public.tournament_self_join_allowed(uuid, uuid) from public, anon;
grant execute on function public.tournament_self_join_allowed(uuid, uuid) to authenticated;

drop policy if exists tournament_players_insert on public.tournament_players;
create policy tournament_players_insert on public.tournament_players
  for insert to authenticated
  with check (
    (user_id = auth.uid()::text
      and coalesce(role, 'player') = 'player'
      and status = 'confirmed'
      and public.tournament_self_join_allowed(tournament_id, auth.uid()))
    or public.can_manage_tournament(tournament_id)
  );

drop policy if exists tournament_players_update on public.tournament_players;
create policy tournament_players_update on public.tournament_players
  for update to authenticated
  using (user_id = auth.uid()::text or partner_user_id = auth.uid()::text or public.can_manage_tournament(tournament_id))
  with check (user_id = auth.uid()::text or partner_user_id = auth.uid()::text or public.can_manage_tournament(tournament_id));

drop policy if exists tournament_players_delete on public.tournament_players;
create policy tournament_players_delete on public.tournament_players
  for delete to authenticated
  using (user_id = auth.uid()::text or public.can_manage_tournament(tournament_id));

-- What a player (not organiser/staff/server) may change on an entry
create or replace function public.guard_tournament_player_client_update()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare _me text := auth.uid()::text;
begin
  if public.xplay_is_privileged() or _me is null or public.can_manage_tournament(OLD.tournament_id) then
    return NEW;
  end if;

  if NEW.tournament_id is distinct from OLD.tournament_id or NEW.user_id is distinct from OLD.user_id
     or NEW.role is distinct from OLD.role or NEW.team_id is distinct from OLD.team_id
     or NEW.joined_at is distinct from OLD.joined_at then
    raise exception 'This change is not allowed' using errcode = '42501';
  end if;

  if OLD.user_id = _me then
    -- withdraw is fine; coming back needs the same checks as a new free join
    if OLD.status::text <> 'confirmed' and NEW.status::text = 'confirmed'
       and not public.tournament_self_join_allowed(OLD.tournament_id, auth.uid()) then
      raise exception 'This tournament is full, closed or needs payment' using errcode = '42501';
    end if;
    return NEW;
  end if;

  -- the invited partner answering the captain's request: only partner_status
  if OLD.partner_user_id = _me then
    if NEW.status is distinct from OLD.status or NEW.partner_user_id is distinct from OLD.partner_user_id
       or NEW.slot_index is distinct from OLD.slot_index or NEW.side_preference is distinct from OLD.side_preference
       or NEW.partner_status not in ('confirmed', 'declined') then
      raise exception 'Partners can only accept or decline' using errcode = '42501';
    end if;
    return NEW;
  end if;

  raise exception 'Not allowed' using errcode = '42501';
end $$;

drop trigger if exists guard_tournament_player_client_update on public.tournament_players;
create trigger guard_tournament_player_client_update
  before update on public.tournament_players
  for each row execute function public.guard_tournament_player_client_update();

-- Points: 100 XP when the tournament is COMPLETED (was: on join, kept after withdrawing)
drop trigger if exists award_tournament_checkin on public.tournament_players;

create or replace function public.trg_award_tournament_completed()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare r record;
begin
  if NEW.status::text = 'completed' and OLD.status::text is distinct from 'completed' then
    for r in select distinct tp.user_id from public.tournament_players tp
              where tp.tournament_id = NEW.id and tp.status = 'confirmed'
                and coalesce(tp.role, 'player') not in ('organiser')
    loop
      begin
        perform public.award_points(r.user_id::uuid, 'tournament_play', null, 'tournament_played');
      exception when others then null;  -- never block ending a tournament
      end;
    end loop;
  end if;
  return NEW;
end $$;

drop trigger if exists award_tournament_completed on public.tournaments;
create trigger award_tournament_completed
  after update of status on public.tournaments
  for each row execute function public.trg_award_tournament_completed();

update public.point_rules set description = 'Awarded to every confirmed player when a tournament is completed'
 where action_type::text = 'tournament_play';
