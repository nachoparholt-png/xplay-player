
-- Match format enum
CREATE TYPE public.match_format AS ENUM ('social', 'competitive', 'training', 'americana');

-- Match status enum
CREATE TYPE public.match_status AS ENUM ('open', 'almost_full', 'full', 'cancelled', 'completed');

-- Match visibility enum
CREATE TYPE public.match_visibility AS ENUM ('public', 'private');

-- Player status in match
CREATE TYPE public.match_player_status AS ENUM ('confirmed', 'waitlist', 'cancelled');

-- Matches table
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club TEXT NOT NULL,
  court TEXT,
  match_date DATE NOT NULL,
  match_time TIME NOT NULL,
  format match_format NOT NULL DEFAULT 'social',
  level_min NUMERIC(2,1) NOT NULL DEFAULT 0.5 CHECK (level_min >= 0.5 AND level_min <= 7.0),
  level_max NUMERIC(2,1) NOT NULL DEFAULT 7.0 CHECK (level_max >= 0.5 AND level_max <= 7.0),
  max_players INTEGER NOT NULL DEFAULT 4 CHECK (max_players >= 2 AND max_players <= 16),
  price_per_player NUMERIC(8,2) DEFAULT 0,
  visibility match_visibility NOT NULL DEFAULT 'public',
  notes TEXT,
  status match_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT level_range_valid CHECK (level_min <= level_max)
);

-- Match players (joins + waitlist)
CREATE TABLE public.match_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status match_player_status NOT NULL DEFAULT 'confirmed',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(match_id, user_id)
);

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;

-- Matches policies
CREATE POLICY "Public matches are viewable by everyone"
  ON public.matches FOR SELECT USING (visibility = 'public' OR organizer_id = auth.uid());

CREATE POLICY "Authenticated users can create matches"
  ON public.matches FOR INSERT WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Organizers can update their matches"
  ON public.matches FOR UPDATE USING (auth.uid() = organizer_id);

CREATE POLICY "Organizers can delete their matches"
  ON public.matches FOR DELETE USING (auth.uid() = organizer_id);

-- Match players policies
CREATE POLICY "Match players are viewable by everyone"
  ON public.match_players FOR SELECT USING (true);

CREATE POLICY "Users can join matches"
  ON public.match_players FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own join status"
  ON public.match_players FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can leave matches"
  ON public.match_players FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_matches_date ON public.matches(match_date);
CREATE INDEX idx_matches_status ON public.matches(status);
CREATE INDEX idx_matches_organizer ON public.matches(organizer_id);
CREATE INDEX idx_match_players_match ON public.match_players(match_id);
CREATE INDEX idx_match_players_user ON public.match_players(user_id);

-- Timestamp triggers
CREATE TRIGGER update_matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
