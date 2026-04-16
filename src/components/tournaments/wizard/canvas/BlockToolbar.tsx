import { Grid3X3, Swords, Zap, Crown, RefreshCw, LayoutGrid, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PhaseType } from "@/lib/tournaments/types";

interface Props {
  onAdd: (type: PhaseType) => void;
  onAutoLayout: () => void;
  onReset?: () => void;
}

const TOOLS: { type: PhaseType; icon: typeof Grid3X3; label: string }[] = [
  { type: "round_robin", icon: Grid3X3, label: "Group" },
  { type: "single_elimination", icon: Swords, label: "Knockout" },
  { type: "single_match", icon: Zap, label: "Match" },
  { type: "americano", icon: RefreshCw, label: "Americano" },
  { type: "king_of_court", icon: Crown, label: "King" },
];

const BlockToolbar = ({ onAdd, onAutoLayout, onReset }: Props) => {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-1.5 p-1.5 bg-card border border-border/50 rounded-xl">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Tooltip key={tool.type}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  onClick={() => onAdd(tool.type)}
                >
                  <Icon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                + {tool.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
        <div className="border-t border-border/30 my-0.5" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg"
              onClick={onAutoLayout}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            Auto-layout
          </TooltipContent>
        </Tooltip>
        {onReset && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive"
                onClick={onReset}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Reset to default
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};

export default BlockToolbar;
