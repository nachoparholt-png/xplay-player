-- Waiting list: "Notify me" on a taken court slot (players app, 25 Sep 2026).
-- slot_watches + slot_watches_check() (every 5 min via pg_cron).
-- A watch is matched against external_court_slots (directory clubs) or
-- court_slots (native clubs, status available). When a court frees up the
-- watch flips to 'notified' and an in-app notification is written.
-- Push: no SQL-callable push path exists (APNs is sent inside edge functions),
-- so the in-app notification is the delivery for now.

create table if not exists public.slot_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  slot_date date not null,
  start_time time not null,
  duration_mins int not null default 60,
  nearby boolean not null default false,
  status text not null default 'active' check (status in ('active','notified','cancelled','expired')),
  notified_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, club_id, slot_date, start_time)
);

create index if not exists slot_watches_active_idx on public.slot_watches (status, slot_date) where status = 'active';

alter table public.slot_watches enable row level security;

drop policy if exists "slot_watches_select_own" on public.slot_watches;
create policy "slot_watches_select_own" on public.slot_watches for select using (auth.uid() = user_id);
drop policy if exists "slot_watches_insert_own" on public.slot_watches;
create policy "slot_watches_insert_own" on public.slot_watches for insert with check (auth.uid() = user_id);
drop policy if exists "slot_watches_update_own" on public.slot_watches;
create policy "slot_watches_update_own" on public.slot_watches for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "slot_watches_delete_own" on public.slot_watches;
create policy "slot_watches_delete_own" on public.slot_watches for delete using (auth.uid() = user_id);

create or replace function public.slot_watches_check()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w record;
  found_at timestamptz;
  club_tz text;
  club_name text;
  notified integer := 0;
  slot_ts timestamptz;
  tol interval;
begin
  -- Watches whose slot time is past: expire.
  update public.slot_watches sw
     set status = 'expired'
    from public.clubs c
   where c.id = sw.club_id
     and sw.status = 'active'
     and ((sw.slot_date + sw.start_time) at time zone coalesce(c.timezone, 'Europe/London')) < now();

  for w in
    select sw.*, c.timezone as tz, c.club_name as cname, c.source as csource
      from public.slot_watches sw
      join public.clubs c on c.id = sw.club_id
     where sw.status = 'active'
  loop
    club_tz := coalesce(w.tz, 'Europe/London');
    club_name := w.cname;
    slot_ts := (w.slot_date + w.start_time) at time zone club_tz;
    tol := case when w.nearby then interval '30 minutes' else interval '0' end;
    found_at := null;

    -- Directory clubs: the collected feed.
    select e.starts_at into found_at
      from public.external_court_slots e
     where e.club_id = w.club_id
       and e.starts_at between slot_ts - tol and slot_ts + tol
       and e.duration_mins >= w.duration_mins
     order by abs(extract(epoch from (e.starts_at - slot_ts))), e.starts_at
     limit 1;

    -- Native clubs: XPLAY's own court slots.
    if found_at is null then
      select coalesce(cs.starts_at, (cs.slot_date + cs.start_time) at time zone club_tz) into found_at
        from public.court_slots cs
        join public.courts ct on ct.id = cs.court_id
       where ct.club_id = w.club_id
         and cs.status = 'available'
         and cs.coaching_session_id is null
         and coalesce(cs.starts_at, (cs.slot_date + cs.start_time) at time zone club_tz) between slot_ts - tol and slot_ts + tol
         and extract(epoch from (cs.end_time - cs.start_time)) / 60 >= w.duration_mins
       order by abs(extract(epoch from (coalesce(cs.starts_at, (cs.slot_date + cs.start_time) at time zone club_tz) - slot_ts)))
       limit 1;
    end if;

    if found_at is not null then
      update public.slot_watches set status = 'notified', notified_at = now() where id = w.id;
      insert into public.notifications (user_id, type, title, body, link, data, target_app)
      values (
        w.user_id::text,
        'system',
        'Court free at ' || club_name,
        to_char(found_at at time zone club_tz, 'Dy') || ' ' || to_char(found_at at time zone club_tz, 'HH24:MI')
          || ' · ' || case when w.duration_mins >= 60 then (w.duration_mins / 60)::text || 'h' || case when w.duration_mins % 60 > 0 then ' ' || (w.duration_mins % 60)::text else '' end else w.duration_mins::text || ' min' end
          || '. First to book gets it.',
        '/clubs/' || w.club_id::text,
        jsonb_build_object('slot_watch_id', w.id, 'club_id', w.club_id, 'starts_at', found_at, 'duration_mins', w.duration_mins),
        'player'
      );
      notified := notified + 1;
    end if;
  end loop;

  return notified;
end;
$$;

revoke all on function public.slot_watches_check() from public;
grant execute on function public.slot_watches_check() to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'slot-watches-check') then
      perform cron.unschedule('slot-watches-check');
    end if;
    perform cron.schedule('slot-watches-check', '*/5 * * * *', 'select public.slot_watches_check()');
  end if;
end $$;
