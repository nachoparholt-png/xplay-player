import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { court_slot_id, club_id } = await req.json();
    if (!court_slot_id || !club_id) return new Response(JSON.stringify({ error: "Missing court_slot_id or club_id" }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check slot availability
    const { data: slot } = await admin.from("court_slots").select("*").eq("id", court_slot_id).single();
    if (!slot || slot.status !== "available") return new Response(JSON.stringify({ error: "Slot not available" }), { status: 400, headers: corsHeaders });

    // Check membership discount
    let discountPct = 0;
    const { data: membership } = await admin.from("club_memberships")
      .select("*, membership_tiers(*)")
      .eq("user_id", user.id).eq("club_id", club_id).eq("status", "active").maybeSingle();
    if (membership?.membership_tiers) {
      discountPct = (membership.membership_tiers as any).court_discount || 0;
    }

    const priceCents = slot.price_cents || 0;
    const finalPrice = Math.round(priceCents * (1 - discountPct / 100));

    // Book the slot
    await admin.from("court_slots").update({ status: "booked", booked_by: user.id }).eq("id", court_slot_id);

    // Create booking record
    const { data: booking, error: bookErr } = await admin.from("court_bookings").insert({
      court_slot_id,
      user_id: user.id,
      club_id,
      amount_paid_cents: finalPrice,
      discount_pct: discountPct,
      status: "confirmed",
    }).select().single();

    if (bookErr) throw bookErr;

    return new Response(JSON.stringify({ booking, amount_cents: finalPrice }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
