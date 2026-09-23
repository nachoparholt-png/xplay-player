-- 21 Sep 2026: per-club rolling collection so the directory can grow past ~15 clubs
-- without the bulk collectors timing out. Collector edge functions are unchanged:
-- the dispatcher calls their existing per-club mode ({club_id}) for the stalest clubs.
-- PROD ONLY wiring (applied by hand, not part of this file):
--   select cron.alter_job(10, active := false);  -- playtomic-collect-30min  (kept for rollback)
--   select cron.alter_job(11, active := false);  -- padelmates-collect-30min (kept for rollback)
--   select cron.schedule('external-collect-dispatch', '* * * * *',
--     $$select public.dispatch_external_collect('playtomic', 3); select public.dispatch_external_collect('padelmates', 1);$$);
-- NOTE: the function URL below is the PROD project ref; staging runs no collectors.
create table if not exists public.external_collect_state (
  club_id uuid primary key references public.clubs(id) on delete cascade,
  last_requested_at timestamptz,
  last_request_id bigint
);
alter table public.external_collect_state enable row level security;

create or replace function public.dispatch_external_collect(_provider text, _batch int)
returns int
language plpgsql
security definer
set search_path = public, net, pg_temp
as $$
declare r record; n int := 0; k text; fn text;
begin
  if _provider not in ('playtomic','padelmates') then raise exception 'unknown provider %', _provider; end if;
  if coalesce((select value from app_settings where key = 'availability_' || _provider || '_enabled'), 'true') = 'false' then
    return 0;
  end if;
  select value into k from internal_secrets where key = 'cron_collector_key';
  if k is null then raise exception 'cron_collector_key missing'; end if;
  fn := 'https://cdctssarfcipdizvynxi.supabase.co/functions/v1/collect-' || _provider || '-availability';
  for r in
    select c.id
    from clubs c
    left join external_collect_state s on s.club_id = c.id
    where c.external_provider = _provider
      and c.external_tenant_id is not null
      and (s.last_requested_at is null or s.last_requested_at < now() - interval '25 minutes')
    order by s.last_requested_at nulls first, c.id
    limit greatest(1, least(_batch, 10))
  loop
    insert into external_collect_state (club_id, last_requested_at, last_request_id)
    values (
      r.id, now(),
      net.http_post(
        url := fn,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', k),
        body := jsonb_build_object('mode', 'collect', 'days', 7, 'club_id', r.id),
        timeout_milliseconds := 120000
      )
    )
    on conflict (club_id) do update
      set last_requested_at = excluded.last_requested_at, last_request_id = excluded.last_request_id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.dispatch_external_collect(text, int) from public, anon, authenticated;
