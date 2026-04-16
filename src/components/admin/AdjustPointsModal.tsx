import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Zap, Plus, Minus } from "lucide-react";

interface AdjustPointsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: { user_id: string; display_name: string | null; padel_park_points: number } | null;
  onSuccess: () => void;
}

const AdjustPointsModal = ({ open, onOpenChange, player, onSuccess }: AdjustPointsModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState<"add" | "deduct">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!player) return null;

  const amountNum = parseInt(amount) || 0;
  const newBalance = type === "add"
    ? player.padel_park_points + amountNum
    : Math.max(0, player.padel_park_points - amountNum);

  const handleConfirm = async () => {
    if (!user || amountNum <= 0) return;
    setSubmitting(true);

    const balanceBefore = player.padel_park_points;
    const balanceAfter = newBalance;
    const adjustedAmount = type === "add" ? amountNum : -amountNum;

    // Update points
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ padel_park_points: balanceAfter })
      .eq("user_id", player.user_id);

    if (updateError) {
      toast({ title: "Error", description: updateError.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Log transaction
    await supabase.from("points_transactions").insert({
      user_id: player.user_id,
      transaction_type: "manual_adjustment",
      amount: adjustedAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reason: reason || (type === "add" ? "Manual point addition" : "Manual point deduction"),
      admin_user_id: user.id,
    });

    // Add admin note if provided
    if (note) {
      await supabase.from("admin_notes").insert({
        target_user_id: player.user_id,
        admin_user_id: user.id,
        note: `Points ${type === "add" ? "added" : "deducted"}: ${amountNum} XP. ${note}`,
      });
    }

    toast({ title: "Points adjusted", description: `${type === "add" ? "+" : "-"}${amountNum} XP → New balance: ${balanceAfter} XP` });
    setAmount("");
    setReason("");
    setNote("");
    onOpenChange(false);
    onSuccess();
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Adjust Points
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="card-elevated p-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{player.display_name || "Player"}</p>
              <p className="text-xs text-muted-foreground">Current balance</p>
            </div>
            <span className="text-xl font-bold text-primary">{player.padel_park_points} XP</span>
          </div>

          <div className="flex gap-2">
            <Button
              variant={type === "add" ? "default" : "outline"}
              onClick={() => setType("add")}
              className="flex-1 rounded-xl gap-2"
            >
              <Plus className="w-4 h-4" /> Add
            </Button>
            <Button
              variant={type === "deduct" ? "destructive" : "outline"}
              onClick={() => setType("deduct")}
              className="flex-1 rounded-xl gap-2"
            >
              <Minus className="w-4 h-4" /> Deduct
            </Button>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Amount</label>
            <Input
              type="number"
              min={1}
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Reason</label>
            <Input
              placeholder="e.g. Tournament reward, correction"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Internal Note (optional)</label>
            <Textarea
              placeholder="Admin-only note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-xl resize-none"
              rows={2}
            />
          </div>

          {amountNum > 0 && (
            <div className="card-elevated p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current</span>
                <span>{player.padel_park_points} XP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Change</span>
                <span className={type === "add" ? "text-win" : "text-destructive"}>
                  {type === "add" ? "+" : "-"}{amountNum} XP
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between font-bold">
                <span>New Balance</span>
                <span className="text-primary">{newBalance} XP</span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={submitting || amountNum <= 0}
              className="flex-1 rounded-xl"
            >
              {submitting ? "Processing..." : "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdjustPointsModal;
