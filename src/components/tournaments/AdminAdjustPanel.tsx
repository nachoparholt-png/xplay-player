import { useState } from "react";
import { Settings2, Minus, SkipForward, Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { estimateMatchMinutes } from "@/lib/tournaments/timeEstimates";
import type { MatchConfig, DeuceMode, BracketConfig, CanvasState } from "@/lib/tournaments/types";

interface AdminAdjustPanelProps {
  tournamentId: string;
  currentMatchConfig: MatchConfig;
  pendingMatchIds: string[];
  onConfigUpdated: (newConfig: MatchConfig) => void;
}

interface AdjustOption {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  timeDelta: number;
  action: () => Promise<void>;
}

const AdminAdjustPanel = ({
  tournamentId,
  currentMatchConfig,
  pendingMatchIds,
  onConfigUpdated,
}: AdminAdjustPanelProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  const currentMins = estimateMatchMinutes(currentMatchConfig);

  const updatePendingMatches = async (newConfig: MatchConfig) => {
    if (pendingMatchIds.length === 0) return;

    const { error } = await supabase
      .from("tournament_matches")
      .update({ match_config: newConfig as MatchConfig })
      .in("id", pendingMatchIds);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }

    // Also update tournament-level config
    await supabase
      .from("tournaments")
      .update({ match_config: newConfig as MatchConfig })
      .eq("id", tournamentId);

    onConfigUpdated(newConfig);
    toast({ title: "Settings updated ✅", description: `${pendingMatchIds.length} pending matches adjusted` });
  };

  const applyOption = async (optionId: string, action: () => Promise<void>) => {
    setApplying(optionId);
    await action();
    setApplying(null);
  };

  const options: AdjustOption[] = [];

  // Shorten points target
  if (currentMatchConfig.scoring_type === "points" && (currentMatchConfig.points_target || 21) > 16) {
    const newTarget = Math.max(16, (currentMatchConfig.points_target || 21) - 5);
    const newConfig = { ...currentMatchConfig, points_target: newTarget };
    const newMins = estimateMatchMinutes(newConfig);
    options.push({
      id: "shorten_points",
      icon: <Minus className="w-4 h-4" />,
      label: `Reduce to ${newTarget} points`,
      description: `Currently ${currentMatchConfig.points_target || 21} pts per match`,
      timeDelta: (newMins - currentMins) * pendingMatchIds.length,
      action: async () => updatePendingMatches(newConfig),
    });
  }

  // Switch deuce mode
  if (currentMatchConfig.scoring_type === "games") {
    const currentDeuce = currentMatchConfig.deuce_mode || "normal";
    if (currentDeuce !== "golden") {
      const newDeuce: DeuceMode = currentDeuce === "normal" ? "silver" : "golden";
      const newConfig = { ...currentMatchConfig, deuce_mode: newDeuce };
      const newMins = estimateMatchMinutes(newConfig);
      options.push({
        id: "switch_deuce",
        icon: <Settings2 className="w-4 h-4" />,
        label: `Switch to ${newDeuce} deuce`,
        description: `Currently ${currentDeuce} deuce`,
        timeDelta: (newMins - currentMins) * pendingMatchIds.length,
        action: async () => updatePendingMatches(newConfig),
      });
    }
  }

  // Reduce sets (best of 3 → 1 set)
  if (currentMatchConfig.scoring_type === "games" && (currentMatchConfig.sets_per_match || 1) > 1) {
    const newConfig = { ...currentMatchConfig, sets_per_match: 1 };
    const newMins = estimateMatchMinutes(newConfig);
    options.push({
      id: "reduce_sets",
      icon: <Minus className="w-4 h-4" />,
      label: "Switch to 1 set",
      description: `Currently best of ${currentMatchConfig.sets_per_match}`,
      timeDelta: (newMins - currentMins) * pendingMatchIds.length,
      action: async () => updatePendingMatches(newConfig),
    });
  }

  // Reduce games per set (6 → 4)
  if (currentMatchConfig.scoring_type === "games" && (currentMatchConfig.games_per_set || 6) > 4) {
    const newConfig = { ...currentMatchConfig, games_per_set: 4 };
    const newMins = estimateMatchMinutes(newConfig);
    options.push({
      id: "reduce_games",
      icon: <Minus className="w-4 h-4" />,
      label: "Reduce to 4 games per set",
      description: `Currently ${currentMatchConfig.games_per_set || 6} games per set`,
      timeDelta: (newMins - currentMins) * pendingMatchIds.length,
      action: async () => updatePendingMatches(newConfig),
    });
  }

  // Skip remaining pending matches
  if (pendingMatchIds.length > 1) {
    const skipCount = Math.ceil(pendingMatchIds.length / 3);
    const skipIds = pendingMatchIds.slice(-skipCount);
    options.push({
      id: "skip_matches",
      icon: <SkipForward className="w-4 h-4" />,
      label: `Skip ${skipCount} matches`,
      description: `Cancel last ${skipCount} of ${pendingMatchIds.length} pending`,
      timeDelta: -currentMins * skipCount,
      action: async () => {
        const { error } = await supabase
          .from("tournament_matches")
          .update({ status: "cancelled" })
          .in("id", skipIds);
        if (error) {
          toast({ title: "Skip failed", description: error.message, variant: "destructive" });
        } else {
          toast({ title: `Skipped ${skipCount} matches` });
        }
      },
    });
  }

  // Switch scoring mode entirely (points → games or vice versa)
  if (currentMatchConfig.scoring_type === "points") {
    const newConfig: MatchConfig = { scoring_type: "games", games_per_set: 4, sets_per_match: 1, deuce_mode: "golden" };
    const newMins = estimateMatchMinutes(newConfig);
    options.push({
      id: "switch_to_games",
      icon: <Settings2 className="w-4 h-4" />,
      label: "Switch to Games mode",
      description: "4 games, 1 set, golden deuce",
      timeDelta: (newMins - currentMins) * pendingMatchIds.length,
      action: async () => updatePendingMatches(newConfig),
    });
  }

  const formatDelta = (mins: number) => {
    if (mins === 0) return "";
    const abs = Math.abs(mins);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    const str = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return mins < 0 ? `−${str}` : `+${str}`;
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-1.5"
        >
          <Settings2 className="w-4 h-4" />
          Adjust
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Adjust Tournament</DrawerTitle>
          <DrawerDescription>
            Changes apply to {pendingMatchIds.length} pending match{pendingMatchIds.length !== 1 ? "es" : ""} only
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No adjustments available for current config
            </p>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => applyOption(opt.id, opt.action)}
                disabled={applying !== null}
                className="w-full flex items-start gap-3 p-3 rounded-xl border bg-card hover:border-primary/40 transition-colors text-left disabled:opacity-50"
              >
                <div className="mt-0.5 p-1.5 rounded-lg bg-muted">
                  {opt.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {opt.timeDelta !== 0 && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${opt.timeDelta < 0 ? "text-accent border-accent/30" : "text-destructive border-destructive/30"}`}
                    >
                      <Clock className="w-3 h-3 mr-0.5" />
                      {formatDelta(opt.timeDelta)}
                    </Badge>
                  )}
                  {applying === opt.id && (
                    <span className="text-[10px] text-muted-foreground">Applying...</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <DrawerFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default AdminAdjustPanel;
