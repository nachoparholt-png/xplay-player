-- XPLAY Store without Shopify (21 Sep 2026)
-- Catalogue, stock per size, orders, UK delivery fee via Stripe, free delivery cap for XPLAY Pro,
-- pickup designed in but off. Spec: project doc "XPLAY_Store_Native_Stripe_Spec".

-- ───────────────────────── 1. Catalogue ─────────────────────────
alter table public.products
  add column if not exists delivery_size text not null default 'small';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_delivery_size_check') then
    alter table public.products add constraint products_delivery_size_check check (delivery_size in ('small','large'));
  end if;
end $$;

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null default 'One size',
  sku text,
  stock integer not null default 0 check (stock >= 0),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, label)
);
create index if not exists product_variants_product_idx on public.product_variants(product_id);

insert into public.product_variants (product_id, label, stock)
select p.id, 'One size', greatest(p.stock, 0)
from public.products p
where not exists (select 1 from public.product_variants v where v.product_id = p.id);

-- ───────────────────────── 2. Pickup locations (off at launch) ─────────────────────────
create table if not exists public.pickup_locations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete set null,
  name text not null,
  address_line1 text,
  city text,
  postcode text,
  instructions text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

-- ───────────────────────── 3. Saved address (own row only; NOT on profiles) ─────────────────────────
create table if not exists public.user_addresses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  line1 text not null,
  line2 text,
  city text not null,
  postcode text not null,
  country text not null default 'GB' check (country = 'GB'),
  phone text,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── 4. Orders ─────────────────────────
create sequence if not exists public.redemption_order_number_seq start 1001;

alter table public.redemption_orders
  add column if not exists order_number bigint not null default nextval('public.redemption_order_number_seq'),
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_label text,
  add column if not exists fulfilment_method text not null default 'delivery',
  add column if not exists pickup_location_id uuid references public.pickup_locations(id) on delete set null,
  add column if not exists pickup_code text,
  add column if not exists pickup_expires_at timestamptz,
  add column if not exists points_to_use integer not null default 0,
  add column if not exists item_cash_pence integer not null default 0,
  add column if not exists delivery_fee_pence integer not null default 0,
  add column if not exists delivery_free_reason text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_refund_id text,
  add column if not exists reserved_until timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists packed_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists tracking_number text,
  add column if not exists tracking_carrier text,
  add column if not exists refunded_points integer not null default 0,
  add column if not exists stock_returned boolean not null default false;

alter sequence public.redemption_order_number_seq owned by public.redemption_orders.order_number;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'redemption_orders_status_check') then
    alter table public.redemption_orders add constraint redemption_orders_status_check
      check (status in ('pending','awaiting_payment','paid','packed','shipped','delivered','fulfilled','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'redemption_orders_fulfilment_check') then
    alter table public.redemption_orders add constraint redemption_orders_fulfilment_check
      check (fulfilment_method in ('delivery','pickup'));
  end if;
end $$;

create unique index if not exists redemption_orders_order_number_key on public.redemption_orders(order_number);
create unique index if not exists redemption_orders_checkout_session_key
  on public.redemption_orders(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create index if not exists redemption_orders_status_idx on public.redemption_orders(status, created_at desc);
create index if not exists redemption_orders_hold_idx on public.redemption_orders(reserved_until) where status = 'awaiting_payment';

-- ───────────────────────── 5. Settings ─────────────────────────
insert into public.app_settings (key, value, description) values
  ('store_delivery_fee_small_pence', '395', 'Store: UK delivery fee for a small parcel, in pence'),
  ('store_delivery_fee_large_pence', '595', 'Store: UK delivery fee for a large parcel, in pence'),
  ('store_free_delivery_per_month', '1', 'Store: free deliveries per calendar month for XPLAY Pro members'),
  ('store_pickup_enabled', 'false', 'Store: offer pickup at active pickup locations')
on conflict (key) do nothing;

create or replace function public.store_setting_int(_key text, _default integer)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select nullif(trim(value), '')::integer from app_settings where key = _key), _default);
$$;

-- UK mainland + NI postcodes only. Channel Islands (JE, GY) and Isle of Man (IM) are outside UK VAT.
create or replace function public.store_valid_uk_postcode(_postcode text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(
    upper(regexp_replace(coalesce(_postcode, ''), '\s', '', 'g')) ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$'
    and upper(regexp_replace(coalesce(_postcode, ''), '\s', '', 'g')) !~ '^(JE|GY|IM)[0-9]',
    false);
$$;

-- ───────────────────────── 6. Order functions (server only) ─────────────────────────
create or replace function public.store_release_order(_order_id uuid, _reason text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare _o redemption_orders%rowtype;
begin
  select * into _o from redemption_orders where id = _order_id for update;
  if not found or _o.status <> 'awaiting_payment' then return false; end if;
  if _o.variant_id is not null then
    update product_variants set stock = stock + 1, updated_at = now() where id = _o.variant_id;
  end if;
  update redemption_orders
     set status = 'cancelled', cancelled_at = now(), cancel_reason = _reason,
         reserved_until = null, stock_returned = true, updated_at = now()
   where id = _order_id;
  return true;
end $$;

create or replace function public.store_release_expired_holds()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare _id uuid; _n integer := 0;
begin
  for _id in
    select id from redemption_orders
     where status = 'awaiting_payment' and reserved_until is not null and reserved_until < now()
     for update skip locked
  loop
    if store_release_order(_id, 'hold_expired') then _n := _n + 1; end if;
  end loop;
  return _n;
end $$;

create or replace function public.store_create_order(
  _user_id uuid,
  _variant_id uuid,
  _points_to_use integer,
  _address jsonb,
  _fulfilment text default 'delivery',
  _pickup_location_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _v product_variants%rowtype;
  _p products%rowtype;
  _profile profiles%rowtype;
  _price integer; _pts integer; _item_cash integer; _fee integer; _total integer;
  _free_reason text; _is_pro boolean; _cap integer; _used integer;
  _name text; _line1 text; _line2 text; _city text; _postcode text; _phone text;
  _month_start timestamptz;
  _order redemption_orders%rowtype;
  _new_balance integer;
  _old uuid;
begin
  perform store_release_expired_holds();

  if coalesce(_fulfilment, 'delivery') <> 'delivery' then
    raise exception 'Pickup is not available yet';
  end if;

  -- a player who starts again gives up any unfinished checkout
  for _old in select id from redemption_orders
               where user_id = _user_id::text and status = 'awaiting_payment' for update
  loop perform store_release_order(_old, 'user_restarted'); end loop;

  select * into _v from product_variants where id = _variant_id for update;
  if not found or not _v.active then raise exception 'This size is not available'; end if;
  select * into _p from products where id = _v.product_id;
  if not found or not _p.active then raise exception 'Product not found'; end if;
  if _v.stock <= 0 then raise exception 'Out of stock'; end if;

  _name := trim(coalesce(_address->>'name', _address->>'full_name', ''));
  _line1 := trim(coalesce(_address->>'line1', _address->>'address1', ''));
  _line2 := nullif(trim(coalesce(_address->>'line2', _address->>'address2', '')), '');
  _city := trim(coalesce(_address->>'city', ''));
  _postcode := upper(trim(coalesce(_address->>'postcode', _address->>'zip', '')));
  _phone := nullif(trim(coalesce(_address->>'phone', '')), '');
  if length(_name) < 2 or length(_line1) < 4 or length(_city) < 2 then
    raise exception 'Please enter your name and full delivery address';
  end if;
  if not store_valid_uk_postcode(_postcode) then
    raise exception 'We only deliver within the UK for now. Please enter a valid UK postcode';
  end if;

  select * into _profile from profiles where user_id = _user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  _price := ceil(_p.point_price)::integer;
  if _price <= 0 then raise exception 'This product is not available for redemption'; end if;
  _pts := greatest(0, least(coalesce(_points_to_use, _price), _price, _profile.padel_park_points));
  _item_cash := _price - _pts;                       -- 100 XPLAY Points = £1 → 1 point = 1p

  _fee := case when _p.delivery_size = 'large'
               then store_setting_int('store_delivery_fee_large_pence', 595)
               else store_setting_int('store_delivery_fee_small_pence', 395) end;
  _fee := greatest(_fee, 0);

  _is_pro := exists (
    select 1 from xplay_pro_subscriptions s
     where s.user_id = _user_id and s.status in ('active','trialing')
       and (s.current_period_end is null or s.current_period_end > now()));
  if _is_pro and _fee > 0 then
    _cap := store_setting_int('store_free_delivery_per_month', 1);
    _month_start := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
    select count(*) into _used from redemption_orders
     where user_id = _user_id::text and delivery_free_reason = 'pro'
       and status <> 'cancelled' and created_at >= _month_start;
    if _used < _cap then _fee := 0; _free_reason := 'pro'; end if;
  end if;

  _total := _item_cash + _fee;
  if _total > 0 and _total < 30 then
    raise exception 'Card payments start at £0.30. Use all your points, or fewer points';
  end if;

  update product_variants set stock = stock - 1, updated_at = now() where id = _v.id;

  insert into redemption_orders (
    user_id, product_id, variant_id, variant_label, fulfilment_method,
    points_used, points_to_use, item_cash_pence, delivery_fee_pence, delivery_free_reason,
    cash_paid_cents, status, reserved_until, paid_at, shipping_address)
  values (
    _user_id::text, _p.id, _v.id, _v.label, 'delivery',
    case when _total = 0 then _pts else 0 end, _pts, _item_cash, _fee, _free_reason,
    0, case when _total = 0 then 'paid' else 'awaiting_payment' end,
    case when _total = 0 then null else now() + interval '35 minutes' end,
    case when _total = 0 then now() else null end,
    jsonb_build_object('name', _name, 'line1', _line1, 'line2', _line2, 'city', _city,
                       'postcode', _postcode, 'country', 'GB', 'phone', _phone))
  returning * into _order;

  if _total = 0 and _pts > 0 then
    _new_balance := _profile.padel_park_points - _pts;
    update profiles set padel_park_points = _new_balance,
                        lifetime_spent = coalesce(lifetime_spent, 0) + _pts
     where user_id = _user_id;
    insert into points_transactions (user_id, amount, balance_before, balance_after, transaction_type, reason)
    values (_user_id::text, -_pts, _profile.padel_park_points, _new_balance, 'spend',
            'Redeemed: ' || _p.title || ' (order #' || _order.order_number || ')');
  end if;

  insert into user_addresses (user_id, full_name, line1, line2, city, postcode, phone, updated_at)
  values (_user_id, _name, _line1, _line2, _city, _postcode, _phone, now())
  on conflict (user_id) do update set full_name = excluded.full_name, line1 = excluded.line1,
    line2 = excluded.line2, city = excluded.city, postcode = excluded.postcode,
    phone = excluded.phone, updated_at = now();

  if _total = 0 then
    insert into notifications (user_id, type, title, body, link)
    values (_user_id::text, 'store_order', 'Order confirmed',
            _p.title || ' is on its way to being packed. Order #' || _order.order_number, '/orders');
  end if;

  return jsonb_build_object(
    'order_id', _order.id, 'order_number', _order.order_number, 'status', _order.status,
    'needs_payment', _total > 0, 'points_to_use', _pts, 'item_cash_pence', _item_cash,
    'delivery_fee_pence', _fee, 'free_delivery', _free_reason is not null,
    'total_cash_pence', _total, 'product_title', _p.title, 'variant_label', _v.label,
    'image_url', _p.image_url);
end $$;

create or replace function public.store_confirm_order(_order_id uuid, _session_id text, _payment_intent text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _o redemption_orders%rowtype;
  _profile profiles%rowtype;
  _title text; _new_balance integer; _retaken boolean := false;
begin
  select * into _o from redemption_orders where id = _order_id for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if _o.status in ('paid','packed','shipped','delivered') then
    return jsonb_build_object('result', 'already', 'order_id', _o.id);
  end if;

  if _o.status = 'cancelled' then
    -- money arrived after the hold was released: take the item back if it is still there
    if coalesce(_o.cancel_reason, '') not in ('hold_expired','user_cancelled','user_restarted') then
      return jsonb_build_object('result', 'cancelled', 'refund', true);
    end if;
    update product_variants set stock = stock - 1, updated_at = now()
     where id = _o.variant_id and stock > 0;
    if not found then
      update redemption_orders set cancel_reason = 'paid_after_hold_out_of_stock',
             stripe_checkout_session_id = coalesce(stripe_checkout_session_id, _session_id),
             stripe_payment_intent_id = _payment_intent, updated_at = now() where id = _o.id;
      return jsonb_build_object('result', 'out_of_stock', 'refund', true);
    end if;
    _retaken := true;
  elsif _o.status <> 'awaiting_payment' then
    return jsonb_build_object('result', 'cancelled', 'refund', true);
  end if;

  select * into _profile from profiles where user_id = _o.user_id::uuid for update;
  if not found or _profile.padel_park_points < _o.points_to_use then
    update product_variants set stock = stock + 1, updated_at = now() where id = _o.variant_id;
    update redemption_orders set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'insufficient_points', reserved_until = null, stock_returned = true,
           stripe_checkout_session_id = coalesce(stripe_checkout_session_id, _session_id),
           stripe_payment_intent_id = _payment_intent, updated_at = now()
     where id = _o.id;
    return jsonb_build_object('result', 'insufficient_points', 'refund', true);
  end if;

  select title into _title from products where id = _o.product_id;

  if _o.points_to_use > 0 then
    _new_balance := _profile.padel_park_points - _o.points_to_use;
    update profiles set padel_park_points = _new_balance,
                        lifetime_spent = coalesce(lifetime_spent, 0) + _o.points_to_use
     where user_id = _o.user_id::uuid;
    insert into points_transactions (user_id, amount, balance_before, balance_after, transaction_type, reason)
    values (_o.user_id, -_o.points_to_use, _profile.padel_park_points, _new_balance, 'spend',
            'Redeemed: ' || coalesce(_title, 'Product') || ' (order #' || _o.order_number || ')');
  end if;

  update redemption_orders
     set status = 'paid', paid_at = now(), points_used = _o.points_to_use,
         cash_paid_cents = _o.item_cash_pence + _o.delivery_fee_pence,
         stripe_checkout_session_id = coalesce(stripe_checkout_session_id, _session_id),
         stripe_payment_intent_id = _payment_intent,
         reserved_until = null, cancelled_at = null, cancel_reason = null,
         stock_returned = false, updated_at = now()
   where id = _o.id;

  insert into notifications (user_id, type, title, body, link)
  values (_o.user_id, 'store_order', 'Order confirmed',
          coalesce(_title, 'Your item') || ' is on its way to being packed. Order #' || _o.order_number, '/orders');

  return jsonb_build_object('result', 'confirmed', 'order_id', _o.id, 'retaken', _retaken);
end $$;

create or replace function public.store_admin_refund_order(_order_id uuid, _restock boolean, _admin_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _o redemption_orders%rowtype;
  _profile profiles%rowtype;
  _new_balance integer;
begin
  if not has_role(_admin_id, 'admin') then raise exception 'Admins only'; end if;
  select * into _o from redemption_orders where id = _order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if _o.status not in ('paid','packed','shipped','delivered') then
    raise exception 'Only paid orders can be refunded';
  end if;

  if _o.points_used > 0 then
    select * into _profile from profiles where user_id = _o.user_id::uuid for update;
    if found then
      _new_balance := _profile.padel_park_points + _o.points_used::integer;
      update profiles set padel_park_points = _new_balance,
                          lifetime_spent = greatest(coalesce(lifetime_spent, 0) - _o.points_used::integer, 0)
       where user_id = _o.user_id::uuid;
      insert into points_transactions (user_id, amount, balance_before, balance_after, transaction_type, admin_user_id, reason)
      values (_o.user_id, _o.points_used, _profile.padel_park_points, _new_balance, 'admin_credit', _admin_id::text,
              'Refund: order #' || _o.order_number);
    end if;
  end if;

  if _restock and _o.variant_id is not null then
    update product_variants set stock = stock + 1, updated_at = now() where id = _o.variant_id;
  end if;

  update redemption_orders
     set status = 'cancelled', cancelled_at = now(), cancel_reason = 'admin_refund',
         refunded_points = _o.points_used::integer, stock_returned = coalesce(_restock, false), updated_at = now()
   where id = _o.id;

  insert into notifications (user_id, type, title, body, link)
  values (_o.user_id, 'store_order', 'Order cancelled and refunded',
          'Order #' || _o.order_number || ' was cancelled. Your points are back in your balance'
          || case when _o.cash_paid_cents > 0 then ' and your card payment is being refunded.' else '.' end,
          '/orders');

  return jsonb_build_object('payment_intent', _o.stripe_payment_intent_id,
                            'cash_paid_cents', _o.cash_paid_cents, 'order_number', _o.order_number);
end $$;

-- Admin panel: move an order forward. Callable by signed-in users, admin checked inside.
create or replace function public.store_admin_set_status(
  _order_id uuid, _status text, _tracking_number text default null, _tracking_carrier text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare _o redemption_orders%rowtype; _title text;
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'Admins only'; end if;
  select * into _o from redemption_orders where id = _order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if _status = 'packed' and _o.status = 'paid' then
    update redemption_orders set status = 'packed', packed_at = now(), updated_at = now() where id = _o.id;
  elsif _status = 'shipped' and _o.status in ('paid','packed','shipped') then
    update redemption_orders
       set status = 'shipped', shipped_at = coalesce(shipped_at, now()),
           packed_at = coalesce(packed_at, now()),
           tracking_number = nullif(trim(coalesce(_tracking_number, '')), ''),
           tracking_carrier = nullif(trim(coalesce(_tracking_carrier, '')), ''),
           updated_at = now()
     where id = _o.id;
    if _o.status <> 'shipped' then
      select title into _title from products where id = _o.product_id;
      insert into notifications (user_id, type, title, body, link)
      values (_o.user_id, 'store_order', 'Your order is on its way',
              coalesce(_title, 'Your item') || ' has been sent'
              || case when nullif(trim(coalesce(_tracking_number, '')), '') is not null
                      then '. Tracking: ' || trim(_tracking_number) else '.' end,
              '/orders');
    end if;
  elsif _status = 'delivered' and _o.status = 'shipped' then
    update redemption_orders set status = 'delivered', delivered_at = now(), updated_at = now() where id = _o.id;
  else
    raise exception 'Cannot move an order from % to %', _o.status, _status;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.store_setting_int(text, integer) from public, anon, authenticated;
revoke all on function public.store_release_order(uuid, text) from public, anon, authenticated;
revoke all on function public.store_release_expired_holds() from public, anon, authenticated;
revoke all on function public.store_create_order(uuid, uuid, integer, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.store_confirm_order(uuid, text, text) from public, anon, authenticated;
revoke all on function public.store_admin_refund_order(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.store_admin_set_status(uuid, text, text, text) from public, anon;
grant execute on function public.store_setting_int(text, integer) to service_role;
grant execute on function public.store_release_order(uuid, text) to service_role;
grant execute on function public.store_release_expired_holds() to service_role;
grant execute on function public.store_create_order(uuid, uuid, integer, jsonb, text, uuid) to service_role;
grant execute on function public.store_confirm_order(uuid, text, text) to service_role;
grant execute on function public.store_admin_refund_order(uuid, boolean, uuid) to service_role;
grant execute on function public.store_admin_set_status(uuid, text, text, text) to authenticated, service_role;

-- ───────────────────────── 7. Row level security ─────────────────────────
alter table public.product_variants enable row level security;
alter table public.pickup_locations enable row level security;
alter table public.user_addresses enable row level security;

drop policy if exists product_variants_select on public.product_variants;
create policy product_variants_select on public.product_variants for select using (true);
drop policy if exists product_variants_admin_write on public.product_variants;
create policy product_variants_admin_write on public.product_variants for all to authenticated
  using (has_role(auth.uid(), 'admin')) with check (has_role(auth.uid(), 'admin'));

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all to authenticated
  using (has_role(auth.uid(), 'admin')) with check (has_role(auth.uid(), 'admin'));

drop policy if exists pickup_locations_select on public.pickup_locations;
create policy pickup_locations_select on public.pickup_locations for select to authenticated
  using (active or has_role(auth.uid(), 'admin'));
drop policy if exists pickup_locations_admin_write on public.pickup_locations;
create policy pickup_locations_admin_write on public.pickup_locations for all to authenticated
  using (has_role(auth.uid(), 'admin')) with check (has_role(auth.uid(), 'admin'));

drop policy if exists user_addresses_own on public.user_addresses;
create policy user_addresses_own on public.user_addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- orders are written by server functions only
drop policy if exists redemption_orders_insert on public.redemption_orders;
drop policy if exists redemption_orders_admin_select on public.redemption_orders;
create policy redemption_orders_admin_select on public.redemption_orders for select to authenticated
  using (has_role(auth.uid(), 'admin'));

drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings for all to authenticated
  using (has_role(auth.uid(), 'admin')) with check (has_role(auth.uid(), 'admin'));

grant select on public.product_variants to anon, authenticated;
grant insert, update, delete on public.product_variants to authenticated;
grant select, insert, update, delete on public.pickup_locations to authenticated;
grant select, insert, update, delete on public.user_addresses to authenticated;
grant all on public.product_variants, public.pickup_locations, public.user_addresses to service_role;

-- ───────────────────────── 8. Product images ─────────────────────────
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists product_images_admin_insert on storage.objects;
create policy product_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

-- ───────────────────────── 9. Release unpaid holds every 10 minutes ─────────────────────────
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('store-release-expired-holds', '*/10 * * * *',
                          'select public.store_release_expired_holds()');
  end if;
end $$;
