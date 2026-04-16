import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Clock } from "lucide-react";
import type { WizardState, MatchConfig, DeuceMode, ScoringMode } from "@/lib/tournaments/types";
import { estimateMatchMinutes } from "@/lib/tournaments/timeEstimates";

interface Props {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
}

const POINT_TARGETS = [16, 21, 32];

const Step2MatchType = ({ state, update }: Props) => {
  const mc = state.matchConfig;
  const estMins = estimateMatchMinutes(mc);

  const setMC = (partial: Partial<MatchConfig>) =>
    update({ matchConfig: { ...mc, ...partial } });

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">How do you want to score?</p>

      <Tabs
        value={mc.scoring_type}
        onValueChange={(v) => setMC({ scoring_type: v as ScoringMode })}
        className="w-full"
      >
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="points">Points</TabsTrigger>
          <TabsTrigger value="games">Games</TabsTrigger>
        </TabsList>

        {/* Points tab */}
        <TabsContent value="points" className="space-y-4 mt-4">
          <Label className="text-sm font-semibold">Target score</Label>
          <div className="flex gap-2">
            {POINT_TARGETS.map((t) => (
              <button
                key={t}
                onClick={() => setMC({ points_target: t })}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                  mc.points_target === t
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-card text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
            <button
              onClick={() => setMC({ points_target: mc.points_target && !POINT_TARGETS.includes(mc.points_target) ? mc.points_target : 25 })}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                mc.points_target && !POINT_TARGETS.includes(mc.points_target)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/50 bg-card text-foreground"
              }`}
            >
              Custom
            </button>
          </div>
          {mc.points_target && !POINT_TARGETS.includes(mc.points_target) && (
            <Input
              type="number"
              min={8}
              max={100}
              value={mc.points_target}
              onChange={(e) => setMC({ points_target: Math.max(8, Math.min(100, parseInt(e.target.value) || 8)) })}
              className="rounded-xl h-11 w-32"
            />
          )}
        </TabsContent>

        {/* Games tab */}
        <TabsContent value="games" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Games per set</Label>
            <div className="flex gap-2">
              {[4, 6].map((g) => (
                <button
                  key={g}
                  onClick={() => setMC({ games_per_set: g })}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                    (mc.games_per_set ?? 4) === g
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 bg-card text-foreground"
                  }`}
                >
                  {g} games
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Sets</Label>
            <div className="flex gap-2">
              {[1, 3].map((s) => (
                <button
                  key={s}
                  onClick={() => setMC({ sets_per_match: s })}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                    (mc.sets_per_match ?? 1) === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 bg-card text-foreground"
                  }`}
                >
                  {s === 1 ? "1 set" : "Best of 3"}
                </button>
              ))}
            </div>
          </div>

          {(mc.sets_per_match ?? 1) === 3 && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card">
              <div>
                <p className="text-sm font-semibold">3rd set tiebreak</p>
                <p className="text-xs text-muted-foreground">Play a tiebreak instead of a full third set</p>
              </div>
              <Switch
                checked={mc.third_set_tiebreak ?? false}
                onCheckedChange={(v) => setMC({ third_set_tiebreak: v })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Deuce mode</Label>
            <Select
              value={mc.deuce_mode ?? "normal"}
              onValueChange={(v) => setMC({ deuce_mode: v as DeuceMode })}
            >
              <SelectTrigger className="rounded-xl h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal deuce (2-point advantage)</SelectItem>
                <SelectItem value="silver">Silver point (1 deuce then decider)</SelectItem>
                <SelectItem value="golden">Golden point (next point wins)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>
      </Tabs>

      {/* Time estimate callout */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
        <Clock className="w-5 h-5 text-primary shrink-0" />
        <div>
          <p className="text-sm font-semibold">~{estMins} min per match</p>
          <p className="text-xs text-muted-foreground">Based on average padel match data</p>
        </div>
      </div>
    </div>
  );
};

export default Step2MatchType;
