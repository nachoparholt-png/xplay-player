import { supabase } from "@/integrations/supabase/client";
import type { MatchConfig } from "./types";

// Hardcoded average match durations in minutes based on scoring config
const DEFAULT_ESTIMATES: Record<string, number> = {
  // Points mode
  "points_16": 10,
  "points_21": 14,
  "points_32": 20,
  // Games mode: gamesPerSet_sets_deuce
  "games_4_1_normal": 18,
  "games_4_1_silver": 16,
  "games_4_1_golden": 14,
  "games_6_1_normal": 28,
  "games_6_1_silver": 25,
  "games_6_1_golden": 22,
  "games_4_3_normal": 40,
  "games_4_3_silver": 35,
  "games_4_3_golden": 30,
  "games_6_3_normal": 65,
  "games_6_3_silver": 58,
  "games_6_3_golden": 50,
  // Best-of-3 with 3rd-set tiebreak (shorter 3rd set)
  "games_4_3_normal_tb": 30,
  "games_4_3_silver_tb": 27,
  "games_4_3_golden_tb": 24,
  "games_6_3_normal_tb": 50,
  "games_6_3_silver_tb": 45,
  "games_6_3_golden_tb": 40,
};

// Cache for admin overrides
let _cachedOverrides: Record<string, number> | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

// Cache for calibrated estimates from historical data
let _calibratedCache: Record<string, number> = {};
let _calibratedCacheTime = 0;
const CALIBRATED_TTL = 5 * 60_000; // 5 minutes

async function loadOverrides(): Promise<Record<string, number>> {
  if (_cachedOverrides && Date.now() - _cacheTime < CACHE_TTL) {
    return _cachedOverrides;
  }
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "tournament_default_time_estimates")
      .maybeSingle();
    if (data?.value) {
      _cachedOverrides = JSON.parse(data.value as string) as Record<string, number>;
      _cacheTime = Date.now();
      return _cachedOverrides;
    }
  } catch {}
  return {};
}

/**
 * Generate a stable config hash key for a MatchConfig.
 * Used both for estimates and for deduplicating historical records.
 */
export function configKey(config: MatchConfig): string {
  if (config.scoring_type === "points") {
    const target = config.points_target ?? config.points_per_match ?? 21;
    if (target <= 16) return "points_16";
    if (target <= 21) return "points_21";
    return "points_32";
  }
  const gps = config.games_per_set ?? 4;
  const sets = config.sets_per_match ?? 1;
  const deuce = config.deuce_mode ?? (config.golden_point ? "golden" : "normal");
  const base = `games_${gps}_${sets}_${deuce}`;
  return (sets >= 3 && config.third_set_tiebreak) ? `${base}_tb` : base;
}

/**
 * Load calibrated estimates from match_time_history using
 * exponentially-weighted moving average (EWMA).
 * Recent matches weigh more heavily (decay factor 0.85).
 */
async function loadCalibratedEstimates(): Promise<Record<string, number>> {
  if (Object.keys(_calibratedCache).length > 0 && Date.now() - _calibratedCacheTime < CALIBRATED_TTL) {
    return _calibratedCache;
  }

  try {
    const { data } = await supabase
      .from("match_time_history")
      .select("config_hash, actual_mins, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (!data || data.length === 0) return {};

    // Group by config_hash
    const grouped: Record<string, { actual_mins: number; created_at: string }[]> = {};
    data.forEach((row: { config_hash: string; actual_mins: number; created_at: string }) => {
      const key = row.config_hash;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ actual_mins: row.actual_mins, created_at: row.created_at });
    });

    const result: Record<string, number> = {};
    const DECAY = 0.85;
    const MIN_SAMPLES = 3; // Need at least 3 samples to calibrate

    for (const [key, samples] of Object.entries(grouped)) {
      if (samples.length < MIN_SAMPLES) continue;

      // Samples are already sorted newest-first
      // Use at most 20 most recent samples
      const recent = samples.slice(0, 20);

      let weightedSum = 0;
      let weightSum = 0;

      recent.forEach((s, i) => {
        const weight = Math.pow(DECAY, i);
        weightedSum += s.actual_mins * weight;
        weightSum += weight;
      });

      result[key] = Math.round(weightedSum / weightSum);
    }

    _calibratedCache = result;
    _calibratedCacheTime = Date.now();
    return result;
  } catch {
    return {};
  }
}

/**
 * Sync estimate — uses cached calibrated data, then admin overrides, then defaults.
 */
export function estimateMatchMinutes(config: MatchConfig): number {
  const key = configKey(config);
  // Priority: calibrated > admin override > hardcoded default
  const calibrated = _calibratedCache[key];
  if (calibrated) return calibrated;
  const overrides = _cachedOverrides || {};
  return overrides[key] ?? DEFAULT_ESTIMATES[key] ?? 15;
}

/**
 * Async version that fetches both calibrated history and admin overrides.
 */
export async function estimateMatchMinutesAsync(config: MatchConfig): Promise<number> {
  const [overrides, calibrated] = await Promise.all([
    loadOverrides(),
    loadCalibratedEstimates(),
  ]);
  const key = configKey(config);
  // Priority: calibrated > admin override > hardcoded default
  return calibrated[key] ?? overrides[key] ?? DEFAULT_ESTIMATES[key] ?? 15;
}

/**
 * Record actual match duration for future calibration.
 * Deduplicates by match_id to prevent double-recording on score edits.
 */
export async function recordMatchDuration(
  configHash: string,
  actualMins: number,
  tournamentId: string,
  matchId: string
): Promise<void> {
  if (actualMins <= 0 || actualMins > 300) return; // sanity check

  try {
    // Upsert-like: check if already recorded for this match
    const { data: existing } = await supabase
      .from("match_time_history")
      .select("id")
      .eq("match_id", matchId)
      .maybeSingle();

    if (existing) {
      // Update existing record
      await supabase
        .from("match_time_history")
        .update({ actual_mins: actualMins, config_hash: configHash })
        .eq("id", existing.id)
        .select();
    } else {
      // Insert new record
      await supabase
        .from("match_time_history")
        .insert({
          config_hash: configHash,
          actual_mins: actualMins,
          tournament_id: tournamentId,
          match_id: matchId,
        });
    }

    // Invalidate calibration cache so next estimate picks up new data
    _calibratedCacheTime = 0;
  } catch {
    // Non-critical — don't break match flow
  }
}

/**
 * Estimate total minutes using per-phase sequential scheduling.
 * Each phase runs sequentially (can't overlap), but matches within
 * a phase are parallelised across courts. Knockout phases get a 20% uplift.
 */
export function estimateTotalMinutes(
  matchMins: number,
  totalMatches: number,
  courtCount: number,
  changeover: number = 2,
  knockoutMatches: number = 0
): number {
  const safeCourts = Math.max(1, courtCount);
  const knockoutMins = Math.round(matchMins * 1.2);
  const groupMatches = totalMatches - knockoutMatches;

  // Group phase rounds
  const groupRounds = groupMatches > 0 ? Math.ceil(groupMatches / safeCourts) : 0;
  const groupTime = groupRounds * (matchMins + changeover);

  // Knockout phase rounds (sequential after groups)
  const koRounds = knockoutMatches > 0 ? Math.ceil(knockoutMatches / safeCourts) : 0;
  const koTime = koRounds * (knockoutMins + changeover);

  return groupTime + koTime;
}

/**
 * Calculate total matches for a format.
 * Returns knockoutMatches separately so callers can pass it to estimateTotalMinutes.
 */
export function calculateTotalMatches(
  teamCount: number,
  format: string,
  bracketConfig: any
): { totalMatches: number; matchesPerTeam: number; knockoutMatches: number } {
  if (format === "americano") {
    const totalMatches = (teamCount * (teamCount - 1)) / 2;
    return { totalMatches, matchesPerTeam: teamCount - 1, knockoutMatches: 0 };
  }

  if (format === "king_of_court") {
    const rounds = bracketConfig?.king_rounds ?? Math.max(teamCount, 6);
    return { totalMatches: rounds, matchesPerTeam: Math.ceil((rounds * 2) / teamCount), knockoutMatches: 0 };
  }

  // Groups format
  const structure = bracketConfig?.knockout_structure ?? "groups_only";
  const groupCount = bracketConfig?.group_count ?? Math.max(2, Math.floor(teamCount / 4));
  const teamsPerGroup = Math.ceil(teamCount / groupCount);
  const groupMatches = groupCount * ((teamsPerGroup * (teamsPerGroup - 1)) / 2);

  let knockoutMatches = 0;
  if (structure === "groups_final") knockoutMatches = 1;
  else if (structure === "groups_semis_final") knockoutMatches = 3;
  else if (structure === "groups_quarters_semis_final") knockoutMatches = 7;

  // Add bronze match if enabled
  if (bracketConfig?.bronze_match && knockoutMatches >= 3) {
    knockoutMatches += 1;
  }

  const totalMatches = groupMatches + knockoutMatches;
  const matchesPerTeam = teamsPerGroup - 1 + (knockoutMatches > 0 ? 1 : 0);

  return { totalMatches, matchesPerTeam, knockoutMatches };
}
