import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Zap, ArrowRight, TrendingUp, Info, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { deriveTournamentStages, type TournamentStage } from "@/lib/tournaments/deriveStages";
import { DEFAULT_STAGE_MULTIPLIERS, type StageKey } from "@/lib/tournaments/betOddsEngine";
import BetBottomSheet from "./BetBottomSheet";
import PointChips from "./PointChips";
import PotentialWinPreview from "./PotentialWinPreview";

interface TournamentBetData {
  tournamentId: string;
  name: string;
  formatType: string;
  bracketConfig?: { knockout_structure?: string } | null;
}

interface TournamentBetSheetProps {
  open: boolean;
  onClose: () => void;
  tournament: TournamentBetData | null;
  onBetPlaced?: () => void;
  isCreatorBlocked?: boolean;
}

type View = "betting" | "confirmed";

interface StageBet {
  enabled: boolean;
  stake: number;
}

function getStageMultiplier(
  liveOdds: Record<string, { multiplier: number; estimated: boolean }>,
  stageKey: string
): { multiplier: number; isEstimated: boolean } {
  if (liveOdds[stageKey] && liveOdds[stageKey].multiplier > 0) {
    return { multiplier: liveOdds[stageKey].multiplier, isEstimated: liveOdds[stageKey].estimated };
  }
  const fallback = DEFAULT_STAGE_MULTIPLIERS[stageKey as StageKey];
  return { multiplier: fallback ?? 1.8, isEstimated: true };
}

const TournamentBetSheet = ({ open, onClose, tournament, onBetPlaced, isCreatorBlocked = false }: TournamentBetSheetProps) => {
  const { user } = useAuth();
  const [view, setView] = useState<View>("betting");
  const [stages, setStages] = useState<TournamentStage[]>([]);
  const [activeStage, setActiveStage] = useState(0);
  const [stageBets, setStageBets] = useState<Record<string, StageBet>>({});
  const [stageOdds, setStageOdds] = useState<Record<string, { multiplier: number; estimated: boolean }>>({});
  const [hasLiveOdds, setHasLiveOdds] = useState(false);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [placedStages, setPlacedStages] = useState<{ stage: string; stake: number; potential: number }[]>([]);

  useEffect(() => {
    if (open && tournament) {
      setView("betting");
      setPlacedStages([]);
      const derived = deriveTournamentStages(tournament.formatType, tournament.bracketConfig);
      setStages(derived);
      setActiveStage(0);

      const initial: Record<string, StageBet> = {};
      derived.forEach((s) => { initial[s.key] = { enabled: false, stake: 0 }; });
      setStageBets(initial);

      fetchBalance();
      fetchOdds(tournament.tournamentId, derived);
    }
  }, [open, tournament]);

  const fetchBalance = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("padel_park_points")
      .eq("user_id", user.id)
      .single();
    setBalance(data?.padel_park_points ?? 0);
  };

  const fetchOdds = async (tournamentId: string, stageList: TournamentStage[]) => {
    let teamFilter: string | null = null;
    if (user) {
      const { data: tp } = await supabase
        .from("tournament_players")
        .select("team_id")
        .eq("tournament_id", tournamentId)
        .eq("user_id", user.id)
        .maybeSingle();
      teamFilter = tp?.team_id ?? null;
    }

    let query = supabase
      .from("tournament_bet_odds")
      .select("stage, odds_multiplier, estimated")
      .eq("tournament_id", tournamentId);
    if (teamFilter) query = query.eq("team_id", teamFilter);

    const { data } = await query;

    const map: Record<string, { multiplier: number; estimated: boolean }> = {};
    (data || []).forEach((row: any) => {
      if (row.stage && row.odds_multiplier) {
        map[row.stage] = { multiplier: row.odds_multiplier, estimated: row.estimated ?? false };
      }
    });
    setStageOdds(map);
    setHasLiveOdds((data || []).length > 0);
  };

  if (!tournament) return null;

  const currentStage = stages[activeStage];
  const totalStaked = Object.values(stageBets).reduce((sum, b) => sum + (b.enabled ? b.stake : 0), 0);
  const enabledCount = Object.values(stageBets).filter((b) => b.enabled && b.stake > 0).length;

  const updateStageBet = (key: string, updates: Partial<StageBet>) => {
    setStageBets((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...updates },
    }));
  };

  const splitEqually = () => {
    const enabledKeys = Object.entries(stageBets).filter(([, b]) => b.enabled).map(([k]) => k);
    if (enabledKeys.length === 0) return;
    const perStage = Math.floor(balance / enabledKeys.length);
    const updated = { ...stageBets };
    enabledKeys.forEach((k) => { updated[k] = { ...updated[k], stake: perStage }; });
    setStageBets(updated);
  };

  const handlePlaceAll = async () => {
    if (!user || enabledCount === 0) return;
    setLoading(true);

    try {
      const placed: typeof placedStages = [];

      for (const [key, bet] of Object.entries(stageBets)) {
        if (!bet.enabled || bet.stake <= 0) continue;

        const { data, error } = await supabase.functions.invoke("place-bet", {
          body: {
            tournament_id: tournament.tournamentId,
            stage: key,
            stake_pts: bet.stake,
          },
        });

        if (error) {
          const errMsg = data?.error || error.message;
          toast.error(`Failed to bet on ${key}: ${errMsg}`);
          continue;
        }

        const { multiplier } = getStageMultiplier(stageOdds, key);
        placed.push({
          stage: stages.find((s) => s.key === key)?.label || key,
          stake: bet.stake,
          potential: Math.round(bet.stake * multiplier),
        });
      }

      if (placed.length > 0) {
        setPlacedStages(placed);
        setView("confirmed");
        toast.success(`${placed.length} bet${placed.length > 1 ? "s" : ""} placed!`);
        onBetPlaced?.();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to place bets");
    } finally {
      setLoading(false);
    }
  };

  // Check if all odds are estimated
  const allEstimated = Object.values(stageOdds).length === 0 || Object.values(stageOdds).every(o => o.estimated);

  return (
    <BetBottomSheet open={open} onClose={onClose} title={view === "betting" ? tournament.name : undefined}>
      <AnimatePresence mode="wait">
        {view === "betting" && (
          <motion.div
            key="betting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* Creator blocked message */}
            {isCreatorBlocked && (
              <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-muted/50 border border-border/30">
                <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Tournament coordinators cannot place bets on their own tournament.
                </span>
              </div>
            )}

            {/* Estimated odds banner */}
            {!isCreatorBlocked && allEstimated && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(82,80%,45%)]/10 border border-[hsl(82,80%,45%)]/20">
                <Info className="w-3.5 h-3.5 text-[hsl(82,80%,45%)] shrink-0" />
                <span className="text-[10px] font-bold text-[hsl(82,80%,45%)]">
                  ~ Based on skill range · Updates as players join
                </span>
              </div>
            )}

            {!isCreatorBlocked && !allEstimated && !hasLiveOdds && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(82,80%,45%)]/10 border border-[hsl(82,80%,45%)]/20">
                <Info className="w-3.5 h-3.5 text-[hsl(82,80%,45%)] shrink-0" />
                <span className="text-[10px] font-bold text-[hsl(82,80%,45%)]">
                  Odds finalised at tournament start · Shown values are estimates
                </span>
              </div>
            )}

            {/* Balance pill */}
            {!isCreatorBlocked && (
              <div className="flex justify-end">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                  <Zap className="w-3 h-3 text-primary fill-primary" />
                  <span className="text-xs font-display font-bold text-primary">{balance} XP</span>
                </div>
              </div>
            )}

            {/* Stage carousel */}
            {!isCreatorBlocked && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {stages.map((s, i) => {
                  const bet = stageBets[s.key];
                  const isActive = i === activeStage;
                  return (
                    <button
                      key={s.key}
                      onClick={() => setActiveStage(i)}
                      className={`whitespace-nowrap text-xs font-bold px-4 py-2 rounded-full border transition-colors shrink-0 ${
                        isActive
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-surface-container-high text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {s.label}
                        {bet?.enabled && bet.stake > 0 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Stage content */}
            {!isCreatorBlocked && currentStage && (() => {
              const { multiplier, isEstimated } = getStageMultiplier(stageOdds, currentStage.key);
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-display font-bold text-foreground">
                      {currentStage.label}
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">
                        {stageBets[currentStage.key]?.enabled ? "ON" : "OFF"}
                      </span>
                      <button
                        onClick={() =>
                          updateStageBet(currentStage.key, {
                            enabled: !stageBets[currentStage.key]?.enabled,
                          })
                        }
                        className={`w-10 h-5 rounded-full transition-colors relative ${
                          stageBets[currentStage.key]?.enabled
                            ? "bg-primary"
                            : "bg-surface-container-highest"
                        }`}
                      >
                        <motion.div
                          animate={{ x: stageBets[currentStage.key]?.enabled ? 20 : 2 }}
                          className="absolute top-0.5 w-4 h-4 rounded-full bg-foreground"
                        />
                      </button>
                    </label>
                  </div>

                  {stageBets[currentStage.key]?.enabled && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="space-y-3"
                    >
                      <div className="rounded-xl bg-surface-container-high p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5 text-secondary" />
                          <span className="text-xs text-muted-foreground font-bold">Multiplier</span>
                        </div>
                        <span className={`font-display font-black ${isEstimated ? "text-muted-foreground" : "text-secondary"}`}>
                          {isEstimated ? "~" : ""}x{multiplier.toFixed(1)}
                          {isEstimated && (
                            <span className="text-[9px] font-bold ml-1 opacity-60">est.</span>
                          )}
                        </span>
                      </div>

                      <PointChips
                        value={stageBets[currentStage.key]?.stake || 0}
                        onChange={(v) => updateStageBet(currentStage.key, { stake: v })}
                        maxBalance={balance - totalStaked + (stageBets[currentStage.key]?.stake || 0)}
                      />

                      <PotentialWinPreview
                        stake={stageBets[currentStage.key]?.stake || 0}
                        multiplier={multiplier}
                      />

                      {isEstimated && stageBets[currentStage.key]?.stake > 0 && (
                        <p className="text-[10px] text-muted-foreground/70 text-center italic">
                          Estimated odds — final multipliers set at tournament start
                        </p>
                      )}
                    </motion.div>
                  )}
                </div>
              );
            })()}

            {/* Budget summary */}
            {!isCreatorBlocked && enabledCount > 0 && (
              <div className="rounded-xl bg-surface-container-high p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total staked</span>
                  <span className="font-bold text-foreground">{totalStaked} XP</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Stages</span>
                  <span className="font-bold text-foreground">{enabledCount}</span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(100, (totalStaked / Math.max(1, balance)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            {!isCreatorBlocked && (
              <div className="space-y-2">
                {enabledCount >= 2 && (
                  <button
                    onClick={splitEqually}
                    className="w-full py-2.5 rounded-full text-xs font-bold text-primary border border-primary/20 hover:bg-primary/5 transition-colors"
                  >
                    Split Equally
                  </button>
                )}

                <button
                  onClick={handlePlaceAll}
                  disabled={enabledCount === 0 || totalStaked === 0 || loading}
                  className="w-full py-4 rounded-full bg-primary text-primary-foreground font-display font-black text-sm uppercase tracking-widest disabled:opacity-40 active:scale-[0.98] transition-transform"
                >
                  {loading
                    ? "Placing..."
                    : `Place ${enabledCount} Bet${enabledCount !== 1 ? "s" : ""} · ${totalStaked} PTS`}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {view === "confirmed" && (
          <motion.div
            key="confirmed"
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
              <h3 className="font-display font-black text-lg text-foreground">Bets Placed!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {placedStages.length} stage{placedStages.length !== 1 ? "s" : ""} locked in
              </p>
            </div>

            <div className="space-y-2">
              {placedStages.map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-surface-container-high p-3 flex items-center justify-between"
                >
                  <div className="text-left">
                    <p className="text-xs font-bold text-foreground">{s.stage}</p>
                    <p className="text-[10px] text-muted-foreground">{s.stake} XP staked</p>
                  </div>
                  <span className="text-sm font-display font-bold text-primary">
                    → {s.potential} XP
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/10 p-3">
              <span className="text-xs font-bold text-primary">
                Total potential: {placedStages.reduce((s, p) => s + p.potential, 0)} XP
              </span>
            </div>

            <button
              onClick={onClose}
              className="flex items-center gap-2 mx-auto text-xs font-bold text-primary"
            >
              Back to Tournaments <ArrowRight className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </BetBottomSheet>
  );
};

export default TournamentBetSheet;
