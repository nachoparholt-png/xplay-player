
ALTER TABLE public.coaching_enrollments
  ADD COLUMN IF NOT EXISTS amount_paid_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_pct numeric NOT NULL DEFAULT 0;

ALTER TABLE public.club_memberships
  ADD COLUMN IF NOT EXISTS tier_id uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT true;
