import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2023-10-16",
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  let event: Stripe.Event;

  if (webhookSecret && sig) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response("Webhook signature verification failed", { status: 400 });
    }
  } else {
    // Fallback: parse without verification (dev/test only — set STRIPE_WEBHOOK_SECRET in prod)
    console.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
    event = JSON.parse(body);
    // Unsigned event: never trust what was posted. Reload the checkout session from
    // Stripe so nobody can invent a "paid" session by calling this URL directly.
    if (typeof event.type === "string" && event.type.startsWith("checkout.session.")) {
      try {
        const posted = event.data.object as { id?: string };
        event.data.object = await stripe.checkout.sessions.retrieve(posted.id ?? "");
      } catch (err) {
        console.error("Unsigned webhook: session could not be loaded from Stripe:", err);
        return new Response("Unknown checkout session", { status: 400 });
      }
    }
  }

  try {
    switch (event.type) {
      // ── One-time checkout OR first payment of a subscription ─────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const meta = session.metadata || {};
        const type = meta.type;
        switch (type) {
          case "court_booking":
            await handleCourtBooking(supabase, session, meta);
            break;
          case "membership":
            await handleMembershipCheckout(supabase, session, meta);
            break;
          case "coaching_enrollment":
            await handleCoachingEnrollment(supabase, session, meta);
            break;
          case "event_signup":
            await handleEventSignup(supabase, session, meta);
            break;
          case "points_purchase":
            await handlePointsPurchase(supabase, session, meta);
            break;
          case "store_order":
            await handleStoreOrder(supabase, stripe, session, meta);
            break;
          default:
            console.warn("Unknown metadata type:", type, "session:", session.id);
        }
        break;
      }

      // ── Store checkout abandoned: put the held item back into stock ──────
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const meta = session.metadata || {};
        if (meta.type === "store_order" && meta.order_id) {
          await supabase.rpc("store_release_order", { _order_id: meta.order_id, _reason: "hold_expired" });
        }
        break;
      }

      // ── Subscription renewal: invoice paid successfully ───────────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // Only handle subscription renewal invoices (not the initial checkout payment)
        if (invoice.subscription && invoice.billing_reason === "subscription_cycle") {
          await handleSubscriptionRenewal(supabase, stripe, invoice);
        }
        break;
      }

      // ── Subscription cancelled (period ended or immediate) ────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCancelled(supabase, subscription);
        break;
      }

      // ── Payment failed on renewal — notify / mark at-risk ─────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          await handlePaymentFailed(supabase, invoice);
        }
        break;
      }

      default:
        // Silently ignore unhandled event types
        break;
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

// ─── Court Booking ────────────────────────────────────────────────────────────

async function handleCourtBooking(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>
) {
  const { booking_id, court_slot_id, match_type } = meta;

  // Dedup: already confirmed?
  const { data: booking } = await supabase
    .from("court_bookings")
    .select("id, status")
    .eq("id", booking_id)
    .maybeSingle();
  if (!booking || booking.status === "confirmed") return;

  // Confirm booking
  await supabase
    .from("court_bookings")
    .update({ status: "confirmed", stripe_session_id: session.id })
    .eq("id", booking_id);

  // Mark slot as booked
  await supabase
    .from("court_slots")
    .update({ status: "booked" })
    .eq("id", court_slot_id);

  // Create a public match record if match_type is public
  if (match_type === "public") {
    const { data: slot } = await supabase
      .from("court_slots")
      .select("starts_at, ends_at, court_id")
      .eq("id", court_slot_id)
      .maybeSingle();

    if (slot) {
      await supabase.from("matches").insert({
        court_slot_id,
        court_id: slot.court_id,
        created_by: meta.user_id,
        status: "open",
        match_type: "public",
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
      }).select().maybeSingle();
    }
  }

  console.log("Court booking confirmed:", booking_id);
}

// ─── Membership: initial checkout (subscription or one-time) ─────────────────

async function handleMembershipCheckout(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>
) {
  const { tier_id, club_id, user_id } = meta;
  const subscriptionId = (session.subscription as string) || null;
  const customerId = (session.customer as string) || null;

  // Dedup: already active with this exact tier?
  const { data: existing } = await supabase
    .from("club_memberships")
    .select("id, tier_id")
    .eq("user_id", user_id)
    .eq("club_id", club_id)
    .eq("status", "active")
    .maybeSingle();

  if (existing?.tier_id === tier_id) return;

  // Fetch tier for expiry calculation
  const { data: tier } = await supabase
    .from("membership_tiers")
    .select("billing_period")
    .eq("id", tier_id)
    .maybeSingle();

  const expiresAt = new Date();
  if (tier?.billing_period === "annual") {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  const membershipFields = {
    tier_id,
    status: "active",
    active: true,
    expires_at: expiresAt.toISOString(),
    stripe_session_id: session.id,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    cancels_at: null,
  };

  if (existing) {
    await supabase
      .from("club_memberships")
      .update(membershipFields)
      .eq("id", existing.id);
  } else {
    await supabase.from("club_memberships").insert({
      user_id,
      club_id,
      role: "member",
      ...membershipFields,
    });
  }

  console.log("Membership activated:", user_id, "tier:", tier_id, "subscription:", subscriptionId);
}

// ─── Subscription renewal ─────────────────────────────────────────────────────

async function handleSubscriptionRenewal(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  invoice: Stripe.Invoice
) {
  const subscriptionId = invoice.subscription as string;

  const { data: membership } = await supabase
    .from("club_memberships")
    .select("id, tier_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!membership) {
    console.warn("Renewal: no membership found for subscription", subscriptionId);
    return;
  }

  // Get accurate period end from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const newExpiresAt = new Date(subscription.current_period_end * 1000);

  await supabase
    .from("club_memberships")
    .update({
      status: "active",
      active: true,
      expires_at: newExpiresAt.toISOString(),
      cancels_at: null,
    })
    .eq("id", membership.id);

  console.log("Membership renewed:", membership.id, "new expiry:", newExpiresAt.toISOString());
}

// ─── Subscription cancelled ───────────────────────────────────────────────────

async function handleSubscriptionCancelled(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const subscriptionId = subscription.id;

  const { data: membership } = await supabase
    .from("club_memberships")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!membership) {
    console.warn("Cancellation: no membership found for subscription", subscriptionId);
    return;
  }

  await supabase
    .from("club_memberships")
    .update({ status: "cancelled", active: false, cancels_at: null })
    .eq("id", membership.id);

  console.log("Membership cancelled:", membership.id);
}

// ─── Payment failed on renewal ────────────────────────────────────────────────

async function handlePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice
) {
  const subscriptionId = invoice.subscription as string;

  // Insert a notification so the player sees "payment failed, update card"
  const { data: membership } = await supabase
    .from("club_memberships")
    .select("id, user_id, club_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!membership) return;

  await supabase.from("notifications").insert({
    user_id: membership.user_id,
    type: "membership_payment_failed",
    title: "Membership payment failed",
    body: "Your membership renewal payment failed. Please update your payment method to keep access.",
    data: { membership_id: membership.id, club_id: membership.club_id },
  }).maybeSingle(); // ignore if notifications table has different schema

  console.log("Payment failed notification sent for membership:", membership.id);
}

// ─── Coaching Enrollment ──────────────────────────────────────────────────────

async function handleCoachingEnrollment(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>
) {
  const { coaching_session_id, user_id } = meta;
  const amountPaidCents = parseInt(meta.amount_cents || "0", 10);
  const discountPct = parseInt(meta.discount_pct || "0", 10);

  // Dedup
  const { data: existing } = await supabase
    .from("coaching_enrollments")
    .select("id")
    .eq("coaching_session_id", coaching_session_id)
    .eq("player_id", user_id)
    .eq("status", "confirmed")
    .maybeSingle();
  if (existing) return;

  await supabase.from("coaching_enrollments").insert({
    coaching_session_id,
    player_id: user_id,
    status: "confirmed",
    amount_paid_cents: amountPaidCents,
    discount_pct: discountPct,
    stripe_session_id: session.id,
  });

  // Increment current_participants on the session
  const { data: coachingSession } = await supabase
    .from("coaching_sessions")
    .select("current_participants")
    .eq("id", coaching_session_id)
    .maybeSingle();

  if (coachingSession) {
    await supabase
      .from("coaching_sessions")
      .update({ current_participants: (coachingSession.current_participants ?? 0) + 1 })
      .eq("id", coaching_session_id);
  }

  console.log("Coaching enrollment confirmed:", user_id, "session:", coaching_session_id);
}

// ─── Event Signup ─────────────────────────────────────────────────────────────

async function handleEventSignup(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>
) {
  const { event_id, user_id } = meta;
  const paidCents = parseInt(meta.paid_cents || "0", 10);

  // Dedup
  const { data: existing } = await supabase
    .from("club_event_attendees")
    .select("id")
    .eq("event_id", event_id)
    .eq("user_id", user_id)
    .eq("status", "signed_up")
    .maybeSingle();
  if (existing) return;

  await supabase.from("club_event_attendees").insert({
    event_id,
    user_id,
    status: "signed_up",
    paid_cents: paidCents,
    stripe_session_id: session.id,
  });

  console.log("Event signup confirmed:", user_id, "event:", event_id);
}

// ─── Points Purchase ──────────────────────────────────────────────────────────

async function handlePointsPurchase(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>
) {
  const userId = meta.user_id;
  const packageId = meta.package_id;
  const points = parseInt(meta.points || "0", 10);
  const priceGbp = parseFloat(meta.price_gbp || "0");

  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("padel_park_points")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) throw new Error("Profile not found");

  const oldBalance = profile.padel_park_points;
  const newBalance = oldBalance + points;

  await supabase
    .from("profiles")
    .update({ padel_park_points: newBalance, lifetime_earned: oldBalance + points })
    .eq("user_id", userId);

  await supabase.from("payments").insert({
    user_id: userId,
    package_id: packageId,
    amount_gbp: priceGbp,
    points_granted: points,
    status: "completed",
    stripe_session_id: session.id,
  });

  await supabase.from("points_transactions").insert({
    user_id: userId,
    amount: points,
    balance_before: oldBalance,
    balance_after: newBalance,
    transaction_type: "purchased",
    reason: `Purchased ${points} PP`,
  });
}

// ─── Store order (XPLAY Store, no Shopify) ─────────────────────────────────────
// Points are deducted and the order is marked paid in one DB transaction
// (store_confirm_order). If the order can no longer be honoured, the card
// payment is refunded straight away.

async function handleStoreOrder(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>
) {
  if (session.payment_status !== "paid") return;
  const orderId = meta.order_id;
  if (!orderId) throw new Error("store_order session without order_id");
  const paymentIntent = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  const { data, error } = await supabase.rpc("store_confirm_order", {
    _order_id: orderId,
    _session_id: session.id,
    _payment_intent: paymentIntent,
  });
  if (error) throw new Error("store_confirm_order failed: " + error.message);

  const result = data as { result: string; refund?: boolean };
  if (result?.refund && paymentIntent) {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntent, metadata: { order_id: orderId, reason: result.result } },
      { idempotencyKey: `store-auto-refund-${orderId}` },
    );
    await supabase.from("redemption_orders").update({ stripe_refund_id: refund.id }).eq("id", orderId);
    const { data: order } = await supabase.from("redemption_orders").select("user_id, order_number").eq("id", orderId).maybeSingle();
    if (order) {
      await supabase.from("notifications").insert({
        user_id: order.user_id,
        type: "store_order",
        title: "Order could not be completed",
        body: result.result === "insufficient_points"
          ? `Order #${order.order_number}: you no longer had enough XPLAY Points, so your card payment has been refunded.`
          : `Order #${order.order_number}: the item sold out before your payment arrived, so your card payment has been refunded.`,
        link: "/orders",
      });
    }
  }
  console.log("Store order", orderId, "→", result?.result);
}
