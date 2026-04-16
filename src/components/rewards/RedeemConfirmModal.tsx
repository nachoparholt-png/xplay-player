import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Zap } from "lucide-react";
import type { Reward } from "@/hooks/useRewards";

interface RedeemConfirmModalProps {
  reward: Reward | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userPoints: number;
  isLoading: boolean;
}

const RedeemConfirmModal = ({ reward, open, onClose, onConfirm, userPoints, isLoading }: RedeemConfirmModalProps) => {
  if (!reward) return null;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Confirm Redemption</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to redeem <strong>{reward.reward_name}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 text-sm">
            <span className="text-muted-foreground">Reward cost</span>
            <div className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="stat-number text-primary">{reward.points_cost.toLocaleString()} XP</span>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 text-sm">
            <span className="text-muted-foreground">Current balance</span>
            <span className="stat-number">{userPoints.toLocaleString()} XP</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm">
            <span className="text-muted-foreground">After redemption</span>
            <span className="stat-number text-primary">{(userPoints - reward.points_cost).toLocaleString()} XP</span>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {isLoading ? "Redeeming..." : "Confirm Redemption"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RedeemConfirmModal;
