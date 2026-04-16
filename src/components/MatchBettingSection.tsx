import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, AlertTriangle, CheckCircle, RefreshCw, Lock, TrendingUp, Users, Trophy, Pencil, Trash2, Plus, X, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface MatchBettingSectionProps {
  matchId: string;
  userTeam?: "A" | "B" | null;
  matchStatus?: string;
  matchDateTime?: string;
}

type MarketData = {
  id: string;
  status: string;
  phase: string;
  team_a_multiplier: number;
  team_b_multiplier: number;
  team_a_tier: string;
  team_b_tier: string;
  team_a_line_status: string;
  team_b_line_status: string;
  total_pot: number;
  pot_share_pct: number;
  factor_locked: boolean;
  team_a_total_staked: number;
  team_b_total_staked: number;
  settled_winner: string | null;
};

type ExistingBet = {
  id: string;
  team: string;
  stake_pts: number;
  locked_multiplier: number;
  potential_payout_pts: number;
  status: string;
  factor_payout_pts: number | null;
  pot_bonus_pts: number | null;
  actual_payout_pts: number | null;
};

const QUICK_AMOUNTS = [5, 10, 25, 50];

const MatchBettingSection = ({
  matchId,
  userTeam,
  matchStatus = "open",
  matchDateTime,
}: MatchBettingSectionProps) => {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [market, setMarket] = useState<MarketData | null>(null);
  const [existingBet, setExistingBet] = useState<ExistingBet | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<"A" | "B" | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<{ min_stake: number; max_stake: number; max_exposure_pct: number } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [increaseAmount, setIncreaseAmount] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [increasing, setIncreasing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // UX enhancement state
  const [balancePulse, setBalancePulse] = useState(false);
  const [floatingDelta, setFloatingDelta] = useState<{ amount: number; key: number } | null>(null);
  const [increaseSuccess, setIncreaseSuccess] = useState(false);
  const [showGetMore, setShowGetMore] = useState(false);
  const prevBalanceRef = useRef<number | null>(null);
  const floatingKeyRef = useRef(0);

  const balance = profile?.padel_park_points ?? 0;
  const stakeNum = parseInt(stakeAmount) || 0;

  // Detect balance increase → pulse + floating animation
  useEffect(() => {
    if (prevBalanceRef.current !== null && balance > prevBalanceRef.current) {
      const delta = balance - prevBalanceRef.current;
      setBalancePulse(true);
      floatingKeyRef.current += 1;
      setFloatingDelta({ amount: delta, key: floatingKeyRef.current });
      const t = setTimeout(() => setBalancePulse(false), 1000);
      const t2 = setTimeout(() => setFloatingDelta(null), 1200);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }
    prevBalanceRef.current = balance;
  }, [balance]);

  // Show "get more" banner when balance < 10 or stake exceeds balance
  useEffect(() => {
    setShowGetMore(balance < 10 || stakeNum > balance);
  }, [balance, stakeNum]);

  const isBettingClosed = useMemo(() => {
    if (!matchDateTime) return false;
    const matchTime = new Date(matchDateTime);
    const now = new Date();
    return matchTime.getTime() - now.getTime() <= 15 * 60 * 1000 || matchStatus !== "open";
  }, [matchDateTime, matchStatus]);

  const fetchData = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const [marketRes, betRes, configRes] = await Promise.all([
      supabase
        .from("match_bet_markets")
        .select("id, status, phase, team_a_multiplier, team_b_multiplier, team_a_tier, team_b_tier, team_a_line_status, team_b_line_status, total_pot, pot_share_pct, factor_locked, team_a_total_staked, team_b_total_staked, settled_winner")
        .eq("match_id", matchId)
        .maybeSingle(),
      supabase
        .from("match_bets")
        .select("id, team, stake_pts, locked_multiplier, potential_payout_pts, status, factor_payout_pts, pot_bonus_pts, actual_payout_pts")
        .eq("match_id", matchId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("match_bet_config")
        .select("min_stake, max_stake, max_exposure_pct")
        .limit(1)
        .single(),
    ]);

    setMarket(marketRes.data || null);
    setExistingBet(betRes.data || null);
    setConfig(configRes.data);
    setLoading(false);
  }, [user, matchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription for live pot updates
  useEffect(() => {
    if (!market?.id) return;
    const channel = supabase
      .channel(`market-${market.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "match_bet_markets", filter: `id=eq.${market.id}` },
        (payload) => {
          const updated = payload.new;
          setMarket((prev) => prev ? { ...prev, ...updated } : null);
          if (updated.phase === "locked" && market.phase !== "locked") {
            toast({ title: "Match Ready 🔒", description: "Betting factors are now locked!" });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [market?.id]);

  // Re-fetch market data when match transitions back to "open"
  const prevStatusRef = useRef(matchStatus);
  useEffect(() => {
    if (prevStatusRef.current !== matchStatus && matchStatus === "open") {
      fetchData();
    }
    prevStatusRef.current = matchStatus;
  }, [matchStatus]);

  const effectiveMaxStake = config ? Math.min(config.max_stake, balance) : balance;

  // For increase mode: max additional stake
  const increaseMaxStake = existingBet && config
    ? Math.min(Math.max(0, config.max_stake - existingBet.stake_pts), balance)
    : 0;

  const isPendingOpponents = market?.phase === "pending_opponents";
  const displayMultiplier = (team: "A" | "B") => {
    if (isPendingOpponents) return 1.0;
    return Number(team === "A" ? market?.team_a_multiplier : market?.team_b_multiplier) || 0;
  };
  const currentMultiplier = selectedTeam ? displayMultiplier(selectedTeam) : 0;
  const potentialWin = Math.floor(stakeNum * (currentMultiplier || 0));

  const estimatedPotBonus = useMemo(() => {
    if (!market || !selectedTeam || stakeNum <= 0) return 0;
    const oppositeStaked = selectedTeam === "A" ? market.team_b_total_staked : market.team_a_total_staked;
    const myTeamStaked = (selectedTeam === "A" ? market.team_a_total_staked : market.team_b_total_staked) + stakeNum;
    const potPool = Math.floor(Number(market.pot_share_pct) * oppositeStaked);
    return myTeamStaked > 0 ? Math.floor((stakeNum / myTeamStaked) * potPool) : 0;
  }, [market, selectedTeam, stakeNum]);

  const canBet = !existingBet && !isBettingClosed && market?.status === "open" && market.phase !== "settled";
  const canModifyBet = existingBet && !isBettingClosed && market?.status === "open" && market.phase !== "settled" && market.phase !== "locked";
  const canConfirm = selectedTeam && stakeNum > 0 && stakeNum <= balance && canBet;

  // Quick-stake: additive
  const handleQuickAdd = (amount: number) => {
    const current = parseInt(stakeAmount) || 0;
    const newVal = Math.min(current + amount, effectiveMaxStake);
    setStakeAmount(String(newVal));
  };

  // Quick-stake for increase mode
  const handleQuickAddIncrease = (amount: number) => {
    const current = parseInt(increaseAmount) || 0;
    const newVal = Math.min(current + amount, increaseMaxStake);
    setIncreaseAmount(String(newVal));
  };

  const handleConfirm = async () => {
    if (!user || !selectedTeam || !canConfirm || !market) return;
    setSubmitting(true);

    const { data, error } = await supabase.functions.invoke("place-match-bet", {
      body: { market_id: market.id, team: selectedTeam, stake_pts: stakeNum },
    });

    if (error || data?.error) {
      toast({ title: "Bet failed", description: data?.error || error?.message, variant: "destructive" });
    } else {
      await refreshProfile();
      setSelectedTeam(null);
      setStakeAmount("");
      toast({ title: "Bet placed! 🎯", description: `${stakeNum} XP on Team ${selectedTeam}` });
      fetchData();
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <div className="flex items-center justify-center gap-2 py-8">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading betting data...</span>
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <div className="flex flex-col items-center justify-center gap-2 py-4">
          <Zap className="w-6 h-6 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Betting not yet available for this match</p>
        </div>
      </div>
    );
  }

  const phase = market.phase;
  const isSettled = phase === "settled" || market.status === "settled";

  // Settled view
  if (isSettled && existingBet) {
    const isWon = existingBet.status === "won";
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className={`px-4 py-3 flex items-center justify-between border-b ${isWon ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
          <div className="flex items-center gap-2">
            <Trophy className={`w-4 h-4 ${isWon ? "text-primary" : "text-destructive"}`} />
            <h3 className="font-display font-bold text-base">{isWon ? "You Won!" : "Better luck next time"}</h3>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 bg-muted/30 rounded-xl">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Staked</p>
              <p className="text-lg font-bold">{existingBet.stake_pts} XP</p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-xl">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Payout</p>
              <p className={`text-lg font-bold ${isWon ? "text-primary" : "text-destructive"}`}>
                {existingBet.actual_payout_pts ?? 0} XP
              </p>
            </div>
          </div>
          {isWon && existingBet.pot_bonus_pts != null && existingBet.pot_bonus_pts > 0 && (
            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-xl text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Pot Bonus
              </span>
              <span className="font-bold text-primary">+{existingBet.pot_bonus_pts} XP</span>
            </div>
          )}
          {isWon && existingBet.factor_payout_pts != null && (
            <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl text-sm">
              <span className="text-muted-foreground">Factor Payout</span>
              <span className="font-bold">{existingBet.factor_payout_pts} XP (×{existingBet.locked_multiplier})</span>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  const increaseNum = parseInt(increaseAmount) || 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border/30">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-bold text-base">
            {phase === "locked" ? "Betting Locked" : phase === "pending_opponents" ? "Awaiting Opponents" : "Place your bet"}
          </h3>
          {phase === "locked" && <Lock className="w-4 h-4 text-muted-foreground" />}
        </div>
        {/* Balance pill */}
        <div className="relative">
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all ${
            balancePulse
              ? "bg-green-500/20 border-green-500/40 animate-pulse"
              : "bg-primary/10 border-primary/20"
          }`}>
            <Zap className={`w-3.5 h-3.5 ${balancePulse ? "text-green-500 fill-green-500" : "text-primary fill-primary"}`} />
            <span className={`text-xs font-display font-black ${balancePulse ? "text-green-500" : "text-primary"}`}>
              {balance} XP
            </span>
          </div>
          {/* Floating +N animation */}
          <AnimatePresence>
            {floatingDelta && (
              <motion.span
                key={floatingDelta.key}
                initial={{ opacity: 1, y: 0 }}
                animate={{ opacity: 0, y: -30 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1 }}
                className="absolute -top-2 right-0 text-xs font-bold text-green-500 pointer-events-none"
              >
                +{floatingDelta.amount}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Phase banners */}
        {phase === "pending_opponents" && (
          <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground font-medium">
                Waiting for opponents to join — factors will update as players join
              </span>
            </div>
          </div>
        )}

        {phase === "open_dynamic" && (
          <div className="p-3 rounded-xl bg-[hsl(var(--accent))]/10 border border-[hsl(var(--accent))]/20">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[hsl(var(--accent))] shrink-0" />
              <span className="text-sm text-[hsl(var(--accent))] font-medium">
                Multipliers are preliminary and will be recalculated as players join or leave. Final odds lock when the match is full.
              </span>
            </div>
          </div>
        )}

        {phase === "locked" && (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-primary font-medium">
                Match is full — factors are locked. No more bets accepted.
              </span>
            </div>
          </div>
        )}

        {isBettingClosed && phase !== "locked" && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <span className="text-sm text-destructive font-medium">Betting is closed for this match</span>
            </div>
          </div>
        )}

        {/* Existing Bet */}
        {existingBet && (
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm text-primary font-medium">Your Active Bet</span>
              </div>
              {canModifyBet && !editMode && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setEditMode(true); setConfirmCancel(false); }}
                    className="h-7 px-2 text-xs text-primary hover:bg-primary/10 rounded-lg gap-1">
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setConfirmCancel(true); setEditMode(false); }}
                    className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 rounded-lg gap-1">
                    <Trash2 className="w-3 h-3" /> Cancel
                  </Button>
                </div>
              )}
              {editMode && (
                <Button variant="ghost" size="sm" onClick={() => { setEditMode(false); setIncreaseAmount(""); }}
                  className="h-7 px-2 text-xs text-muted-foreground hover:bg-muted/30 rounded-lg gap-1">
                  <X className="w-3 h-3" /> Close
                </Button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Team</p>
                <p className="text-sm font-bold">Team {existingBet.team}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Staked</p>
                <p className="text-sm font-bold text-primary">{existingBet.stake_pts} XP</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Factor</p>
                <p className="text-sm font-bold text-secondary">×{existingBet.locked_multiplier.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">To Win</p>
                <p className="text-sm font-bold text-primary">{existingBet.potential_payout_pts} XP</p>
              </div>
            </div>

            {/* Confirm Cancel */}
            <AnimatePresence>
              {confirmCancel && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden">
                  <p className="text-xs text-destructive font-medium">Cancel this bet? {existingBet.stake_pts} XP will be refunded.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirmCancel(false)}
                      className="flex-1 h-9 rounded-xl text-xs">Keep Bet</Button>
                    <Button variant="destructive" size="sm" disabled={cancelling}
                      onClick={async () => {
                        setCancelling(true);
                        const { data, error } = await supabase.functions.invoke("manage-match-bet", {
                          body: { action: "cancel", bet_id: existingBet.id },
                        });
                        if (error || data?.error) {
                          toast({ title: "Cancel failed", description: data?.error || error?.message, variant: "destructive" });
                        } else {
                          await refreshProfile();
                          setConfirmCancel(false);
                          toast({ title: "Bet cancelled", description: `${existingBet.stake_pts} XP refunded` });
                          fetchData();
                        }
                        setCancelling(false);
                      }}
                      className="flex-1 h-9 rounded-xl text-xs">
                      {cancelling ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Yes, Cancel"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Increase Stake */}
            <AnimatePresence>
              {editMode && config && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden">
                  <p className="text-xs text-muted-foreground">
                    Increase your stake (keeps your locked ×{Number(existingBet.locked_multiplier).toFixed(2)} factor)
                  </p>
                  <div className="relative">
                    <Input
                      type="number"
                      min={1}
                      max={increaseMaxStake}
                      placeholder={`1–${increaseMaxStake} XP`}
                      value={increaseAmount}
                      onChange={(e) => setIncreaseAmount(e.target.value)}
                      className="pr-16 h-10 rounded-xl text-sm"
                    />
                    <Button variant="ghost" size="sm"
                      onClick={() => setIncreaseAmount(String(increaseMaxStake))}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg">
                      MAX
                    </Button>
                  </div>

                  {/* Quick-stake buttons for increase */}
                  <div className="flex gap-2">
                    {QUICK_AMOUNTS.map((amt) => (
                      <Button key={amt} variant="outline" size="sm"
                        onClick={() => handleQuickAddIncrease(amt)}
                        disabled={increaseMaxStake <= 0}
                        className="flex-1 h-8 text-xs font-bold rounded-lg">
                        +{amt}
                      </Button>
                    ))}
                  </div>

                  {increaseNum > 0 && (
                    <div className="flex items-center justify-between p-2 bg-primary/5 rounded-lg text-xs">
                      <span className="text-muted-foreground">New total</span>
                      <span className="font-bold text-primary">
                        {existingBet.stake_pts + increaseNum} XP → Win {Math.floor((existingBet.stake_pts + increaseNum) * existingBet.locked_multiplier)} XP
                      </span>
                    </div>
                  )}
                  <Button size="sm" disabled={increasing || increaseNum <= 0 || increaseNum > balance || increaseSuccess}
                    onClick={async () => {
                      if (increaseNum <= 0) return;
                      setIncreasing(true);
                      const { data, error } = await supabase.functions.invoke("manage-match-bet", {
                        body: { action: "increase", bet_id: existingBet.id, additional_stake: increaseNum },
                      });
                      if (error || data?.error) {
                        toast({ title: "Increase failed", description: data?.error || error?.message, variant: "destructive" });
                      } else {
                        await refreshProfile();
                        setIncreaseSuccess(true);
                        setTimeout(() => {
                          setIncreaseSuccess(false);
                          setEditMode(false);
                          setIncreaseAmount("");
                        }, 2000);
                        toast({ title: "Bet increased! 🎯", description: `+${increaseNum} XP added to your bet` });
                        fetchData();
                      }
                      setIncreasing(false);
                    }}
                    className={`w-full h-9 rounded-xl text-xs font-bold gap-1 ${increaseSuccess ? "bg-green-600 hover:bg-green-600 text-white" : ""}`}>
                    {increasing ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : increaseSuccess ? (
                      <>
                        <CheckCircle className="w-3 h-3" /> ✓ Stake increased!
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3" /> Increase Stake {increaseNum > 0 ? `(+${increaseNum} XP)` : ""}
                      </>
                    )}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {market.total_pot > 0 && phase !== "pending_opponents" && !editMode && !confirmCancel && (
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Est. pot bonus
                </span>
                <span className="font-bold text-primary">
                  ~{Math.floor(
                    (existingBet.stake_pts / (existingBet.team === "A" ? Math.max(market.team_a_total_staked, 1) : Math.max(market.team_b_total_staked, 1)))
                    * Number(market.pot_share_pct) * (existingBet.team === "A" ? market.team_b_total_staked : market.team_a_total_staked)
                  )} XP
                </span>
              </div>
            )}
          </div>
        )}

        {/* Team Odds Cards */}
        {canBet && phase !== "locked" && (
          <div className="grid grid-cols-2 gap-3">
            {(["A", "B"] as const).map((team) => {
              const multiplier = displayMultiplier(team);
              const tier = team === "A" ? market.team_a_tier : market.team_b_tier;
              const lineStatus = team === "A" ? market.team_a_line_status : market.team_b_line_status;
              const teamStaked = team === "A" ? market.team_a_total_staked : market.team_b_total_staked;
              const isSelected = selectedTeam === team;
              const isOpponent = userTeam != null && userTeam !== team;
              const isSpectator = userTeam == null;
              const isClosed = lineStatus === "closed";

              const totalStaked = market.team_a_total_staked + market.team_b_total_staked;
              const isLopsided = totalStaked > 0 && (teamStaked / totalStaked) > 0.75;

              return (
                <motion.button
                  key={team}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => !existingBet && !(isOpponent && !isSpectator) && !isClosed && setSelectedTeam(team)}
                  disabled={!!existingBet || (isOpponent && !isSpectator) || isClosed}
                  className={`relative p-4 rounded-xl border-2 text-center transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-[0_0_20px_hsl(var(--primary)/0.15)]"
                      : (isOpponent && !isSpectator) || isClosed
                        ? "border-border/30 bg-muted/20 opacity-50 cursor-not-allowed"
                        : "border-border/50 bg-card hover:border-primary/40 cursor-pointer"
                  }`}
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Team {team}</p>
                  <p className="text-2xl font-display font-bold text-primary">
                    {phase === "open_dynamic" ? "~" : ""}×{Number(multiplier).toFixed(1)}
                  </p>
                  <span className="inline-block mt-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                    {tier}
                  </span>
                  {teamStaked > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">{teamStaked} XP staked</p>
                  )}
                  {isLopsided && (
                    <p className="text-[10px] text-[hsl(var(--destructive))] mt-1 font-medium">⚠ Heavy side</p>
                  )}
                  {lineStatus === "risk" && (
                    <p className="text-[10px] text-[hsl(var(--gold,40_100%_50%))] mt-1">⚠ At risk</p>
                  )}
                  {isClosed && <p className="text-[10px] text-destructive mt-1">Line closed</p>}
                  {isOpponent && !isSpectator && <p className="text-[10px] text-muted-foreground italic mt-2">Can't bet against your team</p>}
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Stake Input */}
        {selectedTeam && canBet && config && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="relative">
              <Input
                type="number"
                min={config.min_stake}
                max={effectiveMaxStake}
                placeholder={`${config.min_stake}–${effectiveMaxStake} XP`}
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="pr-20 h-12 rounded-xl text-base"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStakeAmount(String(effectiveMaxStake))}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-3 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg"
              >
                MAX
              </Button>
            </div>

            {/* Quick-stake buttons */}
            <div className="flex gap-2">
              {QUICK_AMOUNTS.map((amt) => (
                <Button key={amt} variant="outline" size="sm"
                  onClick={() => handleQuickAdd(amt)}
                  className="flex-1 h-9 text-xs font-bold rounded-lg">
                  +{amt}
                </Button>
              ))}
            </div>

            {/* Live preview */}
            {stakeNum > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/10 rounded-xl text-sm font-medium">
                <span className="text-muted-foreground">{stakeNum} XP</span>
                <span className="text-primary">→ Win {potentialWin} XP</span>
              </div>
            )}

            {stakeNum > 0 && (
              <>
                {stakeNum < config.min_stake && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Min stake is {config.min_stake} XP
                  </p>
                )}
                {stakeNum > effectiveMaxStake && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Max stake is {effectiveMaxStake} XP
                  </p>
                )}
                {stakeNum > balance && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Insufficient balance
                  </p>
                )}
              </>
            )}

            {stakeNum > 0 && stakeNum >= config.min_stake && stakeNum <= effectiveMaxStake && (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-primary/10 rounded-xl text-sm">
                  <span className="text-muted-foreground">Factor Win</span>
                  <span className="font-bold text-primary">{potentialWin} XP (×{Number(currentMultiplier).toFixed(2)})</span>
                </div>
                {userTeam ? (
                  estimatedPotBonus > 0 && (
                    <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" /> Est. Pot Bonus
                      </span>
                      <span className="font-bold text-primary">~{estimatedPotBonus} XP</span>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-xl text-sm">
                    <Trophy className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Factor payout only — pot bonus is for match players</span>
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={handleConfirm}
              disabled={!canConfirm || submitting}
              className="w-full h-12 rounded-xl font-bold text-base"
              size="lg"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirm Bet
                </>
              )}
            </Button>
          </motion.div>
        )}

        {!selectedTeam && canBet && phase !== "locked" && (
          <p className="text-center text-sm text-muted-foreground py-2">
            Choose a team to place your bet
          </p>
        )}

        {/* Get more XPLAY points banner */}
        <AnimatePresence>
          {showGetMore && canBet && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="p-3 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ShoppingCart className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-medium text-muted-foreground truncate">
                  {balance < 10 ? "Low balance — top up your XPLAY points" : "Need more points?"}
                </span>
              </div>
              <Button size="sm" variant="outline"
                onClick={() => navigate("/points-store")}
                className="h-7 px-3 text-xs font-bold rounded-lg shrink-0 gap-1 border-primary/30 text-primary hover:bg-primary/10">
                <Plus className="w-3 h-3" /> Get Points
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default MatchBettingSection;
