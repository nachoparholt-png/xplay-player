import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { match_id, action } = await req.json();

    if (!match_id || !action) {
      return new Response(JSON.stringify({ error: "match_id and action required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Get all active stakes for this match
    const { data: stakes } = await supabase
      .from("match_stakes")
      .select("*")
      .eq("match_id", match_id)
      .eq("status", "active");

    if (!stakes || stakes.length === 0) {
      return new Response(JSON.stringify({ message: "No active stakes to settle" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "confirm_result") {
      // Get the validated submission to determine winner
      const { data: submission } = await supabase
        .from("score_submissions")
        .select("*")
        .eq("match_id", match_id)
        .eq("status", "validated")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .single();

      if (!submission) {
        return new Response(JSON.stringify({ error: "No validated submission found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resultType = submission.result_type;

      if (resultType === "draw") {
        // Refund all stakes
        await refundAllStakes(supabase, stakes);
      } else {
        // Determine winning team: team_a_win or team_b_win
        const winningTeam = resultType === "team_a_win" ? "A" : "B";
        const losingTeam = winningTeam === "A" ? "B" : "A";

        // Settle stakes
        for (const stake of stakes) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("padel_park_points")
            .eq("user_id", stake.user_id)
            .single();

          const currentPoints = profile?.padel_park_points || 0;

          if (stake.team === winningTeam) {
            // Winner: add potential_winnings
            const newBalance = currentPoints + stake.potential_winnings;
            await supabase.from("profiles").update({ padel_park_points: newBalance }).eq("user_id", stake.user_id);
            await supabase.from("points_transactions").insert({
              user_id: stake.user_id,
              amount: stake.potential_winnings,
              balance_before: currentPoints,
              balance_after: newBalance,
              transaction_type: "won",
              related_match_id: match_id,
              related_stake_id: stake.id,
              reason: `Won stake on match - Team ${winningTeam}`,
            });
            await supabase.from("match_stakes").update({ status: "won", settled_at: new Date().toISOString() }).eq("id", stake.id);
          } else {
            // Loser: points already deducted when staked
            await supabase.from("points_transactions").insert({
              user_id: stake.user_id,
              amount: -stake.points_staked,
              balance_before: currentPoints,
              balance_after: currentPoints,
              transaction_type: "lost",
              related_match_id: match_id,
              related_stake_id: stake.id,
              reason: `Lost stake on match - Team ${losingTeam}`,
            });
            await supabase.from("match_stakes").update({ status: "lost", settled_at: new Date().toISOString() }).eq("id", stake.id);
          }
        }
      }

      // Trigger rating calculation
      try {
        const ratingUrl = `${supabaseUrl}/functions/v1/calculate-ratings`;
        await fetch(ratingUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ match_id }),
        });
      } catch (e) {
        // Rating calculation is non-critical, don't fail the settlement
        console.error("Rating calculation failed:", e);
      }

      return new Response(JSON.stringify({ message: "Stakes settled successfully" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "refund_draw") {
      await refundAllStakes(supabase, stakes);
      return new Response(JSON.stringify({ message: "All stakes refunded (draw)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function refundAllStakes(supabase: any, stakes: any[]) {
  for (const stake of stakes) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("padel_park_points")
      .eq("user_id", stake.user_id)
      .single();

    const currentPoints = profile?.padel_park_points || 0;
    const newBalance = currentPoints + stake.points_staked;

    await supabase.from("profiles").update({ padel_park_points: newBalance }).eq("user_id", stake.user_id);
    await supabase.from("points_transactions").insert({
      user_id: stake.user_id,
      amount: stake.points_staked,
      balance_before: currentPoints,
      balance_after: newBalance,
      transaction_type: "refunded",
      related_match_id: stake.match_id,
      related_stake_id: stake.id,
      reason: "Stake refunded - match ended as draw",
    });
    await supabase.from("match_stakes").update({ status: "settled", settled_at: new Date().toISOString() }).eq("id", stake.id);
  }
}
