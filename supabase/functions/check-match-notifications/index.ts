import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const nowISO = now.toISOString();
    const results: any[] = [];

    // ─── 1. TRANSITION: matches past end time → awaiting_score ───
    // Find matches that are still in pre-game status but past their scheduled time
    const { data: endedMatches } = await supabase
      .from("matches")
      .select("id, club, match_date, match_time, max_players")
      .in("status", ["open", "almost_full", "full"])
      .lte("match_date", now.toISOString().split("T")[0]);

    const matchesToTransition: any[] = [];

    for (const match of endedMatches || []) {
      // Combine date + time to check if match has ended
      // Assume match duration ~1.5 hours
      const matchDateTime = new Date(`${match.match_date}T${match.match_time}`);
      const matchEndTime = new Date(matchDateTime.getTime() + 90 * 60 * 1000); // +1.5hr

      if (now >= matchEndTime) {
        matchesToTransition.push(match);
      }
    }

    for (const match of matchesToTransition) {
      const matchDateTime = new Date(`${match.match_date}T${match.match_time}`);
      const matchEndTime = new Date(matchDateTime.getTime() + 90 * 60 * 1000);
      const deadline = new Date(matchEndTime.getTime() + 24 * 60 * 60 * 1000); // +24hr from end

      // Update match status
      await supabase
        .from("matches")
        .update({
          status: "awaiting_score",
          deadline_at: deadline.toISOString(),
        })
        .eq("id", match.id);

      // Get all confirmed players
      const { data: players } = await supabase
        .from("match_players")
        .select("user_id")
        .eq("match_id", match.id)
        .eq("status", "confirmed");

      // Send notifications to all players
      if (players && players.length > 0) {
        const notifications = players.map((p: any) => ({
          user_id: p.user_id,
          match_id: match.id,
          type: "post_match",
          title: "Match Finished 🏆",
          body: `Your match at ${match.club} has ended. Upload the score now.`,
          link: `/matches/${match.id}`,
        }));

        await supabase.from("notifications").insert(notifications);
      }

      results.push({
        match_id: match.id,
        action: "transitioned_to_awaiting_score",
        players_notified: players?.length || 0,
      });
    }

    // ─── 2. REMINDER: 2hr after match end, no score uploaded ───
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const { data: reminderMatches } = await supabase
      .from("matches")
      .select("id, club, deadline_at")
      .eq("status", "awaiting_score");

    for (const match of reminderMatches || []) {
      if (!match.deadline_at) continue;
      const deadline = new Date(match.deadline_at);
      // Match end time = deadline - 24hr
      const matchEndTime = new Date(deadline.getTime() - 24 * 60 * 60 * 1000);
      const reminderTime = new Date(matchEndTime.getTime() + 2 * 60 * 60 * 1000);

      // Check if it's time for 2hr reminder (within a 15-min window to avoid duplicates)
      if (now >= reminderTime && now < new Date(reminderTime.getTime() + 15 * 60 * 1000)) {
        // Check if we already sent a reminder
        const { data: existingReminder } = await supabase
          .from("notifications")
          .select("id")
          .eq("match_id", match.id)
          .eq("type", "post_match_reminder")
          .limit(1);

        if (!existingReminder || existingReminder.length === 0) {
          const { data: players } = await supabase
            .from("match_players")
            .select("user_id")
            .eq("match_id", match.id)
            .eq("status", "confirmed");

          if (players && players.length > 0) {
            const notifications = players.map((p: any) => ({
              user_id: p.user_id,
              match_id: match.id,
              type: "post_match_reminder",
              title: "Score Still Pending ⏳",
              body: `Don't forget to upload the score for your match at ${match.club}.`,
              link: `/matches/${match.id}`,
            }));

            await supabase.from("notifications").insert(notifications);
            results.push({ match_id: match.id, action: "2hr_reminder_sent" });
          }
        }
      }
    }

    // ─── 3. URGENT: 4hr before deadline ───
    const { data: urgentMatches } = await supabase
      .from("matches")
      .select("id, club, deadline_at")
      .in("status", ["awaiting_score", "score_submitted", "pending_review", "review_requested"])
      .not("deadline_at", "is", null);

    for (const match of urgentMatches || []) {
      const deadline = new Date(match.deadline_at);
      const urgentTime = new Date(deadline.getTime() - 4 * 60 * 60 * 1000);

      if (now >= urgentTime && now < new Date(urgentTime.getTime() + 15 * 60 * 1000)) {
        // Check if already sent
        const { data: existingUrgent } = await supabase
          .from("notifications")
          .select("id")
          .eq("match_id", match.id)
          .eq("type", "post_match_urgent")
          .limit(1);

        if (!existingUrgent || existingUrgent.length === 0) {
          const { data: players } = await supabase
            .from("match_players")
            .select("user_id")
            .eq("match_id", match.id)
            .eq("status", "confirmed");

          if (players && players.length > 0) {
            const notifications = players.map((p: any) => ({
              user_id: p.user_id,
              match_id: match.id,
              type: "post_match_urgent",
              title: "⚠️ 4 Hours Left!",
              body: `Only 4 hours left to resolve your match at ${match.club} before it closes as a draw.`,
              link: `/matches/${match.id}`,
            }));

            await supabase.from("notifications").insert(notifications);
            results.push({ match_id: match.id, action: "urgent_reminder_sent" });
          }
        }
      }
    }

    // ─── 4. AUTO-CLOSE NOTIFICATION (after auto-close-matches runs) ───
    // Check recently auto-closed matches that don't have a close notification yet
    const { data: closedMatches } = await supabase
      .from("matches")
      .select("id, club")
      .in("status", ["auto_closed", "closed_as_draw"]);

    for (const match of closedMatches || []) {
      const { data: existingClose } = await supabase
        .from("notifications")
        .select("id")
        .eq("match_id", match.id)
        .eq("type", "match_auto_closed")
        .limit(1);

      if (!existingClose || existingClose.length === 0) {
        const { data: players } = await supabase
          .from("match_players")
          .select("user_id")
          .eq("match_id", match.id)
          .eq("status", "confirmed");

        if (players && players.length > 0) {
          const notifications = players.map((p: any) => ({
            user_id: p.user_id,
            match_id: match.id,
            type: "match_auto_closed",
            title: "Match Closed as Draw",
            body: `No agreement was reached for your match at ${match.club}. Staked points have been returned.`,
            link: `/matches/${match.id}`,
          }));

          await supabase.from("notifications").insert(notifications);
          results.push({ match_id: match.id, action: "auto_close_notification_sent" });
        }
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
