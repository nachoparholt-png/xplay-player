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

    const { tournamentId, stage, winningTeamIds, voided = false } = await req.json();

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Admin check
    const { data: isAdmin } = await serviceClient.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: corsHeaders });
    }

    // Get config
    const { data: config } = await serviceClient
      .from("tournament_bet_config")
      .select("max_payout_pts, house_reserve_pts, pot_share_pct, house_boost_pts, organizer_prize_pts")
      .eq("tournament_id", tournamentId)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ error: "No bet config" }), { status: 404, headers: corsHeaders });
    }

    const potSharePct = Number(config.pot_share_pct ?? 0);
    const houseBoostPts = config.house_boost_pts ?? 0;
    const organizerPrizePts = config.organizer_prize_pts ?? 0;

    // Get all active bets for this stage
    const { data: bets } = await serviceClient
      .from("tournament_bets")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("stage", stage)
      .eq("status", "active");

    if (!bets?.length) {
      await serviceClient
        .from("tournament_bet_windows")
        .update({ status: "settled", closes_at: new Date().toISOString() })
        .eq("tournament_id", tournamentId)
        .eq("stage", stage);

      return new Response(JSON.stringify({ success: true, settled: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const winnerSet = new Set<string>(winningTeamIds || []);
    let totalPaidOut = 0;
    const now = new Date().toISOString();

    // Separate winners and losers
    const winningBets: any[] = [];
    const losingBets: any[] = [];

    for (const bet of bets) {
      if (voided) continue;
      if (winnerSet.has(bet.team_id)) {
        winningBets.push(bet);
      } else {
        losingBets.push(bet);
      }
    }

    // Calculate pool from losing stakes
    const totalLosingStakes = losingBets.reduce((s, b) => s + b.stake_pts, 0);
    const poolFromLosers = Math.floor(totalLosingStakes * potSharePct);
    const totalPool = poolFromLosers + houseBoostPts;

    // Calculate total winning stakes for proportional distribution
    const totalWinnerStakes = winningBets.reduce((s, b) => s + b.stake_pts, 0);

    // Process each bet
    for (const bet of bets) {
      let status: string;
      let actualPayout = 0;
      let poolBonusPts = 0;

      if (voided) {
        status = "void";
        const { data: alloc } = await serviceClient
          .from("tournament_bet_allocations")
          .select("spent_pts, balance_pts")
          .eq("tournament_id", tournamentId)
          .eq("user_id", bet.user_id)
          .single();

        if (alloc) {
          await serviceClient
            .from("tournament_bet_allocations")
            .update({
              spent_pts: Math.max(0, alloc.spent_pts - bet.stake_pts),
              balance_pts: (alloc.balance_pts || 0) + bet.stake_pts,
            })
            .eq("tournament_id", tournamentId)
            .eq("user_id", bet.user_id);
        }
      } else if (winnerSet.has(bet.team_id)) {
        status = "won";
        // Use odds_at_placement for payout calculation
        const multiplier = bet.odds_at_placement || bet.odds_multiplier;
        actualPayout = Math.min(
          Math.floor(bet.stake_pts * multiplier),
          config.max_payout_pts
        );

        // Pool bonus proportional to stake
        if (totalPool > 0 && totalWinnerStakes > 0) {
          poolBonusPts = Math.floor(totalPool * (bet.stake_pts / totalWinnerStakes));
        }

        totalPaidOut += actualPayout + poolBonusPts;

        // Credit won_pts
        const { data: alloc } = await serviceClient
          .from("tournament_bet_allocations")
          .select("won_pts")
          .eq("tournament_id", tournamentId)
          .eq("user_id", bet.user_id)
          .single();

        if (alloc) {
          await serviceClient
            .from("tournament_bet_allocations")
            .update({ won_pts: alloc.won_pts + actualPayout + poolBonusPts })
            .eq("tournament_id", tournamentId)
            .eq("user_id", bet.user_id);
        }
      } else {
        status = "lost";
      }

      // Update bet status
      await serviceClient
        .from("tournament_bets")
        .update({
          status,
          actual_payout_pts: actualPayout,
          pool_bonus_pts: poolBonusPts > 0 ? poolBonusPts : null,
          settled_at: now,
        })
        .eq("id", bet.id);
    }

    // Update window
    await serviceClient
      .from("tournament_bet_windows")
      .update({
        status: "settled",
        closes_at: now,
        total_actual_payout_pts: totalPaidOut,
      })
      .eq("tournament_id", tournamentId)
      .eq("stage", stage);

    // If settling the "win", "champion", "groups", "quarters", or "semis" stage
    // For final settlement stages, convert TBP → real points
    if (stage === "win" || stage === "champion") {
      const { data: allAllocations } = await serviceClient
        .from("tournament_bet_allocations")
        .select("user_id, won_pts")
        .eq("tournament_id", tournamentId)
        .gt("won_pts", 0);

      if (allAllocations) {
        for (const alloc of allAllocations) {
          await serviceClient.rpc("credit_points", {
            p_user_id: alloc.user_id,
            p_amount: alloc.won_pts,
          });
        }
      }

      // Credit organizer prize to winning team players
      if (organizerPrizePts > 0 && winningTeamIds?.length > 0) {
        for (const teamId of winningTeamIds) {
          const { data: team } = await serviceClient
            .from("tournament_teams")
            .select("player1_id, player2_id")
            .eq("id", teamId)
            .single();

          if (team) {
            const playerIds = [team.player1_id, team.player2_id].filter(Boolean);
            const perPlayer = Math.floor(organizerPrizePts / playerIds.length);
            for (const pid of playerIds) {
              await serviceClient.rpc("credit_points", {
                p_user_id: pid,
                p_amount: perPlayer,
              });
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, settled: bets.length, totalPaidOut, poolDistributed: totalPool }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
