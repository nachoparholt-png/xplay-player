import { supabase } from "@/integrations/supabase/client";
import { generateBracket } from "@/lib/tournaments/bracketGenerator";
import { notifyTournamentLaunched } from "@/lib/tournaments/tournamentNotifications";
import type { WizardState, MatchConfig, BracketConfig, TournamentVisibility, TournamentFormat, CanvasState } from "@/lib/tournaments/types";
import type { Json } from "@/integrations/supabase/types";

interface LaunchResult {
  success: boolean;
  error?: string;
}

export async function launchTournament(tournamentId: string, userId: string): Promise<LaunchResult> {
  // 1. Fetch tournament config
  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();

  if (tErr || !tournament) {
    return { success: false, error: tErr?.message || "Tournament not found" };
  }

  // 2. Fetch confirmed players
  const { data: playerRows } = await supabase
    .from("tournament_players")
    .select("user_id, side_preference, role")
    .eq("tournament_id", tournamentId)
    .eq("status", "confirmed");

  // Filter out non-playing organisers
  const playingRows = (playerRows || []).filter((p: { user_id: string; side_preference: string | null; role: string }) => p.role !== "organiser");
  const players = playingRows.map((p: { user_id: string; side_preference: string | null; role: string }) => ({
    userId: p.user_id,
    sidePreference: p.side_preference,
  }));

  // Build a WizardState-like object from DB row
  const state: WizardState = {
    tournamentId,
    name: tournament.name,
    tournamentType: tournament.tournament_type as "pairs" | "individual",
    playerCount: tournament.player_count,
    courtCount: tournament.court_count,
    totalTimeMins: tournament.total_time_mins,
    visibility: tournament.visibility as TournamentVisibility,
    matchConfig: (tournament.match_config as MatchConfig | null) || { scoring_type: "points", points_target: 21 },
    formatType: tournament.format_type as TournamentFormat,
    bracketConfig: (tournament.bracket_config as BracketConfig | null) || {},
    ratingExempt: tournament.rating_exempt,
    skillLevelMin: tournament.skill_level_min ?? null,
    skillLevelMax: tournament.skill_level_max ?? null,
    requireAdminApprovalForOutOfRange: tournament.require_admin_approval ?? false,
    adminIsPlaying: tournament.admin_is_playing ?? true,
    courtLabels: (tournament.court_labels as string[] | null) || Array.from({ length: tournament.court_count }, (_, i) => String(i + 1)),
    scheduledDate: tournament.scheduled_date || null,
    scheduledTime: tournament.scheduled_time || null,
    clubName: tournament.club || "",
    canvasState: (tournament.canvas_state as CanvasState | null) || { phases: [], rules: [] },
    savedCanvasSummary: null,
  };

  // 3. Generate bracket
  const { teams, matches } = generateBracket(players, state);

  // 4. Insert teams
  if (teams.length > 0) {
    const teamRows = teams.map((t) => ({
      tournament_id: tournamentId,
      team_name: t.teamName,
      player1_id: t.player1Id,
      player2_id: t.player2Id || null,
      group_id: t.groupId || null,
      seed: t.seed || null,
    }));
    const { data: insertedTeams } = await supabase
      .from("tournament_teams")
      .insert(teamRows)
      .select("id, team_name");

    // Build ID mapping
    const teamIdMap: Record<string, string> = {};
    if (insertedTeams) {
      teams.forEach((t, i) => {
        if (insertedTeams[i]) {
          teamIdMap[t.teamId] = insertedTeams[i].id;
        }
      });
    }

    // 5. Insert matches
    if (matches.length > 0) {
      const courtLabels = state.courtLabels;
      const matchRows = matches.map((m) => ({
        tournament_id: tournamentId,
        round_type: m.round_type,
        round_number: m.round_number,
        match_number: m.match_number,
        team_a_id: m.team_a_id ? teamIdMap[m.team_a_id] || m.team_a_id : null,
        team_b_id: m.team_b_id ? teamIdMap[m.team_b_id] || m.team_b_id : null,
        court_number: m.court_number,
        court_label: m.court_number && courtLabels[m.court_number - 1] ? courtLabels[m.court_number - 1] : null,
        match_config: m.match_config as unknown as Json,
        estimated_mins: m.estimated_mins,
        status: m.status,
      }));
      await supabase.from("tournament_matches").insert(matchRows);
    }
  }

  // 6. Update tournament status to active
  const { error: updateErr } = await supabase
    .from("tournaments")
    .update({
      status: "active" as const,
      started_at: new Date().toISOString(),
    })
    .eq("id", tournamentId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // 7. Send notifications
  const playerIds = players.map((p) => p.userId);
  notifyTournamentLaunched(tournamentId, state.name || "Untitled Tournament", playerIds, userId);

  return { success: true };
}
