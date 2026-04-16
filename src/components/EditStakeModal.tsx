import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Zap, TrendingUp, AlertTriangle, Trash2, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface EditStakeModalProps {
  stake: {
    id: string;
    match_id: string;
    team: string;
    points_staked: number;
    payout_multiplier: number;
    potential_winnings: number;
    match?: { club: string; match_date: string; match_time: string } | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

const EditStakeModal = ({ stake, open, onOpenChange, onUpdated }: EditStakeModalProps) => {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [newAmount, setNewAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const balance = profile?.padel_park_points ?? 0;
  const currentStaked = stake?.points_staked ?? 0;
  const maxAvailable = balance + currentStaked;
  const newAmountNum = parseInt(newAmount) || 0;
  const multiplier = stake?.payout_multiplier ?? 1;
  const newPotentialWin = Math.floor(newAmountNum * multiplier);
  const pointsDiff = newAmountNum - currentStaked;

  useEffect(() => {
    if (open && stake) {
      setNewAmount(String(stake.points_staked));
      setConfirmRemove(false);
    }
  }, [open, stake]);

  const canSave = newAmountNum > 0 && newAmountNum <= maxAvailable && newAmountNum !== currentStaked;

  const handleUpdate = async () => {
    if (!user || !stake || !canSave) return;
    setSaving(true);

    const newBalance = balance - pointsDiff;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ padel_park_points: newBalance })
      .eq("user_id", user.id);

    if (profileError) {
      toast({ title: "Error", description: profileError.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const { error: stakeError } = await supabase
      .from("match_stakes")
      .update({
        points_staked: newAmountNum,
        potential_winnings: newPotentialWin,
      })
      .eq("id", stake.id);

    if (stakeError) {
      await supabase.from("profiles").update({ padel_park_points: balance }).eq("user_id", user.id);
      toast({ title: "Error", description: stakeError.message, variant: "destructive" });
    } else {
      await refreshProfile();
      toast({ title: "Stake updated ✅", description: `${newAmountNum} XP on Team ${stake.team}` });
      onOpenChange(false);
      onUpdated();
    }
    setSaving(false);
  };

  const handleRemove = async () => {
    if (!user || !stake) return;
    setRemoving(true);

    const refundedBalance = balance + currentStaked;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ padel_park_points: refundedBalance })
      .eq("user_id", user.id);

    if (profileError) {
      toast({ title: "Error", description: profileError.message, variant: "destructive" });
      setRemoving(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("match_stakes")
      .delete()
      .eq("id", stake.id);

    if (deleteError) {
      await supabase.from("profiles").update({ padel_park_points: balance }).eq("user_id", user.id);
      toast({ title: "Error", description: deleteError.message, variant: "destructive" });
    } else {
      await refreshProfile();
      toast({ title: "Stake removed", description: `${currentStaked} XP refunded to your balance` });
      onOpenChange(false);
      onUpdated();
    }
    setRemoving(false);
  };

  if (!stake) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-card border-border/50 p-0">
        <div className="p-5 pb-0">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Edit Stake
            </DialogTitle>
          </DialogHeader>

          {stake.match && (
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <span>{stake.match.club}</span>
              <span>•</span>
              <span>{stake.match.match_date}</span>
              <span>•</span>
              <span>{stake.match.match_time.slice(0, 5)}</span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-muted/50">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Your Balance:</span>
            <span className="text-sm font-bold text-primary ml-auto">{balance} XP</span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Current stake info */}
          <div className="card-elevated p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Team</span>
              <span className="font-bold">Team {stake.team}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current Stake</span>
              <span className="font-bold text-primary">{currentStaked} XP</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Multiplier</span>
              <span className="font-bold">×{Number(multiplier).toFixed(2)}</span>
            </div>
          </div>

          {/* Update amount */}
          {!confirmRemove && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">New stake amount</label>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    max={maxAvailable}
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="pr-10 rounded-xl"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">PP</span>
                </div>
                {newAmountNum > maxAvailable && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Maximum available: {maxAvailable} XP
                  </p>
                )}
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2">
                {[50, 100, 250, 500].filter((v) => v <= maxAvailable).map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setNewAmount(String(amount))}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      newAmountNum === amount ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>

              {/* Summary */}
              {newAmountNum > 0 && newAmountNum !== currentStaked && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card-elevated p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Change</span>
                    <span className={`font-bold ${pointsDiff > 0 ? "text-destructive" : "text-primary"}`}>
                      {pointsDiff > 0 ? `−${pointsDiff}` : `+${Math.abs(pointsDiff)}`} XP
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">New Potential Win</span>
                    <span className="font-bold text-primary">{newPotentialWin} XP</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Balance After</span>
                    <span className="font-bold">{balance - pointsDiff} XP</span>
                  </div>
                </motion.div>
              )}

              <Button onClick={handleUpdate} disabled={!canSave || saving} className="w-full h-11 rounded-xl font-semibold gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Update Stake
              </Button>
            </motion.div>
          )}

          {/* Remove stake */}
          {!confirmRemove ? (
            <button
              onClick={() => setConfirmRemove(true)}
              className="w-full py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Stake
            </button>
          ) : (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center space-y-1">
                <p className="text-sm font-semibold text-destructive">Remove this stake?</p>
                <p className="text-xs text-muted-foreground">
                  {currentStaked} XP will be refunded to your balance.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setConfirmRemove(false)} className="flex-1 h-11 rounded-xl">
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRemove}
                  disabled={removing}
                  className="flex-1 h-11 rounded-xl font-semibold gap-2"
                >
                  {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Confirm Remove
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditStakeModal;
