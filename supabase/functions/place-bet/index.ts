import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const userId = userData.user.id;

    const body = await req.json();
    // Support both camelCase and snake_case params
    const tournamentId = body.tournamentId || body.tournament_id;
    const stage = body.stage;
    const teamId = body.teamId || body.team_id;
    const stakePts = body.stakePts || body.stake_pts;
    const sourceBetId = body.source_bet_id || null;

    if (!tournamentId || !stage || !stakePts) {
      return new Response(JSON.stringify({ error: "tournamentId, stage, stakePts required" }), { status: 400, headers: corsHeaders });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Block coordinator from betting
    const { data: tournament } = await serviceClient
      .from("tournaments")
      .select("created_by, status, player_count")
      .eq("id", tournamentId)
      .single();

    if (!tournament) {
      return new Response(JSON.stringify({ error: "Tournament not found" }), { status: 404, headers: corsHeaders });
    }

    if (tournament.created_by === userId) {
      return new Response(JSON.stringify({ error: "Tournament coordinators cannot place bets on their own tournament" }), { status: 403, headers: corsHeaders });
    }

    // Resolve team ID if not provided
    let resolvedTeamId = teamId;
    if (!resolvedTeamId) {
      const { data: player } = await serviceClient
        .from("tournament_players")
        .select("team_id")
        .eq("tournament_id", tournamentId)
        .eq("user_id", userId)
        .eq("status", "confirmed")
        .single();

      if (!player) {
        return new Response(JSON.stringify({ error: "You are not a participant in this tournament" }), { status: 403, headers: corsHeaders });
      }
      resolvedTeamId = player.team_id;
    } else {
      // Verify self-bet only
      const { data: player } = await serviceClient
        .from("tournament_players")
        .select("team_id")
        .eq("tournament_id", tournamentId)
        .eq("user_id", userId)
        .eq("status", "confirmed")
        .single();

      if (!player) {
        return new Response(JSON.stringify({ error: "You are not a participant in this tournament" }), { status: 403, headers: corsHeaders });
      }

      if (resolvedTeamId !== player.team_id) {
        return new Response(JSON.stringify({ error: "You can only bet on your own team" }), { status: 400, headers: corsHeaders });
      }
    }

    // 2. Check window (optional — allow windowless bets for pre-tournament)
    const { data: window } = await serviceClient
      .from("tournament_bet_windows")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("stage", stage)
      .single();

    const windowId = window?.id || null;

    if (window && window.status !== "open") {
      return new Response(JSON.stringify({ error: "Betting window is not open" }), { status: 400, headers: corsHeaders });
    }

    // If no window, allow bet only if tournament not completed
    if (!window && (tournament.status === "completed")) {
      return new Response(JSON.stringify({ error: "Betting is closed for this tournament" }), { status: 400, headers: corsHeaders });
    }

    // 3. Get odds + snapshot odds_at_placement
    const { data: odds } = await serviceClient
      .from("tournament_bet_odds")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("team_id", resolvedTeamId)
      .eq("stage", stage)
      .single();

    const oddsMultiplier = odds?.odds_multiplier ?? 1.8;
    const oddsAtPlacement = oddsMultiplier;

    if (odds && (!odds.is_offered || odds.line_status === "closed")) {
      return new Response(JSON.stringify({ error: "This betting line is not available" }), { status: 400, headers: corsHeaders });
    }

    // 4. Get config
    const { data: config } = await serviceClient
      .from("tournament_bet_config")
      .select("max_stake_per_stage, max_payout_pts")
      .eq("tournament_id", tournamentId)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ error: "No bet config" }), { status: 404, headers: corsHeaders });
    }

    // 5. Handle source_bet_id (roll-over from previous win)
    let skipBalanceDeduction = false;
    if (sourceBetId) {
      const { data: sourceBet } = await serviceClient
        .from("tournament_bets")
        .select("*")
        .eq("id", sourceBetId)
        .single();

      if (!sourceBet || sourceBet.user_id !== userId || sourceBet.status !== "won" || sourceBet.collected_at) {
        return new Response(JSON.stringify({ error: "Invalid source bet for roll-over" }), { status: 400, headers: corsHeaders });
      }

      const sourceMultiplier = sourceBet.odds_at_placement || sourceBet.odds_multiplier;
      const available = Math.floor(sourceBet.stake_pts * sourceMultiplier) + (sourceBet.pool_bonus_pts || 0);
      if (stakePts > available) {
        return new Response(JSON.stringify({ error: `Roll-over exceeds available winnings (${available} TBP)` }), { status: 400, headers: corsHeaders });
      }

      // Mark source bet as collected
      await serviceClient
        .from("tournament_bets")
        .update({ collected_at: new Date().toISOString() })
        .eq("id", sourceBetId);

      skipBalanceDeduction = true;
    }

    // 6. Check allocation balance (only if not rolling over)
    if (!skipBalanceDeduction) {
      const { data: allocation } = await serviceClient
        .from("tournament_bet_allocations")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("user_id", userId)
        .single();

      if (!allocation || allocation.balance_pts < stakePts) {
        return new Response(JSON.stringify({ error: "Insufficient TBP balance" }), { status: 400, headers: corsHeaders });
      }

      // Deduct from allocation
      const newSpent = allocation.spent_pts + stakePts;
      const newBalance = allocation.balance_pts - stakePts;
      await serviceClient
        .from("tournament_bet_allocations")
        .update({ spent_pts: newSpent, balance_pts: newBalance })
        .eq("id", allocation.id);
    }

    // 7. Check per-stage cap
    const { data: existingBets } = await serviceClient
      .from("tournament_bets")
      .select("stake_pts")
      .eq("tournament_id", tournamentId)
      .eq("user_id", userId)
      .eq("stage", stage)
      .in("status", ["active"]);

    const alreadyStaked = (existingBets || []).reduce((sum: number, b: any) => sum + b.stake_pts, 0);
    if (alreadyStaked + stakePts > config.max_stake_per_stage) {
      return new Response(JSON.stringify({
        error: `Exceeds stage cap. You can stake ${config.max_stake_per_stage - alreadyStaked} more TBP.`
      }), { status: 400, headers: corsHeaders });
    }

    // 8. Calculate payout
    const potentialPayout = Math.min(
      Math.floor(stakePts * oddsMultiplier),
      config.max_payout_pts
    );

    // 9. Insert bet
    const { data: bet, error: betError } = await serviceClient
      .from("tournament_bets")
      .insert({
        tournament_id: tournamentId,
        window_id: windowId,
        user_id: userId,
        team_id: resolvedTeamId,
        stage,
        stake_pts: stakePts,
        odds_multiplier: oddsMultiplier,
        odds_at_placement: oddsAtPlacement,
        potential_payout_pts: potentialPayout,
        status: "active",
        source_bet_id: sourceBetId,
      })
      .select()
      .single();

    if (betError) {
      return new Response(JSON.stringify({ error: betError.message }), { status: 500, headers: corsHeaders });
    }

    // 10. Update window totals (if window exists)
    if (window) {
      await serviceClient
        .from("tournament_bet_windows")
        .update({
          total_staked_pts: window.total_staked_pts + stakePts,
          total_potential_payout_pts: window.total_potential_payout_pts + potentialPayout,
        })
        .eq("id", window.id);
    }

    return new Response(JSON.stringify({ success: true, bet }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
