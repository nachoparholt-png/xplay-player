import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is authenticated
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { tournamentId, stage } = await req.json();
    const validStages = ["knockouts", "final", "win"];
    if (!validStages.includes(stage)) {
      return new Response(JSON.stringify({ error: "Invalid stage" }), { status: 400, headers: corsHeaders });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Upsert window as open
    const { data, error } = await serviceClient
      .from("tournament_bet_windows")
      .upsert(
        {
          tournament_id: tournamentId,
          stage,
          status: "open",
          opens_at: new Date().toISOString(),
        },
        { onConflict: "tournament_id,stage" }
      )
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    // Auto-seed TBP allocations for all confirmed participants
    const [{ data: config }, { data: confirmedPlayers }] = await Promise.all([
      serviceClient
        .from("tournament_bet_config")
        .select("allocation_pts")
        .eq("tournament_id", tournamentId)
        .single(),
      serviceClient
        .from("tournament_players")
        .select("user_id, team_id")
        .eq("tournament_id", tournamentId)
        .eq("status", "confirmed"),
    ]);

    if (config && confirmedPlayers && confirmedPlayers.length > 0) {
      const allocationPts = config.allocation_pts || 500;

      const allocations = confirmedPlayers
        .filter((p: any) => p.team_id) // only players assigned to a team
        .map((p: any) => ({
          tournament_id: tournamentId,
          user_id: p.user_id,
          team_id: p.team_id,
          total_pts: allocationPts,
          spent_pts: 0,
          won_pts: 0,
        }));

      if (allocations.length > 0) {
        await serviceClient
          .from("tournament_bet_allocations")
          .upsert(allocations, { onConflict: "tournament_id,user_id", ignoreDuplicates: true });
      }
    }

    return new Response(JSON.stringify({ success: true, window: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
