import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WizardState } from "@/lib/tournaments/types";

interface Props {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
}

const QuickTweakBar = ({ state, update }: Props) => {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card">
      {/* Courts tweak */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium">Courts</span>
        <Button
          size="icon"
          variant="ghost"
          className="w-7 h-7 rounded-lg"
          onClick={() => update({ courtCount: Math.max(1, state.courtCount - 1) })}
        >
          <Minus className="w-3.5 h-3.5" />
        </Button>
        <span className="text-sm font-bold w-5 text-center">{state.courtCount}</span>
        <Button
          size="icon"
          variant="ghost"
          className="w-7 h-7 rounded-lg"
          onClick={() => update({ courtCount: Math.min(10, state.courtCount + 1) })}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="w-px h-6 bg-border" />

      {/* Time tweak */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium">Time</span>
        <Button
          size="icon"
          variant="ghost"
          className="w-7 h-7 rounded-lg"
          onClick={() => {
            const cur = state.totalTimeMins ?? 120;
            update({ totalTimeMins: Math.max(30, cur - 15) });
          }}
        >
          <Minus className="w-3.5 h-3.5" />
        </Button>
        <span className="text-sm font-bold min-w-[2.5rem] text-center">
          {state.totalTimeMins ? `${state.totalTimeMins}m` : "—"}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="w-7 h-7 rounded-lg"
          onClick={() => {
            const cur = state.totalTimeMins ?? 105;
            update({ totalTimeMins: cur + 15 });
          }}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default QuickTweakBar;
