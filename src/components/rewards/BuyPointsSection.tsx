import { motion } from "framer-motion";
import { ShoppingCart, Zap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PointsPack } from "@/hooks/useRewards";

interface BuyPointsSectionProps {
  packs: PointsPack[];
  enabled: boolean;
  title: string;
  onBuyPack: (pack: PointsPack) => void;
  suggestedAmount?: number;
}

const BuyPointsSection = ({ packs, enabled, title, onBuyPack, suggestedAmount }: BuyPointsSectionProps) => {
  if (!enabled) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingCart className="w-5 h-5 text-secondary" />
        <h2 className="font-display font-bold text-lg">{title}</h2>
      </div>

      {suggestedAmount && suggestedAmount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-elevated p-4 border-secondary/20"
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-secondary" />
            <span className="text-sm font-semibold">Need {suggestedAmount} more points?</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Buy exactly what you need to unlock your reward.</p>
          <Button size="sm" className="gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Buy {suggestedAmount} XP
          </Button>
        </motion.div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {packs.map((pack, i) => (
          <motion.div
            key={pack.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.02 }}
            className="card-elevated p-4 text-center cursor-pointer hover:border-secondary/30 transition-colors"
            onClick={() => onBuyPack(pack)}
          >
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap className="w-4 h-4 text-primary" />
              <span className="stat-number text-xl text-primary">{pack.amount}</span>
            </div>
            {pack.bonus > 0 && (
              <span className="inline-block text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full mb-1">
                +{pack.bonus} bonus
              </span>
            )}
            <div className="stat-number text-lg text-foreground">${pack.price.toFixed(2)}</div>
            <span className="text-[10px] text-muted-foreground">Padel Park Points</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default BuyPointsSection;
