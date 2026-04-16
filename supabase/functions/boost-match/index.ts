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

    const { market_id } = await req.json();
    if (!market_id) return json({ error: "market_id required" }, 400);

    // Fetch market
    const { data: market } = await serviceClient
      .from("match_bet_markets")
      .select("*")
      .eq("id", market_id)
      .single();

    if (!market) return json({ error: "Market not found" }, 404);
    if (market.status !== "open") return json({ error: "Market is not open" }, 400);

    // Fetch config
    const { data: config } = await serviceClient
      .from("match_bet_config")
      .select("*")
      .limit(1)
      .single();

    if (!config) return json({ error: "Config not found" }, 500);

    // Check boost limit
    if (market.high_pot_count >= config.high_pot_max_per_match) {
      return json({ error: "Max boosts reached for this match" }, 400);
    }

    // Check user is a participant
    const { data: player } = await serviceClient
      .from("match_players")
      .select("id")
      .eq("match_id", market.match_id)
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .maybeSingle();

    if (!player) return json({ error: "Only match participants can boost" }, 403);

    // Debit boost cost from user
    const boostCost = config.high_pot_boost_pts;
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("padel_park_points")
      .eq("user_id", userId)
      .single();

    if (!profile || profile.padel_park_points < boostCost) {
      return json({ error: `Insufficient balance (need ${boostCost} PP)` }, 400);
    }

    const newBalance = profile.padel_park_points - boostCost;
    await serviceClient
      .from("profiles")
      .update({ padel_park_points: newBalance })
      .eq("user_id", userId);

    // Log transaction
    await serviceClient.from("points_transactions").insert({
      user_id: userId,
      amount: -boostCost,
      balance_before: profile.padel_park_points,
      balance_after: newBalance,
      transaction_type: "stake_placed",
      related_match_id: market.match_id,
      reason: "High Pot boost activation",
    });

    // Update market
    await serviceClient
      .from("match_bet_markets")
      .update({
        high_pot_active: true,
        high_pot_count: market.high_pot_count + 1,
        high_pot_pool_pts: market.high_pot_pool_pts + boostCost,
      })
      .eq("id", market_id);

    return json({
      boosted: true,
      high_pot_count: market.high_pot_count + 1,
      high_pot_pool_pts: market.high_pot_pool_pts + boostCost,
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
