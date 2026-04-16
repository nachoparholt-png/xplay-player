import { Check, AlertTriangle, Clock } from "lucide-react";

interface SummaryStats {
  totalEstimatedMins: number;
  budgetMins: number | null;
  deltaMins: number;
  fit: "green" | "yellow" | "red" | "none";
  totalMatches: number;
  matchesPerTeam: number;
  rounds: number;
}

interface Props {
  stats: SummaryStats;
}

const FIT_CONFIG = {
  green: { bg: "bg-green-500/10 border-green-500/30 text-green-400", icon: Check, label: "Fits your schedule" },
  yellow: { bg: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400", icon: AlertTriangle, label: "Tight fit" },
  red: { bg: "bg-destructive/10 border-destructive/30 text-destructive", icon: AlertTriangle, label: "Won't fit" },
  none: { bg: "bg-muted border-border/50 text-muted-foreground", icon: Clock, label: "No time budget set" },
};

const FeasibilityPanel = ({ stats }: Props) => {
  const cfg = FIT_CONFIG[stats.fit];
  const FitIcon = cfg.icon;

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${cfg.bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FitIcon className="w-4 h-4" />
          <span className="font-bold text-xs">{cfg.label}</span>
        </div>
        <div className="flex gap-3 text-[11px]">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            ~{stats.totalEstimatedMins}m
          </span>
          {stats.budgetMins && (
            <span>
              / {stats.budgetMins}m budget
              {stats.deltaMins > 0 && (
                <span className="ml-1 font-bold">(+{stats.deltaMins})</span>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-center">
        <div className="bg-background/50 rounded-lg py-1.5">
          <p className="font-bold text-sm">{stats.totalMatches}</p>
          <p className="text-muted-foreground text-[10px]">matches</p>
        </div>
        <div className="bg-background/50 rounded-lg py-1.5">
          <p className="font-bold text-sm">{stats.matchesPerTeam}</p>
          <p className="text-muted-foreground text-[10px]">per team</p>
        </div>
        <div className="bg-background/50 rounded-lg py-1.5">
          <p className="font-bold text-sm">{stats.rounds}</p>
          <p className="text-muted-foreground text-[10px]">rounds</p>
        </div>
      </div>
    </div>
  );
};

export default FeasibilityPanel;
