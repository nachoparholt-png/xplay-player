
-- Feature 2: Admin visibility
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS admin_is_playing boolean NOT NULL DEFAULT true;
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player';

-- Feature 3: Named courts
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS court_labels jsonb;
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS court_label text;
