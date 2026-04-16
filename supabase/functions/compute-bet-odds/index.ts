import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Reliability helpers ─────────────────────────────────────
function getReliabilityFactor(reliabilityScore: number): number {
  if (reliabilityScore < 30) return 0.33;
  if (reliabilityScore < 60) return 0.67;
  return 1.00;
}

function getTeamReliabilityFactor(scores: number[]): number {
  if (scores.length === 0) return 1.0;
  return Math.min(...scores.map(getReliabilityFactor));
}

function applyReliabilityToProb(rawProb: number, factor: number): number {
  return rawProb * factor + 0.5 * (1 - factor);
}

// ─── Constants ───────────────────────────────────────────────
const STAGE_ORDER = ["groups", "quarters", "semis", "final", "win"] as const;
type StageKey = (typeof STAGE_ORDER)[number];

const STAGE_DEPTH: Record<StageKey, number> = {
  groups: 0, quarters: 1, semis: 2, final: 3, win: 4,
};

const STAGE_DEPTH_PREMIUM = 0.12;
const MIN_STAGE_JUMP = 1.30;

function stageDepthBonus(depth: number): number {
  return 1 + depth * STAGE_DEPTH_PREMIUM;
}

// ─── Types ───────────────────────────────────────────────────
interface TeamInput { teamId: string; avgElo: number; minReliability: number }
interface TierConfig { label: string; minProb: number; maxProb: number; k: number; maxMult: number }

// ─── ELO ─────────────────────────────────────────────────────
function eloWinProb(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

// ─── 5-Stage Monte Carlo ─────────────────────────────────────
function simulateTournament(teams: TeamInput[], numSims = 50_000) {
  const n = teams.length;
  const counts = teams.map(() => ({ groups: 0, quarters: 0, semis: 0, final: 0, win: 0 }));

  for (let s = 0; s < numSims; s++) {
    const wins = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.random() < eloWinProb(teams[i].avgElo, teams[j].avgElo)) wins[i]++;
        else wins[j]++;
      }
    }
    const ranked = teams
      .map((t, i) => ({ i, wins: wins[i], elo: t.avgElo }))
      .sort((a, b) => b.wins - a.wins || b.elo - a.elo);

    // Groups
    const groupAdv = Math.min(n, Math.max(4, Math.ceil(n / 2)));
    for (let r = 0; r < groupAdv; r++) counts[ranked[r].i].groups++;

    // QF
    const qfCount = Math.min(8, n);
    let qfWinners: number[] = [];
    if (qfCount >= 5) {
      const slots = ranked.slice(0, qfCount).map(r => r.i);
      for (let q = 0; q < Math.floor(qfCount / 2); q++) {
        const a = slots[q], b = slots[qfCount - 1 - q];
        const w = Math.random() < eloWinProb(teams[a].avgElo, teams[b].avgElo) ? a : b;
        qfWinners.push(w);
        counts[w].quarters++;
      }
    } else {
      qfWinners = ranked.slice(0, Math.min(4, n)).map(r => r.i);
      qfWinners.forEach(idx => counts[idx].quarters++);
    }

    // SF
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
      sfWinners.forEach(idx => counts[idx].semis++);
    }

    // Final + Winner
    if (sfWinners.length >= 2) {
      const [f1, f2] = sfWinners;
      counts[f1].final++;
      counts[f2].final++;
      const champ = Math.random() < eloWinProb(teams[f1].avgElo, teams[f2].avgElo) ? f1 : f2;
      counts[champ].win++;
    }
  }

  return teams.map((t, i) => ({
    teamId: t.teamId,
    minReliability: t.minReliability,
    groups: counts[i].groups / numSims,
    quarters: counts[i].quarters / numSims,
    semis: counts[i].semis / numSims,
    final: counts[i].final / numSims,
    win: counts[i].win / numSims,
  }));
}

// ─── Odds computation with depth bonus ───────────────────────
function computeOdds(
  rawTrueProb: number,
  reliabilityFactor: number,
  tiers: TierConfig[],
  maxPayoutPts: number,
  maxStakePts: number,
  totalPlayers: number,
  houseReservePts: number,
  riskThreshold: number,
  closeThreshold: number,
  depth: number,
) {
  const trueProb = applyReliabilityToProb(rawTrueProb, reliabilityFactor);
  const tier = tiers.find((t) => trueProb >= t.minProb) ?? tiers[tiers.length - 1];
  const houseProb = trueProb * tier.k;

  if (houseProb >= 0.98) {
    return {
      tierLabel: tier.label, kFactor: tier.k, houseProbability: houseProb,
      oddsMultiplier: 0, isCapped: false, isOffered: false,
      worstCasePayout: 0, lineStatus: "open" as const,
      rawTrueProb, adjustedTrueProb: trueProb, reliabilityFactor, stageDepth: depth,
    };
  }

  const clampedHouseProb = Math.min(houseProb, 0.98);
  const naturalMult = 1 / clampedHouseProb;
  const depthBoosted = naturalMult * stageDepthBonus(depth);
  const multiplier = Math.min(depthBoosted, tier.maxMult);
  const isCapped = depthBoosted > tier.maxMult;
  const worstCasePayout = totalPlayers * Math.min(maxStakePts * multiplier, maxPayoutPts);

  let lineStatus: "open" | "risk" | "closed" = "open";
  if (worstCasePayout >= houseReservePts * closeThreshold) lineStatus = "closed";
  else if (worstCasePayout >= houseReservePts * riskThreshold) lineStatus = "risk";

  return {
    tierLabel: tier.label, kFactor: tier.k, houseProbability: clampedHouseProb,
    oddsMultiplier: multiplier, isCapped, isOffered: true,
    worstCasePayout, lineStatus,
    rawTrueProb, adjustedTrueProb: trueProb, reliabilityFactor, stageDepth: depth,
  };
}

// ─── Enforce progression ─────────────────────────────────────
function enforceStageProgression(rows: any[]) {
  rows.sort((a: any, b: any) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
  let prevMult = 0;
  for (const row of rows) {
    if (!row.is_offered) continue;
    const minReq = prevMult > 0 ? prevMult * MIN_STAGE_JUMP : 0;
    if (row.odds_multiplier < minReq) {
      row.odds_multiplier = Math.round(minReq * 100) / 100;
    }
    prevMult = row.odds_multiplier;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { tournamentId } = await req.json();

    const { data: config } = await supabase
      .from("tournament_bet_config")
      .select("*")
      .eq("tournament_id", tournamentId)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ error: "No bet config found" }), { status: 404, headers: corsHeaders });
    }

    const { data: teams } = await supabase
      .from("tournament_teams")
      .select("id, player1_id, player2_id")
      .eq("tournament_id", tournamentId);

    if (!teams?.length) {
      return new Response(JSON.stringify({ error: "No teams found" }), { status: 404, headers: corsHeaders });
    }

    const playerIds = teams.flatMap((t: any) => [t.player1_id, t.player2_id].filter(Boolean));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, padel_level, reliability_score, total_matches")
      .in("user_id", playerIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    const teamInputs: TeamInput[] = teams.map((t: any) => {
      const members = [t.player1_id, t.player2_id].filter(Boolean);
      const elos = members.map((pid: string) => {
        const lvl = profileMap.get(pid)?.padel_level || 3.0;
        return lvl * 100 + 1000;
      });
      const reliabilityScores = members.map((pid: string) =>
        profileMap.get(pid)?.reliability_score ?? 0
      );
      return {
        teamId: t.id,
        avgElo: elos.reduce((a: number, b: number) => a + b, 0) / elos.length,
        minReliability: Math.min(...reliabilityScores),
      };
    });

    const simResults = simulateTournament(teamInputs);
    const tiers: TierConfig[] = config.tier_config as TierConfig[];
    const totalPlayers = teams.length;

    const oddsRows: any[] = [];
    for (const sim of simResults) {
      const reliabilityFactor = getReliabilityFactor(sim.minReliability);

      for (const stageKey of STAGE_ORDER) {
        const rawProb = sim[stageKey] ?? 0;
        if (rawProb <= 0) continue; // skip stages with zero probability

        const depth = STAGE_DEPTH[stageKey];
        const odds = computeOdds(
          rawProb, reliabilityFactor, tiers,
          config.max_payout_pts, config.max_stake_per_stage,
          totalPlayers, config.house_reserve_pts,
          config.risk_threshold, config.close_threshold,
          depth
        );

        oddsRows.push({
          tournament_id: tournamentId,
          team_id: sim.teamId,
          stage: stageKey,
          true_probability: odds.adjustedTrueProb,
          raw_true_probability: odds.rawTrueProb,
          reliability_factor: odds.reliabilityFactor,
          tier_label: odds.tierLabel,
          k_factor: odds.kFactor,
          house_probability: odds.houseProbability,
          odds_multiplier: odds.oddsMultiplier,
          is_capped: odds.isCapped,
          is_offered: odds.isOffered,
          worst_case_payout_pts: Math.floor(odds.worstCasePayout),
          line_status: odds.lineStatus,
          computed_at: new Date().toISOString(),
        });
      }
    }

    // Enforce progression per team
    const teamIds = [...new Set(oddsRows.map((r: any) => r.team_id))];
    for (const tid of teamIds) {
      const teamRows = oddsRows.filter((r: any) => r.team_id === tid);
      enforceStageProgression(teamRows);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: upsertError } = await serviceClient
      .from("tournament_bet_odds")
      .upsert(oddsRows, { onConflict: "tournament_id,team_id,stage" });

    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, odds: oddsRows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
