import { supabase } from "@/integrations/supabase/client";
import type { MatchResult, BracketConfig } from "./types";

interface Standing {
  teamId: string;
  groupId: string;
  totalPoints: number;
  pointsFor: number;
  pointsAgainst: number;
}

// Extended type used internally in buildKnockoutPairs
type AdvancingTeam = Standing & { groupIdx: number; position: number };

/**
 * Compute group standings from completed group matches.
 */
function computeGroupStandings(
  teams: { id: string; group_id: string | null }[],
  matches: { round_type: string; team_a_id: string | null; team_b_id: string | null; status: string; result: any }[]
): Map<string, Standing[]> {
  const groups = new Map<string, Standing[]>();

  const groupTeams = teams.filter((t) => t.group_id);
  groupTeams.forEach((t) => {
    const gId = t.group_id!;
    if (!groups.has(gId)) groups.set(gId, []);
    groups.get(gId)!.push({
      teamId: t.id,
      groupId: gId,
      totalPoints: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  });

  const groupMatches = matches.filter((m) => m.round_type === "group" && m.status === "completed" && m.result);
  groupMatches.forEach((m) => {
    const r = m.result as MatchResult;
    for (const [, standings] of groups) {
      standings.forEach((s) => {
        const isA = m.team_a_id === s.teamId;
        const isB = m.team_b_id === s.teamId;
        if (!isA && !isB) return;
        const myScore = isA ? (r.team_a_score || 0) : (r.team_b_score || 0);
        const oppScore = isA ? (r.team_b_score || 0) : (r.team_a_score || 0);
        s.pointsFor += myScore;
        s.pointsAgainst += oppScore;
        if (myScore > oppScore) s.totalPoints += 3;
        else if (myScore === oppScore) s.totalPoints += 1;
      });
    }
  });

  // Sort each group: points → point difference → points for
  for (const [gId, standings] of groups) {
    standings.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
    });
    groups.set(gId, standings);
  }

  return groups;
}

/**
 * Sort comparator for runner-up selection:
 * 1. Most points
 * 2. Best point difference (pointsFor - pointsAgainst)
 * 3. Most points scored
 */
function compareStandings(a: Standing, b: Standing): number {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  const diffA = a.pointsFor - a.pointsAgainst;
  const diffB = b.pointsFor - b.pointsAgainst;
  if (diffB !== diffA) return diffB - diffA;
  return b.pointsFor - a.pointsFor;
}

/**
 * Build knockout match pairings from group standings.
 *
 * Handles the "best runner-up" rule automatically:
 * - If (groupCount × advanceCount) > slotsNeeded → trim excess by keeping
 *   all 1st-place finishers and then only the best runner-up(s), ranked by
 *   points → point difference → points scored (UEFA/FIFA rule).
 * - If (groupCount × advanceCount) < slotsNeeded → supplement with runner-ups
 *   beyond the default advance count, still ranked by performance.
 *
 * @param groups        Standings map (groupId → sorted standings)
 * @param advanceCount  Default teams per group that should advance (usually 2)
 * @param seedingMode   "cross" (1st A vs 2nd B) or "straight" (1st A vs 2nd A)
 * @param slotsNeeded   Exact number of teams the first knockout round needs
 */
function buildKnockoutPairs(
  groups: Map<string, Standing[]>,
  advanceCount: number,
  seedingMode: "straight" | "cross",
  slotsNeeded: number
): [string | null, string | null][] {
  const groupIds = [...groups.keys()].sort();

  // Collect candidates by finishing position
  // Always collect at least 2 positions (1st + 2nd) so runner-up comparisons
  // are possible even when advanceCount is 1.
  const collectPositions = Math.max(advanceCount, 2);
  const byPosition: AdvancingTeam[][] = [];

  groupIds.forEach((gId, gIdx) => {
    const standings = groups.get(gId)!;
    for (let pos = 0; pos < Math.min(collectPositions, standings.length); pos++) {
      if (!byPosition[pos]) byPosition[pos] = [];
      byPosition[pos].push({ ...standings[pos], groupIdx: gIdx, position: pos });
    }
  });

  // ── Step 1: Always take all 1st-place finishers ──────────────────────────
  const firsts: AdvancingTeam[] = byPosition[0] ?? [];
  let advancing: AdvancingTeam[] = [...firsts];

  // ── Step 2: Fill remaining slots from runner-ups (ranked by performance) ──
  const stillNeeded = slotsNeeded - advancing.length;

  if (stillNeeded > 0) {
    // Merge all runner-up positions (2nd, 3rd, …) into one pool and rank them
    const runnerUpPool: AdvancingTeam[] = [];
    for (let pos = 1; pos < byPosition.length; pos++) {
      runnerUpPool.push(...(byPosition[pos] ?? []));
    }
    // Sort runner-ups: points → point diff → points scored
    runnerUpPool.sort(compareStandings);
    advancing.push(...runnerUpPool.slice(0, stillNeeded));
  }

  // ── Step 3: If we still have too many, trim to slotsNeeded ───────────────
  // (shouldn't happen after Step 2, but guard anyway)
  advancing = advancing.slice(0, slotsNeeded);

  // ── Step 4: Pad with nulls if we somehow still don't have enough ──────────
  while (advancing.length < slotsNeeded) {
    advancing.push(null as unknown as AdvancingTeam);
  }

  // ── Step 5: Build match pairs ─────────────────────────────────────────────
  const pairs: [string | null, string | null][] = [];

  if (seedingMode === "cross" && groupIds.length >= 2) {
    // Standard bracket seeding: seed 1 vs seed N, seed 2 vs seed N-1, …
    // This keeps the strongest teams apart until later rounds.
    const half = slotsNeeded / 2;
    for (let i = 0; i < half; i++) {
      const a = advancing[i];
      const b = advancing[slotsNeeded - 1 - i];
      pairs.push([a?.teamId ?? null, b?.teamId ?? null]);
    }
  } else {
    // Straight seeding: sequential pairing
    for (let i = 0; i < advancing.length; i += 2) {
      pairs.push([advancing[i]?.teamId ?? null, advancing[i + 1]?.teamId ?? null]);
    }
  }

  return pairs;
}

/**
 * Populate knockout match slots in the database after group stage completes.
 * Also handles filling final/bronze from semi-final results.
 */
export async function populateKnockoutSlots(
  tournamentId: string,
  bracketConfig: BracketConfig
): Promise<boolean> {
  const [teamsRes, matchesRes] = await Promise.all([
    supabase.from("tournament_teams").select("id, group_id").eq("tournament_id", tournamentId),
    supabase.from("tournament_matches").select("*").eq("tournament_id", tournamentId).order("match_number"),
  ]);

  const teams = (teamsRes.data || []) as { id: string; group_id: string | null }[];
  const matches = (matchesRes.data || []) as { round_type: string; team_a_id: string | null; team_b_id: string | null; status: string; result?: { winner_team_id?: string } }[];

  // ── Group stage → first knockout round ────────────────────────────────────
  const groupMatches = matches.filter((m) => m.round_type === "group");
  const allGroupsDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === "completed");

  if (allGroupsDone) {
    const semis = matches.filter((m) => m.round_type === "semi");
    const needsSemiPopulation = semis.length > 0 && semis.every((m) => !m.team_a_id && !m.team_b_id);
    const quarters = matches.filter((m) => m.round_type === "quarter");
    const needsQuarterPopulation = quarters.length > 0 && quarters.every((m) => !m.team_a_id && !m.team_b_id);

    const firstKnockoutRound = needsQuarterPopulation ? quarters : needsSemiPopulation ? semis : [];

    if (firstKnockoutRound.length > 0) {
      const standings = computeGroupStandings(teams, matches);
      const advanceCount = bracketConfig.advance_count ?? 2;
      const seedingMode = bracketConfig.seeding_mode ?? "cross";

      // slotsNeeded = total teams the first KO round requires (2 per match)
      const slotsNeeded = firstKnockoutRound.length * 2;
      const pairs = buildKnockoutPairs(standings, advanceCount, seedingMode, slotsNeeded);

      const updates = firstKnockoutRound.map((m, i: number) => {
        const pair = pairs[i] ?? [null, null];
        return supabase
          .from("tournament_matches")
          .update({ team_a_id: pair[0], team_b_id: pair[1] })
          .eq("id", m.id)
          .select();
      });

      await Promise.all(updates);
      return true;
    }
  }

  // ── Semi-finals → fill final + bronze ────────────────────────────────────
  const semiMatches = matches.filter((m) => m.round_type === "semi");
  const allSemisDone = semiMatches.length > 0 && semiMatches.every((m) => m.status === "completed");

  if (allSemisDone) {
    const finalMatch = matches.find((m) => m.round_type === "final" && !m.team_a_id && !m.team_b_id);
    const bronzeMatch = matches.find((m) => m.round_type === "bronze" && !m.team_a_id && !m.team_b_id);

    if (finalMatch || bronzeMatch) {
      const winners: string[] = [];
      const losers: string[] = [];

      semiMatches.forEach((m) => {
        const r = m.result as MatchResult | null;
        if (!r) return;
        if (r.winner_team_id) {
          winners.push(r.winner_team_id);
          const loser = r.winner_team_id === m.team_a_id ? m.team_b_id : m.team_a_id;
          if (loser) losers.push(loser);
        }
      });

      const updates: PromiseLike<any>[] = [];
      if (finalMatch && winners.length >= 2) {
        updates.push(
          supabase.from("tournament_matches")
            .update({ team_a_id: winners[0], team_b_id: winners[1] })
            .eq("id", finalMatch.id)
            .select()
        );
      }
      if (bronzeMatch && losers.length >= 2) {
        updates.push(
          supabase.from("tournament_matches")
            .update({ team_a_id: losers[0], team_b_id: losers[1] })
            .eq("id", bronzeMatch.id)
            .select()
        );
      }

      if (updates.length > 0) {
        await Promise.all(updates);
        return true;
      }
    }
  }

  // ── Quarter-finals → fill semi-finals ────────────────────────────────────
  const quarterMatches = matches.filter((m) => m.round_type === "quarter");
  const allQuartersDone = quarterMatches.length > 0 && quarterMatches.every((m) => m.status === "completed");

  if (allQuartersDone) {
    const emptySeeds = semiMatches.filter((m) => !m.team_a_id && !m.team_b_id);
    if (emptySeeds.length > 0) {
      const quarterWinners = quarterMatches
        .map((m) => (m.result as MatchResult)?.winner_team_id)
        .filter(Boolean) as string[];

      const updates = emptySeeds.map((m, i: number) => {
        const a = quarterWinners[i * 2] || null;
        const b = quarterWinners[i * 2 + 1] || null;
        return supabase
          .from("tournament_matches")
          .update({ team_a_id: a, team_b_id: b })
          .eq("id", m.id)
          .select();
      });

      await Promise.all(updates);
      return true;
    }
  }

  return false;
}

/**
 * Exported helper so the UI can explain the advancement rule to organisers.
 *
 * Returns one of:
 *  - "perfect"       → groupCount × advanceCount === slotsNeeded
 *  - "best-runner-up" → groupCount × advanceCount > slotsNeeded (need to pick best seconds)
 *  - "short"         → groupCount × advanceCount < slotsNeeded (not enough teams)
 */
export function resolveAdvancementMode(
  groupCount: number,
  advanceCount: number,
  knockoutFirstRoundSlots: number
): { mode: "perfect" | "best-runner-up" | "short"; numBestRunnerUps: number } {
  const totalAdvancing = groupCount * advanceCount;
  if (totalAdvancing === knockoutFirstRoundSlots) {
    return { mode: "perfect", numBestRunnerUps: 0 };
  }
  if (totalAdvancing > knockoutFirstRoundSlots) {
    const numBestRunnerUps = knockoutFirstRoundSlots - groupCount;
    return { mode: "best-runner-up", numBestRunnerUps: Math.max(0, numBestRunnerUps) };
  }
  return { mode: "short", numBestRunnerUps: 0 };
}
