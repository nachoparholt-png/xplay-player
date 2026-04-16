import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { action, bet_id, additional_stake } = await req.json();
    if (!action || !bet_id) return json({ error: "action and bet_id required" }, 400);
    if (!["cancel", "increase"].includes(action)) return json({ error: "action must be cancel or increase" }, 400);

    // Fetch bet
    const { data: bet } = await serviceClient
      .from("match_bets")
      .select("*")
      .eq("id", bet_id)
      .eq("user_id", userId)
      .single();

    if (!bet) return json({ error: "Bet not found" }, 404);
    if (bet.status !== "active") return json({ error: "Only active bets can be modified" }, 400);

    // Fetch market
    const { data: market } = await serviceClient
      .from("match_bet_markets")
      .select("*")
      .eq("id", bet.market_id)
      .single();

    if (!market) return json({ error: "Market not found" }, 404);
    if (market.status !== "open") return json({ error: "Market is closed" }, 400);
    if (market.phase === "settled") return json({ error: "Market is settled" }, 400);

    // Check betting isn't time-locked (15 min before match)
    const { data: match } = await serviceClient
      .from("matches")
      .select("match_date, match_time")
      .eq("id", market.match_id)
      .single();

    if (match) {
      const matchDateTime = new Date(`${match.match_date}T${match.match_time}`);
      const now = new Date();
      if (matchDateTime.getTime() - now.getTime() <= 15 * 60 * 1000) {
        return json({ error: "Cannot modify bets within 15 minutes of match start" }, 400);
      }
    }

    if (action === "cancel") {
      // Refund points
      await serviceClient.rpc("credit_points", { p_user_id: userId, p_amount: bet.stake_pts });

      // Get updated balance for transaction log
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("padel_park_points")
        .eq("user_id", userId)
        .single();

      // Log refund transaction
      await serviceClient.from("points_transactions").insert({
        user_id: userId,
        amount: bet.stake_pts,
        balance_before: (profile?.padel_park_points ?? 0) - bet.stake_pts,
        balance_after: profile?.padel_park_points ?? 0,
        transaction_type: "refunded",
        related_match_id: market.match_id,
        reason: `Cancelled bet on Team ${bet.team}`,
      });

      // Update market totals (decrease pot and team staked)
      const teamCol = bet.team === "A" ? "team_a_total_staked" : "team_b_total_staked";
      const payoutCol = bet.team === "A" ? "team_a_potential_payout" : "team_b_potential_payout";
      
      await serviceClient
        .from("match_bet_markets")
        .update({
          total_pot: Math.max(0, market.total_pot - bet.stake_pts),
          [teamCol]: Math.max(0, (bet.team === "A" ? market.team_a_total_staked : market.team_b_total_staked) - bet.stake_pts),
          [payoutCol]: Math.max(0, (bet.team === "A" ? market.team_a_potential_payout : market.team_b_potential_payout) - bet.potential_payout_pts),
        })
        .eq("id", market.id);

      // Delete the bet
      await serviceClient.from("match_bets").delete().eq("id", bet_id);

      return json({ success: true, action: "cancelled", refunded: bet.stake_pts });
    }

    if (action === "increase") {
      if (!additional_stake || typeof additional_stake !== "number" || additional_stake < 1) {
        return json({ error: "additional_stake must be a positive number" }, 400);
      }

      // Fetch config
      const { data: config } = await serviceClient
        .from("match_bet_config")
        .select("*")
        .limit(1)
        .single();

      if (!config || !config.enabled) return json({ error: "Betting disabled" }, 403);

      const newTotal = bet.stake_pts + additional_stake;
      if (newTotal > config.max_stake) {
        return json({ error: `Total stake would exceed max of ${config.max_stake} PP` }, 400);
      }

      // Debit additional points
      const { data: debitResult, error: debitError } = await serviceClient.rpc("debit_points_safe", {
        p_user_id: userId,
        p_amount: additional_stake,
      });

      if (debitError) throw debitError;
      if (debitResult?.error) return json({ error: debitResult.error }, 400);

      // Points already debited — proceed with update
      // Keep locked multiplier, recalculate potential payout
      const newPotentialPayout = Math.min(
        Math.floor(newTotal * bet.locked_multiplier),
        config.max_payout_pts
      );
      const additionalPayout = newPotentialPayout - bet.potential_payout_pts;

      // Update bet
      await serviceClient
        .from("match_bets")
        .update({
          stake_pts: newTotal,
          potential_payout_pts: newPotentialPayout,
        })
        .eq("id", bet_id);

      // Log transaction
      await serviceClient.from("points_transactions").insert({
        user_id: userId,
        amount: -additional_stake,
        balance_before: debitResult.balance_before,
        balance_after: debitResult.balance_after,
        transaction_type: "stake_placed",
        related_match_id: market.match_id,
        reason: `Increased bet on Team ${bet.team} (+${additional_stake} PP)`,
      });

      // Update market pot
      await serviceClient.rpc("increment_match_pot", {
        p_market_id: market.id,
        p_team: bet.team,
        p_stake: additional_stake,
      });

      // Update potential payout tracking
      await serviceClient.rpc("increment_market_totals", {
        p_market_id: market.id,
        p_team: bet.team,
        p_staked: 0,
        p_payout: additionalPayout,
        p_house_reserve: config.house_reserve_pts,
        p_risk_threshold: config.risk_threshold,
        p_close_threshold: config.close_threshold,
      });

      return json({
        success: true,
        action: "increased",
        new_stake: newTotal,
        new_potential_payout: newPotentialPayout,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
