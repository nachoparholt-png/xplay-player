-- Push for the waiting list (players app, 25 Sep 2026).
-- push_notify(): fire-and-forget call from SQL to the `send-push` edge function via pg_net.
-- Needs internal_secrets rows: cron_collector_key (exists) and functions_base_url
-- (https://<project-ref>.supabase.co/functions/v1 — set per environment; applied on staging + prod 25/26 Sep).
-- slot_watches_check() now sends a push next to the in-app notification.

create or replace function public.push_notify(p_user_id uuid, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  base_url text;
  cron_key text;
  req_id bigint;
begin
  select value into base_url from public.internal_secrets where key = 'functions_base_url';
  select value into cron_key from public.internal_secrets where key = 'cron_collector_key';
  if base_url is null or cron_key is null then
    raise warning 'push_notify: functions_base_url / cron_collector_key missing in internal_secrets — push skipped';
    return null;
  end if;
  select net.http_post(
    url := base_url || '/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', cron_key),
    body := jsonb_build_object('user_id', p_user_id, 'title', p_title, 'body', p_body, 'data', coalesce(p_data, '{}'::jsonb)),
    timeout_milliseconds := 15000
  ) into req_id;
  return req_id;
end;
$$;

revoke all on function public.push_notify(uuid, text, text, jsonb) from public;
grant execute on function public.push_notify(uuid, text, text, jsonb) to service_role;

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
  n_title text;
  n_body text;
  n_link text;
  n_data jsonb;
begin
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

    select e.starts_at into found_at
      from public.external_court_slots e
     where e.club_id = w.club_id
       and e.starts_at between slot_ts - tol and slot_ts + tol
       and e.duration_mins >= w.duration_mins
     order by abs(extract(epoch from (e.starts_at - slot_ts))), e.starts_at
     limit 1;

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
      n_title := 'Court free at ' || club_name;
      n_body := to_char(found_at at time zone club_tz, 'Dy') || ' ' || to_char(found_at at time zone club_tz, 'HH24:MI')
          || ' · ' || case when w.duration_mins >= 60 then (w.duration_mins / 60)::text || 'h' || case when w.duration_mins % 60 > 0 then ' ' || (w.duration_mins % 60)::text else '' end else w.duration_mins::text || ' min' end
          || '. First to book gets it.';
      n_link := '/clubs/' || w.club_id::text;
      n_data := jsonb_build_object('slot_watch_id', w.id, 'club_id', w.club_id, 'starts_at', found_at, 'duration_mins', w.duration_mins);
      insert into public.notifications (user_id, type, title, body, link, data, target_app)
      values (w.user_id::text, 'system', n_title, n_body, n_link, n_data, 'player');
      perform public.push_notify(w.user_id, n_title, n_body, n_data || jsonb_build_object('type', 'slot_free', 'route', n_link, 'link', n_link));
      notified := notified + 1;
    end if;
  end loop;

  return notified;
end;
$$;
