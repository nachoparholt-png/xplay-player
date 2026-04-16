
-- Create enum for stake status
CREATE TYPE public.stake_status AS ENUM ('active', 'won', 'lost', 'settled');

-- Create match_stakes table
CREATE TABLE public.match_stakes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team TEXT NOT NULL CHECK (team IN ('A', 'B')),
  points_staked INTEGER NOT NULL CHECK (points_staked > 0),
  payout_multiplier NUMERIC(5,2) NOT NULL,
  potential_winnings INTEGER NOT NULL,
  status stake_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  settled_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.match_stakes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own stakes" ON public.match_stakes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view stakes on matches they participate in" ON public.match_stakes
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own stakes" ON public.match_stakes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stakes" ON public.match_stakes
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow match status updates by any authenticated user (for settlement)
CREATE POLICY "Authenticated users can update match status" ON public.matches
  FOR UPDATE USING (auth.uid() IS NOT NULL);
