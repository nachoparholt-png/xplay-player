ALTER TABLE public.tournament_players 
  ADD COLUMN IF NOT EXISTS partner_user_id UUID,
  ADD COLUMN IF NOT EXISTS partner_status TEXT NOT NULL DEFAULT 'solo',
  ADD COLUMN IF NOT EXISTS slot_index INTEGER;