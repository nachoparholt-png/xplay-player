import { supabase } from "@/integrations/supabase/client";

/**
 * After a tournament match is completed, update player stats (wins/losses/total_matches)
 * and optionally trigger the ELO rating calculation via the calculate-ratings edge function.
 *
 * Tournament matches don't use the regular match/score_submissions flow, so we
 * directly update profiles and create a lightweight score_submission + match record
 * that the edge function can consume.
 */

interface TournamentMatchResult {
  tournamentId: string;
  matchId: string;
  teamAId: string;
  teamBId: string;
  teamAScore: number;
  teamBScore: number;
  winnerId: string | null; // "team_a" | "team_b" | null (draw)
  teams: { id: string; player1_id: string; player2_id: string | null }[];
}

/**
 * Update win/loss/total_matches on player profiles after a tournament match.
 */
export async function updatePlayerStats(result: TournamentMatchResult) {
  const teamA = result.teams.find((t) => t.id === result.teamAId);
  const teamB = result.teams.find((t) => t.id === result.teamBId);
  if (!teamA || !teamB) return;

  const aPlayers = [teamA.player1_id, teamA.player2_id].filter(Boolean) as string[];
  const bPlayers = [teamB.player1_id, teamB.player2_id].filter(Boolean) as string[];

  const aWon = result.winnerId === "team_a";
  const bWon = result.winnerId === "team_b";

  const updateBatch = async (playerIds: string[], won: boolean) => {
    for (const pid of playerIds) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("wins, losses, total_matches")
        .eq("user_id", pid)
        .single();
      if (!profile) continue;

      await supabase
        .from("profiles")
        .update({
          total_matches: (profile.total_matches || 0) + 1,
          wins: (profile.wins || 0) + (won ? 1 : 0),
          losses: (profile.losses || 0) + (won ? 0 : 1),
        })
        .eq("user_id", pid);
    }
  };

  await Promise.all([
    updateBatch(aPlayers, aWon),
    updateBatch(bPlayers, bWon),
  ]);
}

/**
 * Submit tournament match result for ELO rating processing.
 * Creates a temporary match + score_submission + match_players so the existing
 * calculate-ratings edge function can process it, then cleans up.
 *
 * This is a best-effort operation — errors are logged but don't block the UI.
 */
export async function submitForRating(result: TournamentMatchResult) {
  try {
    const teamA = result.teams.find((t) => t.id === result.teamAId);
    const teamB = result.teams.find((t) => t.id === result.teamBId);
    if (!teamA || !teamB) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return;

    // Create a temporary match record
    const { data: tempMatch, error: matchErr } = await supabase
      .from("matches")
      .insert({
        organizer_id: user.user.id,
        club: "Tournament",
        match_date: new Date().toISOString().split("T")[0],
        match_time: new Date().toTimeString().split(" ")[0].substring(0, 5),
        format: "competitive",
        status: "confirmed" as const,
        visibility: "private" as const,
        notes: `Tournament match: ${result.tournamentId}`,
      })
      .select("id")
      .single();

    if (matchErr || !tempMatch) {
      console.error("Failed to create temp match for rating:", matchErr);
      return;
    }

    const tempMatchId = tempMatch.id;

    // Insert match_players
    const aPlayers = [teamA.player1_id, teamA.player2_id].filter(Boolean) as string[];
    const bPlayers = [teamB.player1_id, teamB.player2_id].filter(Boolean) as string[];

    const playerRows = [
      ...aPlayers.map((pid) => ({ match_id: tempMatchId, user_id: pid, team: "A" as const, status: "confirmed" as const })),
      ...bPlayers.map((pid) => ({ match_id: tempMatchId, user_id: pid, team: "B" as const, status: "confirmed" as const })),
    ];
    await supabase.from("match_players").insert(playerRows);

    // Insert score_submission
    const resultType = result.winnerId === "team_a" ? "team_a_win" : result.winnerId === "team_b" ? "team_b_win" : "draw";
    await supabase.from("score_submissions").insert({
      match_id: tempMatchId,
      submitted_by: user.user.id,
      result_type: resultType as const,
      status: "validated" as const,
      team_a_set_1: result.teamAScore,
      team_b_set_1: result.teamBScore,
    });

    // Call the edge function
    await supabase.functions.invoke("calculate-ratings", {
      body: { match_id: tempMatchId },
    });

    // Clean up temp match (set to completed/private so it doesn't show in lists)
    await supabase
      .from("matches")
      .update({ status: "completed" as const, visibility: "private" as const })
      .eq("id", tempMatchId);

  } catch (err) {
    console.error("Rating integration error:", err);
  }
}
