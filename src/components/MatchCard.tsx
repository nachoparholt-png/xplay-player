import { motion } from "framer-motion";
import {
  Zap,
  UserPlus,
  MapPin,
  MessageSquare,
  Crown,
  Trophy,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState } from "react";

/* ── Types ── */

type PlayerSlotData = {
  name: string;
  avatar: string;
  rating: number | null;
  isCreator?: boolean;
};

export interface MatchCardProps {
  matchId: string;
  club: string;
  court?: string | null;
  city?: string;
  date: string;
  time: string;
  format: string;
  levelMin: number;
  levelMax: number;
  maxPlayers: number;
  spotsLeft: number;
  status:
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
  teamA: PlayerSlotData[];
  teamB: PlayerSlotData[];
  totalPointsStaked: number;
  teamAOdds: number;
  teamBOdds: number;
  isBettingOpen: boolean;
  hasMarket?: boolean;
  userStake?: { points: number; team: string } | null;
  isJoined: boolean;
  isEligible: boolean;
  duration?: string;
  deadlineAt?: string | null;
  visibility?: string;
  onClick?: () => void;
  onJoin?: () => void;
  onBet?: () => void;
  onChat?: () => void;
}

/* ── Helpers ── */

const avgLevel = (players: PlayerSlotData[]) => {
  const rated = players.filter((p) => p.rating != null);
  if (rated.length === 0) return 0;
  return rated.reduce((s, p) => s + (p.rating || 0), 0) / rated.length;
};

const calcOdds = (teamAAvg: number, teamBAvg: number) => {
  const diff = teamAAvg - teamBAvg;
  const base = 1.8;
  const shift = Math.min(Math.abs(diff) * 0.6, 1.0);
  if (Math.abs(diff) < 0.1) return { a: base, b: base };
  if (diff > 0) return { a: +(base - shift).toFixed(1), b: +(base + shift).toFixed(1) };
  return { a: +(base + shift).toFixed(1), b: +(base - shift).toFixed(1) };
};

/* ── Deadline Chip ── */

function useDeadlineCountdown(deadlineAt?: string | null) {
  const [label, setLabel] = useState<string | null>(null);
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!deadlineAt) return;
    const update = () => {
      const diff = new Date(deadlineAt).getTime() - Date.now();
      if (diff <= 0) { setLabel(null); return; }
      const totalMins = Math.floor(diff / 60000);
      const hours = Math.floor(totalMins / 60);
      const mins  = totalMins % 60;
      setUrgent(diff <= 4 * 60 * 60 * 1000); // urgent within 4 h
      setLabel(hours > 0 ? `Fills in ${hours}h ${mins}m` : `Fills in ${mins}m`);
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [deadlineAt]);

  return { label, urgent };
}

const DeadlineChip = ({ deadlineAt }: { deadlineAt?: string | null }) => {
  const { label, urgent } = useDeadlineCountdown(deadlineAt);
  if (!label) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${
      urgent
        ? "bg-red-500/15 text-red-400 border border-red-500/20"
        : "bg-primary/10 text-primary/70 border border-primary/15"
    }`}>
      {urgent ? <AlertTriangle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
      {label.toUpperCase()}
    </span>
  );
};

/* ── Status Badge Config ── */

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  open: { label: "OPEN", bg: "bg-primary", text: "text-primary-foreground" },
  almost_full: { label: "ALMOST FULL", bg: "bg-secondary", text: "text-secondary-foreground" },
  full: { label: "FULL", bg: "bg-muted", text: "text-foreground" },
  cancelled: { label: "CANCELLED", bg: "bg-destructive", text: "text-destructive-foreground" },
  completed: { label: "COMPLETED", bg: "bg-muted", text: "text-muted-foreground" },
  awaiting_score: { label: "SCORE NEEDED", bg: "bg-primary", text: "text-primary-foreground" },
  score_submitted: { label: "SUBMITTED", bg: "bg-muted", text: "text-foreground" },
  pending_review: { label: "IN REVIEW", bg: "bg-secondary", text: "text-secondary-foreground" },
  review_requested: { label: "REVIEW", bg: "bg-secondary", text: "text-secondary-foreground" },
  confirmed: { label: "CONFIRMED", bg: "bg-win", text: "text-win-foreground" },
  draw: { label: "DRAW", bg: "bg-secondary", text: "text-secondary-foreground" },
  closed_as_draw: { label: "DRAW", bg: "bg-secondary", text: "text-secondary-foreground" },
  auto_closed: { label: "CLOSED", bg: "bg-muted", text: "text-muted-foreground" },
  under_review: { label: "REVIEW", bg: "bg-secondary", text: "text-secondary-foreground" },
};

/* ── Avatar Bubble ── */

const AvatarBubble = ({ player, empty, borderClass }: { player?: PlayerSlotData; empty?: boolean; borderClass: string }) => {
  if (empty) {
    return (
      <div className={`w-12 h-12 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center bg-primary/5`}>
        <UserPlus className="w-3.5 h-3.5 text-primary/40" />
      </div>
    );
  }
  if (!player) return null;
  const initial = player.name?.[0]?.toUpperCase() || "?";

  return (
    <div className="relative">
      {player.avatar ? (
        <img
          src={player.avatar}
          alt={player.name}
          className={`w-12 h-12 rounded-full border-2 ${borderClass} object-cover bg-surface-container-high`}
        />
      ) : (
        <div className={`w-12 h-12 rounded-full border-2 ${borderClass} bg-surface-container-high flex items-center justify-center font-display font-bold text-sm text-foreground`}>
          {initial}
        </div>
      )}
      {player.isCreator && (
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold flex items-center justify-center">
          <Crown className="w-2.5 h-2.5 text-gold-foreground" />
        </div>
      )}
    </div>
  );
};

/* ── Team Group ── */

const TeamGroup = ({ players, maxSlots, label, borderClass }: {
  players: PlayerSlotData[];
  maxSlots: number;
  label: string;
  borderClass: string;
}) => {
  const slots: (PlayerSlotData | null)[] = [
    ...players,
    ...Array(Math.max(0, maxSlots - players.length)).fill(null),
  ].slice(0, maxSlots);

  const avgRating = avgLevel(players);

  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <div className="flex -space-x-3">
        {slots.map((p, i) => (
          <AvatarBubble key={i} player={p ?? undefined} empty={!p} borderClass={borderClass} />
        ))}
      </div>
      <div className="text-center">
        <p className="text-[10px] font-bold text-foreground truncate w-20">{label}</p>
        {avgRating > 0 && (
          <span className="bg-secondary/20 text-secondary text-[9px] font-black px-1.5 rounded">
            {avgRating.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
};

/* ── Main Component ── */

const MatchCard = ({
  club,
  court,
  city,
  date,
  time,
  format: matchFormat,
  levelMin,
  levelMax,
  spotsLeft,
  status,
  teamA,
  teamB,
  totalPointsStaked,
  teamAOdds: rawTeamAOdds,
  teamBOdds: rawTeamBOdds,
  isBettingOpen,
  hasMarket,
  userStake,
  isJoined,
  isEligible,
  deadlineAt,
  visibility,
  onClick,
  onJoin,
  onBet,
  onChat,
}: MatchCardProps) => {
  const teamAAvg = avgLevel(teamA);
  const teamBAvg = avgLevel(teamB);
  const hasBothTeams = teamA.some((p) => p.rating != null) && teamB.some((p) => p.rating != null);

  const odds =
    rawTeamAOdds > 0 && rawTeamBOdds > 0
      ? { a: rawTeamAOdds, b: rawTeamBOdds }
      : calcOdds(teamAAvg, teamBAvg);

  const isFull = spotsLeft <= 0;
  const canJoin = !isJoined && !isFull && isEligible && spotsLeft > 0;

  const statusCfg = statusConfig[status] || statusConfig.open;

  const teamALabel = teamA.length > 0
    ? teamA.map((p) => p.name.split(" ")[0]).join(" & ")
    : "Team A";
  const teamBLabel = teamB.length > 0
    ? teamB.map((p) => p.name.split(" ")[0]).join(" & ")
    : "Team B";

  // Add "?" suffix if team has empty slots
  const teamADisplay = teamA.length < 2 && teamA.length > 0 ? `${teamALabel} & ?` : teamALabel;
  const teamBDisplay = teamB.length < 2 && teamB.length > 0 ? `${teamBLabel} & ?` : teamBLabel;

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="bg-card rounded-2xl p-6 relative overflow-hidden cursor-pointer group w-full flex flex-col"
      onClick={onClick}
    >
      {/* Corner Status Badge */}
      <div className={`absolute top-0 right-0 ${statusCfg.bg} px-4 py-1.5 rounded-bl-2xl`}>
        <span className={`${statusCfg.text} font-display font-extrabold text-[10px] tracking-widest uppercase`}>
          {statusCfg.label}
        </span>
      </div>

      {/* Header: Format + Level */}
      <div className="mb-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded border border-primary/20 uppercase">
            {matchFormat}
          </span>
          <span className="text-muted-foreground font-bold text-[10px] tracking-tight">
            LEVEL {levelMin.toFixed(1)}-{levelMax.toFixed(1)}
          </span>
        </div>
        <h3 className="font-display font-black text-xl text-foreground">{date}, {time}</h3>
        <div className="flex items-center gap-1 mt-1 text-muted-foreground">
          <MapPin className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold">{[club, court, city].filter(Boolean).join(" · ")}</span>
        </div>
        {/* Deadline chip — only on open public matches with spots left */}
        {status === "open" && visibility !== "private" && spotsLeft > 0 && deadlineAt && (
          <div className="mt-2">
            <DeadlineChip deadlineAt={deadlineAt} />
          </div>
        )}
      </div>

      {/* Teams Display */}
      <div className="flex items-center justify-between my-6 bg-surface-container-low p-4 rounded-xl">
        <TeamGroup
          players={teamA}
          maxSlots={2}
          label={teamADisplay}
          borderClass="border-primary"
        />

        <div className="flex flex-col items-center px-4">
          <span className="font-display font-black text-primary/30 text-lg">VS</span>
        </div>

        <TeamGroup
          players={teamB}
          maxSlots={2}
          label={teamBDisplay}
          borderClass={teamB.length >= 2 ? "border-primary" : "border-primary/20"}
        />
      </div>

      {/* Odds Row — only when both teams have rated players */}
      {matchFormat !== "social" && hasBothTeams && (
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Team A Odds</span>
            <span className="text-sm font-display font-black text-foreground">x{odds.a.toFixed(1)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Team B Odds</span>
            <span className="text-sm font-display font-black text-foreground">x{odds.b.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* "Waiting for opponents" hint */}
      {matchFormat !== "social" && !hasBothTeams && (
        <p className="text-[10px] text-muted-foreground italic text-center mb-2">
          Factor updates as players join
        </p>
      )}

      {/* Pot Badge — always visible on competitive matches */}
      {matchFormat !== "social" && (totalPointsStaked > 0 || hasMarket) && (
        <div className="flex flex-col items-center gap-1 mb-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
            totalPointsStaked > 0
              ? "bg-primary/10 border-primary/10"
              : "bg-muted/50 border-border"
          }`}>
            <Zap className={`w-3.5 h-3.5 ${totalPointsStaked > 0 ? "text-primary fill-primary" : "text-muted-foreground"}`} />
            <span className={`text-xs font-display font-black ${totalPointsStaked > 0 ? "text-primary" : "text-muted-foreground"}`}>
              {totalPointsStaked > 0 ? `${totalPointsStaked.toLocaleString()} POT` : "0 POT"}
            </span>
          </div>
          <span className="text-[9px] text-muted-foreground font-semibold flex items-center gap-1">
            <Trophy className="w-2.5 h-2.5" /> Pot bonus · players only
          </span>
        </div>
      )}

      {/* User stake badge */}
      {userStake && (
        <div className="mb-4 flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-3 py-2">
          <Zap className="w-3 h-3 text-primary fill-primary" />
          <span className="text-[10px] font-bold text-primary">
            You staked {userStake.points} pts on {userStake.team === "A" ? "Team A" : "Team B"}
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 mt-auto">
        {canJoin ? (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onJoin?.(); }}
              className="bg-primary text-primary-foreground py-3.5 rounded-full font-display font-black text-xs uppercase tracking-widest glow-primary active:scale-95 transition-transform"
            >
              Join Match
            </button>
            {matchFormat !== "social" && isBettingOpen ? (
              <button
                onClick={(e) => { e.stopPropagation(); onBet?.(); }}
                className="border border-secondary/30 text-secondary py-3.5 rounded-full font-display font-black text-xs uppercase tracking-widest active:bg-secondary/10 transition-colors"
              >
                Bet Points
              </button>
            ) : (
              <button
                onClick={onClick}
                className="border border-border text-foreground py-3.5 rounded-full font-display font-black text-xs uppercase tracking-widest bg-surface-container-high hover:bg-surface-container-highest transition-colors"
              >
                View Match
              </button>
            )}
          </>
        ) : isJoined ? (
          <>
            <button
              onClick={onClick}
              className="bg-primary/15 text-primary py-3.5 rounded-full font-display font-black text-xs uppercase tracking-widest active:scale-95 transition-transform"
            >
              Open Match
            </button>
            <div className="flex items-center gap-2">
              {matchFormat !== "social" && isBettingOpen && (
                <button
                  onClick={(e) => { e.stopPropagation(); onBet?.(); }}
                  className="flex-1 border border-secondary/30 text-secondary py-3.5 rounded-full font-display font-black text-xs uppercase tracking-widest active:bg-secondary/10 transition-colors"
                >
                  {userStake ? "Stakes" : "Bet"}
                </button>
              )}
              {onChat && (
                <button
                  onClick={(e) => { e.stopPropagation(); onChat(); }}
                  className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        ) : (
          <button
            onClick={onClick}
            className="col-span-2 border border-primary/20 text-foreground py-3.5 rounded-full font-display font-black text-xs uppercase tracking-widest bg-surface-container-high hover:bg-surface-container-highest transition-colors"
          >
            View Match
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default MatchCard;