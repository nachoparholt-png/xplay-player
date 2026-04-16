import type { WizardState, FeasibilityStatus } from "./types";
import { estimateMatchMinutes, estimateTotalMinutes, calculateTotalMatches } from "./timeEstimates";

export function computeFeasibility(state: WizardState): FeasibilityStatus {
  const teamCount =
    state.tournamentType === "pairs"
      ? Math.floor(state.playerCount / 2)
      : state.playerCount;

  const matchMins = estimateMatchMinutes(state.matchConfig);
  const { totalMatches, matchesPerTeam, knockoutMatches } = calculateTotalMatches(
    teamCount,
    state.formatType,
    state.bracketConfig
  );
  const totalEstimatedMins = estimateTotalMinutes(matchMins, totalMatches, state.courtCount, 2, knockoutMatches);
  const budgetMins = state.totalTimeMins;
  const deltaMins = budgetMins ? totalEstimatedMins - budgetMins : 0;
  const rounds = Math.ceil(totalMatches / state.courtCount);

  let fit: FeasibilityStatus["fit"] = "none";
  if (budgetMins) {
    const ratio = totalEstimatedMins / budgetMins;
    if (ratio <= 1.05) fit = "green";
    else if (ratio <= 1.3) fit = "yellow";
    else fit = "red";
  }

  // Court alternatives
  const courtAlternatives: FeasibilityStatus["courtAlternatives"] = [];
  for (let extra = 1; extra <= 4; extra++) {
    const newCourts = state.courtCount + extra;
    const est = estimateTotalMinutes(matchMins, totalMatches, newCourts, 2, knockoutMatches);
    courtAlternatives.push({ courts: newCourts, estimatedMins: est });
    if (budgetMins && est <= budgetMins * 1.05) break;
  }

  // Time alternatives
  const timeAlternatives: FeasibilityStatus["timeAlternatives"] = [];
  if (budgetMins && fit !== "green" && fit !== "none") {
    for (let extra = 15; extra <= 120; extra += 15) {
      const newBudget = budgetMins + extra;
      if (totalEstimatedMins <= newBudget * 1.05) {
        timeAlternatives.push({ extraMins: extra, newBudget });
        break;
      }
      timeAlternatives.push({ extraMins: extra, newBudget });
    }
  }

  return {
    totalEstimatedMins,
    budgetMins,
    deltaMins,
    fit,
    totalMatches,
    matchesPerTeam,
    rounds,
    courtAlternatives,
    timeAlternatives,
  };
}
