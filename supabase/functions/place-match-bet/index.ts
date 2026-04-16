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

    const { market_id, team, stake_pts } = await req.json();
    if (!market_id || !team || !stake_pts) return json({ error: "market_id, team, stake_pts required" }, 400);
    if (!["A", "B"].includes(team)) return json({ error: "team must be A or B" }, 400);
    if (typeof stake_pts !== "number" || stake_pts < 1) return json({ error: "Invalid stake" }, 400);

    // Fetch market
    const { data: market } = await serviceClient
      .from("match_bet_markets")
      .select("*")
      .eq("id", market_id)
      .single();

    if (!market) return json({ error: "Market not found" }, 404);
    if (market.status !== "open") return json({ error: "Market is not open" }, 400);

    // Validate phase allows betting
    if (market.phase === "settled") return json({ error: "Market is settled" }, 400);

    // Check line status
    const lineStatus = team === "A" ? market.team_a_line_status : market.team_b_line_status;
    if (lineStatus === "closed") return json({ error: "This line is closed" }, 400);

    // Check if user is a confirmed match participant (don't block, just record)
    const { data: playerEntry } = await serviceClient
      .from("match_players")
      .select("id, team")
      .eq("match_id", market.match_id)
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .maybeSingle();

    const isPlayer = !!playerEntry;

    // Players can only bet on their own team (skip check if team not yet assigned)
    // team from request is "A"/"B", playerEntry.team is "team_a"/"team_b"
    const playerTeamNormalized = playerEntry?.team === "team_a" ? "A" : playerEntry?.team === "team_b" ? "B" : null;
    if (isPlayer && playerTeamNormalized && playerTeamNormalized !== team) {
      return json({ error: "Players can only bet on their own team" }, 400);
    }

    // Check existing bet
    const { data: existingBet } = await serviceClient
      .from("match_bets")
      .select("id")
      .eq("market_id", market_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingBet) return json({ error: "You already have a bet on this match" }, 409);

    // Fetch config for limits
    const { data: config } = await serviceClient
      .from("match_bet_config")
      .select("*")
      .limit(1)
      .single();

    if (!config || !config.enabled) return json({ error: "Betting disabled" }, 403);

    // Validate stake
    if (stake_pts < config.min_stake) return json({ error: `Minimum stake is ${config.min_stake}` }, 400);
    if (stake_pts > config.max_stake) return json({ error: `Maximum stake is ${config.max_stake}` }, 400);

    // Atomic balance deduction
    const { data: debitResult, error: debitError } = await serviceClient.rpc("debit_points_safe", {
      p_user_id: userId,
      p_amount: stake_pts,
    });

    if (debitError) throw debitError;
    if (debitResult?.error) return json({ error: debitResult.error }, 400);

    const balanceBefore = debitResult.balance_before;
    const balanceAfter = debitResult.balance_after;

    // Compute payout
    const multiplier = team === "A" ? market.team_a_multiplier : market.team_b_multiplier;
    const potentialPayout = Math.min(
      Math.floor(stake_pts * multiplier),
      config.max_payout_pts
    );

    // Insert bet
    const { data: bet, error: betError } = await serviceClient
      .from("match_bets")
      .insert({
        market_id,
        match_id: market.match_id,
        user_id: userId,
        team,
        stake_pts,
        locked_multiplier: multiplier,
        potential_payout_pts: potentialPayout,
        is_player: isPlayer,
      })
      .select()
      .single();

    if (betError) {
      await serviceClient.rpc("credit_points", { p_user_id: userId, p_amount: stake_pts });
      throw betError;
    }

    // Log transaction
    await serviceClient.from("points_transactions").insert({
      user_id: userId,
      amount: -stake_pts,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      transaction_type: "stake_placed",
      related_match_id: market.match_id,
      reason: `Bet on Team ${team} @ x${multiplier}${isPlayer ? "" : " (spectator)"}`,
    });

    // Atomic pot + market totals update
    await serviceClient.rpc("increment_match_pot", {
      p_market_id: market_id,
      p_team: team,
      p_stake: stake_pts,
    });

    // Also update potential payout and line status
    const { data: newLineStatus } = await serviceClient.rpc("increment_market_totals", {
      p_market_id: market_id,
      p_team: team,
      p_staked: 0,
      p_payout: potentialPayout,
      p_house_reserve: config.house_reserve_pts,
      p_risk_threshold: config.risk_threshold,
      p_close_threshold: config.close_threshold,
    });

    return json({ bet, line_status: newLineStatus });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
