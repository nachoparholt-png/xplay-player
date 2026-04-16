import { motion } from "framer-motion";
import { Wallet, Gift, ShoppingCart, Sparkles, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";

interface PointsWalletCardProps {
  available: number;
  pending: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  onRedeem: () => void;
  onBuy: () => void;
  onEarn: () => void;
}

const PointsWalletCard = ({ available, pending, lifetimeEarned, lifetimeSpent, onRedeem, onBuy, onEarn }: PointsWalletCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden bg-surface-container rounded-2xl border-l-4 border-secondary shadow-[0px_0px_40px_hsl(var(--secondary)/0.05)]"
    >
      {/* Hero content */}
      <div className="p-6 relative z-10">
        <span className="text-secondary font-display text-xs tracking-widest uppercase font-bold mb-2 block">Points Balance</span>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-display text-4xl font-black tracking-tighter">{available.toLocaleString()}</span>
          <span className="text-muted-foreground font-display font-bold text-sm">PP</span>
        </div>
        {pending > 0 && (
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">+{pending.toLocaleString()} pending</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 border-t border-border/30">
        <div className="p-4 border-r border-border/30">
          <div className="flex items-center gap-1.5 mb-0.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Earned</span>
          </div>
          <span className="font-display font-black text-sm">{lifetimeEarned.toLocaleString()}</span>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-0.5">
            <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Spent</span>
          </div>
          <span className="font-display font-black text-sm">{lifetimeSpent.toLocaleString()}</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 border-t border-border/30">
        <button onClick={onRedeem} className="flex flex-col items-center gap-1.5 p-3 hover:bg-surface-container-high transition-colors">
          <Gift className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Redeem</span>
        </button>
        <button onClick={onBuy} className="flex flex-col items-center gap-1.5 p-3 border-x border-border/30 hover:bg-surface-container-high transition-colors">
          <ShoppingCart className="w-4 h-4 text-secondary" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Buy</span>
        </button>
        <button onClick={onEarn} className="flex flex-col items-center gap-1.5 p-3 hover:bg-surface-container-high transition-colors">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Earn</span>
        </button>
      </div>

      {/* Background decoration */}
      <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
        <Wallet className="w-40 h-40" />
      </div>
    </motion.div>
  );
};

export default PointsWalletCard;
