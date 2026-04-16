import { useState, useMemo } from "react";
import { Minus, Plus, Check, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { notifyResultEntered } from "@/lib/tournaments/tournamentNotifications";
import { updatePlayerStats, submitForRating } from "@/lib/tournaments/ratingIntegration";
import { recordMatchDuration, configKey } from "@/lib/tournaments/timeEstimates";
import type { MatchConfig } from "@/lib/tournaments/types";
import {
  extractRules,
  createInitialState,
  addGame,
  removeGame,
  getSetLabel,
  getDeuceStatus,
  buildResultPayload,
  type LiveGameState,
  
} from "@/lib/tournaments/matchRules";

interface TeamInfo {
  id: string;
  player1_id: string;
  player2_id: string | null;
}

interface ScoreEntryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  matchNumber: number;
  teamAName: string;
  teamBName: string;
  teamAId?: string;
  teamBId?: string;
  matchConfig: MatchConfig;
  startedAt: string | null;
  tournamentId?: string;
  tournamentName?: string;
  teams?: TeamInfo[];
  ratingExempt?: boolean;
  isEditMode?: boolean;
  existingResult?: any;
}

const ScoreEntry = ({
  open,
  onOpenChange,
  matchId,
  matchNumber,
  teamAName,
  teamBName,
  teamAId,
  teamBId,
  matchConfig,
  startedAt,
  tournamentId,
  tournamentName,
  teams,
  ratingExempt,
  isEditMode = false,
  existingResult,
}: ScoreEntryProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const rules = useMemo(() => extractRules(matchConfig), [matchConfig]);
  const isPoints = rules.scoringType === "points";

  // Points mode state — pre-fill from existing result in edit mode
  const [teamAScore, setTeamAScore] = useState(() =>
    isEditMode && existingResult ? existingResult.team_a_score || 0 : 0
  );
  const [teamBScore, setTeamBScore] = useState(() =>
    isEditMode && existingResult ? existingResult.team_b_score || 0 : 0
  );

  // Games mode state — pre-fill sets from existing result
  const [gameState, setGameState] = useState<LiveGameState>(() => {
    if (isEditMode && existingResult?.sets && !isPoints) {
      const initial = createInitialState(rules);
      const existingSets = existingResult.sets as { team_a: number; team_b: number }[];
      existingSets.forEach((s, i) => {
        if (i < initial.sets.length) {
          initial.sets[i].teamA = s.team_a || 0;
          initial.sets[i].teamB = s.team_b || 0;
          if (s.team_a > 0 || s.team_b > 0) {
            initial.sets[i].isComplete = true;
            initial.sets[i].winner = s.team_a > s.team_b ? "a" : s.team_b > s.team_a ? "b" : null;
            if (initial.sets[i].winner === "a") initial.setsWonA++;
            else if (initial.sets[i].winner === "b") initial.setsWonB++;
          }
        }
      });
      // Set current set to the last incomplete one, or the last one
      const lastIncomplete = initial.sets.findIndex((s) => !s.isComplete);
      initial.currentSetIndex = lastIncomplete >= 0 ? lastIncomplete : initial.sets.length - 1;
      return initial;
    }
    return createInitialState(rules);
  });

  const handleAddGame = (team: "a" | "b") => {
    setGameState((prev) => addGame(prev, team, rules));
  };

  const handleRemoveGame = (team: "a" | "b") => {
    setGameState((prev) => removeGame(prev, team, rules));
  };

  const setLabel = getSetLabel(gameState, rules);
  const deuceStatus = getDeuceStatus(gameState, rules);
  const currentSet = gameState.sets[gameState.currentSetIndex];

  const handleSubmit = async () => {
    setSaving(true);

    const now = new Date().toISOString();
    const actualMins = startedAt
      ? Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)
      : null;

    let result: any;

    if (isPoints) {
      const winner =
        teamAScore > teamBScore
          ? "team_a"
          : teamAScore < teamBScore
          ? "team_b"
          : null;
      result = {
        team_a_score: teamAScore,
        team_b_score: teamBScore,
        winner_team_id: winner,
      };
    } else {
      result = buildResultPayload(gameState);
    }

    const { error } = await supabase
      .from("tournament_matches")
      .update({
        result: result,
        status: "completed",
        completed_at: now,
        actual_mins: actualMins,
      })
      .eq("id", matchId);

    setSaving(false);

    if (error) {
      toast({
        title: "Error saving score",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Score submitted! ✅" });

      // Record actual duration for time estimate calibration
      if (actualMins && actualMins > 0 && tournamentId) {
        const hash = configKey(matchConfig);
        recordMatchDuration(hash, actualMins, tournamentId, matchId);
      }

      if (tournamentId && tournamentName && teams && user) {
        const allPlayerIds = teams.flatMap((t) =>
          [t.player1_id, t.player2_id].filter(Boolean) as string[]
        );
        notifyResultEntered(
          tournamentId,
          tournamentName,
          allPlayerIds,
          matchNumber,
          user.id
        );

        const ratingPayload = {
          tournamentId,
          matchId,
          teamAId: teamAId || "",
          teamBId: teamBId || "",
          teamAScore: result.team_a_score,
          teamBScore: result.team_b_score,
          winnerId: result.winner_team_id || null,
          teams: teams.map((t) => ({
            id: t.id,
            player1_id: t.player1_id,
            player2_id: t.player2_id,
          })),
        };

        updatePlayerStats(ratingPayload);
        if (!ratingExempt) {
          submitForRating(ratingPayload);
        }
      }

      onOpenChange(false);
      // Reset
      setTeamAScore(0);
      setTeamBScore(0);
      setGameState(createInitialState(rules));
    }
  };

  const handleStartMatch = async () => {
    await supabase
      .from("tournament_matches")
      .update({
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .eq("id", matchId);
    toast({ title: "Match started! 🎾" });
  };

  const canSubmit = isPoints
    ? teamAScore > 0 || teamBScore > 0
    : gameState.sets.some((s) => s.teamA > 0 || s.teamB > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle className="text-center">
            {isEditMode ? "Edit Score — " : ""}Match #{matchNumber}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {isPoints
              ? `Points to ${rules.pointsTarget}`
              : setLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Start match button if not started */}
          {!startedAt && (
            <Button
              onClick={handleStartMatch}
              variant="outline"
              className="w-full rounded-xl h-10 text-sm"
            >
              Start Match Timer
            </Button>
          )}

          {isPoints ? (
            /* ── Points mode ── */
            <div className="space-y-4">
              <ScoreCounter
                label={teamAName}
                value={teamAScore}
                onIncrement={() => setTeamAScore((v) => v + 1)}
                onDecrement={() => setTeamAScore((v) => Math.max(0, v - 1))}
                highlight={teamAScore >= rules.pointsTarget}
              />
              <VsDivider />
              <ScoreCounter
                label={teamBName}
                value={teamBScore}
                onIncrement={() => setTeamBScore((v) => v + 1)}
                onDecrement={() => setTeamBScore((v) => Math.max(0, v - 1))}
                highlight={teamBScore >= rules.pointsTarget}
              />
            </div>
          ) : (
            /* ── Games mode ── */
            <div className="space-y-4">
              {/* Deuce / tiebreak indicator */}
              {deuceStatus && (
                <div className="flex justify-center">
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 bg-amber-500/10 text-amber-600 gap-1"
                  >
                    <Zap className="w-3 h-3" />
                    {deuceStatus}
                  </Badge>
                </div>
              )}
              {(gameState.isInTiebreak || gameState.isSuperTiebreak) && (
                <div className="flex justify-center">
                  <Badge
                    variant="outline"
                    className="border-primary/50 bg-primary/10 text-primary gap-1"
                  >
                    <Zap className="w-3 h-3" />
                    {gameState.isSuperTiebreak
                      ? `Super Tiebreak to ${rules.superTiebreakTarget}`
                      : `Tiebreak to ${rules.tiebreakTarget}`}
                  </Badge>
                </div>
              )}

              {/* Match complete banner */}
              {gameState.matchComplete && (
                <div className="text-center p-3 rounded-xl bg-primary/10 border border-primary/30">
                  <p className="text-sm font-bold text-primary">
                    🏆{" "}
                    {gameState.matchWinner === "a"
                      ? teamAName
                      : teamBName}{" "}
                    wins!
                  </p>
                </div>
              )}

              {/* Current set scores */}
              <ScoreCounter
                label={teamAName}
                value={currentSet.teamA}
                onIncrement={() => handleAddGame("a")}
                onDecrement={() => handleRemoveGame("a")}
                highlight={currentSet.winner === "a"}
                disabled={gameState.matchComplete}
              />
              <VsDivider />
              <ScoreCounter
                label={teamBName}
                value={currentSet.teamB}
                onIncrement={() => handleAddGame("b")}
                onDecrement={() => handleRemoveGame("b")}
                highlight={currentSet.winner === "b"}
                disabled={gameState.matchComplete}
              />

              {/* Sets overview */}
              {rules.totalSets > 1 && (
                <div className="flex justify-center gap-3 pt-2">
                  {gameState.sets.map((s, i) => (
                    <div
                      key={i}
                      className={`text-center px-2.5 py-1 rounded-lg transition-colors ${
                        i === gameState.currentSetIndex
                          ? "bg-primary/10 border border-primary/30"
                          : s.isComplete
                          ? "bg-muted/50"
                          : ""
                      }`}
                    >
                      <p className="text-[10px] text-muted-foreground mb-0.5">
                        {s.isTiebreak && i === rules.totalSets - 1
                          ? "TB"
                          : `S${i + 1}`}
                      </p>
                      <p className="text-sm font-mono font-bold">
                        {s.teamA}-{s.teamB}
                      </p>
                      {s.winner && (
                        <p className="text-[9px] text-primary font-medium">
                          {s.winner === "a" ? "A" : "B"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Deuce mode info */}
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">
                  {rules.deuceMode === "golden" && "Golden point (no deuce)"}
                  {rules.deuceMode === "silver" && "Silver point (max 2 deuces)"}
                  {rules.deuceMode === "normal" && "Standard deuce rules"}
                  {rules.totalSets > 1 &&
                    rules.thirdSetType !== "full" &&
                    ` • Deciding set: super tiebreak to ${rules.superTiebreakTarget}`}
                </p>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-xl gap-1"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
              className="flex-1 rounded-xl gap-1 font-semibold"
            >
              <Check className="w-4 h-4" />
              {saving ? "Saving..." : "Submit Score"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ── Reusable counter row ── */
function ScoreCounter({
  label,
  value,
  onIncrement,
  onDecrement,
  highlight,
  disabled,
}: {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  highlight: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
        highlight
          ? "border-primary bg-primary/5"
          : "bg-card border-border/50"
      }`}
    >
      <span className="text-sm font-medium truncate max-w-[40%]">{label}</span>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg"
          onClick={onDecrement}
          disabled={disabled || value === 0}
        >
          <Minus className="w-4 h-4" />
        </Button>
        <span className="stat-number text-2xl w-10 text-center">{value}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg"
          onClick={onIncrement}
          disabled={disabled}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function VsDivider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 border-t border-border" />
      <span className="text-xs text-muted-foreground">vs</span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

export default ScoreEntry;
