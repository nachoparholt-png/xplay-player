/**
 * Individual mode pairing algorithm.
 * Generates balanced pairings for each round where:
 * - Players rotate partners (maximize variety)
 * - Side preference is respected when possible
 * - Each player plays roughly the same number of matches
 */

interface PlayerInfo {
  userId: string;
  sidePreference?: string | null;
  rating?: number;
}

interface Pairing {
  teamA: [string, string];
  teamB: [string, string];
  teamAName: string;
  teamBName: string;
}

/**
 * Generate all possible unique pairs from a list of player IDs.
 */
function allPairs(playerIds: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      pairs.push([playerIds[i], playerIds[j]]);
    }
  }
  return pairs;
}

/**
 * Score a pairing based on variety and balance.
 */
function scorePairing(
  teamA: [string, string],
  teamB: [string, string],
  partnerHistory: Map<string, Set<string>>,
  opponentHistory: Map<string, Set<string>>
): number {
  let score = 0;

  // Reward new partner combinations
  const a1Partners = partnerHistory.get(teamA[0]) || new Set();
  const a2Partners = partnerHistory.get(teamA[1]) || new Set();
  const b1Partners = partnerHistory.get(teamB[0]) || new Set();
  const b2Partners = partnerHistory.get(teamB[1]) || new Set();

  if (!a1Partners.has(teamA[1])) score += 10;
  if (!b1Partners.has(teamB[1])) score += 10;

  // Reward new opponent combinations
  const allA = teamA;
  const allB = teamB;
  for (const a of allA) {
    const oppHist = opponentHistory.get(a) || new Set();
    for (const b of allB) {
      if (!oppHist.has(b)) score += 5;
    }
  }

  return score;
}

/**
 * Generate pairings for a single round of individual mode.
 * Players are grouped into teams of 2 for doubles.
 */
export function generateIndividualRound(
  players: PlayerInfo[],
  roundNumber: number,
  partnerHistory: Map<string, Set<string>>,
  opponentHistory: Map<string, Set<string>>,
  courtCount: number
): Pairing[] {
  const playerIds = players.map((p) => p.userId);
  const pairs = allPairs(playerIds);
  const matchesPerRound = Math.min(Math.floor(playerIds.length / 4), courtCount);

  if (matchesPerRound === 0) return [];

  // Greedy approach: pick best scoring match combinations
  const pairings: Pairing[] = [];
  const usedPlayers = new Set<string>();

  // Sort pairs by novelty (prefer pairs that haven't been together)
  const scoredPairs = pairs.map((pair) => {
    const hist = partnerHistory.get(pair[0]) || new Set();
    const novelty = hist.has(pair[1]) ? 0 : 1;
    return { pair, novelty };
  }).sort((a, b) => b.novelty - a.novelty);

  for (let m = 0; m < matchesPerRound; m++) {
    // Find best team A
    let bestTeamA: [string, string] | null = null;
    for (const { pair } of scoredPairs) {
      if (!usedPlayers.has(pair[0]) && !usedPlayers.has(pair[1])) {
        bestTeamA = pair;
        break;
      }
    }
    if (!bestTeamA) break;

    usedPlayers.add(bestTeamA[0]);
    usedPlayers.add(bestTeamA[1]);

    // Find best team B
    let bestTeamB: [string, string] | null = null;
    let bestScore = -1;
    for (const { pair } of scoredPairs) {
      if (!usedPlayers.has(pair[0]) && !usedPlayers.has(pair[1])) {
        const s = scorePairing(bestTeamA, pair, partnerHistory, opponentHistory);
        if (s > bestScore) {
          bestScore = s;
          bestTeamB = pair;
        }
      }
    }
    if (!bestTeamB) {
      usedPlayers.delete(bestTeamA[0]);
      usedPlayers.delete(bestTeamA[1]);
      break;
    }

    usedPlayers.add(bestTeamB[0]);
    usedPlayers.add(bestTeamB[1]);

    // Apply side preferences
    const sideMap = new Map(players.map((p) => [p.userId, p.sidePreference]));
    let finalTeamA = bestTeamA;
    let finalTeamB = bestTeamB;

    // Try to put left-preferring players on left (index 0) within each team
    const arrangeTeam = (team: [string, string]): [string, string] => {
      const s0 = sideMap.get(team[0]);
      const s1 = sideMap.get(team[1]);
      if (s1 === "left" && s0 !== "left") return [team[1], team[0]];
      if (s0 === "right" && s1 !== "right") return [team[1], team[0]];
      return team;
    };

    finalTeamA = arrangeTeam(finalTeamA);
    finalTeamB = arrangeTeam(finalTeamB);

    pairings.push({
      teamA: finalTeamA,
      teamB: finalTeamB,
      teamAName: `Team ${m * 2 + 1}`,
      teamBName: `Team ${m * 2 + 2}`,
    });
  }

  return pairings;
}

/**
 * Update partner and opponent history after a round.
 */
export function updateHistory(
  pairings: Pairing[],
  partnerHistory: Map<string, Set<string>>,
  opponentHistory: Map<string, Set<string>>
): void {
  for (const p of pairings) {
    // Partner history
    for (const team of [p.teamA, p.teamB]) {
      if (!partnerHistory.has(team[0])) partnerHistory.set(team[0], new Set());
      if (!partnerHistory.has(team[1])) partnerHistory.set(team[1], new Set());
      partnerHistory.get(team[0])!.add(team[1]);
      partnerHistory.get(team[1])!.add(team[0]);
    }

    // Opponent history
    for (const a of p.teamA) {
      if (!opponentHistory.has(a)) opponentHistory.set(a, new Set());
      for (const b of p.teamB) {
        opponentHistory.get(a)!.add(b);
      }
    }
    for (const b of p.teamB) {
      if (!opponentHistory.has(b)) opponentHistory.set(b, new Set());
      for (const a of p.teamA) {
        opponentHistory.get(b)!.add(a);
      }
    }
  }
}

/**
 * Generate all rounds for individual mode tournament.
 */
export function generateIndividualTournament(
  players: PlayerInfo[],
  totalRounds: number,
  courtCount: number
): Pairing[][] {
  const partnerHistory = new Map<string, Set<string>>();
  const opponentHistory = new Map<string, Set<string>>();
  const allRounds: Pairing[][] = [];

  for (let r = 0; r < totalRounds; r++) {
    const pairings = generateIndividualRound(
      players,
      r + 1,
      partnerHistory,
      opponentHistory,
      courtCount
    );
    updateHistory(pairings, partnerHistory, opponentHistory);
    allRounds.push(pairings);
  }

  return allRounds;
}
