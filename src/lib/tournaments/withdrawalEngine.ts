import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * Handle a player withdrawing from an active tournament.
 * - Marks the player as cancelled
 * - Awards walkovers on all their pending matches
 * - Optionally replaces them with a standby player
 */
export async function handleWithdrawal(
  tournamentId: string,
  withdrawingUserId: string,
  standbyUserId?: string | null
): Promise<{ success: boolean; error?: string; walkoversApplied: number; replacedTeamId?: string }> {
  try {
    // 1. Find the team(s) this player belongs to
    const { data: teams } = await supabase
      .from("tournament_teams")
      .select("*")
      .eq("tournament_id", tournamentId)
      .or(`player1_id.eq.${withdrawingUserId},player2_id.eq.${withdrawingUserId}`);

    if (!teams || teams.length === 0) {
      return { success: false, error: "Player not found in tournament", walkoversApplied: 0 };
    }

    const affectedTeamIds = teams.map((t: { id: string; player1_id: string; player2_id: string | null }) => t.id);

    // 2. Mark player status as cancelled
    await supabase
      .from("tournament_players")
      .update({ status: "cancelled" as const })
      .eq("tournament_id", tournamentId)
      .eq("user_id", withdrawingUserId)
      .select();

    // 3. Find all pending matches involving this team
    const { data: pendingMatches } = await supabase
      .from("tournament_matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .in("status", ["pending", "in_progress"]);

    const affectedMatches = (pendingMatches || []).filter((m: { team_a_id: string | null; team_b_id: string | null; [key: string]: any }) =>
      affectedTeamIds.includes(m.team_a_id) || affectedTeamIds.includes(m.team_b_id)
    );

    let walkoversApplied = 0;

    // 4. If no standby replacement, apply walkovers
    if (!standbyUserId) {
      for (const match of affectedMatches) {
        const isTeamA = affectedTeamIds.includes(match.team_a_id);
        const winnerId = isTeamA ? match.team_b_id : match.team_a_id;

        // Only apply walkover if opponent exists
        if (winnerId) {
          await supabase
            .from("tournament_matches")
            .update({
              status: "completed" as const,
              completed_at: new Date().toISOString(),
              result: {
                team_a_score: isTeamA ? 0 : 1,
                team_b_score: isTeamA ? 1 : 0,
                winner_team_id: winnerId,
                walkover: true,
                walkover_reason: "player_withdrawal",
              } as unknown as Json,
            })
            .eq("id", match.id)
            .select();

          walkoversApplied++;
        } else {
          // No opponent either, just cancel the match
          await supabase
            .from("tournament_matches")
            .update({ status: "cancelled" as const })
            .eq("id", match.id)
            .select();
        }
      }

      return { success: true, walkoversApplied };
    }

    // 5. Standby replacement: swap the withdrawing player on the team
    const replacedTeam = teams[0];
    const updatePayload: Record<string, string> = {};

    if (replacedTeam.player1_id === withdrawingUserId) {
      updatePayload.player1_id = standbyUserId;
    } else if (replacedTeam.player2_id === withdrawingUserId) {
      updatePayload.player2_id = standbyUserId;
    }

    if (Object.keys(updatePayload).length > 0) {
      await supabase
        .from("tournament_teams")
        .update(updatePayload)
        .eq("id", replacedTeam.id)
        .select();
    }

    // Add standby player to tournament_players
    await supabase.from("tournament_players").insert({
      tournament_id: tournamentId,
      user_id: standbyUserId,
      team_id: replacedTeam.id,
      status: "confirmed" as const,
    });

    return { success: true, walkoversApplied: 0, replacedTeamId: replacedTeam.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message, walkoversApplied: 0 };
  }
}

/**
 * Apply a walkover to a specific match (admin/creator action).
 * The specified team wins by default.
 */
export async function applyWalkover(
  matchId: string,
  winnerTeamId: string,
  reason: string = "walkover"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: match } = await supabase
      .from("tournament_matches")
      .select("team_a_id, team_b_id")
      .eq("id", matchId)
      .single();

    if (!match) return { success: false, error: "Match not found" };

    const isTeamA = match.team_a_id === winnerTeamId;

    const { error } = await supabase
      .from("tournament_matches")
      .update({
        status: "completed" as const,
        completed_at: new Date().toISOString(),
        result: {
          team_a_score: isTeamA ? 1 : 0,
          team_b_score: isTeamA ? 0 : 1,
          winner_team_id: winnerTeamId,
          walkover: true,
          walkover_reason: reason,
        } as unknown as Json,
      })
      .eq("id", matchId)
      .select();

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}
