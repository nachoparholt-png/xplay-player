
CREATE TABLE public.membership_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  billing_period text NOT NULL DEFAULT 'monthly',
  court_discount numeric NOT NULL DEFAULT 0,
  coaching_discount numeric NOT NULL DEFAULT 0,
  advance_booking_days integer NOT NULL DEFAULT 3,
  benefits jsonb DEFAULT '[]'::jsonb,
  max_members integer DEFAULT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  stripe_price_id text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;

-- Anyone can read active tiers
CREATE POLICY "Anyone can read active tiers"
  ON public.membership_tiers FOR SELECT
  USING (active = true OR has_role(auth.uid(), 'admin'::app_role));

-- Club admins can manage tiers
CREATE POLICY "Club admins can manage tiers"
  ON public.membership_tiers FOR ALL
  TO authenticated
  USING (is_club_admin(auth.uid(), club_id))
  WITH CHECK (is_club_admin(auth.uid(), club_id));

-- Platform admins can manage all tiers
CREATE POLICY "Admins can manage all tiers"
  ON public.membership_tiers FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add FK from club_memberships.tier_id to membership_tiers
ALTER TABLE public.club_memberships
  ADD CONSTRAINT club_memberships_tier_id_fkey
  FOREIGN KEY (tier_id) REFERENCES public.membership_tiers(id) ON DELETE SET NULL;
