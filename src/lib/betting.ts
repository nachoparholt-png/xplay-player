import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────

export interface TierConfig {
  label: string;
  minProb: number;
  maxProb: number;
  k: number;
  maxMult: number;
}

export interface OddsResult {
  tierLabel: string;
  kFactor: number;
  houseProbability: number;
  oddsMultiplier: number;
  isCapped: boolean;
  isOffered: boolean;
}

export interface MatchOddsResult {
  teamATrueProb: number;
  teamBTrueProb: number;
  teamA: OddsResult;
  teamB: OddsResult;
}

export interface TeamPlayer {
  display_name: string | null;
  padel_level: number | null;
  avatar_initial: string;
  reliability_score?: number;
}

export interface BetConfig {
  enabled: boolean;
  house_reserve_pts: number;
  min_stake: number;
  max_stake: number;
  max_payout_pts: number;
  risk_threshold: number;
  close_threshold: number;
  tier_config: TierConfig[];
  high_pot_boost_pts: number;
  high_pot_max_per_match: number;
  max_exposure_pct: number;
}

// ─── Match Tier Configuration (T1–T6) ───────────────────────

export const DEFAULT_MATCH_TIER_CONFIG: TierConfig[] = [
  { label: "T1", minProb: 0.70, maxProb: 1.00, k: 1.10, maxMult: 1.80 },
  { label: "T2", minProb: 0.55, maxProb: 0.70, k: 1.18, maxMult: 2.50 },
  { label: "T3", minProb: 0.40, maxProb: 0.55, k: 1.25, maxMult: 4.00 },
  { label: "T4", minProb: 0.25, maxProb: 0.40, k: 1.35, maxMult: 6.00 },
  { label: "T5", minProb: 0.12, maxProb: 0.25, k: 1.50, maxMult: 10.00 },
  { label: "T6", minProb: 0.00, maxProb: 0.12, k: 1.70, maxMult: 15.00 },
];

// ─── Tournament Tier Configuration (wider spreads for multi-stage) ──

export const DEFAULT_TOURNAMENT_TIER_CONFIG: TierConfig[] = [
  { label: "T1", minProb: 0.65, maxProb: 1.00, k: 1.08, maxMult: 1.60 },
  { label: "T2", minProb: 0.50, maxProb: 0.65, k: 1.15, maxMult: 2.20 },
  { label: "T3", minProb: 0.35, maxProb: 0.50, k: 1.22, maxMult: 3.50 },
  { label: "T4", minProb: 0.20, maxProb: 0.35, k: 1.30, maxMult: 5.50 },
  { label: "T5", minProb: 0.08, maxProb: 0.20, k: 1.45, maxMult: 9.00 },
  { label: "T6", minProb: 0.00, maxProb: 0.08, k: 1.65, maxMult: 14.00 },
];

// Backward-compatible alias
export const DEFAULT_TIER_CONFIG = DEFAULT_MATCH_TIER_CONFIG;

// ─── Reliability Helpers ─────────────────────────────────────

export function getReliabilityFactor(reliabilityScore: number): number {
  if (reliabilityScore < 30) return 0.33;
  if (reliabilityScore < 60) return 0.67;
  return 1.00;
}

export function getTeamReliabilityFactor(players: TeamPlayer[]): number {
  if (players.length === 0) return 1.00;
  const factors = players.map((p) => getReliabilityFactor(p.reliability_score ?? 100));
  return Math.min(...factors);
}

export function applyReliabilityToProb(rawProb: number, factor: number): number {
  return rawProb * factor + 0.5 * (1 - factor);
}

// ─── ELO Win Probability ─────────────────────────────────────

export function eloWinProb(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

// ─── Tier Lookup ─────────────────────────────────────────────

export function getTier(trueProb: number, tiers: TierConfig[]): TierConfig {
  // Sort descending by minProb to find first matching range
  const sorted = [...tiers].sort((a, b) => b.minProb - a.minProb);
  return sorted.find((t) => trueProb >= t.minProb) ?? sorted[sorted.length - 1];
}

// ─── Compute Odds for One Side ───────────────────────────────

export function computeOdds(trueProb: number, tiers: TierConfig[]): OddsResult {
  const tier = getTier(trueProb, tiers);
  const houseProb = trueProb * tier.k;

  // Not offered when house probability is too high (near certainty)
  if (houseProb >= 0.98) {
    return {
      tierLabel: tier.label,
      kFactor: tier.k,
      houseProbability: houseProb,
      oddsMultiplier: 0,
      isCapped: false,
      isOffered: false,
    };
  }

  const clampedHouseProb = Math.min(houseProb, 0.98);
  const naturalMult = 1 / clampedHouseProb;
  const multiplier = Math.min(naturalMult, tier.maxMult);
  const isCapped = naturalMult > tier.maxMult;

  return {
    tierLabel: tier.label,
    kFactor: tier.k,
    houseProbability: clampedHouseProb,
    oddsMultiplier: parseFloat(multiplier.toFixed(2)),
    isCapped,
    isOffered: true,
  };
}

// ─── Full Match Odds (ELO-based) ─────────────────────────────

export function computeMatchOdds(
  eloA: number,
  eloB: number,
  tiers: TierConfig[] = DEFAULT_TIER_CONFIG
): MatchOddsResult {
  const teamATrueProb = eloWinProb(eloA, eloB);
  const teamBTrueProb = 1 - teamATrueProb;

  return {
    teamATrueProb: parseFloat(teamATrueProb.toFixed(4)),
    teamBTrueProb: parseFloat(teamBTrueProb.toFixed(4)),
    teamA: computeOdds(teamATrueProb, tiers),
    teamB: computeOdds(teamBTrueProb, tiers),
  };
}

// ─── Level → ELO Conversion ─────────────────────────────────
// Maps padel level (1.0–7.0) to an ELO-like rating for odds computation

export function levelToElo(level: number): number {
  // Linear mapping: level 1.0 → 800, level 7.0 → 2000
  return 800 + ((level - 1.0) / 6.0) * 1200;
}

// ─── Team Strength (backward-compatible) ─────────────────────

export const calculateTeamStrength = (players: TeamPlayer[]): number => {
  const levels = players
    .map((p) => p.padel_level)
    .filter((level): level is number => level != null);
  if (levels.length === 0) return 0;
  return levels.reduce((sum, level) => sum + level, 0) / levels.length;
};

export const calculateTeamDifference = (teamAStrength: number, teamBStrength: number): number => {
  return Math.abs(teamAStrength - teamBStrength);
};

// ─── Calculate Complete Betting Odds (ELO-based) ─────────────

export const calculateBettingOdds = async (
  teamAPlayers: TeamPlayer[],
  teamBPlayers: TeamPlayer[]
) => {
  const teamAStrength = calculateTeamStrength(teamAPlayers);
  const teamBStrength = calculateTeamStrength(teamBPlayers);
  const teamDifference = calculateTeamDifference(teamAStrength, teamBStrength);

  // Convert average levels to ELO
  const eloA = levelToElo(teamAStrength || 3.5);
  const eloB = levelToElo(teamBStrength || 3.5);

  // Fetch tier config from match_bet_config
  const config = await fetchBetConfig();
  const tiers = config?.tier_config ?? DEFAULT_TIER_CONFIG;

  const odds = computeMatchOdds(eloA, eloB, tiers);

  const strongerTeam =
    teamAStrength > teamBStrength ? "A" : teamBStrength > teamAStrength ? "B" : null;

  return {
    teamAStrength,
    teamBStrength,
    teamDifference,
    strongerTeam,
    probA: odds.teamATrueProb,
    probB: odds.teamBTrueProb,
    multiplierA: odds.teamA.oddsMultiplier,
    multiplierB: odds.teamB.oddsMultiplier,
    tierA: odds.teamA.tierLabel,
    tierB: odds.teamB.tierLabel,
    isOfferedA: odds.teamA.isOffered,
    isOfferedB: odds.teamB.isOffered,
  };
};

// ─── Fetch Bet Config ────────────────────────────────────────

export const fetchBetConfig = async (): Promise<BetConfig | null> => {
  const { data, error } = await supabase
    .from("match_bet_config")
    .select("*")
    .limit(1)
    .single();

  if (error || !data) return null;

  const row = data as { enabled: boolean; house_reserve_pts: number; min_stake: number; max_stake: number; max_payout_pts: number; risk_threshold: number; close_threshold: number; tier_config: TierConfig[]; high_pot_boost_pts: number; high_pot_max_per_match: number; max_exposure_pct: number };
  return {
    enabled: row.enabled,
    house_reserve_pts: row.house_reserve_pts,
    min_stake: row.min_stake,
    max_stake: row.max_stake,
    max_payout_pts: row.max_payout_pts,
    risk_threshold: row.risk_threshold,
    close_threshold: row.close_threshold,
    tier_config: row.tier_config,
    high_pot_boost_pts: row.high_pot_boost_pts,
    high_pot_max_per_match: row.high_pot_max_per_match,
    max_exposure_pct: row.max_exposure_pct,
  };
};

// ─── Betting Settings (backward-compatible) ──────────────────

export const getBettingSettings = async () => {
  const config = await fetchBetConfig();
  return {
    minStake: config?.min_stake ?? 1,
    maxStake: config?.max_stake ?? 15,
    maxExposurePercentage: config?.max_exposure_pct ?? 0.30,
    startingPoints: 50, // kept from profiles default
  };
};

// ─── Validate Stake ──────────────────────────────────────────

export const validateStake = async (
  stakeAmount: number,
  userBalance: number
): Promise<{ valid: boolean; error?: string }> => {
  const settings = await getBettingSettings();

  if (stakeAmount < settings.minStake) {
    return { valid: false, error: `Minimum stake is ${settings.minStake} XP` };
  }
  if (stakeAmount > settings.maxStake) {
    return { valid: false, error: `Maximum stake is ${settings.maxStake} XP` };
  }
  if (stakeAmount > userBalance) {
    return { valid: false, error: "Insufficient balance" };
  }
  const maxExposure = Math.floor(userBalance * settings.maxExposurePercentage);
  if (stakeAmount > maxExposure) {
    return {
      valid: false,
      error: `Maximum exposure is ${(settings.maxExposurePercentage * 100).toFixed(0)}% of balance (${maxExposure} XP)`,
    };
  }
  return { valid: true };
};
