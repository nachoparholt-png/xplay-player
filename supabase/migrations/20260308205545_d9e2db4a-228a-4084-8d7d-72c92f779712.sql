
DROP POLICY IF EXISTS "Anyone can read active clubs" ON public.clubs;

CREATE POLICY "Anyone can read active clubs"
ON public.clubs
FOR SELECT
USING ((club_status = 'active'::club_status) OR has_role(auth.uid(), 'admin'::app_role));
