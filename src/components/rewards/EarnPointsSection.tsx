import { motion } from "framer-motion";
import { Sparkles, Gift, Trophy, Calendar, Flame, UserPlus, Award } from "lucide-react";

interface EarnMethod {
  icon: typeof Gift;
  title: string;
  description: string;
  points: string;
  color: string;
}

interface EarnPointsSectionProps {
  title: string;
  settings: Record<string, string>;
}

/**
 * XPLAY Points earning catalogue — simplified.
 * Anchor: 100 pts = £1 of catalogue value.
 * See XPLAY_Rewards_Program_Design.html for full programme rules.
 */
const EarnPointsSection = ({ title, settings: _settings }: EarnPointsSectionProps) => {
  const earningMethods: EarnMethod[] = [
    {
      icon: Gift,
      title: "Sign up & complete profile",
      description: "One-time welcome bonus when you finish onboarding",
      points: "+100 pts",
      color: "text-primary",
    },
    {
      icon: Trophy,
      title: "Play a match",
      description: "Whether you organise or join — every completed match earns the same",
      points: "+100 pts",
      color: "text-primary",
    },
    {
      icon: Award,
      title: "Win a match (skill bonus)",
      description: "Activity bonus on completed wins — capped at 4 wins / week",
      points: "+25 pts",
      color: "text-secondary",
    },
    {
      icon: Calendar,
      title: "Daily app check-in",
      description: "Open the app each day to keep your streak alive",
      points: "+5 pts",
      color: "text-primary",
    },
    {
      icon: Flame,
      title: "Weekly play streak",
      description: "3 consecutive weeks with a match played",
      points: "+100 pts",
      color: "text-secondary",
    },
    {
      icon: UserPlus,
      title: "Refer a friend who plays",
      description: "Invited friend completes their 1st match",
      points: "+500 pts",
      color: "text-primary",
    },
    {
      icon: Trophy,
      title: "Play in a tournament",
      description: "Check in to any XPLAY tournament",
      points: "+100 pts",
      color: "text-secondary",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="font-display font-bold text-lg">{title}</h2>
      </div>

      <div className="space-y-2">
        {earningMethods.map((method, i) => (
          <motion.div
            key={method.title}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="card-elevated p-3 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
              <method.icon className={`w-5 h-5 ${method.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm">{method.title}</h4>
              <p className="text-xs text-muted-foreground">{method.description}</p>
            </div>
            <div className="text-xs font-bold text-primary whitespace-nowrap font-mono">
              {method.points}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="text-[11px] text-muted-foreground mt-3 px-1">
        100 XPLAY Points redeem for £1 of catalogue value. Points have no cash value
        and cannot be transferred or exchanged for cash.
      </div>
    </div>
  );
};

export default EarnPointsSection;
