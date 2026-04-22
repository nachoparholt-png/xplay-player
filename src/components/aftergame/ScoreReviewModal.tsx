import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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

const REVIEW_REASONS = [
  "Wrong set score",
  "Wrong winner",
  "Match should be draw",
  "Third set missing",
  "Score entered incorrectly",
];

const ScoreReviewModal = ({ matchId, submission, open, onOpenChange, players, onReviewed }: ScoreReviewModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  if (!submission) return null;

  const teamA = players.filter((p) => p.team === "A");
  const teamB = players.filter((p) => p.team === "B");

  const sets = [
    submission.team_a_set_1 !== null ? { a: submission.team_a_set_1, b: submission.team_b_set_1 } : null,
    submission.team_a_set_2 !== null ? { a: submission.team_a_set_2, b: submission.team_b_set_2 } : null,
    submission.team_a_set_3 !== null ? { a: submission.team_a_set_3, b: submission.team_b_set_3 } : null,
  ].filter(Boolean) as { a: number | null; b: number | null }[];

  const handleValidate = async () => {
    if (!user || !submission) return;
    setSubmitting(true);

    const { error } = await supabase.from("score_reviews").insert({
      submission_id: submission.id,
      reviewed_by: user.id,
      action: "validated",
      review_note: null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Update submission status
      await supabase.from("score_submissions").update({ status: "validated" }).eq("id", submission.id);
      // Update match status to confirmed or draw
      const newStatus = submission.result_type === "draw" ? "draw" : "confirmed";
      await supabase.from("matches").update({ status: newStatus }).eq("id", matchId);

      // Settle points (old stake system)
      const action = submission.result_type === "draw" ? "refund_draw" : "confirm_result";
      await supabase.functions.invoke("settle-match", {
        body: { match_id: matchId, action },
      });

      // Settle v2 match bets
      const winner = submission.result_type === "team_a_win" ? "A" : submission.result_type === "team_b_win" ? "B" : "draw";
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

      toast({ title: "Score validated! ✅", description: "Match result is now confirmed." });
      onReviewed();
      onOpenChange(false);
    }
    setSubmitting(false);
  };

  const handleRequestReview = async () => {
    if (!user || !submission) return;
    setSubmitting(true);

    const note = selectedReason
      ? `${selectedReason}${reviewNote ? ": " + reviewNote : ""}`
      : reviewNote || "Review requested";

    const { error } = await supabase.from("score_reviews").insert({
      submission_id: submission.id,
      reviewed_by: user.id,
      action: "review_requested",
      review_note: note,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("score_submissions").update({ status: "rejected" }).eq("id", submission.id);
      await supabase.from("matches").update({ status: "review_requested" }).eq("id", matchId);

      // Notify the submitting team
      const userTeam = players.find((p) => p.user_id === user.id)?.team;
      const opponents = players.filter((p) => p.team !== userTeam);
      if (opponents.length > 0) {
        await Promise.all(opponents.map((p) =>
          supabase.rpc("create_notification_for_user", {
            _user_id: p.user_id,
            _type: "review_requested",
            _title: "Review Requested ⚠️",
            _body: `The other team requested a review of the score. Reason: ${note}`,
            _link: `/matches/${matchId}`,
          })
        ));
      }

      toast({ title: "Review requested", description: "The other team will be notified." });
      onReviewed();
      onOpenChange(false);
    }
    setSubmitting(false);
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

          {/* Validate */}
          <Button
            onClick={handleValidate}
            disabled={submitting}
            className="w-full h-12 rounded-xl font-semibold gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Validate Result
          </Button>

          {/* Request Review */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Or request a review</p>

            <div className="flex flex-wrap gap-1.5">
              {REVIEW_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setSelectedReason(selectedReason === reason ? null : reason)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                    selectedReason === reason
                      ? "border-destructive/50 bg-destructive/10 text-destructive"
                      : "border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <Textarea
              placeholder="Additional notes (optional)..."
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              className="rounded-xl bg-muted/50 border-border/50 text-sm resize-none"
              rows={2}
            />

            <Button
              variant="outline"
              onClick={handleRequestReview}
              disabled={submitting}
              className="w-full h-11 rounded-xl font-semibold gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <AlertTriangle className="w-4 h-4" />
              Request Review
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScoreReviewModal;
