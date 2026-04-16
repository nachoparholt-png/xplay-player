
-- Add onboarding columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recommended_level numeric NULL;

-- Create quiz_responses table
CREATE TABLE public.quiz_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id text NOT NULL,
  selected_answer text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;

-- Users can insert their own quiz responses
CREATE POLICY "Users can insert own quiz responses"
ON public.quiz_responses FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view their own quiz responses
CREATE POLICY "Users can view own quiz responses"
ON public.quiz_responses FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all quiz responses
CREATE POLICY "Admins can view all quiz responses"
ON public.quiz_responses FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
