import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Settings {
  [key: string]: string;
}

async function loadSettings(supabase: any): Promise<Settings> {
  const { data } = await supabase.from("app_settings").select("key, value");
  const settings: Settings = {};
  if (data) data.forEach((r: any) => { settings[r.key] = r.value; });
  return settings;
}

function num(settings: Settings, key: string, fallback: number): number {
  const v = parseFloat(settings[key]);
  return isNaN(v) ? fallback : v;
}

function bool(settings: Settings, key: string, fallback: boolean): boolean {
  if (!(key in settings)) return fallback;
  return settings[key] === "true";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { match_id } = await req.json();
    if (!match_id) {
      return new Response(JSON.stringify({ error: "match_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settings = await loadSettings(supabase);

    // Get match
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("*")
      .eq("id", match_id)
      .single();

    if (matchError || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if match type is ranked
    const rankedTypes = (settings.ranked_match_types || "competitive,americana").split(",").map((s: string) => s.trim());
    if (!rankedTypes.includes(match.format)) {
      return new Response(JSON.stringify({ message: "Match format not ranked, skipping rating update" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check auto-closed
    if (match.status === "auto_closed" && !bool(settings, "allow_level_change_on_auto_closed_match", false)) {
      return new Response(JSON.stringify({ message: "Auto-closed matches don't affect rating" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get validated score submission
    const { data: submission } = await supabase
      .from("score_submissions")
      .select("*")
      .eq("match_id", match_id)
      .eq("status", "validated")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .single();

    if (!submission) {
      return new Response(JSON.stringify({ error: "No validated score submission" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resultType = submission.result_type; // team_a_win, team_b_win, draw

    // Check draw config
    if (resultType === "draw" && !bool(settings, "allow_level_change_on_draw", true)) {
      return new Response(JSON.stringify({ message: "Draws don't affect rating (disabled)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get match players with teams and profiles
    const { data: matchPlayers } = await supabase
      .from("match_players")
      .select("user_id, team")
      .eq("match_id", match_id)
      .eq("status", "confirmed");

    if (!matchPlayers || matchPlayers.length < 2) {
      return new Response(JSON.stringify({ error: "Not enough players" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get profiles for all players
    const userIds = matchPlayers.map((p: any) => p.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, padel_level, reliability_score, rating_matches_counted")
      .in("user_id", userIds);

    if (!profiles) {
      return new Response(JSON.stringify({ error: "Could not load profiles" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profileMap: Record<string, any> = {};
    profiles.forEach((p: any) => { profileMap[p.user_id] = p; });

    // Split into teams
    const teamA = matchPlayers.filter((p: any) => p.team === "A");
    const teamB = matchPlayers.filter((p: any) => p.team === "B");

    if (teamA.length === 0 || teamB.length === 0) {
      return new Response(JSON.stringify({ error: "Both teams must have players" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const defaultLevel = num(settings, "default_initial_level", 2.0);

    // Calculate team averages
    const getTeamAvg = (team: any[]) => {
      const levels = team.map((p: any) => profileMap[p.user_id]?.padel_level || defaultLevel);
      return levels.reduce((a: number, b: number) => a + b, 0) / levels.length;
    };

    const teamAAvg = getTeamAvg(teamA);
    const teamBAvg = getTeamAvg(teamB);

    // Config values
    const ratingDivisor = num(settings, "rating_divisor", 400);
    const baseK = num(settings, "base_k_factor", 0.5);
    const matchWeight = num(settings, "match_weight_default", 1.0);
    const maxChange = num(settings, "max_level_change_per_match", 0.5);
    const minChange = num(settings, "min_level_change_per_match", 0.01);
    const winValue = num(settings, "win_value", 1.0);
    const drawValue = num(settings, "draw_value", 0.5);
    const lossValue = num(settings, "loss_value", 0.0);
    const provisionalCount = num(settings, "provisional_match_count", 10);
    const provisionalKMult = num(settings, "provisional_k_multiplier", 2.0);
    const lowThresh = num(settings, "low_reliability_threshold", 30);
    const medThresh = num(settings, "medium_reliability_threshold", 60);
    const lowMult = num(settings, "low_reliability_multiplier", 1.5);
    const medMult = num(settings, "medium_reliability_multiplier", 1.0);
    const highMult = num(settings, "high_reliability_multiplier", 0.8);
    const reliabilityIncrease = num(settings, "reliability_increase_per_match", 3);
    const reliabilityMax = num(settings, "reliability_max_value", 100);
    const levelFloor = num(settings, "level_floor", 0.0);
    const levelCeiling = num(settings, "level_ceiling", 7.0);
    const enableRepeat = bool(settings, "enable_repeated_match_reduction", true);
    const repeatWindowDays = num(settings, "repeated_match_window_days", 30);
    const repeat2Mult = num(settings, "repeat_match_2_multiplier", 0.7);
    const repeat3Mult = num(settings, "repeat_match_3_multiplier", 0.4);
    const repeat4Mult = num(settings, "repeat_match_4_plus_multiplier", 0.2);

    const results: any[] = [];

    // Process each player
    const allPlayers = [...teamA.map((p: any) => ({ ...p, teamAvg: teamAAvg, oppAvg: teamBAvg, team: "A" })),
                        ...teamB.map((p: any) => ({ ...p, teamAvg: teamBAvg, oppAvg: teamAAvg, team: "B" }))];

    for (const player of allPlayers) {
      const profile = profileMap[player.user_id];
      if (!profile) continue;

      const oldLevel = profile.padel_level || defaultLevel;
      const reliability = profile.reliability_score || 30;
      const matchesCounted = profile.rating_matches_counted || 0;
      const isProvisional = matchesCounted < provisionalCount;

      // Determine actual result for this player
      let actualResult: number;
      if (resultType === "draw") {
        actualResult = drawValue;
      } else if ((resultType === "team_a_win" && player.team === "A") ||
                 (resultType === "team_b_win" && player.team === "B")) {
        actualResult = winValue;
      } else {
        actualResult = lossValue;
      }

      // Expected result (Elo formula)
      const expectedResult = 1 / (1 + Math.pow(10, (player.oppAvg - player.teamAvg) / ratingDivisor));

      // Reliability multiplier
      let reliabilityMult: number;
      if (reliability < lowThresh) reliabilityMult = lowMult;
      else if (reliability < medThresh) reliabilityMult = medMult;
      else reliabilityMult = highMult;

      // Provisional multiplier
      const provMult = isProvisional ? provisionalKMult : 1.0;

      // Repeated opponent check
      let repeatMult = 1.0;
      if (enableRepeat) {
        const windowDate = new Date();
        windowDate.setDate(windowDate.getDate() - repeatWindowDays);

        // Find opponents
        const opponents = player.team === "A"
          ? teamB.map((p: any) => p.user_id)
          : teamA.map((p: any) => p.user_id);

        // Count recent matches against same opponents
        const { data: recentHistory } = await supabase
          .from("rating_history")
          .select("match_id")
          .eq("user_id", player.user_id)
          .gte("created_at", windowDate.toISOString());

        if (recentHistory && recentHistory.length > 0) {
          const recentMatchIds = recentHistory.map((r: any) => r.match_id).filter(Boolean);

          if (recentMatchIds.length > 0) {
            const { data: recentOpponents } = await supabase
              .from("match_players")
              .select("user_id, match_id")
              .in("match_id", recentMatchIds)
              .in("user_id", opponents);

            const matchCount = recentOpponents
              ? new Set(recentOpponents.map((r: any) => r.match_id)).size
              : 0;

            if (matchCount >= 3) repeatMult = repeat4Mult;
            else if (matchCount === 2) repeatMult = repeat3Mult;
            else if (matchCount === 1) repeatMult = repeat2Mult;
          }
        }
      }

      // Calculate level change
      const kFactor = baseK * reliabilityMult * provMult * matchWeight * repeatMult;
      let levelChange = kFactor * (actualResult - expectedResult);

      // Clamp
      if (Math.abs(levelChange) > maxChange) levelChange = Math.sign(levelChange) * maxChange;
      if (Math.abs(levelChange) < minChange && levelChange !== 0) levelChange = Math.sign(levelChange) * minChange;

      let newLevel = oldLevel + levelChange;
      newLevel = Math.max(levelFloor, Math.min(levelCeiling, newLevel));
      // Round to internal precision
      newLevel = Math.round(newLevel * 100) / 100;

      const newReliability = Math.min(reliabilityMax, reliability + reliabilityIncrease);

      // Update profile
      await supabase
        .from("profiles")
        .update({
          padel_level: newLevel,
          reliability_score: newReliability,
          rating_matches_counted: matchesCounted + 1,
        })
        .eq("user_id", player.user_id);

      // Insert rating history
      await supabase.from("rating_history").insert({
        user_id: player.user_id,
        match_id: match_id,
        old_level: oldLevel,
        new_level: newLevel,
        level_change: Math.round(levelChange * 1000) / 1000,
        k_factor: Math.round(kFactor * 1000) / 1000,
        reliability_before: reliability,
        reliability_after: newReliability,
        expected_result: Math.round(expectedResult * 10000) / 10000,
        actual_result: actualResult,
        team_avg_level: Math.round(player.teamAvg * 100) / 100,
        opponent_avg_level: Math.round(player.oppAvg * 100) / 100,
        repeat_match_multiplier: repeatMult,
        provisional: isProvisional,
      });

      results.push({
        user_id: player.user_id,
        old_level: oldLevel,
        new_level: newLevel,
        level_change: Math.round(levelChange * 1000) / 1000,
        provisional: isProvisional,
      });
    }

    return new Response(JSON.stringify({ message: "Ratings updated", results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
