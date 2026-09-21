-- Two-tier Clubs area (21 Sep 2026)
-- Applied to staging (cqeejkvwqrytaxzfkswu) on 21 Sep 2026. Apply to prod when promoting develop → main.

-- 1) "Claim this club" leads from the other-club page
create table if not exists public.club_claim_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  role_at_club text check (role_at_club is null or char_length(role_at_club) <= 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) <= 40),
  status text not null default 'new' check (status in ('new','contacted','won','lost')),
  created_at timestamptz not null default now()
);
create index if not exists idx_club_claim_requests_club on public.club_claim_requests (club_id, created_at desc);

alter table public.club_claim_requests enable row level security;

create policy "claim_insert_own" on public.club_claim_requests
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "claim_select_own_or_admin" on public.club_claim_requests
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "claim_update_admin" on public.club_claim_requests
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

revoke all on public.club_claim_requests from anon;

-- 2) Next available external slot per club, for the Clubs list rows
create or replace function public.clubs_next_external_slot()
returns table (club_id uuid, provider text, starts_at timestamptz, price_cents integer, currency text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (s.club_id) s.club_id, s.provider, s.starts_at, s.price_cents::integer, s.currency
  from public.external_court_slots s
  where s.starts_at > now()
  order by s.club_id, s.starts_at, s.price_cents nulls last
$$;

revoke all on function public.clubs_next_external_slot() from public, anon;
grant execute on function public.clubs_next_external_slot() to authenticated;
