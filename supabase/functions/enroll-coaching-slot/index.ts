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

    const { coaching_session_id } = await req.json();
    if (!coaching_session_id) return new Response(JSON.stringify({ error: "Missing coaching_session_id" }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch session + capacity check
    const { data: session } = await admin.from("coaching_sessions").select("*").eq("id", coaching_session_id).single();
    if (!session) return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });

    const { count } = await admin.from("coaching_enrollments").select("id", { count: "exact", head: true })
      .eq("coaching_session_id", coaching_session_id).eq("status", "confirmed");
    if (session.max_players && (count || 0) >= session.max_players) {
      return new Response(JSON.stringify({ error: "Session full" }), { status: 400, headers: corsHeaders });
    }

    // Dedup check
    const { data: existing } = await admin.from("coaching_enrollments")
      .select("id").eq("coaching_session_id", coaching_session_id).eq("player_id", user.id).eq("status", "confirmed").maybeSingle();
    if (existing) return new Response(JSON.stringify({ error: "Already enrolled" }), { status: 400, headers: corsHeaders });

    // Compute price with membership discount
    let discountPct = 0;
    const priceCents: number = session.price_cents || 0;
    if (priceCents > 0) {
      const { data: membership } = await admin.from("club_memberships")
        .select("*, membership_tiers(coaching_discount)")
        .eq("user_id", user.id).eq("club_id", session.club_id).eq("status", "active").maybeSingle();
      if (membership?.membership_tiers) {
        discountPct = (membership.membership_tiers as any).coaching_discount || 0;
      }
    }
    const finalPriceCents = Math.round(priceCents * (1 - discountPct / 100));

    // ── Paid session: create Stripe checkout ──────────────────────────────
    if (finalPriceCents > 0) {
      const { data: club } = await admin.from("clubs").select("club_name, currency").eq("id", session.club_id).single();
      const currency = ((club as any)?.currency || "GBP").toLowerCase();

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
      const origin = req.headers.get("origin") || "https://xplay-player.vercel.app";

      const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
      const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;

      const startDate = session.starts_at
        ? new Date(session.starts_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
        : "";

      const stripeSession = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email!,
        line_items: [{
          price_data: {
            currency,
            unit_amount: finalPriceCents,
            product_data: {
              name: `${session.title} — ${(club as any)?.club_name || "Club"}`,
              description: startDate ? `Coaching session · ${startDate}` : "Coaching session",
            },
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${origin}/clubs/${session.club_id}?coaching=success`,
        cancel_url: `${origin}/clubs/${session.club_id}?coaching=cancelled`,
        metadata: {
          type: "coaching_enrollment",
          coaching_session_id,
          club_id: session.club_id,
          user_id: user.id,
          amount_cents: String(finalPriceCents),
          discount_pct: String(discountPct),
        },
      });

      return new Response(JSON.stringify({ url: stripeSession.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Free session: enroll directly ─────────────────────────────────────
    const { data: enrollment, error: enrollErr } = await admin.from("coaching_enrollments").insert({
      coaching_session_id,
      player_id: user.id,
      status: "confirmed",
      amount_paid_cents: 0,
      discount_pct: discountPct,
    }).select().single();

    if (enrollErr) throw enrollErr;

    // Update current_participants
    await admin.from("coaching_sessions")
      .update({ current_participants: (session.current_participants ?? 0) + 1 })
      .eq("id", coaching_session_id);

    return new Response(JSON.stringify({ enrollment }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enroll-coaching-slot error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
