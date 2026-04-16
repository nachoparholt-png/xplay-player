import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getReliabilityFactor(score: number): number {
  if (score < 30) return 0.33;
  if (score < 60) return 0.67;
  return 1.0;
}

function applyReliabilityToProb(rawProb: number, factor: number): number {
  return rawProb * factor + 0.5 * (1 - factor);
}

function eloWinProb(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

interface TournamentPhase { key: string; label: string; advanceCount: number }
interface TeamInput { teamId: string; avgElo: number; minReliability: number }
interface TierConfig { label: string; minProb: number; maxProb: number; k: number; maxMult: number }

const DEFAULT_PHASES: TournamentPhase[] = [
  { key: "groups", label: "Groups", advanceCount: 8 },
  { key: "quarters", label: "Quarter-Finals", advanceCount: 4 },
  { key: "semis", label: "Semi-Finals", advanceCount: 4 },
  { key: "final", label: "Final", advanceCount: 2 },
  { key: "win", label: "Winner", advanceCount: 1 },
];

const DEFAULT_TIERS: TierConfig[] = [
  { label: "T1", minProb: 0.70, maxProb: 1.00, k: 1.10, maxMult: 1.80 },
  { label: "T2", minProb: 0.55, maxProb: 0.70, k: 1.18, maxMult: 2.50 },
  { label: "T3", minProb: 0.40, maxProb: 0.55, k: 1.25, maxMult: 4.00 },
  { label: "T4", minProb: 0.25, maxProb: 0.40, k: 1.35, maxMult: 6.00 },
  { label: "T5", minProb: 0.12, maxProb: 0.25, k: 1.50, maxMult: 10.00 },
  { label: "T6", minProb: 0.00, maxProb: 0.12, k: 1.70, maxMult: 15.00 },
];

const STAGE_DEPTH_PREMIUM = 0.12;
const MIN_STAGE_JUMP = 0.30;

function simulateTournament(teams: TeamInput[], phases: TournamentPhase[], numSims = 50_000) {
  const n = teams.length;
  const sortedPhases = [...phases].sort((a, b) => b.advanceCount - a.advanceCount);
  const counts = teams.map(() => {
    const m: Record<string, number> = {};
    for (const p of sortedPhases) m[p.key] = 0;
    return m;
  });

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

    for (const phase of sortedPhases) {
      const advCount = Math.min(phase.advanceCount, n);
      if (phase.advanceCount === 1) {
        const top = Math.min(4, n);
        if (top >= 4) {
          const [s1, s2, s3, s4] = ranked.slice(0, 4).map(r => r.i);
          const w14 = Math.random() < eloWinProb(teams[s1].avgElo, teams[s4].avgElo) ? s1 : s4;
          const w23 = Math.random() < eloWinProb(teams[s2].avgElo, teams[s3].avgElo) ? s2 : s3;
          const champ = Math.random() < eloWinProb(teams[w14].avgElo, teams[w23].avgElo) ? w14 : w23;
          counts[champ][phase.key]++;
        } else if (top >= 2) {
          const [f1, f2] = ranked.slice(0, 2).map(r => r.i);
          const champ = Math.random() < eloWinProb(teams[f1].avgElo, teams[f2].avgElo) ? f1 : f2;
          counts[champ][phase.key]++;
        }
      } else if (phase.advanceCount === 2) {
        const top = Math.min(4, n);
        if (top >= 4) {
          const [s1, s2, s3, s4] = ranked.slice(0, 4).map(r => r.i);
          const w14 = Math.random() < eloWinProb(teams[s1].avgElo, teams[s4].avgElo) ? s1 : s4;
          const w23 = Math.random() < eloWinProb(teams[s2].avgElo, teams[s3].avgElo) ? s2 : s3;
          counts[w14][phase.key]++;
          counts[w23][phase.key]++;
        } else if (top >= 2) {
          ranked.slice(0, 2).forEach(r => counts[r.i][phase.key]++);
        }
      } else {
        ranked.slice(0, advCount).forEach(r => counts[r.i][phase.key]++);
      }
    }
  }

  return teams.map((t, i) => {
    const phaseProbs: Record<string, number> = {};
    for (const p of sortedPhases) phaseProbs[p.key] = counts[i][p.key] / numSims;
    return { teamId: t.teamId, phases: phaseProbs, minReliability: t.minReliability };
  });
}

function computeOdds(
  rawTrueProb: number, reliabilityFactor: number, tiers: TierConfig[],
  maxPayoutPts: number, maxStakePts: number, totalPlayers: number,
  houseReservePts: number, riskThreshold: number, closeThreshold: number,
  stageDepth: number,
) {
  const trueProb = applyReliabilityToProb(rawTrueProb, reliabilityFactor);
  const tier = tiers.find(t => trueProb >= t.minProb) ?? tiers[tiers.length - 1];
  const houseProb = trueProb * tier.k;

  if (houseProb >= 0.98) {
    return {
      tierLabel: tier.label, houseProbability: houseProb, oddsMultiplier: 0,
      isCapped: false, isOffered: false, lineStatus: "open" as const,
      rawTrueProb, adjustedTrueProb: trueProb, reliabilityFactor,
    };
  }

  const clampedHouseProb = Math.min(houseProb, 0.98);
  let naturalMult = 1 / clampedHouseProb;
  
  // Apply stage-depth premium
  naturalMult *= (1 + STAGE_DEPTH_PREMIUM * stageDepth);
  
  const multiplier = Math.min(naturalMult, tier.maxMult);
  const isCapped = naturalMult > tier.maxMult;
  const worstCasePayout = totalPlayers * Math.min(maxStakePts * multiplier, maxPayoutPts);

  let lineStatus: "open" | "risk" | "closed" = "open";
  if (worstCasePayout >= houseReservePts * closeThreshold) lineStatus = "closed";
  else if (worstCasePayout >= houseReservePts * riskThreshold) lineStatus = "risk";

  return {
    tierLabel: tier.label, houseProbability: clampedHouseProb, oddsMultiplier: multiplier,
    isCapped, isOffered: true, lineStatus,
    rawTrueProb, adjustedTrueProb: trueProb, reliabilityFactor,
  };
}

function enforceStageProgression(oddsRows: any[], phases: TournamentPhase[]) {
  // Group by team, ensure each successive stage has at least MIN_STAGE_JUMP higher multiplier
  const teamIds = [...new Set(oddsRows.map(r => r.team_id))];
  const phaseOrder = phases.map(p => p.key);

  for (const teamId of teamIds) {
    const teamOdds = oddsRows
      .filter(r => r.team_id === teamId)
      .sort((a, b) => phaseOrder.indexOf(a.stage) - phaseOrder.indexOf(b.stage));

    for (let i = 1; i < teamOdds.length; i++) {
      const prevMult = teamOdds[i - 1].odds_multiplier;
      const minRequired = prevMult * (1 + MIN_STAGE_JUMP);
      if (teamOdds[i].odds_multiplier < minRequired) {
        teamOdds[i].odds_multiplier = Math.round(minRequired * 100) / 100;
      }
    }
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
    if (!tournamentId) {
      return new Response(JSON.stringify({ error: "tournamentId required" }), { status: 400, headers: corsHeaders });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get tournament info
    const { data: tournament } = await serviceClient
      .from("tournaments")
      .select("id, name, player_count, format_type, status, skill_level_min, skill_level_max")
      .eq("id", tournamentId)
      .single();

    if (!tournament) {
      return new Response(JSON.stringify({ error: "Tournament not found" }), { status: 404, headers: corsHeaders });
    }

    // Get or create bet config
    let { data: config } = await serviceClient
      .from("tournament_bet_config")
      .select("*")
      .eq("tournament_id", tournamentId)
      .maybeSingle();

    if (!config) {
      const { data: newConfig, error: createErr } = await serviceClient
        .from("tournament_bet_config")
        .insert({
          tournament_id: tournamentId,
          max_stake_per_stage: 500,
          max_payout_pts: 5000,
          house_reserve_pts: 50000,
          risk_threshold: 0.60,
          close_threshold: 0.85,
          tier_config: DEFAULT_TIERS,
          odds_locked: false,
        })
        .select()
        .single();

      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), { status: 500, headers: corsHeaders });
      }
      config = newConfig;
    }

    // Get teams
    const { data: teams } = await serviceClient
      .from("tournament_teams")
      .select("id, player1_id, player2_id")
      .eq("tournament_id", tournamentId);

    // Get confirmed player count
    const { data: confirmedPlayers } = await serviceClient
      .from("tournament_players")
      .select("user_id")
      .eq("tournament_id", tournamentId)
      .eq("status", "confirmed");

    const confirmedCount = confirmedPlayers?.length ?? 0;
    const isFull = confirmedCount >= tournament.player_count;

    // Compute midpoint ELO from skill range for estimated fill
    const skillMin = (tournament as any).skill_level_min ?? 2.0;
    const skillMax = (tournament as any).skill_level_max ?? 5.0;
    const midpointElo = ((skillMin + skillMax) / 2) * 100 + 1000;

    // If no teams yet, create placeholder odds
    if (!teams?.length) {
      const phases = DEFAULT_PHASES;
      for (const phase of phases) {
        await serviceClient
          .from("tournament_bet_windows")
          .upsert({
            tournament_id: tournamentId,
            stage: phase.key,
            status: "open",
          }, { onConflict: "tournament_id,stage" });
      }

      return new Response(JSON.stringify({
        success: true,
        odds: [],
        oddsLocked: false,
        estimated: true,
        message: "No teams yet — windows created, odds will compute when teams form",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get profiles for ELO — blend with midpoint for empty slots
    const playerIds = teams.flatMap((t: any) => [t.player1_id, t.player2_id].filter(Boolean));
    const { data: profiles } = await serviceClient
      .from("profiles")
      .select("user_id, padel_level, reliability_score")
      .in("user_id", playerIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    const teamInputs: TeamInput[] = teams.map((t: any) => {
      const members = [t.player1_id, t.player2_id].filter(Boolean);
      const elos = members.map((pid: string) => {
        const profile = profileMap.get(pid);
        if (profile?.padel_level) {
          return profile.padel_level * 100 + 1000;
        }
        return midpointElo; // Fill with midpoint for missing profiles
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

    const phases = DEFAULT_PHASES;
    const tiers: TierConfig[] = (config.tier_config as TierConfig[]) || DEFAULT_TIERS;

    const simResults = simulateTournament(teamInputs, phases);

    const oddsRows: any[] = [];
    for (const sim of simResults) {
      const reliabilityFactor = getReliabilityFactor(sim.minReliability);
      for (let pi = 0; pi < phases.length; pi++) {
        const phase = phases[pi];
        const rawProb = sim.phases[phase.key] ?? 0;
        const odds = computeOdds(
          rawProb, reliabilityFactor, tiers,
          config.max_payout_pts, config.max_stake_per_stage,
          teams.length, config.house_reserve_pts,
          config.risk_threshold, config.close_threshold,
          pi, // stageDepth
        );

        oddsRows.push({
          tournament_id: tournamentId,
          team_id: sim.teamId,
          stage: phase.key,
          true_probability: odds.adjustedTrueProb,
          raw_true_probability: odds.rawTrueProb,
          reliability_factor: odds.reliabilityFactor,
          tier_label: odds.tierLabel,
          house_probability: odds.houseProbability,
          odds_multiplier: odds.oddsMultiplier,
          is_capped: odds.isCapped,
          is_offered: odds.isOffered,
          worst_case_payout_pts: 0,
          line_status: odds.lineStatus,
          computed_at: new Date().toISOString(),
          estimated: !isFull,
        });
      }
    }

    // Enforce minimum stage progression
    enforceStageProgression(oddsRows, phases);

    // Upsert odds
    await serviceClient
      .from("tournament_bet_odds")
      .upsert(oddsRows, { onConflict: "tournament_id,team_id,stage" });

    // Ensure windows exist
    for (const phase of phases) {
      await serviceClient
        .from("tournament_bet_windows")
        .upsert({
          tournament_id: tournamentId,
          stage: phase.key,
          status: "open",
        }, { onConflict: "tournament_id,stage" });
    }

    // Check if odds should be locked
    const wasLocked = config.odds_locked;
    if (isFull && !wasLocked) {
      await serviceClient
        .from("tournament_bet_config")
        .update({ odds_locked: true })
        .eq("tournament_id", tournamentId);

      const playerUserIds = confirmedPlayers?.map((p: any) => p.user_id) || [];
      for (const uid of playerUserIds) {
        await serviceClient.rpc("create_notification_for_user", {
          _user_id: uid,
          _type: "tournament",
          _title: "Final Odds Ready! 🎯",
          _body: `Multipliers for "${tournament.name}" are now locked. Place your bets!`,
          _link: `/tournaments/${tournamentId}`,
        });
      }
    } else if (!isFull && wasLocked) {
      await serviceClient
        .from("tournament_bet_config")
        .update({ odds_locked: false })
        .eq("tournament_id", tournamentId);
    }

    return new Response(JSON.stringify({
      success: true,
      odds: oddsRows,
      oddsLocked: isFull,
      estimated: !isFull,
      confirmedCount,
      playerCount: tournament.player_count,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
