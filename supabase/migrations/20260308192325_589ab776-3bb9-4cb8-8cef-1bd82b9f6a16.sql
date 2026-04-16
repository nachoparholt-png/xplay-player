
-- Fix the overly permissive INSERT policy on rating_history
-- Only the service role (edge functions) should insert, not anon users
DROP POLICY "Service can insert rating history" ON public.rating_history;

-- Edge functions use service_role key which bypasses RLS, so no INSERT policy needed for regular users
