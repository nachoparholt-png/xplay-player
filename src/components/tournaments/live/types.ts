/**
 * Tournament Live Mode — shared view-model types used across the
 * tabbed mobile screens. The page-level TournamentLive component
 * builds these once from raw Supabase rows and passes them down.
 */

export interface TournamentRow {
  id: string;
  name: string;
  status: string;
  is_live: boolean | null;
  live_started_at: string | null;
  live_ended_at: string | null;
  live_announcement: string | null;
  started_at: string | null;
  completed_at: string | null;
  format_type: string;
  tournament_type: string;
  player_count: number | null;
  court_count: number | null;
  court_labels: any;
  match_config: any;
  bracket_config: any;
  created_by: string;
  club: string | null;
  club_id: string | null;
}

export interface TMatchRow {
  id: string;
  tournament_id: string;
  match_number: number;
  round_number: number;
  round_type: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  status: string;
  result: any;
  court_number: number | null;
  court_label: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_mins: number | null;
}

export interface TTeamRow {
  id: string;
  tournament_id: string;
  team_name: string;
  player1_id: string;
  player2_id: string | null;
  group_id: string | null;
}

export interface ProfileLite {
  user_id: string;
  display_name: string | null;
}

export interface HelpRequestRow {
  id: string;
  tournament_id: string;
  match_id: string | null;
  requested_by: string;
  court_number: number | null;
  court_label: string | null;
  request_type: 'balls' | 'water' | 'referee' | 'injury' | 'equipment' | 'other';
  note: string | null;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface PlayerStanding {
  team_id: string;
  label: string;
  is_me: boolean;
  played: number;
  wins: number;
  losses: number;
  points_for: number;
  diff: number;
  has_live_match: boolean;
  /** Initials for both players in the team — for avatar rendering */
  initials: { a: string; b: string };
}
