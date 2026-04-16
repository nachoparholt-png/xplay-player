import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

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

    const { event_id } = await req.json();
    if (!event_id) return new Response(JSON.stringify({ error: "Missing event_id" }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: event } = await admin.from("club_events").select("*").eq("id", event_id).single();
    if (!event || event.status !== "published") return new Response(JSON.stringify({ error: "Event not available" }), { status: 400, headers: corsHeaders });

    // Capacity check
    if (event.max_attendees) {
      const { count } = await admin.from("club_event_attendees").select("id", { count: "exact", head: true })
        .eq("event_id", event_id).eq("status", "signed_up");
      if ((count || 0) >= event.max_attendees) return new Response(JSON.stringify({ error: "Event full" }), { status: 400, headers: corsHeaders });
    }

    // Dedup check
    const { data: existing } = await admin.from("club_event_attendees")
      .select("id").eq("event_id", event_id).eq("user_id", user.id).eq("status", "signed_up").maybeSingle();
    if (existing) return new Response(JSON.stringify({ error: "Already signed up" }), { status: 400, headers: corsHeaders });

    const priceCents: number = event.price_cents || 0;

    // ── Paid event: create Stripe checkout ────────────────────────────────
    if (priceCents > 0) {
      const { data: club } = await admin.from("clubs").select("club_name, currency").eq("id", event.club_id).single();
      const currency = ((club as any)?.currency || "GBP").toLowerCase();

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
      const origin = req.headers.get("origin") || "https://xplay-player.vercel.app";

      const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
      const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;

      const eventDate = event.event_date || event.starts_at
        ? new Date(event.event_date || event.starts_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
        : "";

      const stripeSession = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email!,
        line_items: [{
          price_data: {
            currency,
            unit_amount: priceCents,
            product_data: {
              name: `${event.title} — ${(club as any)?.club_name || "Club"}`,
              description: eventDate ? `Event · ${eventDate}` : "Club event",
            },
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${origin}/clubs/${event.club_id}?event=success`,
        cancel_url: `${origin}/clubs/${event.club_id}?event=cancelled`,
        metadata: {
          type: "event_signup",
          event_id,
          club_id: event.club_id,
          user_id: user.id,
          paid_cents: String(priceCents),
        },
      });

      return new Response(JSON.stringify({ url: stripeSession.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Free event: sign up directly ──────────────────────────────────────
    const { data: attendee, error: insertErr } = await admin.from("club_event_attendees").insert({
      event_id,
      user_id: user.id,
      status: "signed_up",
      paid_cents: 0,
    }).select().single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ attendee }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("signup-club-event error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
