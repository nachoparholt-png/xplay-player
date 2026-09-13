// process-referral
//
// Records the referral link between a newly signed-up user and the inviter
// whose code they used. It does NOT grant any points: the reward (500 pts to
// the inviter) is paid server-side by the DB trigger
// `trg_award_referral_on_first_match` when the referee plays their first match,
// and only while `referrals.reward_granted_at IS NULL`. So this function must
// leave the row `pending` with `reward_granted_at = NULL`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REFERRAL_REWARD_PTS = 500; // informational only — paid by DB trigger on first match

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

    // Duplicate checks: the invited user may only ever be referred once
    // (by anyone), and the same pair must not be recorded twice.
    const { data: anyExisting } = await admin
      .from("referrals")
      .select("id, inviter_user_id, referral_status")
      .eq("invited_user_id", userId)
      .limit(1)
      .maybeSingle();

    if (anyExisting) {
      // Same inviter -> idempotent; different inviter -> already referred by someone else.
      const msg = anyExisting.inviter_user_id === inviterProfile.user_id
        ? "Already processed"
        : "User already referred";
      return new Response(JSON.stringify({ ok: true, message: msg }), {
        headers: corsHeaders,
      });
    }

    // Record the referral link only. Reward is granted later by the DB trigger.
    const { error: insertErr } = await admin.from("referrals").insert({
      inviter_user_id: inviterProfile.user_id,
      invited_user_id: userId,
      referral_code,
      referral_status: "pending",
      reward_granted_at: null,
    });

    if (insertErr) {
      // Unique-violation race (double invoke) is fine — treat as processed.
      if (insertErr.code === "23505") {
        return new Response(JSON.stringify({ ok: true, message: "Already processed" }), {
          headers: corsHeaders,
        });
      }
      throw insertErr;
    }

    // Tell the inviter someone joined with their code (no points yet).
    await admin.rpc("create_notification_for_user", {
      _user_id: inviterProfile.user_id,
      _type: "referral",
      _title: "👋 A friend joined with your code",
      _body: `Someone joined XPLAY using your referral code — you'll get ${REFERRAL_REWARD_PTS} XPLAY points when they play their first match.`,
      _link: "/points-store",
    });

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
