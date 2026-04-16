import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find match conversations where the match ended more than 24 hours ago
    // A match is "ended" if status is completed, confirmed, draw, closed_as_draw, auto_closed, or cancelled
    const endedStatuses = [
      "completed",
      "confirmed",
      "draw",
      "closed_as_draw",
      "auto_closed",
      "cancelled",
    ];

    // Get all match conversations
    const { data: matchConvs, error: convError } = await supabase
      .from("conversations")
      .select("id, match_id, created_at")
      .eq("type", "match")
      .not("match_id", "is", null);

    if (convError) {
      console.error("Error fetching conversations:", convError);
      return new Response(JSON.stringify({ error: convError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!matchConvs || matchConvs.length === 0) {
      return new Response(JSON.stringify({ deleted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matchIds = matchConvs.map((c) => c.match_id!);

    // Get matches that are in ended status
    const { data: endedMatches } = await supabase
      .from("matches")
      .select("id, match_date, match_time, status, updated_at")
      .in("id", matchIds)
      .in("status", endedStatuses);

    if (!endedMatches || endedMatches.length === 0) {
      return new Response(JSON.stringify({ deleted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const match of endedMatches) {
      // Use updated_at (when status changed) as the "ended" time
      const endedAt = new Date(match.updated_at);
      if (endedAt > twentyFourHoursAgo) continue;

      // Find the conversation for this match
      const conv = matchConvs.find((c) => c.match_id === match.id);
      if (!conv) continue;

      // Delete messages first (FK constraint)
      await supabase.from("message_reads").delete().in(
        "message_id",
        (
          await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conv.id)
        ).data?.map((m) => m.id) || []
      );

      await supabase.from("messages").delete().eq("conversation_id", conv.id);
      await supabase
        .from("conversation_participants")
        .delete()
        .eq("conversation_id", conv.id);
      await supabase.from("conversations").delete().eq("id", conv.id);

      deletedCount++;
      console.log(`Deleted match chat for match ${match.id}`);
    }

    return new Response(JSON.stringify({ deleted: deletedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
