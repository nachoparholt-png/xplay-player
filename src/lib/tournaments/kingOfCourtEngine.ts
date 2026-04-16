import type { MatchConfig, BracketConfig } from "./types";
import type { TeamDef, GeneratedMatch } from "./bracketGenerator";
import { estimateMatchMinutes } from "./timeEstimates";

export interface KingStanding {
  teamId: string;
  wins: number;
  losses: number;
  byes: number;
  points: number; // win=+2, bye=+1, loss=+0
  cumulativeScore: number;
  headToHead: Record<string, number>; // teamId → net score
}

/**
 * Generate King of the Court matches with promotion/relegation logic.
 * - Court 1 is the "king" court. Winner stays, loser demotes.
 * - Lower courts: winner promotes up, loser stays or demotes.
 * - Odd team count: fair bye rotation, bye = +1 point.
 */
export function generateKingOfCourt(
  teams: TeamDef[],
  bracketConfig: BracketConfig,
  matchConfig: MatchConfig,
  courtCount: number
): GeneratedMatch[] {
  const estMins = estimateMatchMinutes(matchConfig);
  const teamIds = [...teams.map((t) => t.teamId)];
  const totalRounds = bracketConfig.king_rounds || Math.max(teamIds.length, 6);
  const matches: GeneratedMatch[] = [];
  let matchNumber = 1;

  const hasOddTeams = teamIds.length % 2 !== 0;
  const teamsPerRound = Math.min(Math.floor(teamIds.length / 2), courtCount) * 2;

  // Initialize court assignments: pair teams onto courts
  // Court 1 = highest, Court N = lowest
  let courtAssignments: string[] = [...teamIds]; // ordered by court position
  let byeIndex = 0; // tracks fair bye rotation

  for (let r = 0; r < totalRounds; r++) {
    // Determine who has a bye this round (if odd)
    let byeTeamId: string | null = null;
    if (hasOddTeams) {
      byeTeamId = courtAssignments[byeIndex % courtAssignments.length];
      byeIndex++;
    }

    // Get active teams (excluding bye)
    const active = courtAssignments.filter((id) => id !== byeTeamId);

    // Assign pairs to courts
    const matchesThisRound = Math.min(Math.floor(active.length / 2), courtCount);
    for (let c = 0; c < matchesThisRound; c++) {
      const aIdx = c * 2;
      const bIdx = c * 2 + 1;
      if (aIdx < active.length && bIdx < active.length) {
        matches.push({
          round_type: "king",
          round_number: r + 1,
          match_number: matchNumber++,
          team_a_id: active[aIdx],
          team_b_id: active[bIdx],
          court_number: c + 1,
          match_config: matchConfig,
          estimated_mins: estMins,
          status: "pending",
        });
      }
    }

    // Add bye indicator match (for tracking)
    if (byeTeamId) {
      matches.push({
        round_type: "king_bye",
        round_number: r + 1,
        match_number: matchNumber++,
        team_a_id: byeTeamId,
        team_b_id: null,
        court_number: null,
        match_config: matchConfig,
        estimated_mins: 0,
        status: "bye",
      });
    }
  }

  return matches;
}

/**
 * Apply promotion/relegation after a round's results.
 * Returns new court order.
 */
export function applyPromotionRelegation(
  currentOrder: string[],
  roundResults: { teamAId: string; teamBId: string; winnerId: string; courtNumber: number }[]
): string[] {
  const newOrder = [...currentOrder];

  // Sort results by court number (Court 1 first)
  const sorted = [...roundResults].sort((a, b) => a.courtNumber - b.courtNumber);

  for (const result of sorted) {
    const winnerIdx = newOrder.indexOf(result.winnerId);
    const loserId = result.winnerId === result.teamAId ? result.teamBId : result.teamAId;
    const loserIdx = newOrder.indexOf(loserId);

    if (winnerIdx < 0 || loserIdx < 0) continue;

    if (result.courtNumber === 1) {
      // Court 1: winner stays (defends), loser demotes
      // Loser goes down one position
      if (loserIdx < newOrder.length - 1) {
        [newOrder[loserIdx], newOrder[loserIdx + 1]] = [newOrder[loserIdx + 1], newOrder[loserIdx]];
      }
    } else {
      // Other courts: winner promotes up, loser stays/demotes
      if (winnerIdx > 0) {
        [newOrder[winnerIdx], newOrder[winnerIdx - 1]] = [newOrder[winnerIdx - 1], newOrder[winnerIdx]];
      }
    }
  }

  return newOrder;
}

/**
 * Calculate King of Court standings from match results.
 */
export function calculateKingStandings(
  teams: { teamId: string }[],
  matchResults: {
    teamAId: string;
    teamBId: string | null;
    teamAScore: number;
    teamBScore: number;
    winnerId: string | null;
    roundType: string;
  }[]
): KingStanding[] {
  const standings: Record<string, KingStanding> = {};

  // Initialize
  for (const t of teams) {
    standings[t.teamId] = {
      teamId: t.teamId,
      wins: 0,
      losses: 0,
      byes: 0,
      points: 0,
      cumulativeScore: 0,
      headToHead: {},
    };
  }

  for (const m of matchResults) {
    if (m.roundType === "king_bye") {
      // Bye = +1 point
      if (standings[m.teamAId]) {
        standings[m.teamAId].byes++;
        standings[m.teamAId].points += 1;
      }
      continue;
    }

    if (!m.teamBId || !m.winnerId) continue;

    const loserId = m.winnerId === m.teamAId ? m.teamBId : m.teamAId;

    if (standings[m.winnerId]) {
      standings[m.winnerId].wins++;
      standings[m.winnerId].points += 2;
      standings[m.winnerId].cumulativeScore += m.winnerId === m.teamAId ? m.teamAScore : m.teamBScore;
      standings[m.winnerId].headToHead[loserId] = (standings[m.winnerId].headToHead[loserId] || 0) + 1;
    }

    if (standings[loserId]) {
      standings[loserId].losses++;
      standings[loserId].cumulativeScore += loserId === m.teamAId ? m.teamAScore : m.teamBScore;
      standings[loserId].headToHead[m.winnerId] = (standings[loserId].headToHead[m.winnerId] || 0) - 1;
    }
  }

  // Sort: points desc → cumulative score desc → head-to-head
  return Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.cumulativeScore !== a.cumulativeScore) return b.cumulativeScore - a.cumulativeScore;
    // Head-to-head between these two
    const h2h = a.headToHead[b.teamId] || 0;
    return -h2h; // positive means a beat b more
  });
}
