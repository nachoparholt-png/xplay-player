import { Lock, CheckCircle, XCircle, Users, Clock, Upload, AlertTriangle, Equal, Trophy } from "lucide-react";

type MatchStatus =
  | "open"
  | "almost_full"
  | "full"
  | "cancelled"
  | "completed"
  | "awaiting_score"
  | "score_submitted"
  | "pending_review"
  | "review_requested"
  | "confirmed"
  | "draw"
  | "closed_as_draw"
  | "auto_closed"
  | "under_review";

interface StatusChipProps {
  status: MatchStatus;
}

const StatusChip = ({ status }: StatusChipProps) => {
  const config: Record<MatchStatus, { label: string; className: string; icon: React.ReactNode }> = {
    open: { label: "Open", className: "status-open", icon: null },
    almost_full: { label: "Almost Full", className: "status-almost-full", icon: <Users className="w-3 h-3" /> },
    full: { label: "Full", className: "status-full", icon: <Lock className="w-3 h-3" /> },
    cancelled: { label: "Cancelled", className: "status-cancelled", icon: <XCircle className="w-3 h-3" /> },
    completed: { label: "Completed", className: "status-completed", icon: <CheckCircle className="w-3 h-3" /> },
    awaiting_score: { label: "Awaiting Score", className: "status-awaiting", icon: <Upload className="w-3 h-3" /> },
    score_submitted: { label: "Score Submitted", className: "status-pending", icon: <Clock className="w-3 h-3" /> },
    pending_review: { label: "Pending Review", className: "status-pending", icon: <Clock className="w-3 h-3" /> },
    review_requested: { label: "Review Requested", className: "status-review", icon: <AlertTriangle className="w-3 h-3" /> },
    confirmed: { label: "Confirmed", className: "status-confirmed", icon: <Trophy className="w-3 h-3" /> },
    draw: { label: "Draw", className: "status-draw", icon: <Equal className="w-3 h-3" /> },
    closed_as_draw: { label: "Closed as Draw", className: "status-draw", icon: <Equal className="w-3 h-3" /> },
    auto_closed: { label: "Auto-closed", className: "status-completed", icon: <Clock className="w-3 h-3" /> },
    under_review: { label: "Under Review", className: "status-pending", icon: <Clock className="w-3 h-3" /> },
  };

  const c = config[status] || config.open;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${c.className}`}>
      {c.icon}
      {c.label}
    </span>
  );
};

export default StatusChip;
