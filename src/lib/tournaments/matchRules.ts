/**
 * matchRules.ts — Game-level scoring engine for tournament matches.
 *
 * Supports:
 * - Points mode (simple target score)
 * - Games mode with configurable sets, games per set, deuce modes, and tiebreaks
 *
 * Deuce modes:
 *   normal  — unlimited deuces until 2-game lead
 *   silver  — max 2 deuces, then golden point decides
 *   golden  — no deuce; first to reach game point wins immediately
 *
 * Tiebreak:
 *   Triggered at configurable game score (e.g., 6-6).
 *   Tiebreak is first to tiebreak target (default 7) with 2-point lead.
 *
 * Third set options:
 *   "full"        — normal set rules
 *   "tiebreak_10" — super tiebreak to 10 (2-point lead)
 *   "tiebreak_15" — super tiebreak to 15 (2-point lead)
 */

import type { MatchConfig } from "./types";

// ─── Types ──────────────────────────────────────────────────────

export interface SetScore {
  teamA: number;
  teamB: number;
  isTiebreak: boolean;
  isComplete: boolean;
  winner: "a" | "b" | null;
}

export interface LiveGameState {
  sets: SetScore[];
  currentSetIndex: number;
  setsWonA: number;
  setsWonB: number;
  matchComplete: boolean;
  matchWinner: "a" | "b" | null;
  /** For deuce tracking in the current game within the current set */
  deuceCount: number;
  isInTiebreak: boolean;
  /** For super-tiebreak third sets */
  isSuperTiebreak: boolean;
}

export type ThirdSetType = "full" | "tiebreak_10" | "tiebreak_15";

export interface GameRules {
  scoringType: "points" | "games";
  // Points mode
  pointsTarget: number;
  // Games mode
  gamesPerSet: number;
  setsToWin: number;       // e.g. 2 for best-of-3, 1 for single set
  totalSets: number;       // e.g. 3 for best-of-3
  deuceMode: "normal" | "silver" | "golden";
  tiebreakAt: number;      // game score that triggers tiebreak (e.g. 6)
  tiebreakTarget: number;  // points to win tiebreak (default 7)
  thirdSetType: ThirdSetType;
  superTiebreakTarget: number; // 10 or 15
}

// ─── Rule extraction from MatchConfig ───────────────────────────

export function extractRules(config: MatchConfig): GameRules {
  const scoringType = config.scoring_type || "points";
  const gamesPerSet = config.games_per_set ?? 4;
  const totalSets = config.sets_per_match ?? 1;
  const setsToWin = Math.ceil(totalSets / 2);

  let deuceMode: "normal" | "silver" | "golden" = "normal";
  if (config.deuce_mode) {
    deuceMode = config.deuce_mode;
  } else if (config.golden_point) {
    deuceMode = "golden";
  } else if (config.deuce_enabled === false) {
    deuceMode = "golden"; // no deuce = golden point
  }

  const tiebreakAt = config.tiebreak_at ?? gamesPerSet;

  let thirdSetType: ThirdSetType = "full";
  if (config.third_set_tiebreak) {
    thirdSetType = "tiebreak_10";
  }

  const superTarget = thirdSetType === "tiebreak_10" ? 10 : 15;

  return {
    scoringType,
    pointsTarget: config.points_target ?? config.points_per_match ?? 21,
    gamesPerSet,
    setsToWin,
    totalSets,
    deuceMode,
    tiebreakAt,
    tiebreakTarget: 7,
    thirdSetType,
    superTiebreakTarget: superTarget,
  };
}

// ─── State initialization ───────────────────────────────────────

export function createInitialState(rules: GameRules): LiveGameState {
  const sets: SetScore[] = Array.from({ length: rules.totalSets }, () => ({
    teamA: 0,
    teamB: 0,
    isTiebreak: false,
    isComplete: false,
    winner: null,
  }));

  return {
    sets,
    currentSetIndex: 0,
    setsWonA: 0,
    setsWonB: 0,
    matchComplete: false,
    matchWinner: null,
    deuceCount: 0,
    isInTiebreak: false,
    isSuperTiebreak: false,
  };
}

// ─── Core logic: add a game/point to a team ─────────────────────

export function addGame(
  state: LiveGameState,
  team: "a" | "b",
  rules: GameRules
): LiveGameState {
  if (state.matchComplete) return state;

  const next = deepClone(state);
  const setIdx = next.currentSetIndex;
  const set = next.sets[setIdx];

  if (set.isComplete) return state;

  // Increment score
  if (team === "a") set.teamA++;
  else set.teamB++;

  // Check if this set is won
  const setResult = checkSetWin(set, rules, next);

  if (setResult) {
    set.isComplete = true;
    set.winner = setResult;

    if (setResult === "a") next.setsWonA++;
    else next.setsWonB++;

    // Reset deuce state
    next.deuceCount = 0;
    next.isInTiebreak = false;

    // Check match win
    if (next.setsWonA >= rules.setsToWin) {
      next.matchComplete = true;
      next.matchWinner = "a";
    } else if (next.setsWonB >= rules.setsToWin) {
      next.matchComplete = true;
      next.matchWinner = "b";
    } else {
      // Move to next set
      next.currentSetIndex++;

      // Check if next set is a super tiebreak
      const isDecidingSet = next.currentSetIndex === rules.totalSets - 1 &&
        next.setsWonA === next.setsWonB;
      if (isDecidingSet && rules.thirdSetType !== "full") {
        next.isSuperTiebreak = true;
        next.sets[next.currentSetIndex].isTiebreak = true;
      }
    }
  } else {
    // Check if entering tiebreak
    if (!next.isInTiebreak && !next.isSuperTiebreak) {
      if (set.teamA === rules.tiebreakAt && set.teamB === rules.tiebreakAt) {
        next.isInTiebreak = true;
        set.isTiebreak = true;
      }
    }

    // Track deuce count for silver mode
    if (!next.isInTiebreak && !next.isSuperTiebreak) {
      const deuceLine = rules.gamesPerSet - 1; // e.g., 3 for 4-game sets
      if (set.teamA >= deuceLine && set.teamB >= deuceLine && set.teamA === set.teamB) {
        next.deuceCount++;
      }
    }
  }

  return next;
}

export function removeGame(
  state: LiveGameState,
  team: "a" | "b",
  rules: GameRules
): LiveGameState {
  if (state.matchComplete) return state;

  const next = deepClone(state);
  const setIdx = next.currentSetIndex;
  const set = next.sets[setIdx];

  if (team === "a" && set.teamA > 0) set.teamA--;
  else if (team === "b" && set.teamB > 0) set.teamB--;

  // Recalculate tiebreak state
  next.isInTiebreak = set.teamA >= rules.tiebreakAt && set.teamB >= rules.tiebreakAt;
  set.isTiebreak = next.isInTiebreak;

  return next;
}

// ─── Set win detection ──────────────────────────────────────────

function checkSetWin(
  set: SetScore,
  rules: GameRules,
  state: LiveGameState
): "a" | "b" | null {
  const { teamA, teamB } = set;

  // Super tiebreak (third set)
  if (state.isSuperTiebreak) {
    const target = rules.superTiebreakTarget;
    if (teamA >= target && teamA - teamB >= 2) return "a";
    if (teamB >= target && teamB - teamA >= 2) return "b";
    return null;
  }

  // Normal tiebreak in progress
  if (state.isInTiebreak || set.isTiebreak) {
    const target = rules.tiebreakTarget;
    if (teamA >= target && teamA - teamB >= 2) return "a";
    if (teamB >= target && teamB - teamA >= 2) return "b";
    return null;
  }

  const gps = rules.gamesPerSet;

  // Standard set win: reach gamesPerSet with 2-game lead
  // or win via deuce rules
  if (teamA >= gps || teamB >= gps) {
    const diff = teamA - teamB;

    // Clear winner with 2+ game lead
    if (teamA >= gps && diff >= 2) return "a";
    if (teamB >= gps && -diff >= 2) return "b";

    // Deuce handling
    if (teamA >= gps - 1 && teamB >= gps - 1) {
      switch (rules.deuceMode) {
        case "golden":
          // No deuce — first to gamesPerSet wins
          if (teamA >= gps && teamA > teamB) return "a";
          if (teamB >= gps && teamB > teamA) return "b";
          break;

        case "silver":
          // After 2 deuces, golden point applies
          if (state.deuceCount >= 2) {
            if (teamA > teamB) return "a";
            if (teamB > teamA) return "b";
          }
          // Otherwise need 2-game lead (handled above)
          break;

        case "normal":
        default:
          // Need 2-game lead (handled above), or proceed to tiebreak at tiebreakAt
          break;
      }
    }
  }

  return null;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Get display label for the current scoring state */
export function getSetLabel(
  state: LiveGameState,
  rules: GameRules
): string {
  if (state.matchComplete) {
    return state.matchWinner === "a" ? "Team A wins!" : "Team B wins!";
  }

  const setNum = state.currentSetIndex + 1;

  if (state.isSuperTiebreak) {
    return `Super Tiebreak (to ${rules.superTiebreakTarget})`;
  }

  if (state.isInTiebreak) {
    return `Set ${setNum} — Tiebreak (to ${rules.tiebreakTarget})`;
  }

  return `Set ${setNum} of ${rules.totalSets}`;
}

/** Get deuce status description */
export function getDeuceStatus(
  state: LiveGameState,
  rules: GameRules
): string | null {
  if (rules.deuceMode === "golden") return null;
  if (state.isInTiebreak || state.isSuperTiebreak) return null;

  const set = state.sets[state.currentSetIndex];
  const deuceLine = rules.gamesPerSet - 1;

  if (set.teamA >= deuceLine && set.teamB >= deuceLine && set.teamA === set.teamB) {
    if (rules.deuceMode === "silver") {
      const remaining = Math.max(0, 2 - state.deuceCount);
      if (remaining === 0) return "Golden point!";
      return `Deuce ${state.deuceCount + 1} — ${remaining} deuce${remaining > 1 ? "s" : ""} left`;
    }
    return `Deuce ${state.deuceCount + 1}`;
  }

  return null;
}

/** Build result object for DB storage */
export function buildResultPayload(state: LiveGameState) {
  const totalA = state.sets.reduce((s, set) => s + set.teamA, 0);
  const totalB = state.sets.reduce((s, set) => s + set.teamB, 0);

  return {
    team_a_score: totalA,
    team_b_score: totalB,
    sets: state.sets
      .filter((s) => s.teamA > 0 || s.teamB > 0)
      .map((s) => ({
        team_a: s.teamA,
        team_b: s.teamB,
        is_tiebreak: s.isTiebreak,
      })),
    winner_team_id: state.matchWinner === "a" ? "team_a" : state.matchWinner === "b" ? "team_b" : null,
  };
}

function deepClone(state: LiveGameState): LiveGameState {
  return {
    ...state,
    sets: state.sets.map((s) => ({ ...s })),
  };
}
