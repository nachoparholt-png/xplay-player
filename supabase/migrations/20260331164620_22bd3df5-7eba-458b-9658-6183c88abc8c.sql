CREATE POLICY "Anyone authenticated can read court slots"
ON public.court_slots
FOR SELECT
TO authenticated
USING (true);