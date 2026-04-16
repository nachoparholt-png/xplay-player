import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string;
  currentLevel: number | null;
  reliabilityScore: number;
  matchesCounted: number;
}

type RatingEntry = {
  id: string;
  old_level: number;
  new_level: number;
  level_change: number;
  provisional: boolean;
  created_at: string;
};

const PlayerRatingCard = ({ userId, currentLevel, reliabilityScore, matchesCounted }: Props) => {
  const [history, setHistory] = useState<RatingEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [provisionalThreshold, setProvisionalThreshold] = useState(10);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("rating_history")
        .select("id, old_level, new_level, level_change, provisional, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setHistory(data as RatingEntry[]);

      // Get provisional threshold from settings
      const { data: settingData } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "provisional_match_count")
        .maybeSingle();
      if (settingData) setProvisionalThreshold(parseInt(settingData.value) || 10);
    };
    fetch();
  }, [userId]);

  const isProvisional = matchesCounted < provisionalThreshold;
  const displayLevel = currentLevel?.toFixed(1) ?? "—";

  // Confidence label
  let confidenceLabel = "Low";
  let confidenceColor = "text-loss";
  if (reliabilityScore >= 80) { confidenceLabel = "High"; confidenceColor = "text-win"; }
  else if (reliabilityScore >= 60) { confidenceLabel = "Good"; confidenceColor = "text-primary"; }
  else if (reliabilityScore >= 30) { confidenceLabel = "Medium"; confidenceColor = "text-yellow-500"; }

  // Trend from last 5 matches
  const recentChanges = history.slice(0, 5);
  const totalRecentChange = recentChanges.reduce((sum, r) => sum + r.level_change, 0);
  let trendIcon = <Minus className="w-4 h-4 text-muted-foreground" />;
  let trendLabel = "Stable";
  let trendColor = "text-muted-foreground";
  if (totalRecentChange > 0.05) { trendIcon = <TrendingUp className="w-4 h-4 text-win" />; trendLabel = "Rising"; trendColor = "text-win"; }
  else if (totalRecentChange < -0.05) { trendIcon = <TrendingDown className="w-4 h-4 text-loss" />; trendLabel = "Falling"; trendColor = "text-loss"; }

  return (
    <div className="card-elevated p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-sm">Rating & Level</h3>
        {isProvisional && (
          <Badge variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-500">
            Provisional
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-2xl font-display font-bold">{displayLevel}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Level</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${confidenceColor}`}>{confidenceLabel}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Confidence</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1">
            {trendIcon}
            <span className={`text-sm font-bold ${trendColor}`}>{trendLabel}</span>
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Trend</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
        <span>{matchesCounted} rated match{matchesCounted !== 1 ? "es" : ""}</span>
        <span>Reliability: {reliabilityScore.toFixed(0)}%</span>
      </div>

      {/* Expandable history */}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
          >
            {expanded ? "Hide" : "Show"} rating history
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-1">
                  {history.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/20 last:border-0">
                      <span className="text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                      <span>{entry.old_level.toFixed(1)} → {entry.new_level.toFixed(1)}</span>
                      <span className={`font-mono font-medium ${entry.level_change > 0 ? "text-win" : entry.level_change < 0 ? "text-loss" : "text-muted-foreground"}`}>
                        {entry.level_change > 0 ? "+" : ""}{entry.level_change.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default PlayerRatingCard;
