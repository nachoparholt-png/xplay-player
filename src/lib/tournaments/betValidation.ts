export interface BetValidationInput {
  userId: string;
  teamId: string;
  userTeamId: string; // the team the user belongs to
  stage: string;
  stakePts: number;
  windowStatus: string;
  lineStatus: string;
  allocationBalance: number;
  alreadyStakedThisStage: number;
  maxStakePerStage: number;
}

export interface BetValidationResult {
  valid: boolean;
  error?: string;
}

export function validateBet(input: BetValidationInput): BetValidationResult {
  // Self-bet only
  if (input.teamId !== input.userTeamId) {
    return { valid: false, error: "You can only bet on your own team" };
  }

  // Window must be open
  if (input.windowStatus !== "open") {
    return { valid: false, error: "Betting window is not open for this stage" };
  }

  // Line must be open or at risk (not closed)
  if (input.lineStatus === "closed") {
    return { valid: false, error: "This betting line is closed" };
  }

  // Stake must be positive
  if (input.stakePts <= 0) {
    return { valid: false, error: "Stake must be greater than 0" };
  }

  // Per-stage cap
  if (input.alreadyStakedThisStage + input.stakePts > input.maxStakePerStage) {
    return {
      valid: false,
      error: `Exceeds max stake per stage (${input.maxStakePerStage} TBP). You have ${input.maxStakePerStage - input.alreadyStakedThisStage} TBP remaining.`,
    };
  }

  // Balance check
  if (input.stakePts > input.allocationBalance) {
    return { valid: false, error: "Insufficient TBP balance" };
  }

  return { valid: true };
}
