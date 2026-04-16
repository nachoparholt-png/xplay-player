import { motion } from "framer-motion";
import { Check } from "lucide-react";

interface TeamPickCardProps {
  label: string;
  odds: number;
  selected: boolean;
  onSelect: () => void;
  avgRating?: number;
}

const TeamPickCard = ({ label, odds, selected, onSelect, avgRating }: TeamPickCardProps) => {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onSelect}
      className={`relative flex-1 rounded-2xl p-4 border-2 transition-colors ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-surface-container-high hover:border-muted-foreground/30"
      }`}
    >
      {/* Selected checkmark */}
      {selected && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
        >
          <Check className="w-3 h-3 text-primary-foreground" />
        </motion.div>
      )}

      <p className="font-display font-bold text-xs uppercase tracking-wide text-foreground truncate">
        {label}
      </p>

      {avgRating != null && avgRating > 0 && (
        <span className="text-[10px] text-muted-foreground font-bold mt-0.5 block">
          Avg {avgRating.toFixed(1)}
        </span>
      )}

      <div className="mt-2">
        <span className={`text-lg font-display font-black ${selected ? "text-primary" : "text-secondary"}`}>
          x{odds.toFixed(1)}
        </span>
      </div>
    </motion.button>
  );
};

export default TeamPickCard;
