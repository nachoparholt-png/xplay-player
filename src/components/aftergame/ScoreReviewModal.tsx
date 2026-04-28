import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, Trophy, Equal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type Submission = {
  id: string;
  match_id: string;
  submitted_by: string;
  submitter_name: string | null;
  team_a_set_1: number | null;
  team_b_set_1: number | null;
  team_a_set_2: number | null;
  team_b_set_2: number | null;
  team_a_set_3: number | null;
  team_b_set_3: number | null;
  result_type: string;
  comment: string | null;
};

type TeamPlayer = {
  user_id: string;
  display_name: string | null;
  team: string | null;
};

interface ScoreReviewModalProps {
  matchId: string;
  submission: Submission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: TeamPlayer[];
  onReviewed: () => void;
}

type SetScore = { a: number | null; b: number | null };

const VALID_SCORES = [
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6],
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 7], [6, 7],
];

const isValidSet = (s: SetScore): boolean => {
  if (s.a === null || s.b === null) return false;
  return VALID_SCORES.some(([a, b]) => a === s.a && b === s.b);
};

const ScoreReviewModal = ({ matchId, submission, open, onOpenChange, players, onReviewed }: ScoreReviewModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeSets, setDisputeSets] = useState<[SetScore, SetScore, SetScore]>([
    { a: null, b: null },
    { a: null, b: null },
    { a: null, b: null },
  ]);

  if (!submission) return null;

  const teamA = players.filter((p) => p.team === "A");
  const teamB = players.filter((p) => p.team === "B");
  const userTeam = (players.find((p) => p.user_id === user?.id)?.team as "A" | "B") ?? "A";

  const sets = [
    submission.team_a_set_1 !== null ? { a: submission.team_a_set_1, b: submission.team_b_set_1 } : null,
    submission.team_a_set_2 !== null ? { a: submission.team_a_set_2, b: submission.team_b_set_2 } : null,
    submission.team_a_set_3 !== null ? { a: submission.team_a_set_3, b: submission.team_b_set_3 } : null,
  ].filter(Boolean) as { a: number | null; b: number | null }[];

  // Validate dispute sets
  const d1Valid = isValidSet(disputeSets[0]);
  const d2Valid = isValidSet(disputeSets[1]);
  const d3Valid = disputeSets[2].a !== null && disputeSets[2].b !== null ? isValidSet(disputeSets[2]) : true;
  const canDispute = d1Valid && d2Valid && d3Valid;

  const handleAccept = async () => {
    if (!user || !submission) return;
    setSubmitting(true);

    const { data, error } = await supabase.functions.invoke("confirm-match-score", {
      body: {
        match_id: matchId,
        submission_id: submission.id,
        action: "accept",
      },
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error ?? error?.message, variant: "destructive" });
    } else {
      // Also settle match bets if applicable
      const winner = data?.winner;
      if (winner) {
        const { data: marketData } = await supabase
          .from("match_bet_markets")
          .select("id")
          .eq("match_id", matchId)
          .eq("status", "open")
          .maybeSingle();
        if (marketData) {
          await supabase.functions.invoke("settle-match-market", {
            body: { market_id: marketData.id, winner },
          });
        }
      }

      toast({ title: "Score confirmed! ✅", description: "Match result is now confirmed." });
      onReviewed();
      onOpenChange(false);
    }
    setSubmitting(false);
  };

  const handleDispute = async () => {
    if (!user || !submission || !canDispute) return;
    setSubmitting(true);

    const { data, error } = await supabase.functions.invoke("confirm-match-score", {
      body: {
        match_id: matchId,
        submission_id: submission.id,
        action: "dispute",
        submitted_team: userTeam,
        team_a_set_1: disputeSets[0].a,
        team_a_set_2: disputeSets[1].a,
        team_a_set_3: disputeSets[2].a ?? null,
        team_b_set_1: disputeSets[0].b,
        team_b_set_2: disputeSets[1].b,
        team_b_set_3: disputeSets[2].b ?? null,
      },
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error ?? error?.message, variant: "destructive" });
    } else {
      toast({ title: "Score disputed", description: "The other team will be asked to confirm your score." });
      onReviewed();
      onOpenChange(false);
    }
    setSubmitting(false);
  };

  const ScoreSelector = ({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) => {
    const scores = [0, 1, 2, 3, 4, 5, 6, 7];
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <div className="flex flex-wrap gap-1 justify-center">
          {scores.map((s) => (
            <button
              key={s}
              onClick={() => onChange(s)}
              className={`w-8 h-8 rounded-lg font-bold text-sm transition-all ${
                value === s
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-card border-border/50 p-0">
        <div className="p-5 pb-0">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-primary" />
              Review Score
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            Submitted by <span className="font-semibold text-foreground">{submission.submitter_name || "Player"}</span>
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Teams */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1">Team A</p>
              {teamA.map((p) => (
                <p key={p.user_id} className="text-xs truncate">{p.display_name || "Player"}</p>
              ))}
            </div>
            <div className="p-3 rounded-xl bg-secondary/5 border border-secondary/20">
              <p className="text-[10px] uppercase tracking-wider text-secondary font-bold mb-1">Team B</p>
              {teamB.map((p) => (
                <p key={p.user_id} className="text-xs truncate">{p.display_name || "Player"}</p>
              ))}
            </div>
          </div>

          {/* Score Display */}
          <div className="card-elevated p-4 space-y-2">
            {sets.map((set, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Set {i + 1}</span>
                <div className="flex items-center gap-3">
                  <span className={`font-mono font-bold text-lg ${set.a !== null && set.b !== null && set.a > set.b ? "text-primary" : "text-muted-foreground"}`}>
                    {set.a ?? "-"}
                  </span>
                  <span className="text-muted-foreground text-xs">–</span>
                  <span className={`font-mono font-bold text-lg ${set.a !== null && set.b !== null && set.b > set.a ? "text-secondary" : "text-muted-foreground"}`}>
                    {set.b ?? "-"}
                  </span>
                </div>
              </div>
            ))}

            <div className="h-px bg-border my-2" />

            <div className="flex items-center justify-center gap-2">
              {submission.result_type === "team_a_win" && (
                <span className="flex items-center gap-2 font-display font-bold text-primary">
                  <Trophy className="w-4 h-4" /> Team A Wins
                </span>
              )}
              {submission.result_type === "team_b_win" && (
                <span className="flex items-center gap-2 font-display font-bold text-secondary">
                  <Trophy className="w-4 h-4" /> Team B Wins
                </span>
              )}
              {submission.result_type === "draw" && (
                <span className="flex items-center gap-2 font-display font-bold text-gold">
                  <Equal className="w-4 h-4" /> Draw
                </span>
              )}
            </div>
          </div>

          {submission.comment && (
            <p className="text-sm text-muted-foreground italic border-l-2 border-border pl-3">{submission.comment}</p>
          )}

          {/* Accept */}
          {!showDisputeForm && (
            <>
              <Button
                onClick={handleAccept}
                disabled={submitting}
                className="w-full h-12 rounded-xl font-semibold gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {submitting ? "Confirming..." : "Confirm Result"}
              </Button>

              <Button
                variant="outline"
                onClick={() => setShowDisputeForm(true)}
                disabled={submitting}
                className="w-full h-11 rounded-xl font-semibold gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <AlertTriangle className="w-4 h-4" />
                Dispute — Enter Different Score
              </Button>
            </>
          )}

          {/* Dispute score entry */}
          {showDisputeForm && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Enter the correct score
                </p>
                <button
                  onClick={() => setShowDisputeForm(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>

              {[0, 1, 2].map((i) => {
                const set = disputeSets[i];
                const valid = set.a !== null && set.b !== null ? isValidSet(set) : true;
                return (
                  <div key={i} className={`p-3 rounded-xl border ${!valid && set.a !== null ? "border-destructive/50 bg-destructive/5" : "border-border/50 bg-card"}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Set {i + 1} {i === 2 ? "(optional)" : ""}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <ScoreSelector
                        label="Team A"
                        value={set.a}
                        onChange={(v) => {
                          const ns = [...disputeSets] as [SetScore, SetScore, SetScore];
                          ns[i] = { ...ns[i], a: v };
                          setDisputeSets(ns);
                        }}
                      />
                      <ScoreSelector
                        label="Team B"
                        value={set.b}
                        onChange={(v) => {
                          const ns = [...disputeSets] as [SetScore, SetScore, SetScore];
                          ns[i] = { ...ns[i], b: v };
                          setDisputeSets(ns);
                        }}
                      />
                    </div>
                    {!valid && set.a !== null && set.b !== null && (
                      <p className="text-[10px] text-destructive mt-1.5 text-center">Invalid set score</p>
                    )}
                  </div>
                );
              })}

              <Button
                onClick={handleDispute}
                disabled={submitting || !canDispute}
                className="w-full h-12 rounded-xl font-semibold gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                <AlertTriangle className="w-4 h-4" />
                {submitting ? "Submitting..." : "Submit Disputed Score"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScoreReviewModal;
