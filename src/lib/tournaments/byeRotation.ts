import type { TeamDef, GeneratedMatch } from "./bracketGenerator";
import type { MatchConfig, BracketConfig } from "./types";
import { estimateMatchMinutes } from "./timeEstimates";

/**
 * Generate Americano round-robin with fair bye rotation for odd team counts.
 * Bye = +1 point in standings.
 */
export function generateAmericanoWithByes(
  teams: TeamDef[],
  bracketConfig: BracketConfig,
  matchConfig: MatchConfig,
  courtCount: number
): GeneratedMatch[] {
  const estMins = estimateMatchMinutes(matchConfig);
  const teamIds = teams.map((t) => t.teamId);
  const isOdd = teamIds.length % 2 !== 0;

  // Standard round-robin with optional bye placeholder
  const rrTeams = [...teamIds];
  if (isOdd) rrTeams.push("__BYE__");

  const n = rrTeams.length;
  const rounds: [string, string][][] = [];

  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = rrTeams[i];
      const away = rrTeams[n - 1 - i];
      round.push([home, away]);
    }
    rounds.push(round);
    const last = rrTeams.pop()!;
    rrTeams.splice(1, 0, last);
  }

  const maxRounds = bracketConfig.americano_rounds || rounds.length;
  const matches: GeneratedMatch[] = [];
  let matchNumber = 1;
  let courtIdx = 0;

  for (let r = 0; r < Math.min(maxRounds, rounds.length); r++) {
    for (const [a, b] of rounds[r]) {
      if (a === "__BYE__" || b === "__BYE__") {
        // Bye match — the non-bye team gets a bye
        const byeTeam = a === "__BYE__" ? b : a;
        matches.push({
          round_type: "americano_bye",
          round_number: r + 1,
          match_number: matchNumber++,
          team_a_id: byeTeam,
          team_b_id: null,
          court_number: null,
          match_config: matchConfig,
          estimated_mins: 0,
          status: "bye",
        });
      } else {
        matches.push({
          round_type: "americano",
          round_number: r + 1,
          match_number: matchNumber++,
          team_a_id: a,
          team_b_id: b,
          court_number: (courtIdx++ % courtCount) + 1,
          match_config: matchConfig,
          estimated_mins: estMins,
          status: "pending",
        });
      }
    }
  }

  return matches;
}
