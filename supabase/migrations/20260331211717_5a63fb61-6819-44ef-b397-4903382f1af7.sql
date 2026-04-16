
-- 1. Add nickname, slot_duration_minutes, default_price_cents to courts
ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS slot_duration_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS default_price_cents integer NOT NULL DEFAULT 0;

-- 2. Club operating hours table
CREATE TABLE public.club_operating_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  open_time text NOT NULL DEFAULT '07:00',
  close_time text NOT NULL DEFAULT '23:00',
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.club_operating_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read hours" ON public.club_operating_hours FOR SELECT USING (true);
CREATE POLICY "Club admins can manage hours" ON public.club_operating_hours FOR ALL TO authenticated
  USING (is_club_admin(auth.uid(), club_id))
  WITH CHECK (is_club_admin(auth.uid(), club_id));

-- 3. Court pricing windows table
CREATE TABLE public.court_pricing_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  days_of_week integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  price_cents integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT 'amber',
  priority integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.court_pricing_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read windows" ON public.court_pricing_windows FOR SELECT USING (true);
CREATE POLICY "Club admins can manage windows" ON public.court_pricing_windows FOR ALL TO authenticated
  USING (is_club_admin(auth.uid(), club_id))
  WITH CHECK (is_club_admin(auth.uid(), club_id));

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_operating_hours, public.court_pricing_windows;
