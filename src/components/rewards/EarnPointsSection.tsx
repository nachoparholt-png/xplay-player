import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Gift, Trophy, Calendar, Flame, UserPlus, Award, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface EarnMethod {
  icon: typeof Gift;
  title: string;
  points: string;
  highlight?: boolean;
}

interface EarnPointsSectionProps {
  title: string;
  settings: Record<string, string>;
}

/**
 * XPLAY Points earning catalogue — compact grid (user feedback 12 Jun: the
 * 7-row descriptive list was too long for the value it added). Top earners
 * surface first; full detail lives in Programme Rules.
 * Anchor: 100 pts = £1 of catalogue value.
 */
const EarnPointsSection = ({ title, settings: _settings }: EarnPointsSectionProps) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const methods: EarnMethod[] = [
    { icon: UserPlus, title: "Refer a friend who plays", points: "+500", highlight: true },
    { icon: Trophy, title: "Play a match", points: "+100" },
    { icon: Flame, title: "Weekly play streak", points: "+100" },
    { icon: Trophy, title: "Play a tournament", points: "+100" },
    { icon: Gift, title: "Complete your profile", points: "+100" },
    { icon: Award, title: "Win bonus", points: "+25" },
    { icon: Calendar, title: "Daily check-in", points: "+5" },
  ];
  const visible = expanded ? methods : methods.slice(0, 4);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="font-display font-bold text-lg">{title}</h2>
      </div>

      {/* compact 2-col grid */}
      <div className="grid grid-cols-2 gap-2">
        {visible.map((m, i) => (
          <motion.div
            key={m.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`rounded-xl p-3 flex flex-col gap-1.5 border ${
              m.highlight ? "bg-primary/10 border-primary/30" : "bg-card border-border/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <m.icon className={`w-4 h-4 ${m.highlight ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`font-mono text-sm font-bold ${m.highlight ? "text-primary" : "text-foreground"}`}>
                {m.points} <span className="text-[11px] font-display">XP</span>
              </span>
            </div>
            <span className="text-xs font-semibold leading-tight">{m.title}</span>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground"
        >
          {expanded ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>Show all {methods.length} <ChevronDown className="w-3 h-3" /></>}
        </button>
        <button
          onClick={() => navigate("/programme-rules")}
          className="text-[11px] font-bold text-primary"
        >
          How earning works →
        </button>
      </div>

      <div className="text-[11px] text-muted-foreground px-1">
        100 XPLAY Points redeem for £1 of catalogue value. Points have no cash value
        and cannot be transferred or exchanged for cash.
      </div>
    </div>
  );
};

export default EarnPointsSection;
