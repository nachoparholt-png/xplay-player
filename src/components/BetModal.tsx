import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Zap, TrendingUp, AlertTriangle, CheckCircle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type TeamPlayer = {
  display_name: string | null;
  padel_level: number | null;
  reliability_score: number;
};

interface BetModalProps {
  matchId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BetModal = ({ matchId, open, onOpenChange }: BetModalProps) => {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [matchInfo, setMatchInfo] = useState<{ club: string; match_date: string; match_time: string; format: string } | null>(null);
  const [teamA, setTeamA] = useState<TeamPlayer[]>([]);
  const [teamB, setTeamB] = useState<TeamPlayer[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<"A" | "B" | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [existingStake, setExistingStake] = useState(false);

  const balance = profile?.padel_park_points ?? 0;

  const fetchData = async () => {
    if (!matchId || !user) return;
    setLoading(true);
    setStep("select");
    setSelectedTeam(null);
    setStakeAmount("");

    const [{ data: matchData }, { data: playerData }, { data: stakeData }] = await Promise.all([
      supabase.from("matches").select("club, match_date, match_time, format").eq("id", matchId).single(),
      supabase.from("match_players").select("user_id").eq("match_id", matchId).eq("status", "confirmed").order("joined_at", { ascending: true }),
      supabase.from("match_stakes").select("id").eq("match_id", matchId).eq("user_id", user.id).eq("status", "active"),
    ]);

    setMatchInfo(matchData);
    setExistingStake((stakeData || []).length > 0);

    if (playerData && playerData.length > 0) {
      const userIds = playerData.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, padel_level, reliability_score, total_matches")
        .in("user_id", userIds);

      const enriched = playerData.map((p) => {
        const prof = profiles?.find((pr) => pr.user_id === p.user_id);
        return {
          display_name: prof?.display_name || "Player",
          padel_level: prof?.padel_level || null,
          reliability_score: prof?.reliability_score ?? 0,
        };
      });

      setTeamA(enriched.slice(0, 2));
      setTeamB(enriched.slice(2, 4));
    } else {
      setTeamA([]);
      setTeamB([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (open && matchId) fetchData();
  }, [open, matchId]);

  const teamALevel = useMemo(() => {
    const levels = teamA.map((p) => p.padel_level).filter((l): l is number => l != null);
    return levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  }, [teamA]);

  const teamBLevel = useMemo(() => {
    const levels = teamB.map((p) => p.padel_level).filter((l): l is number => l != null);
    return levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  }, [teamB]);

  const { multiplierA, multiplierB } = useMemo(() => {
    if (teamALevel === 0 && teamBLevel === 0) return { multiplierA: 2.0, multiplierB: 2.0 };
    if (teamALevel === 0 || teamBLevel === 0) return { multiplierA: 2.0, multiplierB: 2.0 };

    const diff = Math.abs(teamALevel - teamBLevel);
    const base = 1.2;
    const factor = Math.min(diff * 0.5, 2.0);

    if (teamALevel > teamBLevel) {
      return { multiplierA: Math.max(base, 2.0 - factor), multiplierB: Math.min(base + factor * 2, 5.0) };
    } else if (teamBLevel > teamALevel) {
      return { multiplierA: Math.min(base + factor * 2, 5.0), multiplierB: Math.max(base, 2.0 - factor) };
    }
    return { multiplierA: 2.0, multiplierB: 2.0 };
  }, [teamALevel, teamBLevel]);

  const currentMultiplier = selectedTeam === "A" ? multiplierA : selectedTeam === "B" ? multiplierB : 0;
  const stakeNum = parseInt(stakeAmount) || 0;
  const potentialWin = Math.floor(stakeNum * currentMultiplier);
  const remainingBalance = balance - stakeNum;

  const canConfirm = selectedTeam && stakeNum > 0 && stakeNum <= balance && !existingStake;

  const handleConfirm = async () => {
    if (!user || !matchId || !selectedTeam || !canConfirm) return;
    setSubmitting(true);

    // Deduct points
    const { error: pointsError } = await supabase
      .from("profiles")
      .update({ padel_park_points: remainingBalance })
      .eq("user_id", user.id);

    if (pointsError) {
      toast({ title: "Error", description: pointsError.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Create stake
    const { error: stakeError } = await supabase.from("match_stakes").insert({
      user_id: user.id,
      match_id: matchId,
      team: selectedTeam,
      points_staked: stakeNum,
      payout_multiplier: currentMultiplier,
      potential_winnings: potentialWin,
    });

    if (stakeError) {
      // Rollback points
      await supabase.from("profiles").update({ padel_park_points: balance }).eq("user_id", user.id);
      toast({ title: "Error", description: stakeError.message, variant: "destructive" });
    } else {
      await refreshProfile();
      toast({ title: "Stake placed! 🎯", description: `${stakeNum} XP on Team ${selectedTeam}` });
      onOpenChange(false);
    }
    setSubmitting(false);
  };

  const TeamCard = ({ label, players, level, multiplier, team }: {
    label: string; players: TeamPlayer[]; level: number; multiplier: number; team: "A" | "B";
  }) => {
    const isSelected = selectedTeam === team;
    const isStronger = level > (team === "A" ? teamBLevel : teamALevel) && level > 0;
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => !existingStake && setSelectedTeam(team)}
        disabled={existingStake}
        className={`flex-1 p-4 rounded-xl border-2 transition-all text-left ${
          isSelected
            ? "border-primary bg-primary/10"
            : "border-border/50 bg-muted/30 hover:border-border"
        } ${existingStake ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">{label}</p>
        <div className="space-y-1 mb-3">
          {players.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                {p.display_name?.[0]?.toUpperCase() || "?"}
              </div>
              <span className="text-sm truncate">{p.display_name || "TBD"}</span>
              {p.padel_level != null && (
                <span className="text-[10px] text-muted-foreground ml-auto">Lvl {p.padel_level.toFixed(1)}</span>
              )}
            </div>
          ))}
          {players.length === 0 && <p className="text-xs text-muted-foreground italic">No players yet</p>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Avg Level</span>
          <span className="text-sm font-bold">{level > 0 ? level.toFixed(2) : "–"}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">Payout</span>
          <span className={`text-sm font-bold ${isStronger ? "text-muted-foreground" : "text-primary"}`}>
            ×{multiplier.toFixed(2)}
          </span>
        </div>
      </motion.button>
    );
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-card border-border/50 p-0">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="p-5 pb-0">
              <DialogHeader>
                <DialogTitle className="font-display text-xl flex items-center gap-2">
                  {step === "confirm" && (
                    <button onClick={() => setStep("select")} className="p-1 rounded-lg hover:bg-muted">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <TrendingUp className="w-5 h-5 text-primary" />
                  {step === "select" ? "Place a Bet" : "Confirm Bet"}
                </DialogTitle>
              </DialogHeader>

              {matchInfo && (
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <span>{matchInfo.club}</span>
                  <span>•</span>
                  <span>{matchInfo.match_date}</span>
                  <span>•</span>
                  <span>{matchInfo.match_time.slice(0, 5)}</span>
                </div>
              )}

              {/* Balance display */}
              <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-muted/50">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Your Balance:</span>
                <span className="text-sm font-bold text-primary ml-auto">{balance} XP</span>
              </div>
            </div>

            {existingStake && (
              <div className="mx-5 mt-3 p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm text-primary font-medium">You already have an active stake on this match</span>
              </div>
            )}

            {step === "select" ? (
              <div className="p-5 space-y-4">
                {/* Teams */}
                <div className="flex gap-3">
                  <TeamCard label="Team A" players={teamA} level={teamALevel} multiplier={multiplierA} team="A" />
                  <TeamCard label="Team B" players={teamB} level={teamBLevel} multiplier={multiplierB} team="B" />
                </div>

                {/* Stake input */}
                {selectedTeam && !existingStake && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Points to stake</label>
                      <div className="relative">
                        <Input
                          type="number"
                          min={1}
                          max={balance}
                          placeholder="Enter amount"
                          value={stakeAmount}
                          onChange={(e) => setStakeAmount(e.target.value)}
                          className="pr-10 rounded-xl"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">PP</span>
                      </div>
                      {stakeNum > balance && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Insufficient balance
                        </p>
                      )}
                    </div>

                    {/* Quick amounts */}
                    <div className="flex gap-2">
                      {[50, 100, 250, 500].filter((v) => v <= balance).map((amount) => (
                        <button
                          key={amount}
                          onClick={() => setStakeAmount(String(amount))}
                          className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                        >
                          {amount}
                        </button>
                      ))}
                    </div>

                    {stakeNum > 0 && stakeNum <= balance && (
                      <Button
                        onClick={() => setStep("confirm")}
                        className="w-full h-11 rounded-xl font-semibold gap-2"
                      >
                        <TrendingUp className="w-4 h-4" />
                        Review Bet
                      </Button>
                    )}
                  </motion.div>
                )}

                {!selectedTeam && !existingStake && (
                  <p className="text-center text-sm text-muted-foreground">Select a team to back</p>
                )}
              </div>
            ) : (
              /* Confirmation step */
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-5 space-y-4">
                <div className="card-elevated p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Selected Team</span>
                    <span className="font-bold">Team {selectedTeam}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Points Staked</span>
                    <span className="font-bold text-primary">{stakeNum} XP</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Payout Multiplier</span>
                    <span className="font-bold">×{currentMultiplier.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Potential Winnings</span>
                    <span className="font-bold text-primary">{potentialWin} XP</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Remaining Balance</span>
                    <span className="font-bold">{remainingBalance} XP</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("select")} className="flex-1 h-11 rounded-xl">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={submitting}
                    className="flex-1 h-11 rounded-xl font-semibold gap-2"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Confirm Bet
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "select" && (
              <div className="px-5 pb-5">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full h-11 rounded-xl">
                  Close
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BetModal;
