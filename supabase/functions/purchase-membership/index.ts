import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { tier_id, club_id } = await req.json();
    if (!tier_id || !club_id) return new Response(JSON.stringify({ error: "Missing tier_id or club_id" }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: tier } = await admin.from("membership_tiers").select("*").eq("id", tier_id).single();
    if (!tier || !tier.active) return new Response(JSON.stringify({ error: "Tier not found or inactive" }), { status: 404, headers: corsHeaders });

    const priceCents: number = tier.price_cents || 0;

    // ── Paid tier: create Stripe Subscription checkout ─────────────────────
    if (priceCents > 0) {
      const { data: club } = await admin.from("clubs").select("club_name, currency").eq("id", club_id).single();
      const currency = ((club as any)?.currency || "GBP").toLowerCase();
      const interval: "month" | "year" = tier.billing_period === "annual" ? "year" : "month";

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2023-10-16" });
      // Always use the production web URL — req.headers origin can be
      // "capacitor://localhost" on native which Stripe rejects.
      const appUrl = Deno.env.get("APP_URL") || "https://xplay-player.vercel.app";

      // Find or create a Stripe customer so the subscription is attached to them
      let customerId: string | undefined;
      const existing = await stripe.customers.list({ email: user.email!, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({
          email: user.email!,
          metadata: { supabase_user_id: user.id },
        });
        customerId = newCustomer.id;
      }

      const tierLabel = interval === "year" ? "/ year" : "/ month";
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{
          price_data: {
            currency,
            unit_amount: priceCents,
            recurring: { interval },
            product_data: {
              name: `${tier.name} Membership — ${(club as any)?.club_name || "Club"}`,
              description: `Recurring ${tierLabel} · Courts, coaching & events`,
            },
          },
          quantity: 1,
        }],
        mode: "subscription",
        success_url: `${appUrl}/clubs/${club_id}?membership=success`,
        cancel_url: `${appUrl}/clubs/${club_id}?membership=cancelled`,
        // Metadata on the session AND the subscription so webhooks can identify the record
        metadata: {
          type: "membership",
          tier_id,
          club_id,
          user_id: user.id,
        },
        subscription_data: {
          metadata: {
            type: "membership",
            tier_id,
            club_id,
            user_id: user.id,
          },
        },
      });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Free tier: activate directly ──────────────────────────────────────
    const expiresAt = new Date();
    if (tier.billing_period === "annual") {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    const { data: existingMem } = await admin.from("club_memberships")
      .select("id").eq("user_id", user.id).eq("club_id", club_id).eq("status", "active").maybeSingle();

    if (existingMem) {
      await admin.from("club_memberships").update({
        tier_id,
        status: "active",
        active: true,
        expires_at: expiresAt.toISOString(),
        cancels_at: null,
        stripe_subscription_id: null,
        stripe_customer_id: null,
        role: "member",
      }).eq("id", existingMem.id);
    } else {
      await admin.from("club_memberships").insert({
        user_id: user.id,
        club_id,
        tier_id,
        role: "member",
        active: true,
        status: "active",
        expires_at: expiresAt.toISOString(),
      });
    }

    return new Response(JSON.stringify({ success: true, expires_at: expiresAt.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("purchase-membership error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
