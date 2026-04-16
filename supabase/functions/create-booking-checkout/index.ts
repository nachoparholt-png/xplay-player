import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;

    // Parse body
    const body = await req.json();
    const { court_slot_id, club_id, match_type } = body;

    if (!court_slot_id || !club_id) {
      return new Response(
        JSON.stringify({ error: "Missing court_slot_id or club_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (match_type && !["private", "public"].includes(match_type)) {
      return new Response(
        JSON.stringify({ error: "match_type must be 'private' or 'public'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch slot
    const { data: slot, error: slotErr } = await admin
      .from("court_slots")
      .select("*, courts(name, club_id, court_type, surface)")
      .eq("id", court_slot_id)
      .single();

    if (slotErr || !slot) {
      return new Response(JSON.stringify({ error: "Slot not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (slot.status !== "available") {
      return new Response(JSON.stringify({ error: "Slot is no longer available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check membership discount via tier
    let discountPct = 0;
    const { data: membership } = await admin
      .from("club_memberships")
      .select("*, membership_tiers(court_discount)")
      .eq("user_id", userId)
      .eq("club_id", club_id)
      .eq("status", "active")
      .maybeSingle();

    if (membership?.membership_tiers) {
      discountPct = (membership.membership_tiers as any).court_discount || 0;
    }

    // Fetch club name + currency
    const { data: club } = await admin
      .from("clubs")
      .select("club_name, currency")
      .eq("id", club_id)
      .single();

    const priceCents = slot.price_cents || 0;
    const discountCents = Math.round(priceCents * (discountPct / 100));
    const finalPriceCents = priceCents - discountCents;

    // If free, book directly without Stripe
    if (finalPriceCents <= 0) {
      await admin
        .from("court_slots")
        .update({ status: "booked", booked_by: userId })
        .eq("id", court_slot_id);

      const { data: booking } = await admin
        .from("court_bookings")
        .insert({
          court_slot_id,
          user_id: userId,
          club_id,
          amount_paid_cents: 0,
          discount_pct: discountPct,
          status: "confirmed",
        })
        .select()
        .single();

      return new Response(
        JSON.stringify({ booking, free: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reserve slot temporarily
    await admin
      .from("court_slots")
      .update({ status: "held", booked_by: userId })
      .eq("id", court_slot_id)
      .eq("status", "available");

    // Create pending booking record
    const { data: booking, error: bookErr } = await admin
      .from("court_bookings")
      .insert({
        court_slot_id,
        user_id: userId,
        club_id,
        amount_paid_cents: finalPriceCents,
        discount_pct: discountPct,
        status: "pending",
      })
      .select()
      .single();

    if (bookErr) throw bookErr;

    // Stripe checkout
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find or skip existing customer
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;

    const courtName = (slot.courts as any)?.name || "Court";
    const clubName = club?.club_name || "Club";
    const slotStart = new Date(slot.starts_at);
    const slotEnd = new Date(slot.ends_at);
    const timeLabel = `${slotStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} – ${slotEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    const dateLabel = slotStart.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

    const origin = req.headers.get("origin") || "https://xplay-player.vercel.app";
    const currency = ((club as any)?.currency || "GBP").toLowerCase();

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: finalPriceCents,
            product_data: {
              name: `${courtName} — ${clubName}`,
              description: `${dateLabel} · ${timeLabel} · ${match_type || "private"} match`,
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/clubs/${club_id}?booking=success&id=${booking!.id}`,
      cancel_url: `${origin}/clubs/${club_id}?booking=cancelled&id=${booking!.id}`,
      metadata: {
        type: "court_booking",
        booking_id: booking!.id,
        court_slot_id,
        club_id,
        user_id: userId,
        match_type: match_type || "private",
      },
    });

    return new Response(
      JSON.stringify({ url: session.url, booking_id: booking!.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("create-booking-checkout error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
