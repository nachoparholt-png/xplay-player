export type TournamentVisibility = "public" | "private";
export type TournamentStatus = "draft" | "active" | "completed" | "cancelled";
export type TournamentFormat = "groups" | "americano" | "king_of_court";
export type TournamentPlayerStatus = "confirmed" | "cancelled";
export type ScoringMode = "points" | "games";
export type DeuceMode = "normal" | "silver" | "golden";

export interface MatchConfig {
  scoring_type: ScoringMode;
  points_per_match?: number;
  points_target?: number;
  games_per_set?: number;
  sets_per_match?: number;
  deuce_enabled?: boolean;
  deuce_mode?: DeuceMode;
  golden_point?: boolean;
  third_set_tiebreak?: boolean;
  tiebreak_at?: number;
}

export interface BracketConfig {
  group_count?: number;
  teams_per_group?: number;
  advance_count?: number;
  knockout_rounds?: number;
  knockout_structure?: "groups_only" | "groups_final" | "groups_semis_final" | "groups_quarters_semis_final";
  rotation_style?: "balanced" | "random";
  americano_rounds?: number;
  king_rounds?: number;
  bronze_match?: boolean;
  seeding_mode?: "straight" | "cross";
  knockout_match_config?: MatchConfig;
}

export interface MatchResult {
  team_a_score: number;
  team_b_score: number;
  sets?: { team_a: number; team_b: number }[];
  winner_team_id?: string;
}

export interface Tournament {
  id: string;
  created_by: string;
  name: string;
  status: TournamentStatus;
  visibility: TournamentVisibility;
  format_type: TournamentFormat;
  tournament_type: string;
  player_count: number;
  court_count: number;
  total_time_mins: number | null;
  match_config: MatchConfig;
  bracket_config: BracketConfig;
  club: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  skill_category_id: string | null;
  require_admin_approval: boolean;
}

export interface TournamentPlayer {
  id: string;
  tournament_id: string;
  user_id: string;
  team_id: string | null;
  status: TournamentPlayerStatus;
  side_preference: string | null;
  joined_at: string;
  role: "admin" | "organiser" | "player";
  partner_status: string;
  partner_user_id: string | null;
  slot_index: number | null;
}

export interface TournamentInvitation {
  id: string;
  tournament_id: string;
  invited_by: string;
  invited_user_id: string;
  status: string;
  responded_at: string | null;
  created_at: string;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  round_type: string;
  round_number: number;
  match_number: number;
  team_a_id: string | null;
  team_b_id: string | null;
  court_number: number | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  match_config: MatchConfig;
  result: MatchResult;
  estimated_mins: number | null;
  actual_mins: number | null;
  created_at: string;
}

export interface WizardState {
  tournamentId: string | null;
  name: string;
  tournamentType: "pairs" | "individual";
  playerCount: number;
  courtCount: number;
  totalTimeMins: number | null;
  visibility: TournamentVisibility;
  matchConfig: MatchConfig;
  formatType: TournamentFormat;
  bracketConfig: BracketConfig;
  ratingExempt: boolean;
  skillLevelMin: number | null;
  skillLevelMax: number | null;
  requireAdminApprovalForOutOfRange: boolean;
  adminIsPlaying: boolean;
  courtLabels: string[];
  scheduledDate: string | null;
  scheduledTime: string | null;
  clubName: string;
  canvasState: CanvasState;
  /** Summary text produced when the user explicitly saves the Visual Builder layout. */
  savedCanvasSummary: string | null;
}

export interface SuggestionCard {
  id: string;
  label: string;
  description: string;
  formatType: TournamentFormat;
  matchConfig: MatchConfig;
  bracketConfig: BracketConfig;
  estimatedTotalMins: number;
  matchesPerTeam: number;
  timeFit: "green" | "yellow" | "red" | "none";
  isRecommended: boolean;
  adjustmentTip: string | null;
  formatSummary: string;
}

export interface SkillCategory {
  id: string;
  label: string;
  min_rating: number;
  max_rating: number;
  color: string;
  sort_order: number;
}

export interface FeasibilityStatus {
  totalEstimatedMins: number;
  budgetMins: number | null;
  deltaMins: number;
  fit: "green" | "yellow" | "red" | "none";
  totalMatches: number;
  matchesPerTeam: number;
  rounds: number;
  courtAlternatives: { courts: number; estimatedMins: number }[];
  timeAlternatives: { extraMins: number; newBudget: number }[];
}

// Canvas builder types
export type PhaseType = "round_robin" | "single_elimination" | "single_match" | "americano" | "king_of_court";

/**
 * "direct"  — one specific ranked team goes directly to the next phase (the default).
 * "best_of" — multiple ranked teams from different phases compete; the best N qualify.
 *             Rules sharing the same bestOfGroup id form a single qualifier pool.
 */
export type RuleType = "direct" | "best_of";

/**
 * Tiebreaker criteria used when resolving a best_of qualifier pool.
 * points            → total points scored across all group matches
 * wins              → number of match wins
 * game_differential → games won minus games lost
 */
export type BestOfTiebreaker = "points" | "wins" | "game_differential";

export interface PhaseBlock {
  id: string;
  phaseType: PhaseType;
  label: string;
  positionX: number;
  positionY: number;
  config: Record<string, any>;
  sortOrder: number;
  matchConfigOverride?: Partial<MatchConfig>;
}

export interface ProgressionRule {
  id: string;
  fromPhaseId: string;
  toPhaseId: string;
  fromRank: string;
  toSlot: string;
  // ── Best-of qualifier fields (only present when ruleType === "best_of") ──
  /** Defaults to "direct" when omitted. */
  ruleType?: RuleType;
  /** Shared UUID that groups all competing rules in the same qualifier pool. */
  bestOfGroup?: string;
  /** How many teams qualify from this pool (default 1). */
  bestOfCount?: number;
  /** How to break ties inside the qualifier pool. */
  tiebreaker?: BestOfTiebreaker;
}

export interface CanvasState {
  phases: PhaseBlock[];
  rules: ProgressionRule[];
}

export const DEFAULT_CANVAS_STATE: CanvasState = {
  phases: [],
  rules: [],
};

export const DEFAULT_WIZARD_STATE: WizardState = {
  tournamentId: null,
  name: "",
  tournamentType: "pairs",
  playerCount: 8,
  courtCount: 2,
  totalTimeMins: null,
  visibility: "public",
  matchConfig: {
    scoring_type: "points",
    points_target: 21,
  },
  formatType: "groups",
  bracketConfig: {},
  ratingExempt: false,
  skillLevelMin: null,
  skillLevelMax: null,
  requireAdminApprovalForOutOfRange: true,
  adminIsPlaying: true,
  courtLabels: ["1", "2"],
  scheduledDate: null,
  scheduledTime: null,
  clubName: "",
  canvasState: { phases: [], rules: [] },
  savedCanvasSummary: null,
};
