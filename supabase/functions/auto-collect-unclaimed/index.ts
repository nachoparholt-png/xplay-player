import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find won bets that haven't been collected and are older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: unclaimedBets, error } = await serviceClient
      .from("tournament_bets")
      .select("id, user_id, tournament_id, stake_pts, odds_multiplier, odds_at_placement, pool_bonus_pts, actual_payout_pts")
      .eq("status", "won")
      .is("collected_at", null)
      .eq("auto_collected", false)
      .lt("settled_at", tenMinutesAgo)
      .limit(100);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    let collected = 0;

    for (const bet of (unclaimedBets || [])) {
      const payout = (bet.actual_payout_pts || 0) + (bet.pool_bonus_pts || 0);

      if (payout > 0) {
        // Credit to allocation won_pts (already done at settlement)
        // Mark as auto-collected
        await serviceClient
          .from("tournament_bets")
          .update({
            collected_at: new Date().toISOString(),
            auto_collected: true,
          })
          .eq("id", bet.id);

        collected++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      checked: (unclaimedBets || []).length,
      autoCollected: collected,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
