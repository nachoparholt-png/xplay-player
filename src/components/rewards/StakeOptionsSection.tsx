import { motion } from "framer-motion";
import { Zap, Swords, ChevronRight, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface StakeOptionsSectionProps {
  title: string;
  stakeEnabled: boolean;
  activeStakeCount: number;
  minStake: number;
  maxStake: number;
}

const StakeOptionsSection = ({ title, stakeEnabled, activeStakeCount, minStake, maxStake }: StakeOptionsSectionProps) => {
  const navigate = useNavigate();

  if (!stakeEnabled) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Swords className="w-5 h-5 text-primary" />
        <h2 className="font-display font-bold text-lg">{title}</h2>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-elevated p-4 space-y-3"
      >
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Use your XPLAY Points (XP) to raise the stakes in selected matches. Winners can earn more, while draws return your staked points.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted/50 p-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Min Stake</span>
            <div className="flex items-center gap-1 mt-0.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="stat-number text-sm">{minStake} XP</span>
            </div>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Max Stake</span>
            <div className="flex items-center gap-1 mt-0.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="stat-number text-sm">{maxStake} XP</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigate("/matches")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            View Stake Matches
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {activeStakeCount > 0 && (
          <button
            onClick={() => navigate("/stakes")}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
          >
            You have {activeStakeCount} active stake{activeStakeCount !== 1 ? "s" : ""}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default StakeOptionsSection;
