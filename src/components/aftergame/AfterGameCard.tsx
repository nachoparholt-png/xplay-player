import { motion } from "framer-motion";
import { Upload, Equal, Trophy, CheckCircle, AlertTriangle, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import CountdownTimer from "./CountdownTimer";

type MatchStatus = string;

interface AfterGameCardProps {
  status: MatchStatus;
  deadlineAt: string | null;
  isPlayerInMatch: boolean;
  canSubmitScore: boolean;
  canReviewScore: boolean;
  lastSubmitterName: string | null;
  lastReviewNote: string | null;
  resultSummary: string | null;
  onUploadScore: () => void;
  onReviewScore: () => void;
  onMarkDraw: () => void;
  onDeadlineExpired: () => void;
}

const AfterGameCard = ({
  status,
  deadlineAt,
  isPlayerInMatch,
  canSubmitScore,
  canReviewScore,
  lastSubmitterName,
  lastReviewNote,
  resultSummary,
  onUploadScore,
  onReviewScore,
  onMarkDraw,
  onDeadlineExpired,
}: AfterGameCardProps) => {
  const getStatusConfig = () => {
    switch (status) {
      case "awaiting_score":
        return {
          icon: <Upload className="w-5 h-5" />,
          title: "Match Finished",
          subtitle: "Upload the result within 24 hours",
          color: "text-primary",
          bg: "bg-primary/10 border-primary/20",
        };
      case "score_submitted":
      case "pending_review":
        return {
          icon: <Clock className="w-5 h-5" />,
          title: "Score Submitted",
          subtitle: `Submitted by ${lastSubmitterName || "a player"}. Waiting for opponent review.`,
          color: "text-secondary",
          bg: "bg-secondary/10 border-secondary/20",
        };
      case "review_requested":
        return {
          icon: <RotateCcw className="w-5 h-5" />,
          title: "Review Requested",
          subtitle: lastReviewNote || "The opposing team disputed the score.",
          color: "text-gold",
          bg: "bg-gold/10 border-gold/20",
        };
      case "confirmed":
        return {
          icon: <Trophy className="w-5 h-5" />,
          title: "Match Confirmed",
          subtitle: resultSummary || "Result has been validated.",
          color: "text-win",
          bg: "bg-win/10 border-win/20",
        };
      case "draw":
        return {
          icon: <Equal className="w-5 h-5" />,
          title: "Match Ended — Draw",
          subtitle: "Both teams agreed on a draw. Stakes refunded.",
          color: "text-gold",
          bg: "bg-gold/10 border-gold/20",
        };
      case "closed_as_draw":
      case "auto_closed":
        return {
          icon: <AlertTriangle className="w-5 h-5" />,
          title: "Auto-Closed as Draw",
          subtitle: "No agreement was reached within 24 hours. Stakes refunded.",
          color: "text-muted-foreground",
          bg: "bg-muted/50 border-border/50",
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  const isResolved = ["confirmed", "draw", "closed_as_draw", "auto_closed"].includes(status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card-elevated p-4 space-y-3 border ${config.bg}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-xl ${config.bg} ${config.color}`}>{config.icon}</div>
        <div className="flex-1">
          <h3 className={`font-display font-bold ${config.color}`}>{config.title}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{config.subtitle}</p>
        </div>
      </div>

      {/* Countdown */}
      {!isResolved && deadlineAt && (
        <CountdownTimer deadlineAt={deadlineAt} onExpired={onDeadlineExpired} />
      )}

      {/* Action buttons */}
      {!isResolved && isPlayerInMatch && (
        <div className="space-y-2">
          {canSubmitScore && (status === "awaiting_score" || status === "review_requested") && (
            <>
              <Button
                onClick={onUploadScore}
                className="w-full h-11 rounded-xl font-semibold gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload Score
              </Button>
              <Button
                variant="outline"
                onClick={onMarkDraw}
                className="w-full h-10 rounded-xl font-semibold gap-2 border-gold/30 text-gold hover:bg-gold/10"
              >
                <Equal className="w-4 h-4" />
                Mark as Draw
              </Button>
            </>
          )}
          {canReviewScore && (status === "pending_review" || status === "score_submitted") && (
            <Button
              onClick={onReviewScore}
              className="w-full h-11 rounded-xl font-semibold gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Review Score
            </Button>
          )}
        </div>
      )}

      {/* Resolved result */}
      {isResolved && resultSummary && (
        <div className="p-3 rounded-xl bg-muted/50 text-center">
          <p className="text-sm font-semibold">{resultSummary}</p>
        </div>
      )}
    </motion.div>
  );
};

export default AfterGameCard;
