
CREATE TABLE IF NOT EXISTS public.court_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    court_slot_id uuid NOT NULL REFERENCES public.court_slots(id),
    user_id uuid NOT NULL,
    club_id uuid NOT NULL REFERENCES public.clubs(id),
    amount_paid_cents integer NOT NULL DEFAULT 0,
    discount_pct numeric NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'confirmed',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.court_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own bookings"
ON public.court_bookings FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role can insert bookings"
ON public.court_bookings FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all bookings"
ON public.court_bookings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
