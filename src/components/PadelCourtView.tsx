import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, ArrowLeftRight } from "lucide-react";

type CourtPlayer = {
  user_id?: string;
  display_name: string | null;
  avatar_url: string | null;
  padel_level: number | null;
};

interface PadelCourtViewProps {
  teamA: CourtPlayer[];
  teamB: CourtPlayer[];
  interactive?: boolean;
  currentUserId?: string;
  onEmptySlotClick?: (team: "A" | "B", slotIndex: number) => void;
  onSwitchTeam?: (toTeam: "A" | "B") => void;
}

const PlayerBubble = ({
  player,
  color,
  isCurrentUser,
  canSwitch,
  onSwitchClick,
}: {
  player: CourtPlayer;
  color: "primary" | "secondary";
  isCurrentUser?: boolean;
  canSwitch?: boolean;
  onSwitchClick?: () => void;
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [imgError, setImgError] = useState(false);
  const initial = player.display_name?.[0]?.toUpperCase() || "?";
  const bgClass = color === "primary" ? "bg-primary/15 border-primary/40" : "bg-secondary/15 border-secondary/40";
  const textClass = color === "primary" ? "text-primary" : "text-secondary";
  const ringClass = isCurrentUser ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "";
  const hasAvatar = player.avatar_url && !imgError;

  const handleClick = () => {
    if (!canSwitch) return;
    if (showConfirm) {
      onSwitchClick?.();
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
    }
  };

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      whileHover={canSwitch ? { scale: 1.1 } : undefined}
      whileTap={canSwitch ? { scale: 0.95 } : undefined}
      onClick={handleClick}
      disabled={!canSwitch}
      className={`flex flex-col items-center h-[58px] justify-start ${canSwitch ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className={`relative w-11 h-11 rounded-full border-2 ${bgClass} ${ringClass} flex items-center justify-center text-sm font-bold ${textClass} overflow-hidden`}>
        {hasAvatar ? (
          <img
            src={player.avatar_url!}
            alt={player.display_name || "Player"}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          initial
        )}
        {canSwitch && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10">
            <ArrowLeftRight className="w-2.5 h-2.5 text-primary-foreground" />
          </div>
        )}
      </div>
      <AnimatePresence mode="wait">
        {showConfirm ? (
          <motion.span
            key="confirm"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="text-[9px] font-bold text-primary max-w-[60px] truncate text-center leading-tight mt-1"
          >
            Tap to switch
          </motion.span>
        ) : (
          <motion.span
            key="name"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[9px] font-medium text-foreground max-w-[60px] truncate text-center leading-tight mt-1"
          >
            {player.display_name || "TBD"}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

const EmptySlot = ({ interactive, onClick }: { interactive?: boolean; onClick?: () => void }) => (
  <motion.button
    whileHover={interactive ? { scale: 1.1 } : undefined}
    whileTap={interactive ? { scale: 0.95 } : undefined}
    onClick={interactive ? onClick : undefined}
    disabled={!interactive}
    className={`flex flex-col items-center h-[58px] justify-start ${interactive ? "cursor-pointer" : "cursor-default"}`}
  >
    <div className={`w-11 h-11 rounded-full border-2 border-dashed flex items-center justify-center transition-colors ${
      interactive
        ? "border-primary/40 bg-primary/5 hover:border-primary/60 hover:bg-primary/10"
        : "border-muted-foreground/25"
    }`}>
      {interactive ? (
        <UserPlus className="w-4 h-4 text-primary/50" />
      ) : (
        <span className="text-xs text-muted-foreground/40">?</span>
      )}
    </div>
    <span className={`text-[9px] mt-1 ${interactive ? "text-primary/50 font-medium" : "text-muted-foreground/40"}`}>
      {interactive ? "Join" : "Empty"}
    </span>
  </motion.button>
);

const PadelCourtView = ({ teamA, teamB, interactive, currentUserId, onEmptySlotClick, onSwitchTeam }: PadelCourtViewProps) => {
  const teamASlots = [...teamA, ...Array(Math.max(0, 2 - teamA.length)).fill(null)].slice(0, 2);
  const teamBSlots = [...teamB, ...Array(Math.max(0, 2 - teamB.length)).fill(null)].slice(0, 2);

  const isUserInTeamA = teamA.some(p => p.user_id === currentUserId);
  const isUserInTeamB = teamB.some(p => p.user_id === currentUserId);
  const teamBHasSpace = teamB.length < 2;
  const teamAHasSpace = teamA.length < 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-elevated overflow-hidden p-5"
    >
      <h3 className="font-display font-bold text-sm mb-3">Court View</h3>

      <div className="relative rounded-lg overflow-hidden" style={{ height: 140 }}>
        <div className="absolute inset-0 bg-[hsl(var(--primary)/0.06)] border border-primary/15 rounded-lg" />
        <div className="absolute inset-1 border border-primary/20 rounded" />
        <div className="absolute left-1 right-1 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-foreground/25" />
        <div className="absolute left-1 right-1 top-[28%] border-t border-primary/10" />
        <div className="absolute left-1/2 top-1 bottom-1/2 border-l border-primary/10" />
        <div className="absolute left-1 right-1 bottom-[28%] border-t border-primary/10" />
        <div className="absolute left-1/2 top-1/2 bottom-1 border-l border-primary/10" />

        {/* Team A */}
        <div className="absolute inset-x-0 top-0 h-1/2 flex items-center justify-center">
          <div className="flex items-center gap-8">
            {teamASlots.map((player, i) =>
              player ? (
                <PlayerBubble
                  key={i}
                  player={player}
                  color="primary"
                  isCurrentUser={player.user_id === currentUserId}
                  canSwitch={player.user_id === currentUserId && teamBHasSpace && !!onSwitchTeam}
                  onSwitchClick={() => onSwitchTeam?.("B")}
                />
              ) : (
                <EmptySlot
                  key={i}
                  interactive={interactive}
                  onClick={() => onEmptySlotClick?.("A", teamA.length + i)}
                />
              )
            )}
          </div>
        </div>
        <div className="absolute top-1 left-2">
          <span className="text-[8px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-px rounded-full">Team A</span>
        </div>

        {/* Team B */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 flex items-center justify-center">
          <div className="flex items-center gap-8">
            {teamBSlots.map((player, i) =>
              player ? (
                <PlayerBubble
                  key={i}
                  player={player}
                  color="secondary"
                  isCurrentUser={player.user_id === currentUserId}
                  canSwitch={player.user_id === currentUserId && teamAHasSpace && !!onSwitchTeam}
                  onSwitchClick={() => onSwitchTeam?.("A")}
                />
              ) : (
                <EmptySlot
                  key={i}
                  interactive={interactive}
                  onClick={() => onEmptySlotClick?.("B", teamB.length + i)}
                />
              )
            )}
          </div>
        </div>
        <div className="absolute bottom-1 left-2">
          <span className="text-[8px] font-bold uppercase tracking-wider text-secondary bg-secondary/10 px-1.5 py-px rounded-full">Team B</span>
        </div>
      </div>
    </motion.div>
  );
};

export default PadelCourtView;
