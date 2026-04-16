import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function eloWinProb(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

function levelToElo(level: number): number {
  return 800 + ((level - 1.0) / 6.0) * 1200;
}

interface TierConfig {
  label: string;
  minProb: number;
  maxProb: number;
  k: number;
  maxMult: number;
}

function getTier(trueProb: number, tiers: TierConfig[]): TierConfig {
  const sorted = [...tiers].sort((a, b) => b.minProb - a.minProb);
  return sorted.find((t) => trueProb >= t.minProb) ?? sorted[sorted.length - 1];
}

function computeSideOdds(trueProb: number, tiers: TierConfig[]) {
  const tier = getTier(trueProb, tiers);
  const houseProb = trueProb * tier.k;
  if (houseProb >= 0.98) return { tier: tier.label, multiplier: 0, isOffered: false };
  const clamped = Math.min(houseProb, 0.98);
  const natural = 1 / clamped;
  const mult = Math.min(natural, tier.maxMult);
  return { tier: tier.label, multiplier: parseFloat(mult.toFixed(2)), isOffered: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { match_id } = await req.json();
    if (!match_id) {
      return new Response(JSON.stringify({ error: "match_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if market already exists
    const { data: existing } = await supabase
      .from("match_bet_markets")
      .select("id")
      .eq("match_id", match_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Market already exists", market_id: existing.id }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch config
    const { data: configRow } = await supabase
      .from("match_bet_config")
      .select("*")
      .limit(1)
      .single();

    if (!configRow || !configRow.enabled) {
      return new Response(JSON.stringify({ error: "Betting is disabled" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch match players with profiles
    const { data: players } = await supabase
      .from("match_players")
      .select("team, user_id")
      .eq("match_id", match_id)
      .eq("status", "confirmed");

    const userIds = (players || []).map((p: any) => p.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, padel_level")
      .in("user_id", userIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.padel_level ?? 3.5]));

    const teamALevels: number[] = [];
    const teamBLevels: number[] = [];
    for (const p of players || []) {
      const level = profileMap.get(p.user_id) ?? 3.5;
      if (p.team === "A" || p.team === "team_a") teamALevels.push(level);
      else if (p.team === "B" || p.team === "team_b") teamBLevels.push(level);
    }

    const avgA = teamALevels.length > 0 ? teamALevels.reduce((s, l) => s + l, 0) / teamALevels.length : 3.5;
    const avgB = teamBLevels.length > 0 ? teamBLevels.reduce((s, l) => s + l, 0) / teamBLevels.length : 3.5;

    const eloA = levelToElo(avgA);
    const eloB = levelToElo(avgB);
    const probA = eloWinProb(eloA, eloB);
    const probB = 1 - probA;

    const tiers = configRow.tier_config as TierConfig[];
    const oddsA = computeSideOdds(probA, tiers);
    const oddsB = computeSideOdds(probB, tiers);

    const hasBothTeams = teamALevels.length > 0 && teamBLevels.length > 0;
    const isFull = (players || []).length >= 4; // Default padel match size

    const phase = !hasBothTeams ? "pending_opponents" : isFull ? "locked" : "open_dynamic";

    const { data: market, error: insertError } = await supabase
      .from("match_bet_markets")
      .insert({
        match_id,
        team_a_elo: parseFloat(eloA.toFixed(1)),
        team_b_elo: parseFloat(eloB.toFixed(1)),
        team_a_true_prob: parseFloat(probA.toFixed(4)),
        team_b_true_prob: parseFloat(probB.toFixed(4)),
        team_a_multiplier: oddsA.multiplier,
        team_b_multiplier: oddsB.multiplier,
        team_a_tier: oddsA.tier,
        team_b_tier: oddsB.tier,
        team_a_line_status: "open",
        team_b_line_status: "open",
        config_snapshot: configRow,
        phase,
        pot_share_pct: configRow.pot_share_pct ?? 0.10,
        factor_locked: isFull,
        factor_locked_at: isFull ? new Date().toISOString() : null,
        team_a_final_multiplier: isFull ? oddsA.multiplier : null,
        team_b_final_multiplier: isFull ? oddsB.multiplier : null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ market }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
