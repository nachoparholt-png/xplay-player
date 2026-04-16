// ─── ELO Win Probability ─────────────────────────────────────
export function eloWinProb(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

// ─── Constants ───────────────────────────────────────────────
const NUM_SIMS = 50_000;

export const STAGE_ORDER = ["groups", "quarters", "semis", "final", "win"] as const;
export type StageKey = (typeof STAGE_ORDER)[number];

export const STAGE_DEPTH: Record<StageKey, number> = {
  groups: 0,
  quarters: 1,
  semis: 2,
  final: 3,
  win: 4,
};

export const STAGE_META: Record<StageKey, { label: string; short: string; depth: number }> = {
  groups: { label: "Groups", short: "GRP", depth: 0 },
  quarters: { label: "Quarter-Finals", short: "QF", depth: 1 },
  semis: { label: "Semi-Finals", short: "SF", depth: 2 },
  final: { label: "Final", short: "FIN", depth: 3 },
  win: { label: "Winner", short: "WIN", depth: 4 },
};

export const DEFAULT_STAGE_MULTIPLIERS: Record<StageKey, number> = {
  groups: 1.40,
  quarters: 1.85,
  semis: 2.50,
  final: 3.40,
  win: 5.20,
};

export const STAGE_DEPTH_PREMIUM = 0.12;
export const MIN_STAGE_JUMP = 1.30;

export function stageDepthBonus(depth: number): number {
  return 1 + depth * STAGE_DEPTH_PREMIUM;
}

// ─── Types ───────────────────────────────────────────────────
export interface TeamInput {
  teamId: string;
  avgElo: number;
}

export interface SimResult {
  teamId: string;
  groups: number;
  quarters: number;
  semis: number;
  final: number;
  win: number;
}

export interface TierConfig {
  label: string;
  minProb: number;
  maxProb: number;
  k: number;
  maxMult: number;
}

export interface OddsResult {
  tierLabel: string;
  kFactor: number;
  houseProbability: number;
  oddsMultiplier: number;
  isCapped: boolean;
  isOffered: boolean;
  worstCasePayout: number;
  lineStatus: "open" | "risk" | "closed";
  stageDepth: number;
}

export interface StageOddsRow {
  stage: StageKey;
  oddsMultiplier: number;
  trueProb: number;
  tierLabel: string;
  isOffered: boolean;
  lineStatus: string;
}

// ─── Monte Carlo Tournament Simulation ───────────────────────
export function simulateTournament(
  teams: TeamInput[],
  numSims: number = NUM_SIMS
): SimResult[] {
  const n = teams.length;
  const counts = teams.map(() => ({ groups: 0, quarters: 0, semis: 0, final: 0, win: 0 }));

  for (let s = 0; s < numSims; s++) {
    const wins = new Array(n).fill(0);

    // Round Robin group stage
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p = eloWinProb(teams[i].avgElo, teams[j].avgElo);
        if (Math.random() < p) wins[i]++;
        else wins[j]++;
      }
    }

    // Rank by wins; ELO tiebreaker
    const ranked = teams
      .map((t, i) => ({ i, wins: wins[i], elo: t.avgElo }))
      .sort((a, b) => b.wins - a.wins || b.elo - a.elo);

    // Groups: everyone who survives (top ceil(n/2) or all if small)
    const groupAdvance = Math.min(n, Math.max(4, Math.ceil(n / 2)));
    for (let r = 0; r < groupAdvance; r++) {
      counts[ranked[r].i].groups++;
    }

    // QF: top 8 → 4 winners (or skip if < 5 teams)
    const qfCount = Math.min(8, n);
    let qfWinners: number[] = [];
    if (qfCount >= 5) {
      // Pair 1v8, 2v7, 3v6, 4v5
      const qfSlots = ranked.slice(0, qfCount).map((r) => r.i);
      for (let q = 0; q < Math.floor(qfCount / 2); q++) {
        const a = qfSlots[q];
        const b = qfSlots[qfCount - 1 - q];
        const winner = Math.random() < eloWinProb(teams[a].avgElo, teams[b].avgElo) ? a : b;
        qfWinners.push(winner);
        counts[winner].quarters++;
      }
    } else {
      // Small tournament: top 4 auto-advance to QF
      qfWinners = ranked.slice(0, Math.min(4, n)).map((r) => r.i);
      qfWinners.forEach((idx) => { counts[idx].quarters++; });
    }

    // SF: top 4 from QF winners
    const sfPool = qfWinners.slice(0, Math.min(4, qfWinners.length));
    let sfWinners: number[] = [];
    if (sfPool.length >= 4) {
      const w1 = Math.random() < eloWinProb(teams[sfPool[0]].avgElo, teams[sfPool[3]].avgElo) ? sfPool[0] : sfPool[3];
      const w2 = Math.random() < eloWinProb(teams[sfPool[1]].avgElo, teams[sfPool[2]].avgElo) ? sfPool[1] : sfPool[2];
      sfWinners = [w1, w2];
      counts[w1].semis++;
      counts[w2].semis++;
    } else if (sfPool.length >= 2) {
      sfWinners = sfPool.slice(0, 2);
      sfWinners.forEach((idx) => { counts[idx].semis++; });
    }

    // Final
    if (sfWinners.length >= 2) {
      const [f1, f2] = sfWinners;
      counts[f1].final++;
      counts[f2].final++;

      // Winner
      const champ = Math.random() < eloWinProb(teams[f1].avgElo, teams[f2].avgElo) ? f1 : f2;
      counts[champ].win++;
    }
  }

  return teams.map((t, i) => ({
    teamId: t.teamId,
    groups: counts[i].groups / numSims,
    quarters: counts[i].quarters / numSims,
    semis: counts[i].semis / numSims,
    final: counts[i].final / numSims,
    win: counts[i].win / numSims,
  }));
}

// ─── Tiered K-Factor Odds with Stage Depth ───────────────────
export function computeOdds(
  trueProb: number,
  tiers: TierConfig[],
  maxPayoutPts: number,
  maxStakePts: number,
  totalPlayers: number,
  houseReservePts: number,
  riskThreshold: number,
  closeThreshold: number,
  stageDepth: number = 0
): OddsResult {
  const tier = tiers.find((t) => trueProb >= t.minProb) ?? tiers[tiers.length - 1];
  const houseProb = trueProb * tier.k;

  if (houseProb >= 0.98) {
    return {
      tierLabel: tier.label,
      kFactor: tier.k,
      houseProbability: houseProb,
      oddsMultiplier: 0,
      isCapped: false,
      isOffered: false,
      worstCasePayout: 0,
      lineStatus: "open",
      stageDepth,
    };
  }

  const clampedHouseProb = Math.min(houseProb, 0.98);
  const naturalMult = 1 / clampedHouseProb;
  // Apply stage depth bonus before capping
  const depthBoosted = naturalMult * stageDepthBonus(stageDepth);
  const multiplier = Math.min(depthBoosted, tier.maxMult);
  const isCapped = depthBoosted > tier.maxMult;

  const worstCasePayout = totalPlayers * Math.min(maxStakePts * multiplier, maxPayoutPts);

  let lineStatus: "open" | "risk" | "closed" = "open";
  if (worstCasePayout >= houseReservePts * closeThreshold) {
    lineStatus = "closed";
  } else if (worstCasePayout >= houseReservePts * riskThreshold) {
    lineStatus = "risk";
  }

  return {
    tierLabel: tier.label,
    kFactor: tier.k,
    houseProbability: clampedHouseProb,
    oddsMultiplier: multiplier,
    isCapped,
    isOffered: true,
    worstCasePayout,
    lineStatus,
    stageDepth,
  };
}

// ─── Enforce Progressive Multipliers ─────────────────────────
export function enforceStageProgression(
  rows: StageOddsRow[]
): StageOddsRow[] {
  // Sort by stage order
  const ordered = [...rows].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
  );

  let prevMult = 0;
  for (const row of ordered) {
    if (!row.isOffered) continue;
    const minRequired = prevMult > 0 ? prevMult * MIN_STAGE_JUMP : 0;
    if (row.oddsMultiplier < minRequired) {
      row.oddsMultiplier = Math.round(minRequired * 100) / 100;
    }
    prevMult = row.oddsMultiplier;
  }

  return ordered;
}
