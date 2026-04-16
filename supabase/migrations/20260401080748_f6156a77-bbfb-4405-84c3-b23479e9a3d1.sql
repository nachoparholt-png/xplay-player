
CREATE UNIQUE INDEX IF NOT EXISTS uq_court_slots_court_starts ON public.court_slots (court_id, starts_at);
