import { motion } from "framer-motion";
import { Sparkles, Gift, TrendingUp, Wallet } from "lucide-react";

interface EarnMethod {
  icon: typeof Gift;
  title: string;
  description: string;
  color: string;
}

interface EarnPointsSectionProps {
  title: string;
  settings: Record<string, string>;
}

const EarnPointsSection = ({ title, settings }: EarnPointsSectionProps) => {
  const earningMethods: EarnMethod[] = [
    {
      icon: Gift,
      title: "Welcome Bonus",
      description: "Get 50 XPLAY Points when you join the platform",
      color: "text-primary",
    },
    {
      icon: TrendingUp,
      title: "Earn Points from Stakes",
      description: "Win points by correctly predicting match outcomes",
      color: "text-secondary",
    },
    {
      icon: Wallet,
      title: "Buy More Points",
      description: "Purchase point bundles with bonus rewards included",
      color: "text-primary",
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
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default EarnPointsSection;
