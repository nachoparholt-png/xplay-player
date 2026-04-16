export interface BetForSettlement {
  id: string;
  userId: string;
  teamId: string;
  stakePts: number;
  oddsMultiplier: number;
  potentialPayoutPts: number;
}

export interface SettlementResult {
  betId: string;
  userId: string;
  status: "won" | "lost" | "void";
  actualPayoutPts: number;
}

/**
 * Settle all bets for a stage given the winning team IDs.
 * - knockouts: team_ids of the teams that advanced
 * - final: team_ids of the 2 finalists
 * - win: team_id of the champion
 */
export function settleBets(
  bets: BetForSettlement[],
  winningTeamIds: Set<string>,
  maxPayoutPts: number,
  voided = false
): SettlementResult[] {
  return bets.map((bet) => {
    if (voided) {
      return { betId: bet.id, userId: bet.userId, status: "void" as const, actualPayoutPts: 0 };
    }

    if (winningTeamIds.has(bet.teamId)) {
      const payout = Math.min(
        Math.floor(bet.stakePts * bet.oddsMultiplier),
        maxPayoutPts
      );
      return { betId: bet.id, userId: bet.userId, status: "won" as const, actualPayoutPts: payout };
    }

    return { betId: bet.id, userId: bet.userId, status: "lost" as const, actualPayoutPts: 0 };
  });
}
