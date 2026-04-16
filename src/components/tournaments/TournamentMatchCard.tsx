import { Badge } from "@/components/ui/badge";
import { Clock, Pencil } from "lucide-react";

interface TournamentMatchCardProps {
  matchNumber: number;
  roundType: string;
  roundNumber: number;
  teamAName: string;
  teamBName: string;
  courtNumber?: number | null;
  courtLabel?: string | null;
  status: string;
  estimatedMins?: number | null;
  estimatedTime?: string | null;
  teamAScore?: number;
  teamBScore?: number;
  isUserMatch?: boolean;
  canEdit?: boolean;
  isWalkover?: boolean;
  actionSlot?: React.ReactNode;
  onClick?: () => void;
}

const statusStyles: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "status-open",
  completed: "status-confirmed",
};

const TournamentMatchCard = ({
  matchNumber,
  roundType,
  roundNumber,
  teamAName,
  teamBName,
  courtNumber,
  courtLabel,
  status,
  estimatedMins,
  estimatedTime,
  teamAScore,
  teamBScore,
  isUserMatch,
  canEdit,
  isWalkover,
  actionSlot,
  onClick,
}: TournamentMatchCardProps) => {
  const displayCourt = courtLabel || (courtNumber ? `Court ${courtNumber}` : null);
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border bg-card p-3 space-y-2 ${isUserMatch ? "border-primary/40 ring-1 ring-primary/20" : ""} ${onClick ? "cursor-pointer hover:border-primary/40 transition-colors" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          #{matchNumber} · {roundType} R{roundNumber}
        </span>
        <div className="flex items-center gap-1.5">
          {estimatedTime && status === "pending" && (
            <Badge variant="outline" className="text-[9px] gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {estimatedTime}
            </Badge>
          )}
          {isUserMatch && (
            <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
              You
            </Badge>
          )}
          {displayCourt && (
            <Badge variant="outline" className="text-[9px]">
              {displayCourt}
            </Badge>
          )}
          <Badge variant="outline" className={`text-[9px] ${statusStyles[status] || ""}`}>
            {status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      {/* Teams */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium truncate max-w-[60%] ${status === "completed" && teamAScore !== undefined && teamBScore !== undefined && teamAScore > teamBScore ? "text-primary font-bold" : ""}`}>
            {teamAName}
          </span>
          {teamAScore !== undefined && (
            <span className="stat-number text-sm">{teamAScore}</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium truncate max-w-[60%] ${status === "completed" && teamBScore !== undefined && teamAScore !== undefined && teamBScore > teamAScore ? "text-primary font-bold" : ""}`}>
            {teamBName}
          </span>
          {teamBScore !== undefined && (
            <span className="stat-number text-sm">{teamBScore}</span>
          )}
        </div>
      </div>

      {/* Footer */}
      {estimatedMins && status === "pending" && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          ~{estimatedMins}min
        </div>
      )}
      {canEdit && status === "completed" && (
        <div className="flex items-center gap-1 text-[10px] text-primary font-medium">
          <Pencil className="w-3 h-3" />
          Tap to edit score
        </div>
      )}
      {isWalkover && (
        <Badge variant="outline" className="text-[9px] bg-muted/50 text-muted-foreground w-fit">
          W/O
        </Badge>
      )}
      {actionSlot}
    </div>
  );
};

export default TournamentMatchCard;
