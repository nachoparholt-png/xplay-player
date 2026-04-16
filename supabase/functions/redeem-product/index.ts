import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SHOPIFY_DOMAIN = () => Deno.env.get("SHOPIFY_STORE_DOMAIN") ?? "";
const SHOPIFY_TOKEN = () => Deno.env.get("SHOPIFY_ACCESS_TOKEN") ?? "";
const SHOPIFY_API = "2025-07";

// ─── Shopify helpers ──────────────────────────────────────────────────────────

/** Returns true if the Shopify variant is available for sale (inventory > 0 or oversell allowed). */
async function shopifyVariantAvailable(variantGid: string): Promise<boolean> {
  const domain = SHOPIFY_DOMAIN();
  const token = SHOPIFY_TOKEN();
  if (!domain || !token) {
    console.warn("SHOPIFY_STORE_DOMAIN / SHOPIFY_ACCESS_TOKEN not set — skipping stock check");
    return true; // fail open so redemption isn't broken by missing config
  }

  const numericId = variantGid.replace("gid://shopify/ProductVariant/", "");
  try {
    const resp = await fetch(
      `https://${domain}/admin/api/${SHOPIFY_API}/variants/${numericId}.json`,
      { headers: { "X-Shopify-Access-Token": token } },
    );
    if (!resp.ok) {
      console.error("Shopify variant check failed:", resp.status, await resp.text());
      return true; // fail open
    }
    const { variant } = await resp.json();
    // inventory_policy "continue" means sell even when out of stock
    if (variant.inventory_policy === "continue") return true;
    return (variant.inventory_quantity ?? 0) > 0;
  } catch (err) {
    console.error("Shopify variant check error:", err);
    return true; // fail open
  }
}

/** Creates a £0.00 Shopify order which triggers fulfilment + inventory decrement. */
async function createShopifyOrder(
  product: { title: string; shopify_variant_id: string | null },
  shippingAddress: Record<string, string> | null,
  userId: string,
): Promise<string | null> {
  const domain = SHOPIFY_DOMAIN();
  const token = SHOPIFY_TOKEN();
  if (!domain || !token || !product.shopify_variant_id) return null;

  const numericId = product.shopify_variant_id.replace("gid://shopify/ProductVariant/", "");

  const orderPayload: Record<string, unknown> = {
    order: {
      line_items: [{ variant_id: parseInt(numericId), quantity: 1, price: "0.00" }],
      financial_status: "paid",
      tags: "xplay-redemption",
      note: `XPLAY XP redemption — user ${userId}`,
    },
  };

  if (shippingAddress) {
    (orderPayload.order as Record<string, unknown>).shipping_address = {
      first_name: shippingAddress.name?.split(" ")[0] ?? "",
      last_name: shippingAddress.name?.split(" ").slice(1).join(" ") ?? "",
      address1: shippingAddress.address1 ?? shippingAddress.line1 ?? "",
      address2: shippingAddress.address2 ?? shippingAddress.line2 ?? "",
      city: shippingAddress.city ?? "",
      zip: shippingAddress.postcode ?? shippingAddress.zip ?? "",
      country: shippingAddress.country ?? "GB",
    };
  }

  try {
    const resp = await fetch(
      `https://${domain}/admin/api/${SHOPIFY_API}/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify(orderPayload),
      },
    );
    if (!resp.ok) {
      console.error("Shopify order creation failed:", resp.status, await resp.text());
      return null;
    }
    const { order } = await resp.json();
    console.log("Shopify order created:", order.id, "for user:", userId);
    return order?.id?.toString() ?? null;
  } catch (err) {
    console.error("Shopify order error:", err);
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    // Auth
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) throw new Error("Not authenticated");

    const body = await req.json();
    const { product_id, shipping_address, stripe_session_id } = body;

    // ── Hybrid path: Stripe Checkout already paid → finalise ──────────────────
    if (stripe_session_id) {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
        apiVersion: "2023-10-16",
      });

      const session = await stripe.checkout.sessions.retrieve(stripe_session_id);
      if (session.payment_status !== "paid") throw new Error("Payment not completed");

      // Idempotency check
      const { data: existingOrder } = await supabaseAdmin
        .from("redemption_orders")
        .select("id")
        .eq("stripe_payment_intent_id", stripe_session_id)
        .maybeSingle();
      if (existingOrder) {
        return new Response(
          JSON.stringify({ success: true, order: existingOrder, already_redeemed: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const meta = session.metadata ?? {};
      const sessionProductId = meta.product_id;
      const sessionUserId = meta.user_id;
      const pointsToUse = parseInt(meta.points_to_use ?? "0", 10);
      const sessionShipping = meta.shipping_address ? JSON.parse(meta.shipping_address) : null;

      if (sessionUserId !== user.id) throw new Error("Session user mismatch");

      const { data: product } = await supabaseAdmin
        .from("products")
        .select("*")
        .eq("id", sessionProductId)
        .eq("active", true)
        .single();
      if (!product) throw new Error("Product not found");

      // ✅ Option 2: check Shopify inventory (not local stock)
      if (product.shopify_variant_id) {
        const available = await shopifyVariantAvailable(product.shopify_variant_id);
        if (!available) throw new Error("Out of stock");
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("padel_park_points")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      const actualPointsToUse = Math.min(pointsToUse, profile.padel_park_points);
      const cashPaidCents = product.point_price - actualPointsToUse;

      if (actualPointsToUse > 0) {
        const newBalance = profile.padel_park_points - actualPointsToUse;
        await supabaseAdmin
          .from("profiles")
          .update({ padel_park_points: newBalance })
          .eq("user_id", user.id);
        await supabaseAdmin.from("points_transactions").insert({
          user_id: user.id,
          amount: -actualPointsToUse,
          balance_before: profile.padel_park_points,
          balance_after: newBalance,
          transaction_type: "spent",
          reason: `Redeemed: ${product.title}`,
        });
      }

      // ✅ Shopify order creation decrements inventory automatically
      const shopifyOrderId = await createShopifyOrder(product, sessionShipping, user.id);

      const { data: order, error: orderError } = await supabaseAdmin
        .from("redemption_orders")
        .insert({
          user_id: user.id,
          product_id: sessionProductId,
          points_used: actualPointsToUse,
          cash_paid_cents: cashPaidCents,
          stripe_payment_intent_id: stripe_session_id,
          status: "paid",
          shipping_address: sessionShipping,
          shopify_order_id: shopifyOrderId,
        })
        .select()
        .single();
      if (orderError) throw new Error("Failed to create order: " + orderError.message);

      return new Response(JSON.stringify({ success: true, order }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Full XP redemption path ────────────────────────────────────────────────
    if (!product_id) throw new Error("product_id is required");

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", product_id)
      .eq("active", true)
      .single();
    if (!product) throw new Error("Product not found");

    // ✅ Option 2: check Shopify inventory (not local stock)
    if (product.shopify_variant_id) {
      const available = await shopifyVariantAvailable(product.shopify_variant_id);
      if (!available) throw new Error("Out of stock");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("padel_park_points")
      .eq("user_id", user.id)
      .single();
    if (!profile) throw new Error("Profile not found");

    const pointPrice = product.point_price;
    if (profile.padel_park_points < pointPrice) throw new Error("Insufficient XP");

    const newBalance = profile.padel_park_points - pointPrice;
    await supabaseAdmin
      .from("profiles")
      .update({ padel_park_points: newBalance })
      .eq("user_id", user.id);
    await supabaseAdmin.from("points_transactions").insert({
      user_id: user.id,
      amount: -pointPrice,
      balance_before: profile.padel_park_points,
      balance_after: newBalance,
      transaction_type: "spent",
      reason: `Redeemed: ${product.title}`,
    });

    // ✅ Shopify order creation decrements inventory automatically
    const shopifyOrderId = await createShopifyOrder(product, shipping_address ?? null, user.id);

    const { data: order, error: orderError } = await supabaseAdmin
      .from("redemption_orders")
      .insert({
        user_id: user.id,
        product_id,
        points_used: pointPrice,
        cash_paid_cents: 0,
        status: "pending",
        shipping_address: shipping_address ?? null,
        shopify_order_id: shopifyOrderId,
      })
      .select()
      .single();
    if (orderError) throw new Error("Failed to create order: " + orderError.message);

    return new Response(JSON.stringify({ success: true, order }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("redeem-product error:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
