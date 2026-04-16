import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REFERRAL_REWARD_PTS = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const userId = callerUser.id;

    // Only allow referral processing for new accounts (created within last 10 minutes)
    const createdAt = new Date(callerUser.created_at);
    const ageMs = Date.now() - createdAt.getTime();
    const TEN_MINUTES = 10 * 60 * 1000;
    if (ageMs > TEN_MINUTES) {
      return new Response(JSON.stringify({ error: "Referral only valid for new accounts" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { referral_code } = await req.json();
    if (!referral_code || typeof referral_code !== "string") {
      return new Response(JSON.stringify({ error: "referral_code required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Use service role for DB operations
    const admin = createClient(supabaseUrl, serviceKey);

    // Find inviter by referral code
    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("user_id")
      .eq("referral_code", referral_code)
      .single();

    if (!inviterProfile) {
      return new Response(JSON.stringify({ error: "Invalid referral code" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (inviterProfile.user_id === userId) {
      return new Response(JSON.stringify({ error: "Cannot refer yourself" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Check if already rewarded
    const { data: existing } = await admin
      .from("referrals")
      .select("id, referral_status")
      .eq("inviter_user_id", inviterProfile.user_id)
      .eq("invited_user_id", userId)
      .maybeSingle();

    if (existing?.referral_status === "completed") {
      return new Response(JSON.stringify({ ok: true, message: "Already processed" }), {
        headers: corsHeaders,
      });
    }

    // Upsert referral to completed
    if (existing) {
      await admin
        .from("referrals")
        .update({ referral_status: "completed", reward_granted_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await admin.from("referrals").insert({
        inviter_user_id: inviterProfile.user_id,
        invited_user_id: userId,
        referral_code,
        referral_status: "completed",
        reward_granted_at: new Date().toISOString(),
      });
    }

    // Credit inviter points
    await admin.rpc("increment_points", {
      p_user_id: inviterProfile.user_id,
      p_amount: REFERRAL_REWARD_PTS,
    });

    // Get inviter balance for transaction log
    const { data: inviterBal } = await admin
      .from("profiles")
      .select("padel_park_points")
      .eq("user_id", inviterProfile.user_id)
      .single();

    const balAfter = inviterBal?.padel_park_points ?? 0;

    await admin.from("points_transactions").insert({
      user_id: inviterProfile.user_id,
      amount: REFERRAL_REWARD_PTS,
      balance_before: balAfter - REFERRAL_REWARD_PTS,
      balance_after: balAfter,
      transaction_type: "bonus",
      reason: `Referral bonus: invited user joined via code ${referral_code}`,
    });

    // Notify the inviter
    await admin.rpc("create_notification_for_user", {
      _user_id: inviterProfile.user_id,
      _type: "referral",
      _title: "🎉 Referral Reward!",
      _body: "A friend joined XPLAY using your referral link — you've earned 50 XPLAY points! Keep sharing to earn more.",
      _link: "/points-store",
    });

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
