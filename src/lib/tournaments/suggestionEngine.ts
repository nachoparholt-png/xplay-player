import type { SuggestionCard, MatchConfig, BracketConfig, TournamentFormat, WizardState } from "./types";
import { estimateMatchMinutes, estimateTotalMinutes, calculateTotalMatches } from "./timeEstimates";

function timeFitBadge(
  estimatedMins: number,
  budgetMins: number | null
): SuggestionCard["timeFit"] {
  if (!budgetMins) return "none";
  const ratio = estimatedMins / budgetMins;
  if (ratio <= 1.05) return "green";
  if (ratio <= 1.3) return "yellow";
  return "red";
}

function buildCard(
  id: string,
  label: string,
  description: string,
  formatType: TournamentFormat,
  matchConfig: MatchConfig,
  bracketConfig: BracketConfig,
  teamCount: number,
  courtCount: number,
  budgetMins: number | null
): SuggestionCard {
  const matchMins = estimateMatchMinutes(matchConfig);
  const { totalMatches, matchesPerTeam, knockoutMatches } = calculateTotalMatches(teamCount, formatType, bracketConfig);
  const estimatedTotalMins = estimateTotalMinutes(matchMins, totalMatches, courtCount, 2, knockoutMatches);

  const formatSummary = generateFormatSummary(formatType, matchConfig, bracketConfig, teamCount);

  return {
    id,
    label,
    description,
    formatType,
    matchConfig,
    bracketConfig,
    estimatedTotalMins,
    matchesPerTeam,
    timeFit: timeFitBadge(estimatedTotalMins, budgetMins),
    isRecommended: false,
    adjustmentTip: null,
    formatSummary,
  };
}

export function generateFormatSummary(
  formatType: TournamentFormat,
  matchConfig: MatchConfig,
  bracketConfig: BracketConfig,
  teamCount: number
): string {
  const scoringDesc = matchConfig.scoring_type === "points"
    ? `to ${matchConfig.points_target ?? 21} pts`
    : matchConfig.sets_per_match && matchConfig.sets_per_match > 1
      ? `best-of-${matchConfig.sets_per_match} sets (games to ${matchConfig.games_per_set ?? 4}${matchConfig.deuce_mode === "golden" ? ", golden deuce" : ""})`
      : `games to ${matchConfig.games_per_set ?? 6}${matchConfig.deuce_mode === "golden" ? ", golden deuce" : ""}`;

  if (formatType === "americano") {
    return `All teams rotate opponents each round, playing ${scoringDesc}. Final standings by total points accumulated.`;
  }

  if (formatType === "king_of_court") {
    return `Players rotate across courts. Winners move up, losers move down. Points: Win +2, Bye +1, Loss 0. ${scoringDesc} per round.`;
  }

  // Groups format
  const groups = bracketConfig.group_count ?? 2;
  const perGroup = Math.ceil(teamCount / groups);
  const ko = bracketConfig.knockout_structure ?? "groups_only";

  const koDesc: Record<string, string> = {
    groups_only: "No knockout — final standings by group points.",
    groups_final: `Top teams from each group advance to a final.`,
    groups_semis_final: `Top 2 from each group advance to semis, then a final.`,
    groups_quarters_semis_final: `Top teams advance through quarters, semis, and a final.`,
  };

  return `${groups} groups of ~${perGroup} teams play round-robin ${scoringDesc}. ${koDesc[ko] ?? koDesc.groups_only}`;
}

/**
 * Score how closely a card matches the admin's chosen format from Step 3.
 * Higher = better match.
 */
function formatMatchScore(card: SuggestionCard, state: WizardState): number {
  let score = 0;
  if (card.formatType === state.formatType) {
    score += 10;
    // Bonus for matching knockout structure
    if (
      card.bracketConfig.knockout_structure &&
      card.bracketConfig.knockout_structure === state.bracketConfig.knockout_structure
    ) {
      score += 5;
    }
    // Bonus for matching scoring type
    if (card.matchConfig.scoring_type === state.matchConfig.scoring_type) {
      score += 3;
    }
  }
  return score;
}

/**
 * Calculate actionable tips for a card that doesn't fit the time budget.
 */
function calculateAdjustmentTip(
  card: SuggestionCard,
  budgetMins: number | null,
  courtCount: number,
  teamCount: number
): string | null {
  if (!budgetMins || card.timeFit === "green" || card.timeFit === "none") return null;

  const parts: string[] = [];

  // How many extra minutes needed
  const extraMins = Math.ceil(card.estimatedTotalMins - budgetMins);
  if (extraMins > 0) {
    parts.push(`add ~${extraMins} min to your budget`);
  }

  // How many extra courts needed
  const matchMins = estimateMatchMinutes(card.matchConfig);
  const { totalMatches, knockoutMatches } = calculateTotalMatches(teamCount, card.formatType, card.bracketConfig);

  for (let extra = 1; extra <= 4; extra++) {
    const newEstimate = estimateTotalMinutes(matchMins, totalMatches, courtCount + extra, 2, knockoutMatches);
    if (newEstimate <= budgetMins * 1.05) {
      parts.push(`add ${extra} court${extra > 1 ? "s" : ""}`);
      break;
    }
  }

  if (parts.length === 0) return null;
  return `To make this work: ${parts.join(" or ")}`;
}

export function generateSuggestions(state: WizardState): SuggestionCard[] {
  const teamCount = state.tournamentType === "pairs"
    ? Math.floor(state.playerCount / 2)
    : state.playerCount;
  const courts = state.courtCount;
  const budget = state.totalTimeMins;

  const cards: SuggestionCard[] = [];

  // 1. Safe pick — Groups + Points 21
  cards.push(
    buildCard(
      "safe",
      "Safe pick",
      "Groups to 21 points — balanced and familiar",
      "groups",
      { scoring_type: "points", points_target: 21 },
      { knockout_structure: "groups_final", group_count: Math.max(2, Math.floor(teamCount / 4)) },
      teamCount,
      courts,
      budget
    )
  );

  // 2. Competitive — Groups + Games 4 best-of-3 + knockout
  cards.push(
    buildCard(
      "competitive",
      "Competitive",
      "Groups with games scoring + knockout final",
      "groups",
      { scoring_type: "games", games_per_set: 4, sets_per_match: 3, deuce_mode: "golden" },
      { knockout_structure: "groups_semis_final", group_count: Math.max(2, Math.floor(teamCount / 4)) },
      teamCount,
      courts,
      budget
    )
  );

  // 3. Fast & fun — Americano + Points 16
  cards.push(
    buildCard(
      "fast",
      "Fast & fun",
      "Americano to 16 points — everyone plays everyone",
      "americano",
      { scoring_type: "points", points_target: 16 },
      {},
      teamCount,
      courts,
      budget
    )
  );

  // 4. Premium Final — Groups + Games 6 + big knockout
  cards.push(
    buildCard(
      "premium",
      "Premium Final",
      "Full games scoring with semis & final",
      "groups",
      { scoring_type: "games", games_per_set: 6, sets_per_match: 1, deuce_mode: "normal" },
      { knockout_structure: "groups_quarters_semis_final", group_count: Math.max(2, Math.floor(teamCount / 4)) },
      teamCount,
      courts,
      budget
    )
  );

  // 5. Full classic — Americano + Games 4
  cards.push(
    buildCard(
      "classic",
      "Full classic",
      "Americano with games to 4 — the marathon option",
      "americano",
      { scoring_type: "games", games_per_set: 4, sets_per_match: 1, deuce_mode: "golden" },
      {},
      teamCount,
      courts,
      budget
    )
  );

  // Score each card by how closely it matches the admin's format choice
  let bestScore = -1;
  let bestIdx = -1;
  cards.forEach((card, i) => {
    const score = formatMatchScore(card, state);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });

  // Mark recommended and calculate adjustment tip
  if (bestIdx >= 0 && bestScore > 0) {
    cards[bestIdx].isRecommended = true;
    cards[bestIdx].adjustmentTip = calculateAdjustmentTip(
      cards[bestIdx],
      budget,
      courts,
      teamCount
    );
  }

  // Sort: recommended first, then by timeFit
  const fitOrder: Record<string, number> = { green: 0, yellow: 1, none: 2, red: 3 };
  cards.sort((a, b) => {
    if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1;
    return (fitOrder[a.timeFit] ?? 2) - (fitOrder[b.timeFit] ?? 2);
  });

  return cards;
}
