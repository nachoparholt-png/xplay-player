import { useState, useCallback, useRef, useMemo } from "react";
import type { PhaseBlock, PhaseType, ProgressionRule, CanvasState, MatchConfig, BestOfTiebreaker } from "@/lib/tournaments/types";
import { toast } from "@/hooks/use-toast";
import { Trash2, X, Star } from "lucide-react";
import PhaseBlockCard from "./PhaseBlockCard";
import ConnectionArrow from "./ConnectionArrow";
import BlockToolbar from "./BlockToolbar";
import SimulationBar from "./SimulationBar";

let blockCounter = 0;

const PHASE_LABELS: Record<PhaseType, string> = {
  round_robin: "Group",
  single_elimination: "Knockout",
  single_match: "Match",
  americano: "Americano",
  king_of_court: "King of Court",
};

interface HandlePosition {
  x: number;
  y: number;
}

interface PendingBestOf {
  fromPhaseId: string;
  fromRank: string;
  toPhaseId: string;
  /** Canvas-relative x for popup anchor */
  x: number;
  /** Canvas-relative y for popup anchor */
  y: number;
}

interface Props {
  canvasState: CanvasState;
  onChange: (state: CanvasState) => void;
  courtCount: number;
  totalTimeMins: number | null;
  initialCanvasState?: CanvasState;
  totalPlayers?: number;
  matchConfig?: MatchConfig;
  onCourtCountChange?: (count: number) => void;
  onTotalTimeMinsChange?: (mins: number | null) => void;
}

const BuilderCanvas = ({
  canvasState,
  onChange,
  courtCount,
  totalTimeMins,
  initialCanvasState,
  totalPlayers,
  matchConfig,
  onCourtCountChange,
  onTotalTimeMinsChange,
}: Props) => {
  const { phases, rules } = canvasState;

  // ── Connection state ──────────────────────────────────────────────────────
  const [connectingFrom, setConnectingFrom] = useState<{ phaseId: string; rank: string } | null>(null);
  /**
   * When true the user intends to draw a Best-of qualifier connection instead
   * of a direct one. Toggled via the hint banner while connectingFrom is active.
   */
  const [isBestOfMode, setIsBestOfMode] = useState(false);

  // ── Delete confirmation state ─────────────────────────────────────────────
  const [pendingDelete, setPendingDelete] = useState<{ ruleId: string; x: number; y: number } | null>(null);

  // ── Best-of qualifier popup state ─────────────────────────────────────────
  const [pendingBestOf, setPendingBestOf] = useState<PendingBestOf | null>(null);
  const [bestOfTiebreaker, setBestOfTiebreaker] = useState<BestOfTiebreaker>("points");
  const [bestOfCount, setBestOfCount] = useState(1);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Track handle positions reported by each PhaseBlockCard
  const [handlePositions, setHandlePositions] = useState<Record<string, Record<string, HandlePosition>>>({});

  const handleHandlePositions = useCallback(
    (phaseId: string, positions: Record<string, HandlePosition>) => {
      setHandlePositions((prev) => {
        const existing = prev[phaseId];
        if (existing) {
          const keys = Object.keys(positions);
          const same = keys.every(
            (k) => existing[k]?.x === positions[k].x && existing[k]?.y === positions[k].y
          );
          if (same && keys.length === Object.keys(existing).length) return prev;
        }
        return { ...prev, [phaseId]: positions };
      });
    },
    []
  );

  // ── Helpers to clear connection state ────────────────────────────────────
  const clearConnection = useCallback(() => {
    setConnectingFrom(null);
    setIsBestOfMode(false);
  }, []);

  const savedInitial = useMemo(
    () => initialCanvasState ?? { phases: [], rules: [] },
    [initialCanvasState]
  );

  const handleReset = useCallback(() => {
    onChange({ phases: [...savedInitial.phases], rules: [...savedInitial.rules] });
    clearConnection();
  }, [onChange, savedInitial, clearConnection]);

  const updatePhases = useCallback(
    (newPhases: PhaseBlock[]) => onChange({ ...canvasState, phases: newPhases, rules }),
    [canvasState, onChange, rules]
  );

  const updateRules = useCallback(
    (newRules: ProgressionRule[]) => onChange({ ...canvasState, phases, rules: newRules }),
    [canvasState, onChange, phases]
  );

  // ── Add / move / delete phase ─────────────────────────────────────────────
  const addPhase = useCallback(
    (type: PhaseType) => {
      blockCounter++;
      const existingOfType = phases.filter((p) => p.phaseType === type).length;
      const newPhase: PhaseBlock = {
        id: `phase-${Date.now()}-${blockCounter}`,
        phaseType: type,
        label: `${PHASE_LABELS[type]} ${existingOfType + 1}`,
        positionX: 40 + (phases.length % 3) * 300,
        positionY: 40 + Math.floor(phases.length / 3) * 220,
        config: {},
        sortOrder: phases.length,
      };

      if (type === "round_robin" && totalPlayers && totalPlayers > 0) {
        const newGroupCount = existingOfType + 1;
        const teamsPerGroup = Math.max(4, Math.floor(totalPlayers / newGroupCount));
        newPhase.config = { teams: teamsPerGroup };
        const updatedPhases = phases.map((p) =>
          p.phaseType === "round_robin"
            ? { ...p, config: { ...p.config, teams: teamsPerGroup } }
            : p
        );
        updatePhases([...updatedPhases, newPhase]);
        return;
      }

      updatePhases([...phases, newPhase]);
    },
    [phases, updatePhases, totalPlayers]
  );

  const movePhase = useCallback(
    (id: string, x: number, y: number) => {
      updatePhases(
        phases.map((p) => (p.id === id ? { ...p, positionX: Math.max(0, x), positionY: Math.max(0, y) } : p))
      );
    },
    [phases, updatePhases]
  );

  const deletePhase = useCallback(
    (id: string) => {
      const deletedPhase = phases.find((p) => p.id === id);
      const remainingPhases = phases.filter((p) => p.id !== id);
      const remainingRules = rules.filter((r) => r.fromPhaseId !== id && r.toPhaseId !== id);

      let finalPhases = remainingPhases;

      // When a group (round-robin) phase is deleted, redistribute its teams
      // proportionally across the remaining group phases
      if (deletedPhase?.phaseType === "round_robin") {
        const remainingGroups = remainingPhases.filter((p) => p.phaseType === "round_robin");
        if (remainingGroups.length > 0 && totalPlayers && totalPlayers > 0) {
          const teamsPerGroup = Math.max(4, Math.floor(totalPlayers / remainingGroups.length));
          finalPhases = remainingPhases.map((p) =>
            p.phaseType === "round_robin"
              ? { ...p, config: { ...p.config, teams: teamsPerGroup } }
              : p
          );
        }
      }

      onChange({ phases: finalPhases, rules: remainingRules });
      setHandlePositions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [phases, rules, onChange, totalPlayers]
  );

  // ── Delete rule (arrow click or handle click) ─────────────────────────────
  const deleteRule = useCallback(
    (ruleId: string) => {
      const ruleToDelete = rules.find((r) => r.id === ruleId);

      if (ruleToDelete?.ruleType === "best_of" && ruleToDelete.bestOfGroup) {
        const groupId = ruleToDelete.bestOfGroup;
        const effectiveBestOfCount = ruleToDelete.bestOfCount ?? 1;
        // Remaining rules in the same group after removing this one
        const remainingGroupRules = rules.filter(
          (r) => r.bestOfGroup === groupId && r.id !== ruleId
        );
        if (remainingGroupRules.length <= effectiveBestOfCount) {
          // Not enough competitors to justify a qualifier — remove the whole group
          updateRules(rules.filter((r) => r.bestOfGroup !== groupId));
        } else {
          updateRules(rules.filter((r) => r.id !== ruleId));
        }
      } else {
        updateRules(rules.filter((r) => r.id !== ruleId));
      }

      setPendingDelete(null);
    },
    [rules, updateRules]
  );

  const handleDeleteRequest = useCallback((ruleId: string, x: number, y: number) => {
    setPendingDelete({ ruleId, x, y });
  }, []);

  /**
   * Called by PhaseBlockCard when the user clicks a wired output handle.
   * Looks up the rule and opens the delete confirmation popup.
   */
  const handleWiredHandleClick = useCallback(
    (phaseId: string, rank: string) => {
      const rule = rules.find((r) => r.fromPhaseId === phaseId && r.fromRank === rank);
      if (!rule) return;
      const pos = handlePositions[phaseId]?.[rank];
      setPendingDelete({ ruleId: rule.id, x: pos?.x ?? 200, y: pos?.y ?? 200 });
    },
    [rules, handlePositions]
  );

  const handlePhaseFormatOverride = useCallback(
    (phaseId: string, override: Partial<MatchConfig> | null) => {
      updatePhases(
        phases.map((p) =>
          p.id === phaseId
            ? { ...p, matchConfigOverride: override ?? undefined }
            : p
        )
      );
    },
    [phases, updatePhases]
  );

  // ── Confirm best-of qualifier creation ────────────────────────────────────
  const confirmBestOf = useCallback(() => {
    if (!pendingBestOf) return;

    // Derive fixed capacity of the destination phase (overrides manual bestOfCount)
    const destPhase = phases.find((p) => p.id === pendingBestOf.toPhaseId);
    const destCapacity =
      destPhase?.phaseType === "single_match"
        ? 2
        : (destPhase?.config?.teams as number | undefined);
    const effectiveBestOfCount = destCapacity !== undefined ? destCapacity : bestOfCount;

    // Reuse existing group id if one already exists for this rank→dest pair
    const existingGroupRule = rules.find(
      (r) =>
        r.toPhaseId === pendingBestOf.toPhaseId &&
        r.fromRank === pendingBestOf.fromRank &&
        r.bestOfGroup
    );
    const groupId = existingGroupRule?.bestOfGroup ?? `bestof-${Date.now()}`;

    // Upgrade any existing DIRECT rules with the same rank→dest to best_of
    const upgradedRules = rules.map((r) => {
      if (
        r.toPhaseId === pendingBestOf.toPhaseId &&
        r.fromRank === pendingBestOf.fromRank &&
        r.ruleType !== "best_of"
      ) {
        return {
          ...r,
          ruleType: "best_of" as const,
          bestOfGroup: groupId,
          bestOfCount: effectiveBestOfCount,
          tiebreaker: bestOfTiebreaker,
        };
      }
      // Keep existing best_of rules in the same group in sync
      if (r.bestOfGroup === groupId) {
        return { ...r, bestOfCount: effectiveBestOfCount, tiebreaker: bestOfTiebreaker };
      }
      return r;
    });

    const newRule: ProgressionRule = {
      id: `rule-${Date.now()}`,
      fromPhaseId: pendingBestOf.fromPhaseId,
      toPhaseId: pendingBestOf.toPhaseId,
      fromRank: pendingBestOf.fromRank,
      toSlot: "IN",
      ruleType: "best_of",
      bestOfGroup: groupId,
      bestOfCount: effectiveBestOfCount,
      tiebreaker: bestOfTiebreaker,
    };

    updateRules([...upgradedRules, newRule]);
    setPendingBestOf(null);
    clearConnection();
  }, [pendingBestOf, phases, rules, updateRules, bestOfCount, bestOfTiebreaker, clearConnection]);

  // ── Main handle-click router ──────────────────────────────────────────────
  const handleHandleClick = useCallback(
    (phaseId: string, handleType: "in" | "out", rank: string) => {
      if (handleType === "out") {
        setConnectingFrom({ phaseId, rank });
        setIsBestOfMode(false); // reset mode when selecting a new source
        return;
      }

      // ── IN handle clicked while connectingFrom is active ──────────────────
      if (handleType === "in" && connectingFrom) {
        // Cancel if clicking own block
        if (connectingFrom.phaseId === phaseId) {
          clearConnection();
          return;
        }

        // Guard: source rank already wired to somewhere else
        const duplicate = rules.find(
          (r) => r.fromPhaseId === connectingFrom.phaseId && r.fromRank === connectingFrom.rank
        );
        if (duplicate) {
          const fromPhase = phases.find((p) => p.id === connectingFrom.phaseId);
          const existingTarget = phases.find((p) => p.id === duplicate.toPhaseId);
          toast({
            title: "Connection not allowed",
            description: `"${connectingFrom.rank}" from ${fromPhase?.label ?? "Phase"} is already connected to ${
              existingTarget?.label ?? "another phase"
            }. Remove that connection first.`,
            variant: "destructive",
          });
          clearConnection();
          return;
        }

        // ── Best-of mode: open qualifier config popup ─────────────────────
        if (isBestOfMode) {
          // Pre-fill from existing group settings (if joining)
          const existingBestOf = rules.find(
            (r) =>
              r.toPhaseId === phaseId &&
              r.fromRank === connectingFrom.rank &&
              r.ruleType === "best_of"
          );

          // Derive the fixed capacity of the destination phase
          const destPhase = phases.find((p) => p.id === phaseId);
          const destCapacity =
            destPhase?.phaseType === "single_match"
              ? 2
              : (destPhase?.config?.teams as number | undefined);

          if (existingBestOf) {
            setBestOfCount(existingBestOf.bestOfCount ?? 1);
            setBestOfTiebreaker(existingBestOf.tiebreaker ?? "points");
          } else if (destCapacity !== undefined) {
            // Auto-set to the destination's required team count
            setBestOfCount(destCapacity);
            setBestOfTiebreaker("points");
          } else {
            setBestOfCount(1);
            setBestOfTiebreaker("points");
          }
          const pos = handlePositions[phaseId]?.["IN"];
          setPendingBestOf({
            fromPhaseId: connectingFrom.phaseId,
            fromRank: connectingFrom.rank,
            toPhaseId: phaseId,
            x: pos?.x ?? 300,
            y: pos?.y ?? 200,
          });
          return;
        }

        // ── Direct mode: capacity check ────────────────────────────────────
        const targetPhase = phases.find((p) => p.id === phaseId);
        // Only direct connections consume a destination slot
        const directIncoming = rules.filter(
          (r) => r.toPhaseId === phaseId && r.ruleType !== "best_of"
        ).length;
        const capacity =
          targetPhase?.phaseType === "single_match"
            ? 2
            : (targetPhase?.config?.teams as number | undefined);

        if (capacity !== undefined && directIncoming >= capacity) {
          clearConnection();
          toast({
            title: "Connection blocked",
            description: `${targetPhase?.label ?? "Phase"} is full (${directIncoming}/${capacity} direct slots filled). Switch to Best-of mode in the banner below, or remove an existing connection first.`,
            variant: "destructive",
          });
          return;
        }

        // ── Create direct rule ─────────────────────────────────────────────
        const newRule: ProgressionRule = {
          id: `rule-${Date.now()}`,
          fromPhaseId: connectingFrom.phaseId,
          toPhaseId: phaseId,
          fromRank: connectingFrom.rank,
          toSlot: rank,
          ruleType: "direct",
        };
        updateRules([...rules, newRule]);
        clearConnection();
      }
    },
    [connectingFrom, isBestOfMode, rules, phases, updateRules, handlePositions, clearConnection]
  );

  const autoLayout = useCallback(() => {
    if (phases.length === 0) return;
    const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
    const cols = Math.ceil(Math.sqrt(sorted.length));
    const updated = sorted.map((p, i) => ({
      ...p,
      positionX: 40 + (i % cols) * 300,
      positionY: 40 + Math.floor(i / cols) * 240,
    }));
    updatePhases(updated);
  }, [phases, updatePhases]);

  const maxX = Math.max(600, ...phases.map((p) => p.positionX + 340));
  const maxY = Math.max(400, ...phases.map((p) => p.positionY + 260));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {/* Toolbar */}
        <BlockToolbar onAdd={addPhase} onAutoLayout={autoLayout} onReset={handleReset} />

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-auto rounded-xl border border-border/40 bg-muted/10"
          style={{ minHeight: 360, maxHeight: 560 }}
          onClick={() => {
            clearConnection();
            setPendingDelete(null);
            setPendingBestOf(null);
          }}
        >
          {/* Dot grid */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle, hsl(var(--border) / 0.3) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />

          {/* SVG connections */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: maxX, height: maxY }}
          >
            <g className="pointer-events-auto">
              {rules.map((rule) => (
                <ConnectionArrow
                  key={rule.id}
                  rule={rule}
                  phases={phases}
                  onDeleteRequest={handleDeleteRequest}
                  handlePositions={handlePositions}
                  isPendingDelete={pendingDelete?.ruleId === rule.id}
                />
              ))}
            </g>
          </svg>

          {/* ── Delete confirmation popup ──────────────────────────────────── */}
          {pendingDelete &&
            (() => {
              const rule = rules.find((r) => r.id === pendingDelete.ruleId);
              const fromPhase = phases.find((p) => p.id === rule?.fromPhaseId);
              const toPhase = phases.find((p) => p.id === rule?.toPhaseId);
              const isBestOfRule = rule?.ruleType === "best_of";
              return (
                <div
                  className="absolute z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 min-w-[180px]"
                  style={{ left: pendingDelete.x - 90, top: pendingDelete.y + 14 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[11px] text-zinc-400 mb-2 leading-snug">
                    {isBestOfRule ? (
                      <>
                        Remove <span className="font-bold text-amber-300">⭐ Best-of</span> qualifier{" "}
                        <span className="font-bold text-zinc-200">{rule?.fromRank}</span>
                      </>
                    ) : (
                      <>
                        Delete connection{" "}
                        <span className="font-bold text-zinc-200">{rule?.fromRank}</span>
                      </>
                    )}
                    {fromPhase && (
                      <>
                        {" "}from{" "}
                        <span className="font-semibold text-zinc-200">{fromPhase.label}</span>
                      </>
                    )}
                    {toPhase && (
                      <>
                        {" "}→{" "}
                        <span className="font-semibold text-zinc-200">{toPhase.label}</span>
                      </>
                    )}?
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold transition-colors"
                      onClick={() => deleteRule(pendingDelete.ruleId)}
                    >
                      <Trash2 className="w-3 h-3" />
                      {isBestOfRule ? "Remove" : "Delete"}
                    </button>
                    <button
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[11px] font-semibold transition-colors"
                      onClick={() => setPendingDelete(null)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* ── Best-of qualifier popup ────────────────────────────────────── */}
          {pendingBestOf &&
            (() => {
              const fromPhase = phases.find((p) => p.id === pendingBestOf.fromPhaseId);
              const toPhase = phases.find((p) => p.id === pendingBestOf.toPhaseId);
              const isJoining = rules.some(
                (r) =>
                  r.toPhaseId === pendingBestOf.toPhaseId &&
                  r.fromRank === pendingBestOf.fromRank &&
                  r.ruleType === "best_of"
              );
              return (
                <div
                  className="absolute z-50 bg-zinc-900 border border-amber-500/50 rounded-xl shadow-2xl p-3 min-w-[230px]"
                  style={{ left: pendingBestOf.x - 115, top: pendingBestOf.y + 14 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <p className="text-[12px] font-bold text-amber-300">
                      {isJoining ? "Join Best-of qualifier" : "Create Best-of qualifier"}
                    </p>
                  </div>
                  <p className="text-[10px] text-zinc-400 mb-3 leading-snug">
                    <span className="font-semibold text-zinc-200">{pendingBestOf.fromRank}</span>{" "}
                    from{" "}
                    <span className="font-semibold text-zinc-200">{fromPhase?.label}</span>{" "}
                    competes for a slot in{" "}
                    <span className="font-semibold text-zinc-200">{toPhase?.label}</span>
                  </p>

                  {/* Tiebreaker */}
                  <div className="mb-3">
                    <p className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wide mb-1">
                      Tiebreaker
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {(
                        [
                          { value: "points", label: "Points scored" },
                          { value: "wins", label: "Match wins" },
                          { value: "game_differential", label: "Game differential" },
                        ] as { value: BestOfTiebreaker; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setBestOfTiebreaker(opt.value)}
                          className={`text-[10px] px-2 py-1 rounded-md text-left transition-colors ${
                            bestOfTiebreaker === opt.value
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Teams that qualify */}
                  {(() => {
                    const toPhase = phases.find((p) => p.id === pendingBestOf.toPhaseId);
                    const destCapacity =
                      toPhase?.phaseType === "single_match"
                        ? 2
                        : (toPhase?.config?.teams as number | undefined);
                    if (destCapacity !== undefined) {
                      // Fixed — destination requires an exact number, no stepper needed
                      return (
                        <div className="mb-3">
                          <p className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wide mb-1">
                            Teams that qualify
                          </p>
                          <p className="text-[10px] text-zinc-300 leading-snug">
                            <span className="font-bold text-amber-300">{destCapacity}</span>{" "}
                            team{destCapacity !== 1 ? "s" : ""} — set by{" "}
                            <span className="font-semibold text-zinc-200">{toPhase?.label}</span>{" "}
                            ({destCapacity} required)
                          </p>
                        </div>
                      );
                    }
                    // Variable — show the stepper
                    return (
                      <div className="mb-3">
                        <p className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wide mb-1">
                          Teams that qualify
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setBestOfCount((c) => Math.max(1, c - 1))}
                            className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs flex items-center justify-center font-bold"
                          >
                            −
                          </button>
                          <span className="text-[13px] font-bold text-zinc-200 min-w-[18px] text-center">
                            {bestOfCount}
                          </span>
                          <button
                            onClick={() => setBestOfCount((c) => Math.min(4, c + 1))}
                            className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs flex items-center justify-center font-bold"
                          >
                            +
                          </button>
                          <span className="text-[9px] text-zinc-500 ml-1">
                            best team{bestOfCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-semibold transition-colors"
                      onClick={confirmBestOf}
                    >
                      <Star className="w-3 h-3 fill-black" />
                      {isJoining ? "Join group" : "Create qualifier"}
                    </button>
                    <button
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[11px] font-semibold transition-colors"
                      onClick={() => {
                        setPendingBestOf(null);
                        clearConnection();
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* Phase blocks */}
          <div className="relative" style={{ width: maxX, height: maxY }}>
            {phases.map((phase) => {
              const isStartPhase = !rules.some((r) => r.toPhaseId === phase.id);
              // For capacity display, count only direct incoming connections
              const incomingCount = rules.filter(
                (r) => r.toPhaseId === phase.id && r.ruleType !== "best_of"
              ).length;
              const capacity =
                phase.phaseType === "single_match"
                  ? 2
                  : (phase.config?.teams as number | undefined);

              // Wired outputs (all rule types)
              const wiredOutputs = new Set(
                rules
                  .filter((r) => r.fromPhaseId === phase.id)
                  .map((r) => `${r.fromPhaseId}::${r.fromRank}`)
              );
              // Subset: only best_of outputs → shown with star badge
              const bestOfOutputs = new Set(
                rules
                  .filter((r) => r.fromPhaseId === phase.id && r.ruleType === "best_of")
                  .map((r) => `${r.fromPhaseId}::${r.fromRank}`)
              );

              return (
                <PhaseBlockCard
                  key={phase.id}
                  phase={phase}
                  onMove={movePhase}
                  onDelete={deletePhase}
                  onHandleClick={handleHandleClick}
                  connectingFrom={connectingFrom}
                  totalPlayers={totalPlayers}
                  onHandlePositions={handleHandlePositions}
                  isStartPhase={isStartPhase}
                  incomingCount={incomingCount}
                  capacity={capacity}
                  wiredOutputs={wiredOutputs}
                  bestOfOutputs={bestOfOutputs}
                  onWiredHandleClick={handleWiredHandleClick}
                  matchConfig={matchConfig}
                  onFormatOverride={handlePhaseFormatOverride}
                />
              );
            })}
          </div>

          {phases.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Click a block type on the left to add phases
              </p>
            </div>
          )}

          {/* ── Connection hint banner ─────────────────────────────────────── */}
          {connectingFrom && (
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-0 rounded-full shadow-lg overflow-hidden border border-zinc-700 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Left: instruction text */}
              <span className="px-3 py-1.5 bg-zinc-900 text-zinc-300 text-[11px] font-semibold whitespace-nowrap">
                Click{" "}
                <span className="font-bold text-white">IN</span> on a destination block
              </span>

              {/* Divider */}
              <span className="w-px h-full bg-zinc-700" />

              {/* Direct mode tab */}
              <button
                className={`px-3 py-1.5 text-[10px] font-bold transition-colors ${
                  !isBestOfMode
                    ? "bg-primary text-primary-foreground"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
                onClick={() => setIsBestOfMode(false)}
              >
                Direct
              </button>

              {/* Best-of mode tab */}
              <button
                className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold transition-colors ${
                  isBestOfMode
                    ? "bg-amber-500 text-black"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
                onClick={() => setIsBestOfMode(true)}
              >
                <Star className={`w-2.5 h-2.5 ${isBestOfMode ? "fill-black" : ""}`} />
                Best-of
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Simulation bar */}
      <SimulationBar
        phases={phases}
        courtCount={courtCount}
        totalTimeMins={totalTimeMins}
        matchConfig={matchConfig}
        rules={rules}
        onCourtCountChange={onCourtCountChange}
        onTotalTimeMinsChange={onTotalTimeMinsChange}
      />
    </div>
  );
};

export default BuilderCanvas;
