import { motion } from "framer-motion";
import { Zap, ShoppingBag, Store } from "lucide-react";
import type { Reward } from "@/hooks/useRewards";

interface RewardCatalogCardProps {
  reward: Reward;
  userPoints: number;
  onSelect: (reward: Reward) => void;
}

const RewardCatalogCard = ({ reward, userPoints, onSelect }: RewardCatalogCardProps) => {
  const isOutOfStock = reward.stock_status === "out_of_stock" || (reward.current_stock !== null && reward.current_stock <= 0);
  const isComingSoon = reward.stock_status === "coming_soon" || reward.status === "coming_soon";
  const canAfford = userPoints >= reward.points_cost;
  const isAvailable = reward.status === "active" && !isOutOfStock && !isComingSoon;

  const getButtonState = () => {
    if (isComingSoon) return { label: "Coming Soon", disabled: true, className: "bg-surface-container-highest text-muted-foreground" };
    if (reward.status === "expired") return { label: "Expired", disabled: true, className: "bg-destructive/20 text-destructive" };
    if (isOutOfStock) return { label: "Out of Stock", disabled: true, className: "bg-surface-container-highest text-muted-foreground" };
    if (!canAfford) return { label: "Not enough", disabled: true, className: "bg-surface-container-highest text-muted-foreground cursor-not-allowed" };
    return { label: `${reward.points_cost.toLocaleString()} XP`, disabled: false, className: "bg-primary text-primary-foreground hover:brightness-110 active:scale-95" };
  };

  const btn = getButtonState();

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={`bg-surface-container rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden group ${!isAvailable ? "opacity-60" : ""}`}
      onClick={() => onSelect(reward)}
    >
      {/* Subtle glow */}
      {isAvailable && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />
      )}

      <div className="flex justify-between items-start z-10">
        <div className="space-y-1 flex-1 min-w-0">
          <h4 className="font-display text-lg font-bold truncate">{reward.reward_name}</h4>
          <p className="text-muted-foreground text-xs font-medium line-clamp-1">
            {reward.reward_description || reward.category}
          </p>
          {reward.store_name && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
              <Store className="w-3 h-3" />
              <span className="truncate">{reward.store_name}</span>
            </div>
          )}
        </div>
        {isAvailable && canAfford && (
          <div className="text-primary font-display font-black whitespace-nowrap ml-2">
            {reward.points_cost.toLocaleString()} XP
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <button
          disabled={btn.disabled}
          className={`w-full py-3 rounded-full font-display font-black text-sm uppercase tracking-wider transition-all ${btn.className}`}
          onClick={(e) => { e.stopPropagation(); if (!btn.disabled) onSelect(reward); }}
        >
          {isAvailable && canAfford ? "Redeem" : btn.label}
        </button>
        {/* XP shortfall hint */}
        {isAvailable && !canAfford && (
          <p className="text-center text-[11px] text-muted-foreground/70 font-medium">
            You need {(reward.points_cost - userPoints).toLocaleString()} more XP to unlock this
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default RewardCatalogCard;
