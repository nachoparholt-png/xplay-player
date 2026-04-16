import { useState, useEffect, useRef } from "react";
import { Trophy, ArrowRight, Coins, Download, Timer, Star, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PhaseWinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bet: {
    id: string;
    stage: string;
    stake_pts: number;
    actual_payout_pts: number;
    pool_bonus_pts: number | null;
    odds_multiplier: number;
  };
  nextPhase: {
    stage: string;
    odds_multiplier: number;
    true_probability: number;
    tier_label: string;
  } | null;
  tournamentId: string;
  teamId: string;
  teamName: string;
  variant?: "win" | "elimination" | "champion";
  totalTournamentEarnings?: number;
}

const AUTO_COLLECT_SECONDS = 60;

const PhaseWinModal = ({
  open,
  onOpenChange,
  bet,
  nextPhase,
  tournamentId,
  teamId,
  teamName,
  variant: variantProp,
  totalTournamentEarnings = 0,
}: PhaseWinModalProps) => {
  const { toast } = useToast();
  const [rollOverAmount, setRollOverAmount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_COLLECT_SECONDS);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const totalPayout = bet.actual_payout_pts + (bet.pool_bonus_pts || 0);
  const poolBonus = bet.pool_bonus_pts || 0;
  const isFinalPhase = !nextPhase;
  const variant = variantProp || (isFinalPhase ? "champion" : "win");

  const formatLabel = (stage: string) =>
    stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Auto-collect countdown (only for standard win variant)
  useEffect(() => {
    if (!open || variant !== "win") return;
    setCountdown(AUTO_COLLECT_SECONDS);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          handleCollect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [open, variant]);

  const handleCollect = async () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    toast({ title: "Winnings collected! 🎉", description: `+${totalPayout} TBP credited` });
    onOpenChange(false);
  };

  const handleRollOver = async () => {
    if (!nextPhase || rollOverAmount <= 0) return;
    if (countdownRef.current) clearInterval(countdownRef.current);
    setProcessing(true);

    const { data, error } = await supabase.functions.invoke("place-bet", {
      body: {
        tournamentId,
        stage: nextPhase.stage,
        teamId,
        stakePts: rollOverAmount,
        source_bet_id: bet.id,
      },
    });

    setProcessing(false);

    if (error || data?.error) {
      toast({ title: "Roll-over failed", description: data?.error || error?.message, variant: "destructive" });
    } else {
      const collected = totalPayout - rollOverAmount;
      toast({
        title: "Rolled over! 🎯",
        description: `${rollOverAmount} TBP → ${formatLabel(nextPhase.stage)} at ×${nextPhase.odds_multiplier.toFixed(2)}${collected > 0 ? ` · ${collected} TBP collected` : ""}`,
      });
      onOpenChange(false);
    }
  };

  // Elimination variant
  if (variant === "elimination") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-center justify-center">
              <XCircle className="w-6 h-6 text-muted-foreground" />
              Your run ended at {formatLabel(bet.stage)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-xl p-4 text-center space-y-2 border border-border/30">
              <p className="text-xs text-muted-foreground">Points collected this tournament</p>
              <p className="text-2xl font-bold text-foreground font-mono">{totalTournamentEarnings} TBP</p>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Your TBP winnings will be converted to XPLAY Points at tournament end.
            </p>
            <Button onClick={() => onOpenChange(false)} variant="outline" className="w-full h-11 rounded-xl font-semibold">
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Champion variant
  if (variant === "champion") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-center justify-center">
              <Star className="w-6 h-6 text-primary fill-primary" />
              Champion! 🏆
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-primary/10 rounded-xl p-4 text-center space-y-2 border border-primary/20">
              <p className="text-xs text-muted-foreground">Total Payout</p>
              <p className="text-3xl font-bold text-primary font-mono">+{totalPayout} TBP</p>
              <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                <span>Factor: {bet.actual_payout_pts}</span>
                {poolBonus > 0 && <span>Pool bonus: +{poolBonus}</span>}
              </div>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{teamName}</span>
              {" · "}
              <Badge variant="outline" className="text-[10px] capitalize">{formatLabel(bet.stage)}</Badge>
            </div>
            {totalTournamentEarnings > 0 && (
              <div className="bg-muted/30 rounded-xl p-3 text-center border border-border/30">
                <p className="text-xs text-muted-foreground">Total XPLAY earned this tournament</p>
                <p className="text-lg font-bold text-foreground font-mono">{totalTournamentEarnings + totalPayout} TBP</p>
              </div>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Your TBP winnings will be converted to XPLAY Points at tournament end.
            </p>
            <Button onClick={handleCollect} className="w-full h-12 rounded-xl font-semibold">
              <Download className="w-4 h-4 mr-2" />
              Collect All
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Standard win variant
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-center justify-center">
            <Trophy className="w-6 h-6 text-primary" />
            You made it to {nextPhase ? formatLabel(nextPhase.stage) : formatLabel(bet.stage)}!
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payout Breakdown */}
          <div className="bg-primary/10 rounded-xl p-4 text-center space-y-2 border border-primary/20">
            <p className="text-xs text-muted-foreground">Total Payout</p>
            <p className="text-3xl font-bold text-primary font-mono">+{totalPayout} TBP</p>
            <div className="flex justify-center gap-4 text-xs text-muted-foreground">
              <span>Factor: {bet.actual_payout_pts}</span>
              {poolBonus > 0 && <span>Pool bonus: +{poolBonus}</span>}
            </div>
          </div>

          {/* Team info */}
          <div className="text-center text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{teamName}</span>
            {" · "}
            <Badge variant="outline" className="text-[10px] capitalize">{formatLabel(bet.stage)}</Badge>
          </div>

          {/* Running total */}
          {totalTournamentEarnings > 0 && (
            <div className="text-center text-xs text-muted-foreground">
              Total XPLAY earned this tournament: <span className="font-bold text-foreground">{totalTournamentEarnings} TBP</span>
            </div>
          )}

          {nextPhase && (
            <>
              {/* Next phase nudge */}
              <div className="bg-muted/30 rounded-xl p-3 border border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{formatLabel(nextPhase.stage)}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{nextPhase.tier_label}</Badge>
                    <span className="text-sm font-bold text-primary font-mono">×{nextPhase.odds_multiplier.toFixed(2)}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Win probability</span>
                    <span>{(nextPhase.true_probability * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={nextPhase.true_probability * 100} className="h-2" />
                </div>
              </div>

              {/* Roll-over slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Roll over</span>
                  <div className="flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-primary" />
                    <span className="font-bold">{rollOverAmount} TBP</span>
                  </div>
                </div>
                <Slider
                  value={[rollOverAmount]}
                  onValueChange={([v]) => setRollOverAmount(v)}
                  min={0}
                  max={totalPayout}
                  step={10}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Keep: {totalPayout - rollOverAmount}</span>
                  <span>Potential: {Math.floor(rollOverAmount * nextPhase.odds_multiplier)} TBP</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCollect} className="flex-1 h-11 rounded-xl">
                  <Download className="w-4 h-4 mr-1" />
                  Collect All
                </Button>
                <Button
                  onClick={handleRollOver}
                  disabled={processing || rollOverAmount <= 0}
                  className="flex-1 h-11 rounded-xl"
                >
                  <ArrowRight className="w-4 h-4 mr-1" />
                  {processing ? "..." : `Roll ${rollOverAmount}`}
                </Button>
              </div>
            </>
          )}

          {!nextPhase && (
            <Button onClick={handleCollect} className="w-full h-12 rounded-xl font-semibold">
              <Download className="w-4 h-4 mr-2" />
              Collect Winnings
            </Button>
          )}

          {/* Auto-collect countdown */}
          {variant === "win" && nextPhase && countdown > 0 && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Timer className="w-3 h-3" />
              Auto-collecting in 0:{countdown.toString().padStart(2, "0")}...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhaseWinModal;
