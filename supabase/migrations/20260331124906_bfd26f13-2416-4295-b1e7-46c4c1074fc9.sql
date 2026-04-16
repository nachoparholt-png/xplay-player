
-- Fix: only add coaching_enrollments to realtime (court_slots already there)
ALTER PUBLICATION supabase_realtime ADD TABLE public.coaching_enrollments;
