import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function levelToElo(level: number): number {
  return 800 + ((level - 1.0) / 6.0) * 1200;
}

function eloWinProb(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
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

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { match_id } = await req.json();
    if (!match_id) return json({ error: "match_id required" }, 400);

    // Get or create market
    let { data: market } = await serviceClient
      .from("match_bet_markets")
      .select("*")
      .eq("match_id", match_id)
      .maybeSingle();

    // Fetch match info
    const { data: match } = await serviceClient
      .from("matches")
      .select("format, max_players")
      .eq("id", match_id)
      .single();

    if (!match) return json({ error: "Match not found" }, 404);
    if (match.format === "social") return json({ skipped: true, reason: "social match" });

    // Fetch config
    const { data: config } = await serviceClient
      .from("match_bet_config")
      .select("*")
      .limit(1)
      .single();

    if (!config || !config.enabled) return json({ skipped: true, reason: "betting disabled" });

    // Fetch confirmed players with profiles
    const { data: players } = await serviceClient
      .from("match_players")
      .select("team, user_id")
      .eq("match_id", match_id)
      .eq("status", "confirmed");

    const userIds = (players || []).map((p: any) => p.user_id);
    const { data: profiles } = userIds.length > 0
      ? await serviceClient.from("profiles").select("user_id, padel_level").in("user_id", userIds)
      : { data: [] };

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.padel_level ?? 3.5]));

    const teamAPlayers = (players || []).filter((p: any) => p.team === "team_a" || p.team === "A");
    const teamBPlayers = (players || []).filter((p: any) => p.team === "team_b" || p.team === "B");

    const teamALevels = teamAPlayers.map((p: any) => profileMap.get(p.user_id) ?? 3.5);
    const teamBLevels = teamBPlayers.map((p: any) => profileMap.get(p.user_id) ?? 3.5);

    const hasBothTeams = teamALevels.length > 0 && teamBLevels.length > 0;
    const isFull = (players || []).length >= match.max_players;

    const tiers = config.tier_config as TierConfig[];

    let updateData: any = {};

    if (hasBothTeams) {
      const avgA = teamALevels.reduce((s: number, l: number) => s + l, 0) / teamALevels.length;
      const avgB = teamBLevels.reduce((s: number, l: number) => s + l, 0) / teamBLevels.length;
      const eloA = levelToElo(avgA);
      const eloB = levelToElo(avgB);
      const probA = eloWinProb(eloA, eloB);
      const probB = 1 - probA;

      const oddsA = computeSideOdds(probA, tiers);
      const oddsB = computeSideOdds(probB, tiers);

      updateData = {
        team_a_elo: parseFloat(eloA.toFixed(1)),
        team_b_elo: parseFloat(eloB.toFixed(1)),
        team_a_true_prob: parseFloat(probA.toFixed(4)),
        team_b_true_prob: parseFloat(probB.toFixed(4)),
        team_a_multiplier: oddsA.multiplier,
        team_b_multiplier: oddsB.multiplier,
        team_a_tier: oddsA.tier,
        team_b_tier: oddsB.tier,
        phase: isFull ? "locked" : "open_dynamic",
      };

      if (isFull) {
        updateData.factor_locked = true;
        updateData.factor_locked_at = new Date().toISOString();
        updateData.team_a_final_multiplier = oddsA.multiplier;
        updateData.team_b_final_multiplier = oddsB.multiplier;
      } else {
        updateData.factor_locked = false;
        updateData.factor_locked_at = null;
        updateData.team_a_final_multiplier = null;
        updateData.team_b_final_multiplier = null;
      }
    } else {
      updateData = {
        team_a_multiplier: 1.0,
        team_b_multiplier: 1.0,
        phase: "pending_opponents",
        factor_locked: false,
        factor_locked_at: null,
        team_a_final_multiplier: null,
        team_b_final_multiplier: null,
      };
    }

    if (!market) {
      // Create market
      const { data: newMarket, error: insertError } = await serviceClient
        .from("match_bet_markets")
        .insert({
          match_id,
          ...updateData,
          pot_share_pct: config.pot_share_pct ?? 0.10,
          config_snapshot: config,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return json({ market: newMarket, created: true });
    }

    // Don't update if already settled or factor already locked
    if (market.status === "settled") return json({ skipped: true, reason: "already settled" });

    const { data: updated, error: updateError } = await serviceClient
      .from("match_bet_markets")
      .update(updateData)
      .eq("id", market.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return json({ market: updated, updated: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
