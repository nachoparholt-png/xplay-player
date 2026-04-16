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

    const { booking_id } = await req.json();
    if (!booking_id) return new Response(JSON.stringify({ error: "Missing booking_id" }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: booking } = await admin.from("court_bookings").select("*").eq("id", booking_id).single();
    if (!booking) return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404, headers: corsHeaders });
    if (booking.user_id !== user.id) return new Response(JSON.stringify({ error: "Not your booking" }), { status: 403, headers: corsHeaders });

    await admin.from("court_bookings").update({ status: "cancelled" }).eq("id", booking_id);
    await admin.from("court_slots").update({ status: "available", booked_by: null }).eq("id", booking.court_slot_id);

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
