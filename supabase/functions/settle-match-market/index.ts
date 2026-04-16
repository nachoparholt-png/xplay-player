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

    // Admin check
    const { data: isAdmin } = await serviceClient.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const { market_id, winner } = await req.json();
    if (!market_id) return json({ error: "market_id required" }, 400);
    if (!["A", "B", "draw"].includes(winner)) return json({ error: "winner must be A, B, or draw" }, 400);

    // Fetch market
    const { data: market } = await serviceClient
      .from("match_bet_markets")
      .select("*")
      .eq("id", market_id)
      .single();

    if (!market) return json({ error: "Market not found" }, 404);
    if (market.status === "settled") return json({ error: "Already settled" }, 400);

    // Fetch all active bets
    const { data: bets } = await serviceClient
      .from("match_bets")
      .select("*")
      .eq("market_id", market_id)
      .eq("status", "active");

    const now = new Date().toISOString();
    const potSharePct = Number(market.pot_share_pct) || 0.10;

    if (winner === "draw") {
      // Refund all stakes
      for (const bet of bets || []) {
        const { data: profile } = await serviceClient
          .from("profiles")
          .select("padel_park_points")
          .eq("user_id", bet.user_id)
          .single();

        const currentBalance = profile?.padel_park_points ?? 0;
        await serviceClient.rpc("credit_points", { p_user_id: bet.user_id, p_amount: bet.stake_pts });

        await serviceClient
          .from("match_bets")
          .update({ status: "refunded", actual_payout_pts: bet.stake_pts, settled_at: now })
          .eq("id", bet.id);

        await serviceClient.from("points_transactions").insert({
          user_id: bet.user_id,
          amount: bet.stake_pts,
          balance_before: currentBalance,
          balance_after: currentBalance + bet.stake_pts,
          transaction_type: "refunded",
          related_match_id: market.match_id,
          reason: "Match ended in draw — stake refunded",
        });
      }

      await serviceClient
        .from("match_bet_markets")
        .update({ status: "settled", settled_winner: winner, house_pnl_pts: 0, phase: "settled" })
        .eq("id", market_id);

      return json({ settled: true, house_pnl_pts: 0, bets_settled: (bets || []).length });
    }

    // Model B: Pot redistribution settlement
    const winnerBets = (bets || []).filter((b) => b.team === winner);
    const loserBets = (bets || []).filter((b) => b.team !== winner);

    const losingTeamTotalStaked = loserBets.reduce((s, b) => s + b.stake_pts, 0);

    // Pot bonus pool = pot_share_pct * losing team's total staked
    const potBonusPool = Math.floor(potSharePct * losingTeamTotalStaked);
    let totalPotBonusPaid = 0;
    let totalFactorPaid = 0;

    // Only match players share the pot bonus
    const playerWinnerBets = winnerBets.filter((b) => b.is_player === true);
    const playerWinnerTotalStaked = playerWinnerBets.reduce((s, b) => s + b.stake_pts, 0);

    // Settle winners
    for (const bet of winnerBets) {
      const factorPayout = bet.potential_payout_pts; // stake * multiplier (already calculated)
      
      // Pot bonus only for match players
      let winnerPotShare = 0;
      if (bet.is_player && playerWinnerTotalStaked > 0) {
        winnerPotShare = Math.floor((bet.stake_pts / playerWinnerTotalStaked) * potBonusPool);
      }

      const totalPayout = factorPayout + winnerPotShare;

      const { data: profile } = await serviceClient
        .from("profiles")
        .select("padel_park_points")
        .eq("user_id", bet.user_id)
        .single();

      const currentBalance = profile?.padel_park_points ?? 0;
      await serviceClient.rpc("credit_points", { p_user_id: bet.user_id, p_amount: totalPayout });

      await serviceClient
        .from("match_bets")
        .update({
          status: "won",
          actual_payout_pts: totalPayout,
          factor_payout_pts: factorPayout,
          pot_bonus_pts: winnerPotShare,
          settled_at: now,
        })
        .eq("id", bet.id);

      await serviceClient.from("points_transactions").insert({
        user_id: bet.user_id,
        amount: totalPayout,
        balance_before: currentBalance,
        balance_after: currentBalance + totalPayout,
        transaction_type: "stake_won",
        related_match_id: market.match_id,
        reason: bet.is_player
          ? `Won bet on Team ${winner} — factor x${bet.locked_multiplier} + pot bonus ${winnerPotShare} PP`
          : `Won bet on Team ${winner} — factor x${bet.locked_multiplier} (spectator, no pot bonus)`,
      });

      totalPotBonusPaid += winnerPotShare;
      totalFactorPaid += factorPayout;
    }

    // Settle losers
    for (const bet of loserBets) {
      await serviceClient
        .from("match_bets")
        .update({ status: "lost", actual_payout_pts: 0, factor_payout_pts: 0, pot_bonus_pts: 0, settled_at: now })
        .eq("id", bet.id);
    }

    // House gets: losing stakes - pot bonus paid - factor payouts from house
    const totalStaked = (bets || []).reduce((s, b) => s + b.stake_pts, 0);
    const housePotRake = losingTeamTotalStaked - potBonusPool;
    const housePnl = totalStaked - totalFactorPaid - totalPotBonusPaid;

    await serviceClient
      .from("match_bet_markets")
      .update({
        status: "settled",
        settled_winner: winner,
        house_pnl_pts: housePnl,
        house_pot_rake_pts: housePotRake,
        phase: "settled",
      })
      .eq("id", market_id);

    return json({
      settled: true,
      house_pnl_pts: housePnl,
      pot_bonus_pool: potBonusPool,
      house_pot_rake: housePotRake,
      bets_settled: (bets || []).length,
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
