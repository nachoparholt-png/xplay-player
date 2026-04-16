import { motion } from "framer-motion";
import { Gift, Zap } from "lucide-react";

interface RewardCardProps {
  title: string;
  description: string;
  cost: number;
  category: string;
  available?: boolean;
}

const RewardCard = ({ title, description, cost, category, available = true }: RewardCardProps) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`card-elevated p-4 ${!available ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Gift className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{category}</span>
          <h3 className="font-display font-bold text-foreground mt-0.5">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-primary" />
          <span className="stat-number text-primary">{cost.toLocaleString()} XP</span>
        </div>
        <button
          className={`text-sm font-semibold px-4 py-1.5 rounded-xl transition-colors ${
            available
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
          disabled={!available}
        >
          {available ? "Redeem" : "Not enough"}
        </button>
      </div>
    </motion.div>
  );
};

export default RewardCard;
