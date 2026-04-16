ALTER TABLE tournament_bet_odds
  ADD COLUMN IF NOT EXISTS raw_true_probability float,
  ADD COLUMN IF NOT EXISTS reliability_factor float DEFAULT 1.0;