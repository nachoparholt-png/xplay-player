import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Calendar, Check, Zap, ArrowRight, WifiOff, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import BetBottomSheet from "./BetBottomSheet";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import TeamPickCard from "./TeamPickCard";
import PointChips from "./PointChips";
import PotentialWinPreview from "./PotentialWinPreview";

interface MatchBetData {
  matchId: string;
  club: string;
  date: string;
  time: string;
  teamALabel: string;
  teamBLabel: string;
  teamAOdds: number;
  teamBOdds: number;
  teamAAvgRating?: number;
  teamBAvgRating?: number;
}

interface MatchBetSheetProps {
  open: boolean;
  onClose: () => void;
  match: MatchBetData | null;
  onBetPlaced?: () => void;
}

type View = "select" | "confirm";

const MatchBetSheet = ({ open, onClose, match, onBetPlaced }: MatchBetSheetProps) => {
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [view, setView] = useState<View>("select");
  const [selectedTeam, setSelectedTeam] = useState<"team_a" | "team_b" | null>(null);
  const [stake, setStake] = useState(0);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [placedBet, setPlacedBet] = useState<{ team: string; stake: number; potential: number } | null>(null);
  const [playerTeam, setPlayerTeam] = useState<"team_a" | "team_b" | null>(null);
  const [isPlayer, setIsPlayer] = useState(false);

  // Reset on open & detect player team
  useEffect(() => {
    if (open) {
      setView("select");
      setSelectedTeam(null);
      setStake(0);
      setPlacedBet(null);
      setNetworkError(false);
      setPlayerTeam(null);
      setIsPlayer(false);
      fetchBalance();
      detectPlayerTeam();
    }
  }, [open]);

  const detectPlayerTeam = async () => {
    if (!user || !match) return;
    const { data } = await supabase
      .from("match_players")
      .select("team")
      .eq("match_id", match.matchId)
      .eq("user_id", user.id)
      .eq("status", "confirmed")
      .maybeSingle();
    if (data?.team) {
      const t = data.team as "team_a" | "team_b";
      setPlayerTeam(t);
      setIsPlayer(true);
      setSelectedTeam(t); // auto-select their team
    }
  };

  const fetchBalance = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("padel_park_points")
      .eq("user_id", user.id)
      .single();
    setBalance(data?.padel_park_points ?? 0);
  };

  if (!match) return null;

  const odds = selectedTeam === "team_a" ? match.teamAOdds : match.teamBOdds;
  const potential = Math.round(stake * odds);

  const handlePlace = async () => {
    if (!user || !selectedTeam || stake <= 0) return;

    // Guard: detect offline before attempting
    if (!isOnline) {
      setNetworkError(true);
      return;
    }

    setNetworkError(false);
    setLoading(true);

    try {
      // Look up market_id from match_bet_markets
      const { data: market } = await supabase
        .from("match_bet_markets")
        .select("id")
        .eq("match_id", match.matchId)
        .single();

      if (!market) {
        toast.error("No betting market found for this match");
        setLoading(false);
        return;
      }

      const teamCode = selectedTeam === "team_a" ? "A" : "B";

      const { data, error } = await supabase.functions.invoke("place-match-bet", {
        body: {
          market_id: market.id,
          team: teamCode,
          stake_pts: stake,
        },
      });

      if (error) throw error;
      // Check for error in response body
      if (data?.error) throw new Error(data.error);

      setPlacedBet({
        team: selectedTeam === "team_a" ? match.teamALabel : match.teamBLabel,
        stake,
        potential,
      });
      setView("confirm");
      toast.success("Bet placed!");
      onBetPlaced?.();

      // Auto-close after 8s
      setTimeout(() => onClose(), 8000);
    } catch (err: any) {
      const isNetworkErr = !navigator.onLine || /fetch|network|failed to fetch/i.test(err.message ?? '');
      if (isNetworkErr) {
        setNetworkError(true);
      } else {
        toast.error(err.message || "Failed to place bet");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <BetBottomSheet open={open} onClose={onClose} title={view === "select" ? "PLACE BET" : undefined}>
      <AnimatePresence mode="wait">
        {view === "select" && (
          <motion.div
            key="select"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* Match recap */}
            <div className="rounded-xl bg-surface-container-high p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>{match.date} · {match.time}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                <span>{match.club}</span>
              </div>
            </div>

            {/* Balance pill */}
            <div className="flex justify-end">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                <Zap className="w-3 h-3 text-primary fill-primary" />
                <span className="text-xs font-display font-bold text-primary">{balance} XP</span>
              </div>
            </div>

            {/* Team selection */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {isPlayer ? "Your Team" : "Pick a Team"}
              </p>
              <div className="flex gap-3">
                {(!isPlayer || playerTeam === "team_a") && (
                  <TeamPickCard
                    label={match.teamALabel}
                    odds={match.teamAOdds}
                    selected={selectedTeam === "team_a"}
                    onSelect={() => !isPlayer && setSelectedTeam("team_a")}
                    avgRating={match.teamAAvgRating}
                  />
                )}
                {(!isPlayer || playerTeam === "team_b") && (
                  <TeamPickCard
                    label={match.teamBLabel}
                    odds={match.teamBOdds}
                    selected={selectedTeam === "team_b"}
                    onSelect={() => !isPlayer && setSelectedTeam("team_b")}
                    avgRating={match.teamBAvgRating}
                  />
                )}
              </div>
            </div>

            {/* Point chips */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Stake Amount
              </p>
              <PointChips value={stake} onChange={setStake} maxBalance={balance} />
            </div>

            {/* Potential win */}
            {selectedTeam && (
              <PotentialWinPreview stake={stake} multiplier={odds} />
            )}

            {/* Offline / network-error state */}
            {networkError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
                <WifiOff className="w-4 h-4 shrink-0" />
                {isOnline
                  ? "Connection error — tap Retry to try again."
                  : "You're offline — reconnect and tap Retry."}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={() => { setNetworkError(false); handlePlace(); }}
              disabled={!selectedTeam || stake <= 0 || loading || (networkError && !isOnline)}
              className="w-full py-4 rounded-full bg-primary text-primary-foreground font-display font-black text-sm uppercase tracking-widest disabled:opacity-40 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              {loading ? (
                "Placing..."
              ) : networkError ? (
                <><RefreshCw className="w-4 h-4" /> Retry · {stake} PTS</>
              ) : (
                `Place Bet · ${stake} PTS`
              )}
            </button>
          </motion.div>
        )}

        {view === "confirm" && placedBet && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-5 text-center py-4"
          >
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 10, stiffness: 200 }}
              className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto"
            >
              <Check className="w-8 h-8 text-primary" />
            </motion.div>

            <div>
              <h3 className="font-display font-black text-lg text-foreground">Bet Placed!</h3>
              <p className="text-sm text-muted-foreground mt-1">Your bet is locked in</p>
            </div>

            <div className="rounded-xl bg-surface-container-high p-4 text-left space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Team</span>
                <span className="font-bold text-foreground">{placedBet.team}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Stake</span>
                <span className="font-bold text-foreground">{placedBet.stake} XP</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Potential Return</span>
                <span className="font-bold text-primary">{placedBet.potential} XP</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="flex items-center gap-2 mx-auto text-xs font-bold text-primary"
            >
              Back to Matches <ArrowRight className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </BetBottomSheet>
  );
};

export default MatchBetSheet;
