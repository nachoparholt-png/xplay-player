import { useMemo, useState } from "react";
import { Clock, Check, AlertTriangle, Star, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WizardState, SuggestionCard } from "@/lib/tournaments/types";
import { generateSuggestions, generateFormatSummary } from "@/lib/tournaments/suggestionEngine";

import { estimateMatchMinutes, estimateTotalMinutes, calculateTotalMatches } from "@/lib/tournaments/timeEstimates";
import FeasibilityPanel from "./FeasibilityPanel";
import QuickTweakBar from "./QuickTweakBar";

interface Props {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  onSelect: () => void;
}

const FIT_STYLES: Record<SuggestionCard["timeFit"], { bg: string; icon: typeof Check; label: string }> = {
  green: { bg: "bg-green-500/10 text-green-400 border-green-500/30", icon: Check, label: "Good fit" },
  yellow: { bg: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", icon: AlertTriangle, label: "Tight fit" },
  red: { bg: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertTriangle, label: "Won't fit" },
  none: { bg: "bg-muted text-muted-foreground border-border/50", icon: Clock, label: "" },
};

function buildCurrentCard(state: WizardState): SuggestionCard {
  const teamCount = state.tournamentType === "pairs"
    ? Math.floor(state.playerCount / 2)
    : state.playerCount;
  const matchMins = estimateMatchMinutes(state.matchConfig);
  const { totalMatches, matchesPerTeam, knockoutMatches } = calculateTotalMatches(teamCount, state.formatType, state.bracketConfig);
  const estimatedTotalMins = estimateTotalMinutes(matchMins, totalMatches, state.courtCount, 2, knockoutMatches);
  const budget = state.totalTimeMins;

  let timeFit: SuggestionCard["timeFit"] = "none";
  if (budget) {
    const ratio = estimatedTotalMins / budget;
    if (ratio <= 1.05) timeFit = "green";
    else if (ratio <= 1.3) timeFit = "yellow";
    else timeFit = "red";
  }

  const hasCustomLayout = !!state.savedCanvasSummary;

  return {
    id: "current",
    label: "Your current setup",
    description: hasCustomLayout
      ? "Custom layout built in the Advanced Visual Builder"
      : "Based on the format and scoring you configured",
    formatType: state.formatType,
    matchConfig: state.matchConfig,
    bracketConfig: state.bracketConfig,
    estimatedTotalMins,
    matchesPerTeam,
    timeFit,
    isRecommended: false,
    adjustmentTip: null,
    formatSummary: hasCustomLayout
      ? state.savedCanvasSummary!
      : generateFormatSummary(state.formatType, state.matchConfig, state.bracketConfig, teamCount),
  };
}

const Step4Suggestions = ({ state, update, onSelect }: Props) => {
  const cards = useMemo(() => generateSuggestions(state), [state]);
  const currentCard = useMemo(() => buildCurrentCard(state), [state]);
  const allCards = useMemo(() => [currentCard, ...cards], [currentCard, cards]);

  const [selectedCardId, setSelectedCardId] = useState<string>("current");

  const selectedCard = allCards.find((c) => c.id === selectedCardId) ?? currentCard;

  // Build summary stats from selected card
  const teamCount = state.tournamentType === "pairs"
    ? Math.floor(state.playerCount / 2)
    : state.playerCount;
  const summaryStats = useMemo(() => {
    const matchMins = estimateMatchMinutes(selectedCard.matchConfig);
    const { totalMatches, matchesPerTeam, knockoutMatches } = calculateTotalMatches(
      teamCount, selectedCard.formatType, selectedCard.bracketConfig
    );
    const totalEstimatedMins = estimateTotalMinutes(matchMins, totalMatches, state.courtCount, 2, knockoutMatches);
    const budgetMins = state.totalTimeMins;
    const deltaMins = budgetMins ? Math.max(0, totalEstimatedMins - budgetMins) : 0;
    const rounds = Math.ceil(totalMatches / state.courtCount);

    let fit: "green" | "yellow" | "red" | "none" = "none";
    if (budgetMins) {
      const ratio = totalEstimatedMins / budgetMins;
      if (ratio <= 1.05) fit = "green";
      else if (ratio <= 1.3) fit = "yellow";
      else fit = "red";
    }

    return { totalEstimatedMins, budgetMins, deltaMins, fit, totalMatches, matchesPerTeam, rounds };
  }, [selectedCard, state.courtCount, state.totalTimeMins, teamCount]);

  const selectCard = (card: SuggestionCard) => {
    if (card.id === "current") {
      onSelect();
    } else {
      update({
        formatType: card.formatType,
        matchConfig: card.matchConfig,
        bracketConfig: card.bracketConfig,
      });
      onSelect();
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick tweaks at the top */}
      <QuickTweakBar state={state} update={update} />

      {/* Shared summary bar reacting to selected card */}
      <FeasibilityPanel stats={summaryStats} />

      {/* All cards */}
      <p className="text-sm text-muted-foreground pt-1">Choose a format</p>

      {allCards.map((card) => {
        const fit = FIT_STYLES[card.timeFit];
        const FitIcon = fit.icon;
        const isSelected = card.id === selectedCardId;
        const isCurrent = card.id === "current";

        return (
          <div
            key={card.id}
            className={`p-4 rounded-xl border bg-card space-y-3 transition-colors cursor-pointer ${
              isSelected
                ? "border-primary ring-1 ring-primary/20"
                : "border-border/50"
            }`}
            onClick={() => setSelectedCardId(card.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold">{card.label}</p>
                  {isCurrent && (
                    <Badge className="bg-accent/15 text-accent-foreground border-accent/30 text-[10px] px-1.5 py-0">
                      Current
                    </Badge>
                  )}
                  {card.isRecommended && (
                    <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0 gap-1">
                      <Star className="w-3 h-3" />
                      Recommended
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed bg-muted/50 rounded-lg px-2.5 py-1.5">
                  {card.formatSummary}
                </p>
              </div>
              {fit.label && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${fit.bg}`}>
                  <FitIcon className="w-3 h-3" />
                  {fit.label}
                </span>
              )}
            </div>

            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                ~{card.estimatedTotalMins} min total
              </span>
              <span>{card.matchesPerTeam} matches each</span>
            </div>

            {card.adjustmentTip && (
              <div className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{card.adjustmentTip}</span>
              </div>
            )}

            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                selectCard(card);
              }}
              variant={isSelected ? "default" : "outline"}
              className="rounded-xl w-full"
            >
              Select this
            </Button>
          </div>
        );
      })}

      <p className="text-center text-xs text-muted-foreground pt-2">
        None of these work?{" "}
        <button className="text-primary underline" onClick={() => window.history.back()}>
          Go back and customise
        </button>
      </p>
    </div>
  );
};

export default Step4Suggestions;
