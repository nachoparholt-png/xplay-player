
-- Tournament phases (blocks on the canvas)
CREATE TABLE public.tournament_phases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  phase_type TEXT NOT NULL DEFAULT 'round_robin',
  label TEXT NOT NULL DEFAULT 'Phase',
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Progression rules (arrows connecting blocks)
CREATE TABLE public.tournament_progression_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  from_phase_id UUID NOT NULL REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
  to_phase_id UUID NOT NULL REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
  from_rank TEXT NOT NULL DEFAULT '1st',
  to_slot TEXT NOT NULL DEFAULT 'IN',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add phase_id to tournament_matches
ALTER TABLE public.tournament_matches ADD COLUMN phase_id UUID REFERENCES public.tournament_phases(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.tournament_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_progression_rules ENABLE ROW LEVEL SECURITY;

-- RLS: anyone authenticated can read phases/rules
CREATE POLICY "Anyone can read tournament phases"
  ON public.tournament_phases FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Tournament creator can manage phases"
  ON public.tournament_phases FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid()));

CREATE POLICY "Anyone can read progression rules"
  ON public.tournament_progression_rules FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Tournament creator can manage progression rules"
  ON public.tournament_progression_rules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid()));
