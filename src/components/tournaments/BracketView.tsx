import { Badge } from "@/components/ui/badge";
import { Trophy, Zap } from "lucide-react";

interface BracketMatch {
  id: string;
  roundType: string;
  matchNumber: number;
  teamAName: string | null;
  teamBName: string | null;
  teamAScore?: number;
  teamBScore?: number;
  status: string;
  winnerId?: string | null;
  courtNumber?: number | null;
  courtLabel?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  isUserMatch?: boolean;
  sets?: { teamA: number; teamB: number }[];
}

interface BracketViewProps {
  rounds: { label: string; matches: BracketMatch[] }[];
}

const statusBadge = (status: string, isLive?: boolean) => {
  if (isLive) return { label: "LIVE", cls: "bg-primary/20 text-primary border-primary/30 animate-pulse" };
  switch (status) {
    case "completed": return { label: "FT", cls: "bg-muted text-muted-foreground border-border" };
    case "in_progress": return { label: "LIVE", cls: "bg-primary/20 text-primary border-primary/30 animate-pulse" };
    default: return { label: "UPCOMING", cls: "bg-muted/50 text-muted-foreground border-border/50" };
  }
};

const formatTime = (iso?: string | null) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
};

const formatDate = (iso?: string | null) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: "short", day: "2-digit" }).toUpperCase();
  } catch {
    return null;
  }
};

const BracketView = ({ rounds }: BracketViewProps) => {
  if (rounds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No knockout rounds scheduled
      </p>
    );
  }

  const mainRounds = rounds
    .map((r) => ({
      ...r,
      matches: r.matches.filter((m) => m.roundType !== "bronze"),
    }))
    .filter((r) => r.matches.length > 0);

  const bronzeMatches = rounds.flatMap((r) =>
    r.matches.filter((m) => m.roundType === "bronze")
  );

  // Find current round (first with in_progress matches)
  const currentRoundIdx = mainRounds.findIndex((r) =>
    r.matches.some((m) => m.status === "in_progress")
  );

  // Check if final is completed for champion display
  const finalRound = mainRounds.find((r) =>
    r.matches.some((m) => m.roundType === "final")
  );
  const finalMatch = finalRound?.matches.find((m) => m.roundType === "final");
  const champion =
    finalMatch?.status === "completed" && finalMatch.winnerId
      ? finalMatch.teamAScore !== undefined &&
        finalMatch.teamBScore !== undefined &&
        finalMatch.teamAScore > finalMatch.teamBScore
        ? finalMatch.teamAName
        : finalMatch.teamBName
      : null;

  return (
    <div className="space-y-6">
      {mainRounds.map((round, rIdx) => {
        const isCurrent = rIdx === currentRoundIdx;
        const isFinalRound = round.matches.some((m) => m.roundType === "final");

        return (
          <div key={rIdx} className="space-y-3">
            {/* Round Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {round.label}
              </h3>
              {isCurrent && (
                <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20 gap-1">
                  <Zap className="w-2.5 h-2.5" />
                  Current Round
                </Badge>
              )}
            </div>

            {/* Match Cards */}
            <div className="space-y-2">
              {round.matches.map((m) => (
                <BracketMatchCard key={m.id} match={m} />
              ))}
            </div>

            {/* Champion Section */}
            {isFinalRound && (
              <div className="rounded-2xl border border-[hsl(var(--gold))]/20 bg-[hsl(var(--gold))]/5 p-4 text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <Trophy className="w-5 h-5 text-[hsl(var(--gold))]" />
                  <span className="text-xs font-bold uppercase tracking-widest text-[hsl(var(--gold))]">
                    Champion
                  </span>
                </div>
                {champion ? (
                  <p className="text-lg font-bold text-[hsl(var(--gold))]">{champion}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">TBD</p>
                )}
                {finalMatch?.scheduledAt && (
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(finalMatch.scheduledAt)} · {formatTime(finalMatch.scheduledAt)}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Bronze / 3rd Place */}
      {bronzeMatches.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            🥉 3rd Place Match
          </h3>
          <div className="space-y-2">
            {bronzeMatches.map((m) => (
              <BracketMatchCard key={m.id} match={m} isBronze />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const BracketMatchCard = ({
  match: m,
  isBronze,
}: {
  match: BracketMatch;
  isBronze?: boolean;
}) => {
  const isLive = m.status === "in_progress";
  const badge = statusBadge(m.status, isLive);
  const court = m.courtLabel || (m.courtNumber ? `Court ${m.courtNumber}` : null);
  const time = formatTime(m.scheduledAt || m.startedAt);

  const isAWinner =
    m.status === "completed" &&
    m.winnerId &&
    m.teamAScore !== undefined &&
    m.teamBScore !== undefined &&
    m.teamAScore > m.teamBScore;
  const isBWinner =
    m.status === "completed" &&
    m.winnerId &&
    m.teamBScore !== undefined &&
    m.teamAScore !== undefined &&
    m.teamBScore > m.teamAScore;

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-colors ${
        isLive
          ? "border-primary/30 bg-card"
          : isBronze
          ? "border-[hsl(var(--gold))]/20 bg-card"
          : "border-border/50 bg-card"
      }`}
    >
      {/* Live accent bar */}
      {isLive && (
        <div className="h-0.5 bg-gradient-to-r from-primary to-primary-container" />
      )}

      <div className="p-3 space-y-2">
        {/* Top metadata row */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {court && <span className="uppercase font-medium">{court}</span>}
            {court && time && <span>·</span>}
            {time && <span>{time}</span>}
            {m.isUserMatch && (
              <Badge variant="outline" className="text-[8px] border-primary/30 text-primary ml-1 py-0">
                YOUR MATCH
              </Badge>
            )}
          </div>
          <Badge variant="outline" className={`text-[8px] py-0 ${badge.cls}`}>
            {badge.label}
          </Badge>
        </div>

        {/* Team rows */}
        <div className="space-y-1">
          <TeamRow
            name={m.teamAName}
            score={m.teamAScore}
            sets={m.sets?.map((s) => s.teamA)}
            isWinner={!!isAWinner}
            isPending={m.status === "pending"}
          />
          <div className="border-t border-border/30" />
          <TeamRow
            name={m.teamBName}
            score={m.teamBScore}
            sets={m.sets?.map((s) => s.teamB)}
            isWinner={!!isBWinner}
            isPending={m.status === "pending"}
          />
        </div>
      </div>
    </div>
  );
};

const TeamRow = ({
  name,
  score,
  sets,
  isWinner,
  isPending,
}: {
  name: string | null;
  score?: number;
  sets?: number[];
  isWinner: boolean;
  isPending: boolean;
}) => (
  <div className={`flex items-center justify-between py-0.5 ${isWinner ? "text-foreground" : "text-muted-foreground"}`}>
    <span className={`text-sm truncate max-w-[60%] ${isWinner ? "font-bold" : "font-medium"}`}>
      {name || "TBD"}
    </span>
    <div className="flex items-center gap-1.5">
      {sets && sets.length > 0 ? (
        sets.map((s, i) => (
          <span
            key={i}
            className={`w-6 h-6 flex items-center justify-center rounded text-xs stat-number ${
              isWinner ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"
            }`}
          >
            {s}
          </span>
        ))
      ) : score !== undefined ? (
        <span className={`stat-number text-sm ${isWinner ? "text-primary" : ""}`}>
          {score}
        </span>
      ) : isPending ? (
        <span className="text-xs text-muted-foreground/50">–</span>
      ) : null}
    </div>
  </div>
);

export default BracketView;
