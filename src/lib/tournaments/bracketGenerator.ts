import type { WizardState, MatchConfig, BracketConfig } from "./types";
import { estimateMatchMinutes } from "./timeEstimates";
import { generateKingOfCourt } from "./kingOfCourtEngine";
import { generateAmericanoWithByes } from "./byeRotation";

export interface TeamDef {
  teamId: string;
  teamName: string;
  player1Id: string;
  player2Id?: string;
  groupId?: string;
  seed?: number;
}

export interface GeneratedMatch {
  round_type: string;
  round_number: number;
  match_number: number;
  team_a_id: string | null;
  team_b_id: string | null;
  court_number: number | null;
  match_config: MatchConfig;
  estimated_mins: number | null;
  status: string;
}

/**
 * Generate round-robin pairings for a list of team IDs.
 * Returns array of [teamA, teamB] pairs per round.
 */
function roundRobinRounds(teamIds: string[]): [string, string][][] {
  const teams = [...teamIds];
  // If odd, add a "bye" placeholder
  if (teams.length % 2 !== 0) teams.push("__BYE__");

  const n = teams.length;
  const rounds: [string, string][][] = [];

  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = teams[i];
      const away = teams[n - 1 - i];
      if (home !== "__BYE__" && away !== "__BYE__") {
        round.push([home, away]);
      }
    }
    rounds.push(round);
    // Rotate: fix first element, rotate the rest
    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }

  return rounds;
}

/**
 * Assign matches to courts in a simple round-robin fashion.
 */
function assignCourts(matches: GeneratedMatch[], courtCount: number): GeneratedMatch[] {
  let courtIdx = 0;
  return matches.map((m) => ({
    ...m,
    court_number: (courtIdx++ % courtCount) + 1,
  }));
}

/**
 * Generate groups bracket: round-robin within groups, then optional knockout.
 */
function generateGroups(
  teams: TeamDef[],
  bracketConfig: BracketConfig,
  matchConfig: MatchConfig,
  courtCount: number
): GeneratedMatch[] {
  const matches: GeneratedMatch[] = [];
  const estMins = estimateMatchMinutes(matchConfig);

  // Determine group count
  const groupCount = bracketConfig.group_count || Math.max(1, Math.floor(teams.length / (bracketConfig.teams_per_group || 4)));
  const groups: TeamDef[][] = Array.from({ length: groupCount }, () => []);

  // Distribute teams to groups (snake draft)
  teams.forEach((t, i) => {
    const gIdx = i % groupCount;
    groups[gIdx].push(t);
    t.groupId = String.fromCharCode(65 + gIdx); // A, B, C...
  });

  let matchNumber = 1;

  // Group stage round-robins
  for (let g = 0; g < groups.length; g++) {
    const groupTeamIds = groups[g].map((t) => t.teamId);
    const rounds = roundRobinRounds(groupTeamIds);

    rounds.forEach((round, rIdx) => {
      round.forEach(([a, b]) => {
        matches.push({
          round_type: "group",
          round_number: rIdx + 1,
          match_number: matchNumber++,
          team_a_id: a,
          team_b_id: b,
          court_number: null,
          match_config: matchConfig,
          estimated_mins: estMins,
          status: "pending",
        });
      });
    });
  }

  // Knockout rounds (placeholder slots)
  const knockoutStructure = bracketConfig.knockout_structure || "groups_only";
  const koMatchConfig = bracketConfig.knockout_match_config || matchConfig;
  const koEstMins = estimateMatchMinutes(koMatchConfig);

  if (knockoutStructure !== "groups_only") {
    const advancePerGroup = bracketConfig.advance_count || 2;
    const totalAdvancing = advancePerGroup * groupCount;

    let roundNum = 1;
    let koRounds = 0;
    if (knockoutStructure === "groups_final") koRounds = 1;
    else if (knockoutStructure === "groups_semis_final") koRounds = 2;
    else if (knockoutStructure === "groups_quarters_semis_final") koRounds = 3;

    let currentTeams = totalAdvancing;
    for (let kr = 0; kr < koRounds; kr++) {
      const matchesInRound = Math.floor(currentTeams / 2);
      const roundType = kr === koRounds - 1 ? "final" : kr === koRounds - 2 ? "semi" : "quarter";

      for (let m = 0; m < matchesInRound; m++) {
        // Court assignment rules: final → court 1, semis → courts 1&2
        let courtNum: number | null = null;
        if (roundType === "final") courtNum = 1;
        else if (roundType === "semi") courtNum = (m % courtCount) + 1;

        matches.push({
          round_type: roundType,
          round_number: roundNum,
          match_number: matchNumber++,
          team_a_id: null,
          team_b_id: null,
          court_number: courtNum,
          match_config: koMatchConfig,
          estimated_mins: koEstMins,
          status: "pending",
        });
      }
      currentTeams = matchesInRound;
      roundNum++;
    }

    // Bronze / 3rd-place match (only if semis exist)
    if (bracketConfig.bronze_match && koRounds >= 2) {
      matches.push({
        round_type: "bronze",
        round_number: roundNum,
        match_number: matchNumber++,
        team_a_id: null,
        team_b_id: null,
        court_number: courtCount >= 2 ? 2 : 1,
        match_config: koMatchConfig,
        estimated_mins: koEstMins,
        status: "pending",
      });
    }
  }

  return assignCourts(matches.filter(m => m.round_type === "group"), courtCount).concat(
    matches.filter(m => m.round_type !== "group")
  );
}

// Americano and King of Court moved to dedicated modules with bye support

/**
 * Main entry: generate teams + matches for a tournament.
 */
export function generateBracket(
  players: { userId: string; sidePreference?: string | null }[],
  state: WizardState
): { teams: TeamDef[]; matches: GeneratedMatch[] } {
  const teams: TeamDef[] = [];

  if (state.tournamentType === "pairs") {
    // Pair players sequentially (pairs should be pre-arranged or randomly assigned)
    for (let i = 0; i < players.length; i += 2) {
      const p1 = players[i];
      const p2 = players[i + 1];
      const teamId = `team_${Math.floor(i / 2) + 1}`;
      teams.push({
        teamId,
        teamName: `Team ${Math.floor(i / 2) + 1}`,
        player1Id: p1.userId,
        player2Id: p2?.userId,
      });
    }
  } else {
    // Individual mode: each player is a "team"
    players.forEach((p, i) => {
      teams.push({
        teamId: `player_${i + 1}`,
        teamName: `Player ${i + 1}`,
        player1Id: p.userId,
      });
    });
  }

  let matches: GeneratedMatch[];

  switch (state.formatType) {
    case "americano":
      matches = generateAmericanoWithByes(teams, state.bracketConfig, state.matchConfig, state.courtCount);
      break;
    case "king_of_court":
      matches = generateKingOfCourt(teams, state.bracketConfig, state.matchConfig, state.courtCount);
      break;
    case "groups":
    default:
      matches = generateGroups(teams, state.bracketConfig, state.matchConfig, state.courtCount);
      break;
  }

  return { teams, matches };
}
