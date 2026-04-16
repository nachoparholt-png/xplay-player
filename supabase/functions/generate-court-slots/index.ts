import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * generate-court-slots
 * 
 * Creates court_slots rows for a given club (or all clubs) based on:
 * - club_operating_hours (day-of-week open/close)
 * - courts (slot_duration_minutes, default_price_cents)
 * - court_pricing_windows (time-of-day pricing overrides)
 *
 * Body: { club_id?: string, days_ahead?: number }
 *   - club_id: optional, if omitted generates for ALL active clubs
 *   - days_ahead: how many days into the future to generate (default 14)
 *
 * Idempotent: skips slots that already exist (same court_id + starts_at).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Optional auth check — allow cron (no auth) or admin users
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error } = await userClient.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Could add admin-only check here if desired
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const daysAhead = Math.min(Math.max(body.days_ahead || 14, 1), 60);
    const targetClubId: string | undefined = body.club_id;

    // 1. Fetch clubs
    let clubQuery = admin.from("clubs").select("id").eq("club_status", "active");
    if (targetClubId) clubQuery = clubQuery.eq("id", targetClubId);
    const { data: clubs, error: clubErr } = await clubQuery;
    if (clubErr) throw clubErr;
    if (!clubs?.length) {
      return new Response(JSON.stringify({ message: "No clubs found", created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clubIds = clubs.map((c) => c.id);

    // 2. Fetch all data in parallel
    const [courtsRes, hoursRes, windowsRes] = await Promise.all([
      admin.from("courts").select("id, club_id, slot_duration_minutes, default_price_cents").eq("active", true).in("club_id", clubIds),
      admin.from("club_operating_hours").select("*").in("club_id", clubIds),
      admin.from("court_pricing_windows").select("*").eq("active", true).in("club_id", clubIds).order("priority", { ascending: false }),
    ]);

    if (courtsRes.error) throw courtsRes.error;
    if (hoursRes.error) throw hoursRes.error;
    if (windowsRes.error) throw windowsRes.error;

    const courts = courtsRes.data || [];
    const hours = hoursRes.data || [];
    const windows = windowsRes.data || [];

    // Index operating hours by club_id → day_of_week
    const hoursMap = new Map<string, Map<number, { open_time: string; close_time: string; is_closed: boolean }>>();
    for (const h of hours) {
      if (!hoursMap.has(h.club_id)) hoursMap.set(h.club_id, new Map());
      hoursMap.get(h.club_id)!.set(h.day_of_week, {
        open_time: h.open_time,
        close_time: h.close_time,
        is_closed: h.is_closed,
      });
    }

    // Index pricing windows by club_id (already sorted by priority desc)
    const windowsMap = new Map<string, typeof windows>();
    for (const w of windows) {
      if (!windowsMap.has(w.club_id)) windowsMap.set(w.club_id, []);
      windowsMap.get(w.club_id)!.push(w);
    }

    // 3. Determine date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const courtIds = courts.map((c) => c.id);
    if (!courtIds.length) {
      return new Response(JSON.stringify({ message: "No active courts found", created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Generate slots
    const slotsToInsert: Array<{
      court_id: string;
      starts_at: string;
      ends_at: string;
      price_cents: number;
      status: string;
    }> = [];

    for (const court of courts) {
      const clubHours = hoursMap.get(court.club_id);
      const clubWindows = windowsMap.get(court.club_id) || [];
      const durationMins = court.slot_duration_minutes || 60;
      const defaultPrice = court.default_price_cents || 0;

      for (let d = 0; d < daysAhead; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() + d);
        const dow = date.getDay(); // 0=Sun

        // Get operating hours for this day
        const dayHours = clubHours?.get(dow);
        if (!dayHours || dayHours.is_closed) continue;

        const [openH, openM] = dayHours.open_time.split(":").map(Number);
        const [closeH, closeM] = dayHours.close_time.split(":").map(Number);
        const openMins = openH * 60 + openM;
        const closeMins = closeH * 60 + closeM;

        // Generate slots from open to close
        for (let mins = openMins; mins + durationMins <= closeMins; mins += durationMins) {
          const slotStart = new Date(date);
          slotStart.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotEnd.getMinutes() + durationMins);

          // Find matching pricing window (highest priority first)
          const slotTimeStr = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
          let priceCents = defaultPrice;

          for (const w of clubWindows) {
            if (!(w.days_of_week as number[]).includes(dow)) continue;
            if (slotTimeStr >= w.start_time && slotTimeStr < w.end_time) {
              priceCents = w.price_cents;
              break; // highest priority wins
            }
          }

          slotsToInsert.push({
            court_id: court.id,
            starts_at: slotStart.toISOString(),
            ends_at: slotEnd.toISOString(),
            price_cents: priceCents,
            status: "available",
          });
        }
      }
    }

    // 6. Batch insert
    let created = 0;
    const BATCH = 500;
    for (let i = 0; i < slotsToInsert.length; i += BATCH) {
      const batch = slotsToInsert.slice(i, i + BATCH);
      const { data: inserted, error: insErr } = await admin.from("court_slots").upsert(batch, { onConflict: "court_id,starts_at", ignoreDuplicates: true }).select("id");
      if (insErr) throw insErr;
      created += inserted?.length || 0;
    }

    return new Response(
      JSON.stringify({
        message: `Generated ${created} slots for ${clubIds.length} club(s), ${daysAhead} days ahead`,
        created,
        clubs: clubIds.length,
        days: daysAhead,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-court-slots error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
