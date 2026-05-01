-- Add external platform fields to profiles
-- These support the onboarding step where players self-report
-- their level and match history from other platforms.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS external_platform        boolean        DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_platform_level  numeric(3,1)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS external_platform_matches integer        DEFAULT NULL;

-- initial_level_source already exists; extend the comment to document the new value
COMMENT ON COLUMN public.profiles.initial_level_source IS
  'quiz | external_seeded — source used to seed the player''s starting padel_level';

COMMENT ON COLUMN public.profiles.external_platform IS
  'true when the player reported a ranking from another platform during onboarding';

COMMENT ON COLUMN public.profiles.external_platform_level IS
  'Self-reported level on external platform (0–10 scale as entered by player)';

COMMENT ON COLUMN public.profiles.external_platform_matches IS
  'Self-reported number of matches played on the external platform';
