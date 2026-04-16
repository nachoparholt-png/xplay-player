import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";

interface PotentialWinPreviewProps {
  stake: number;
  multiplier: number;
}

const PotentialWinPreview = ({ stake, multiplier }: PotentialWinPreviewProps) => {
  const potential = Math.round(stake * multiplier);

  if (stake <= 0 || multiplier <= 0) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/5 border border-primary/10">
      <Zap className="w-3.5 h-3.5 text-primary fill-primary" />
      <AnimatePresence mode="wait">
        <motion.span
          key={potential}
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -6, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="font-display font-black text-sm text-primary"
        >
          {stake} XP → Win {potential} XP
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

export default PotentialWinPreview;
