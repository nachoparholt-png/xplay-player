/**
 * renew-memberships
 *
 * Daily cron Edge Function for membership lifecycle management.
 *
 * What it does:
 *  1. Expire non-Stripe memberships — finds active memberships with
 *     expires_at < now() and no Stripe subscription, marks them expired.
 *  2. Sync Stripe subscriptions — for active memberships whose expires_at
 *     has passed but DO have a Stripe subscription, polls Stripe to get the
 *     current status. Updates expires_at if renewed, or marks expired if
 *     the subscription is cancelled/past_due past grace period.
 *  3. Notify clubs — sends a target_app='club' notification to the club's
 *     admin/owner when a member's access expires.
 *
 * Scheduled via pg_cron at midnight daily (see migration below).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RenewalResult {
  expired_manual: number;
  expired_stripe: number;
  renewed_stripe: number;
  notifications_sent: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripe = stripeKey
    ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" })
    : null;

  const result: RenewalResult = {
    expired_manual: 0,
    expired_stripe: 0,
    renewed_stripe: 0,
    notifications_sent: 0,
    errors: [],
  };

  const now = new Date();

  // ── 1. Fetch all active memberships that have passed their expiry ──────────

  const { data: expiredMemberships, error: fetchErr } = await supabase
    .from("club_memberships")
    .select(`
      id,
      user_id,
      club_id,
      tier_id,
      expires_at,
      stripe_subscription_id,
      stripe_customer_id,
      clubs:club_id (club_name),
      membership_tiers:tier_id (name)
    `)
    .eq("status", "active")
    .eq("active", true)
    .not("expires_at", "is", null)
    .lt("expires_at", now.toISOString());

  if (fetchErr) {
    console.error("Failed to fetch expired memberships:", fetchErr);
    return new Response(
      JSON.stringify({ error: fetchErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const memberships = expiredMemberships ?? [];
  console.log(`Found ${memberships.length} memberships with passed expiry`);

  // ── 2. Process each membership ────────────────────────────────────────────

  for (const mem of memberships) {
    const clubName = (mem.clubs as any)?.club_name ?? "Unknown Club";
    const tierName = (mem.membership_tiers as any)?.name ?? "Membership";

    try {
      if (!mem.stripe_subscription_id) {
        // ── Manual / free membership — just expire it ──────────────────
        await supabase
          .from("club_memberships")
          .update({ status: "expired", active: false })
          .eq("id", mem.id);

        result.expired_manual++;
        console.log(`Expired manual membership ${mem.id} for user ${mem.user_id}`);

        // Notify the club that this member has expired
        await notifyClubMemberExpired(supabase, mem, clubName, tierName);
        result.notifications_sent++;
      } else if (stripe) {
        // ── Stripe subscription — verify with Stripe API ───────────────
        try {
          const subscription = await stripe.subscriptions.retrieve(
            mem.stripe_subscription_id
          );

          if (
            subscription.status === "active" ||
            subscription.status === "trialing"
          ) {
            // Stripe renewed it but our webhook may have missed it — update expiry
            const newExpiresAt = new Date(
              subscription.current_period_end * 1000
            );
            await supabase
              .from("club_memberships")
              .update({
                status: "active",
                active: true,
                expires_at: newExpiresAt.toISOString(),
                cancels_at: subscription.cancel_at
                  ? new Date(subscription.cancel_at * 1000).toISOString()
                  : null,
              })
              .eq("id", mem.id);

            result.renewed_stripe++;
            console.log(
              `Synced Stripe renewal for membership ${mem.id}, new expiry: ${newExpiresAt.toISOString()}`
            );
          } else if (
            subscription.status === "canceled" ||
            subscription.status === "unpaid" ||
            subscription.status === "past_due"
          ) {
            // Subscription ended or payment failed beyond grace period
            await supabase
              .from("club_memberships")
              .update({
                status: subscription.status === "canceled" ? "cancelled" : "expired",
                active: false,
              })
              .eq("id", mem.id);

            result.expired_stripe++;
            console.log(
              `Expired Stripe membership ${mem.id} (subscription status: ${subscription.status})`
            );

            await notifyClubMemberExpired(supabase, mem, clubName, tierName);
            result.notifications_sent++;
          }
        } catch (stripeErr) {
          // If Stripe returns 404, the subscription no longer exists — expire the membership
          const errMsg = (stripeErr as Error).message;
          if (errMsg.includes("No such subscription")) {
            await supabase
              .from("club_memberships")
              .update({ status: "expired", active: false })
              .eq("id", mem.id);

            result.expired_stripe++;
            await notifyClubMemberExpired(supabase, mem, clubName, tierName);
            result.notifications_sent++;
          } else {
            console.error(`Stripe API error for membership ${mem.id}:`, errMsg);
            result.errors.push(`Stripe error on ${mem.id}: ${errMsg}`);
          }
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      console.error(`Error processing membership ${mem.id}:`, errMsg);
      result.errors.push(`${mem.id}: ${errMsg}`);
    }
  }

  console.log("renew-memberships completed:", result);

  return new Response(
    JSON.stringify({
      ok: true,
      processed: memberships.length,
      ...result,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

// ── Notify club admin/owner that a member's access has expired ────────────────

async function notifyClubMemberExpired(
  supabase: ReturnType<typeof createClient>,
  mem: {
    id: string;
    user_id: string;
    club_id: string;
    tier_id: string | null;
  },
  clubName: string,
  tierName: string
) {
  // Deduplication: only send once per membership expiry
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("type", "member_access_expired")
    .eq("data->>membership_id", mem.id)
    .limit(1);

  if (existing && existing.length > 0) return;

  // Find the club owner/admin to notify
  const { data: staff } = await supabase
    .from("club_memberships")
    .select("user_id")
    .eq("club_id", mem.club_id)
    .in("role", ["owner", "admin"])
    .eq("active", true)
    .limit(5);

  if (!staff || staff.length === 0) {
    console.warn(`No admin found for club ${mem.club_id} to notify`);
    return;
  }

  // Get the expired member's display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username")
    .eq("user_id", mem.user_id)
    .maybeSingle();

  const memberName =
    (profile as any)?.full_name ||
    (profile as any)?.username ||
    "A member";

  // Send notification to each admin/owner
  const notifications = staff.map((s) => ({
    user_id: s.user_id,
    type: "member_access_expired",
    title: "Member Access Expired",
    body: `${memberName}'s ${tierName} membership at ${clubName} has expired.`,
    link: `/memberships`,
    target_app: "club",
    data: {
      membership_id: mem.id,
      expired_user_id: mem.user_id,
      club_id: mem.club_id,
      tier_name: tierName,
      member_name: memberName,
    },
  }));

  const { error } = await supabase.from("notifications").insert(notifications);
  if (error) {
    console.error("Failed to insert club expiry notification:", error);
  }
}
