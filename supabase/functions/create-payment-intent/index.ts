import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user?.email) throw new Error("Not authenticated");

    const { product_id, shipping_address, points_to_use } = await req.json();
    if (!product_id) throw new Error("product_id is required");

    // Fetch product
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", product_id)
      .eq("active", true)
      .single();
    if (productError || !product) throw new Error("Product not found");

    // Fetch user profile for points
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("padel_park_points")
      .eq("user_id", user.id)
      .single();
    if (!profile) throw new Error("Profile not found");

    const pointPrice = product.point_price;
    const userPoints = profile.padel_park_points;
    // Use client-provided points_to_use, clamped to valid range
    const pointsToUse = Math.max(0, Math.min(points_to_use ?? Math.min(userPoints, pointPrice), userPoints, pointPrice));
    const shortfallPts = pointPrice - pointsToUse;
    // 10 PP = £1 → 1 PP = 10 pence → shortfall in pence = shortfallPts * 10
    const chargeAmountCents = shortfallPts * 10;

    if (chargeAmountCents <= 0) {
      throw new Error("No card payment needed — use full points redemption instead");
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://racketeer-rewards.lovable.app";

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: product.title,
              description: `${pointsToUse} PP applied, paying remainder`,
            },
            unit_amount: chargeAmountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        type: "product_redemption",
        product_id,
        user_id: user.id,
        points_to_use: pointsToUse.toString(),
        shipping_address: shipping_address ? JSON.stringify(shipping_address) : "",
      },
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/marketplace`,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
