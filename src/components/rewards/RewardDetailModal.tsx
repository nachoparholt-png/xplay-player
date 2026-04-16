import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, ShoppingBag, AlertTriangle, CheckCircle, ShoppingCart, Sparkles, Store, ExternalLink } from "lucide-react";
import type { Reward } from "@/hooks/useRewards";

interface RewardDetailModalProps {
  reward: Reward | null;
  open: boolean;
  onClose: () => void;
  userPoints: number;
  onRedeem: (reward: Reward) => void;
  onBuyPoints: () => void;
  onEarnMore: () => void;
}

const RewardDetailModal = ({ reward, open, onClose, userPoints, onRedeem, onBuyPoints, onEarnMore }: RewardDetailModalProps) => {
  if (!reward) return null;

  const canAfford = userPoints >= reward.points_cost;
  const missingPoints = reward.points_cost - userPoints;
  const isOutOfStock = reward.stock_status === "out_of_stock" || (reward.current_stock !== null && reward.current_stock <= 0);
  const isComingSoon = reward.stock_status === "coming_soon" || reward.status === "coming_soon";
  const isAvailable = reward.status === "active" && !isOutOfStock && !isComingSoon;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{reward.reward_name}</DialogTitle>
          <DialogDescription>{reward.reward_description}</DialogDescription>
        </DialogHeader>

        {/* Image */}
        <div className="h-36 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center overflow-hidden">
          {reward.reward_image ? (
            <img src={reward.reward_image} alt={reward.reward_name} className="w-full h-full object-cover" />
          ) : (
            <ShoppingBag className="w-12 h-12 text-muted-foreground/30" />
          )}
        </div>

        {/* Store info */}
        {reward.store_name && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
            <Store className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{reward.store_name}</p>
              {reward.store_website_url && (
                <a href={reward.store_website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                  Visit store <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Redemption instructions */}
        {(reward.redemption_instructions || reward.store_redemption_instructions) && (
          <div className="p-3 rounded-xl bg-muted/50">
            <p className="text-xs text-muted-foreground font-medium mb-1">How to redeem</p>
            <p className="text-sm">{reward.redemption_instructions || reward.store_redemption_instructions}</p>
          </div>
        )}

        {/* Cost and balance */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <span className="text-sm text-muted-foreground">Cost</span>
            <div className="flex items-center gap-1">
              <Zap className="w-4 h-4 text-primary" />
              <span className="stat-number text-primary">{reward.points_cost.toLocaleString()} XP</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <span className="text-sm text-muted-foreground">Your balance</span>
            <span className="stat-number text-foreground">{userPoints.toLocaleString()} XP</span>
          </div>

          {canAfford && isAvailable && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
              <span className="text-sm text-muted-foreground">After redemption</span>
              <span className="stat-number text-primary">{(userPoints - reward.points_cost).toLocaleString()} XP</span>
            </div>
          )}

          {!canAfford && isAvailable && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-sm font-medium text-foreground">
                  You need {missingPoints.toLocaleString()} more points
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Keep playing or buy points to unlock this reward!</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={onBuyPoints} className="flex-1 gap-1.5 text-xs">
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Buy Points
                </Button>
                <Button size="sm" variant="outline" onClick={onEarnMore} className="flex-1 gap-1.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  Earn More
                </Button>
              </div>
            </div>
          )}

          {isOutOfStock && (
            <div className="p-3 rounded-xl bg-muted border border-border text-center">
              <span className="text-sm text-muted-foreground font-medium">This reward is currently out of stock</span>
            </div>
          )}

          {isComingSoon && (
            <div className="p-3 rounded-xl bg-secondary/10 border border-secondary/20 text-center">
              <span className="text-sm text-secondary font-medium">Coming soon — stay tuned!</span>
            </div>
          )}
        </div>

        {canAfford && isAvailable && (
          <Button onClick={() => onRedeem(reward)} className="w-full gap-2 mt-2">
            <CheckCircle className="w-4 h-4" />
            Redeem for {reward.points_cost.toLocaleString()} XP
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RewardDetailModal;
