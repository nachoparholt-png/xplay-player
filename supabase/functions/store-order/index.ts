import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// XPLAY Store — orders without Shopify.
// actions: create | finalise | cancel | admin_refund
// All money/points/stock rules live in the database functions (store_*); this file only
// talks to Stripe and passes the signed-in user through.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "");
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error("Not authenticated");

    const body = await req.json();
    const action: string = body.action ?? "create";
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2023-10-16" });

    // ── create: hold the item, work out what is due, open Stripe if anything is ──
    if (action === "create") {
      const { variant_id, points_to_use, shipping_address } = body;
      if (!variant_id) throw new Error("Please choose a size");

      const { data: order, error } = await admin.rpc("store_create_order", {
        _user_id: user.id,
        _variant_id: variant_id,
        _points_to_use: Number.isFinite(points_to_use) ? Math.floor(points_to_use) : null,
        _address: shipping_address ?? {},
        _fulfilment: "delivery",
        _pickup_location_id: null,
      });
      if (error) throw new Error(error.message);

      if (!order.needs_payment) return json({ success: true, order });

      try {
        const origin = req.headers.get("origin") || "https://xplay-player.vercel.app";
        const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
        if (order.item_cash_pence > 0) {
          line_items.push({
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: order.item_cash_pence,
              product_data: {
                name: `${order.product_title}${order.variant_label && order.variant_label !== "One size" ? ` — ${order.variant_label}` : ""}`,
                description: order.points_to_use > 0 ? `${order.points_to_use} XPLAY Points applied` : undefined,
              },
            },
          });
        }
        if (order.delivery_fee_pence > 0) {
          line_items.push({
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: order.delivery_fee_pence,
              product_data: { name: "UK delivery" },
            },
          });
        }

        let customerId: string | undefined;
        if (user.email) {
          const customers = await stripe.customers.list({ email: user.email, limit: 1 });
          customerId = customers.data[0]?.id;
        }

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer: customerId,
          customer_email: customerId ? undefined : user.email,
          line_items,
          // Stripe's shortest session life is 30 minutes; the item is held for 35.
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
          metadata: { type: "store_order", order_id: order.order_id, user_id: user.id },
          payment_intent_data: { metadata: { type: "store_order", order_id: order.order_id, user_id: user.id } },
          success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/marketplace?cancelled_order=${order.order_id}`,
        });

        await admin.from("redemption_orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.order_id);
        return json({ success: true, order, url: session.url });
      } catch (stripeErr) {
        // could not open Stripe → give the item back at once
        await admin.rpc("store_release_order", { _order_id: order.order_id, _reason: "checkout_failed" });
        throw stripeErr;
      }
    }

    // ── finalise: player is back from Stripe (the webhook may already have done this) ──
    if (action === "finalise") {
      const { stripe_session_id } = body;
      if (!stripe_session_id) throw new Error("Missing session");
      const session = await stripe.checkout.sessions.retrieve(stripe_session_id);
      const meta = session.metadata ?? {};
      if (meta.type !== "store_order" || !meta.order_id) throw new Error("This payment is not a store order");
      if (meta.user_id !== user.id) throw new Error("This payment belongs to another account");
      if (session.payment_status !== "paid") throw new Error("Payment not completed");

      const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
      const { data: result, error } = await admin.rpc("store_confirm_order", {
        _order_id: meta.order_id, _session_id: session.id, _payment_intent: paymentIntent,
      });
      if (error) throw new Error(error.message);

      if (result?.refund && paymentIntent) {
        const refund = await stripe.refunds.create(
          { payment_intent: paymentIntent, metadata: { order_id: meta.order_id, reason: result.result } },
          { idempotencyKey: `store-auto-refund-${meta.order_id}` },
        );
        await admin.from("redemption_orders").update({ stripe_refund_id: refund.id }).eq("id", meta.order_id);
        throw new Error(
          result.result === "insufficient_points"
            ? "You no longer had enough XPLAY Points for this order, so your card payment has been refunded."
            : "This item sold out before your payment arrived, so your card payment has been refunded.",
        );
      }
      return json({ success: true, result: result?.result, order_id: meta.order_id });
    }

    // ── cancel: player left Stripe without paying → item back into stock now ──
    if (action === "cancel") {
      const { order_id } = body;
      if (!order_id) throw new Error("Missing order");
      const { data: order } = await admin.from("redemption_orders")
        .select("id, user_id, status, stripe_checkout_session_id").eq("id", order_id).maybeSingle();
      if (!order || order.user_id !== user.id) throw new Error("Order not found");
      if (order.status !== "awaiting_payment") return json({ success: true, released: false });

      if (order.stripe_checkout_session_id) {
        const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
        if (session.payment_status === "paid") return json({ success: true, released: false, paid: true });
        if (session.status === "open") await stripe.checkout.sessions.expire(session.id).catch(() => null);
      }
      const { data: released } = await admin.rpc("store_release_order", { _order_id: order_id, _reason: "user_cancelled" });
      return json({ success: true, released: !!released });
    }

    // ── admin_refund: points back, card refunded, optional restock ──
    if (action === "admin_refund") {
      const { order_id, restock } = body;
      if (!order_id) throw new Error("Missing order");
      const { data: info, error } = await admin.rpc("store_admin_refund_order", {
        _order_id: order_id, _restock: restock !== false, _admin_id: user.id,
      });
      if (error) throw new Error(error.message);

      let cardRefunded = false;
      let cardError: string | null = null;
      if (info?.cash_paid_cents > 0) {
        if (!info.payment_intent) {
          cardError = "No Stripe payment is recorded on this order";
        } else {
          try {
            const refund = await stripe.refunds.create(
              { payment_intent: info.payment_intent, metadata: { order_id, reason: "admin_refund" } },
              { idempotencyKey: `store-admin-refund-${order_id}` },
            );
            await admin.from("redemption_orders").update({ stripe_refund_id: refund.id }).eq("id", order_id);
            cardRefunded = true;
          } catch (e) {
            cardError = e instanceof Error ? e.message : "Stripe refund failed";
          }
        }
      }
      return json({ success: true, card_refunded: cardRefunded, card_error: cardError, cash_paid_cents: info?.cash_paid_cents ?? 0 });
    }

    throw new Error("Unknown action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("store-order error:", message);
    return json({ error: message }, 400);
  }
});
