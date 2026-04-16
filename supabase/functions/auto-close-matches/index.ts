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

    const now = new Date().toISOString();

    // Find all matches past their 24hr deadline that haven't been resolved
    const { data: expiredMatches } = await supabase
      .from("matches")
      .select("id, status, deadline_at")
      .in("status", ["awaiting_score", "score_submitted", "pending_review", "review_requested"])
      .not("deadline_at", "is", null)
      .lt("deadline_at", now);

    if (!expiredMatches || expiredMatches.length === 0) {
      return new Response(JSON.stringify({ message: "No expired matches to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const match of expiredMatches) {
      // Update match status to auto_closed
      await supabase.from("matches").update({ status: "auto_closed" }).eq("id", match.id);

      // Mark any pending submissions as superseded
      await supabase
        .from("score_submissions")
        .update({ status: "superseded" })
        .eq("match_id", match.id)
        .eq("status", "pending");

      // Refund all active stakes (old system)
      const { data: stakes } = await supabase
        .from("match_stakes")
        .select("*")
        .eq("match_id", match.id)
        .eq("status", "active");

      if (stakes && stakes.length > 0) {
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
            related_match_id: match.id,
            related_stake_id: stake.id,
            reason: "Auto-closed after 24 hours without agreement",
          });
          await supabase.from("match_stakes").update({ status: "settled", settled_at: now }).eq("id", stake.id);
        }
      }

      // Close any open match_bet_markets (v2 system)
      await supabase
        .from("match_bet_markets")
        .update({ status: "closed" })
        .eq("match_id", match.id)
        .eq("status", "open");

      // Refund all active v2 bets
      const { data: v2Bets } = await supabase
        .from("match_bets")
        .select("*")
        .eq("match_id", match.id)
        .eq("status", "active");

      if (v2Bets && v2Bets.length > 0) {
        for (const bet of v2Bets) {
          await supabase.rpc("credit_points", { p_user_id: bet.user_id, p_amount: bet.stake_pts });

          const { data: prof } = await supabase
            .from("profiles")
            .select("padel_park_points")
            .eq("user_id", bet.user_id)
            .single();

          await supabase.from("points_transactions").insert({
            user_id: bet.user_id,
            amount: bet.stake_pts,
            balance_before: (prof?.padel_park_points || 0) - bet.stake_pts,
            balance_after: prof?.padel_park_points || 0,
            transaction_type: "refunded",
            related_match_id: match.id,
            reason: "Auto-closed — bet refunded",
          });

          await supabase.from("match_bets").update({ status: "refunded", actual_payout_pts: bet.stake_pts, settled_at: now }).eq("id", bet.id);
        }
      }

      results.push({ match_id: match.id, stakes_refunded: (stakes?.length || 0) + (v2Bets?.length || 0) });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
