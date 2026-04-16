ALTER TABLE tournament_bet_odds
  DROP CONSTRAINT IF EXISTS tournament_bet_odds_stage_check;

ALTER TABLE tournament_bet_odds
  ADD CONSTRAINT tournament_bet_odds_stage_check
  CHECK (stage IN ('groups', 'quarters', 'semis', 'final', 'win', 'knockouts', 'champion'));