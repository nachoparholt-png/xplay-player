import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import {
  Grid3X3, Swords, Zap, Crown, RefreshCw,
  GripVertical, Trash2, AlertTriangle, Users, Hash, Check, Star, Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PhaseBlock, PhaseType, MatchConfig, DeuceMode } from "@/lib/tournaments/types";
import { estimateMatchMinutes } from "@/lib/tournaments/timeEstimates";

const PHASE_META: Record<PhaseType, { icon: typeof Grid3X3; color: string; label: string; phaseLabel: string }> = {
  round_robin:        { icon: Grid3X3,   color: "text-blue-500",    label: "Group",     phaseLabel: "Group phase"      },
  single_elimination: { icon: Swords,    color: "text-amber-500",   label: "Knockout",  phaseLabel: "Knockout phase"   },
  single_match:       { icon: Zap,       color: "text-emerald-500", label: "Final",     phaseLabel: "Match phase"      },
  americano:          { icon: RefreshCw, color: "text-violet-500",  label: "Americano", phaseLabel: "Americano phase"  },
  king_of_court:      { icon: Crown,     color: "text-yellow-500",  label: "King",      phaseLabel: "King phase"       },
};

function getPlayerCount(phase: PhaseBlock): number {
  const teams = (phase.config as Record<string, unknown>)?.teams;
  if (typeof teams === "number" && teams > 0) return teams;
  return 4;
}

function getOutputHandles(phase: PhaseBlock): { label: string; defaultActive: boolean; group?: number }[] {
  const n = getPlayerCount(phase);
  switch (phase.phaseType) {
    case "round_robin":
      // Cap at 8 output handles — supports groups up to 24 teams while keeping
      // the canvas readable. Groups larger than 8 should be split further.
      return Array.from({ length: Math.min(n, 8) }, (_, i) => ({
        label: `${i + 1}${["st", "nd", "rd"][i] ?? "th"}`,
        defaultActive: i < 2,
      }));
    case "single_elimination": {
      const matchCount = Math.floor(n / 2);
      const handles: { label: string; defaultActive: boolean; group: number }[] = [];
      for (let m = 0; m < matchCount; m++) {
        handles.push({ label: `W${m + 1}`, defaultActive: true,  group: m });
        handles.push({ label: `L${m + 1}`, defaultActive: false, group: m });
      }
      return handles;
    }
    case "single_match":
      return [
        { label: "W", defaultActive: true  },
        { label: "L", defaultActive: false },
      ];
    default:
      return [
        { label: "1st", defaultActive: true  },
        { label: "2nd", defaultActive: false },
      ];
  }
}

function getMatchCount(phase: PhaseBlock): number {
  const n = getPlayerCount(phase);
  switch (phase.phaseType) {
    case "round_robin":       return (n * (n - 1)) / 2;
    case "single_elimination": return Math.floor(n / 2);
    case "single_match":      return 1;
    default:                  return Math.floor(n / 2);
  }
}

const DEFAULT_GLOBAL_CONFIG: MatchConfig = { scoring_type: "points", points_target: 21 };

function getApproxMatchMins(phase: PhaseBlock, globalConfig?: MatchConfig): number {
  const baseConfig = globalConfig ?? DEFAULT_GLOBAL_CONFIG;
  const merged: MatchConfig = phase.matchConfigOverride
    ? { ...baseConfig, ...phase.matchConfigOverride } as MatchConfig
    : baseConfig;
  const baseMins = estimateMatchMinutes(merged);
  return (phase.phaseType === "single_elimination" || phase.phaseType === "single_match")
    ? Math.round(baseMins * 1.2)
    : baseMins;
}
/** Plain-English description, e.g. "First to 21 points wins" or "Best of 3 sets, 6 games each, golden point" */
function formatDescription(config: MatchConfig, override?: Partial<MatchConfig>): string {
  const m = { ...config, ...(override ?? {}) };
  if (m.scoring_type === "points") {
    const target = m.points_target ?? m.points_per_match ?? 21;
    return `First to ${target} points wins`;
  }
  const gps  = m.games_per_set ?? 4;
  const sets = m.sets_per_match ?? 1;
  const deuce = m.deuce_mode ?? "normal";
  const parts: string[] = [];
  if (sets === 1) {
    parts.push(`${gps} games per set, 1 set`);
  } else {
    parts.push(`Best of ${sets} sets, ${gps} games each`);
  }
  if (deuce === "golden") parts.push("golden point");
  else if (deuce === "silver") parts.push("silver point");
  if (sets >= 3 && m.third_set_tiebreak) parts.push("tiebreak");
  return parts.join(", ");
}

/** Human-readable format summary, e.g. "21 pts", "4g×1s", "6g×3s GP+TB" */
function formatLabel(config: MatchConfig, override?: Partial<MatchConfig>): string {
  const m = { ...config, ...(override ?? {}) };
  if (m.scoring_type === "points") {
    const target = m.points_target ?? m.points_per_match ?? 21;
    return `${target} pts`;
  }
  const gps  = m.games_per_set ?? 4;
  const sets = m.sets_per_match ?? 1;
  const deuce = m.deuce_mode ?? "normal";
  const deuceStr = deuce === "golden" ? " GP" : deuce === "silver" ? " SP" : "";
  const tbStr = sets >= 3 && m.third_set_tiebreak ? "+TB" : "";
  return `${gps}g×${sets}s${deuceStr}${tbStr}`;
}

interface HandlePosition {
  x: number;
  y: number;
}

interface Props {
  phase: PhaseBlock;
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onHandleClick: (phaseId: string, handleType: "in" | "out", rank: string) => void;
  connectingFrom: { phaseId: string; rank: string } | null;
  totalPlayers?: number;
  onHandlePositions?: (phaseId: string, positions: Record<string, HandlePosition>) => void;
  isStartPhase?: boolean;
  incomingCount?: number;
  capacity?: number;
  wiredOutputs?: Set<string>;
  bestOfOutputs?: Set<string>;
  onWiredHandleClick?: (phaseId: string, rank: string) => void;
  /** Global tournament match config (used as fallback when no override) */
  matchConfig?: MatchConfig;
  /** Called when the user sets or clears a format override for this phase */
  onFormatOverride?: (phaseId: string, override: Partial<MatchConfig> | null) => void;
}

const CARD_WIDTH       = 260;
const HANDLE_H         = 24;
const HANDLE_GAP_IN_GROUP = 4;
const GROUP_SEP        = 10;

const PhaseBlockCard = ({
  phase, onMove, onDelete, onHandleClick, connectingFrom,
  totalPlayers, onHandlePositions, isStartPhase,
  incomingCount = 0, capacity, wiredOutputs, bestOfOutputs, onWiredHandleClick,
  matchConfig, onFormatOverride,
}: Props) => {
  const meta        = PHASE_META[phase.phaseType];
  const Icon        = meta.icon;
  const playerCount = getPlayerCount(phase);
  const matchCount  = getMatchCount(phase);
  const outputHandles = useMemo(() => getOutputHandles(phase), [phase]);

  const isGroup        = phase.phaseType === "round_robin";
  const tooFewPlayers  = isGroup && playerCount < 4;
  const tooManyInGroup = isGroup && playerCount > 8;

  const perMatchMins = getApproxMatchMins(phase, matchConfig);
  const changeoverMins = 2;
  const approxMins = matchCount * (perMatchMins + changeoverMins);
  const estH       = Math.floor(approxMins / 60);
  const estM       = approxMins % 60;
  const timeLabel  = estH > 0 ? `~${estH}h ${estM}m` : `~${estM}m`;

  // Format override state
  const [formatPopupOpen, setFormatPopupOpen] = useState(false);
  const formatPopupRef = useRef<HTMLDivElement>(null);
  const formatBtnRef = useRef<HTMLButtonElement>(null);

  const effectiveGlobal = matchConfig ?? DEFAULT_GLOBAL_CONFIG;
  const currentOverride = phase.matchConfigOverride ?? {};
  const mergedConfig    = { ...effectiveGlobal, ...currentOverride } as MatchConfig;
  const hasOverride     = phase.matchConfigOverride != null && Object.keys(phase.matchConfigOverride).length > 0;

  // Close popup on outside click
  useEffect(() => {
    if (!formatPopupOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        formatPopupRef.current && !formatPopupRef.current.contains(e.target as Node) &&
        formatBtnRef.current && !formatBtnRef.current.contains(e.target as Node)
      ) {
        setFormatPopupOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [formatPopupOpen]);

  const applyOverride = (patch: Partial<MatchConfig>) => {
    onFormatOverride?.(phase.id, { ...currentOverride, ...patch });
  };

  const [activeOutputs, setActiveOutputs] = useState<Set<string>>(() => {
    const set = new Set<string>();
    outputHandles.forEach((h) => { if (h.defaultActive) set.add(h.label); });
    return set;
  });

  /** Which output handle circle the cursor is hovering over */
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);

  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const cardBodyRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(160);

  useEffect(() => {
    const el = cardBodyRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setCardHeight(el.offsetHeight));
    obs.observe(el);
    setCardHeight(el.offsetHeight);
    return () => obs.disconnect();
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);
      dragRef.current = {
        startX:  e.clientX,
        startY:  e.clientY,
        originX: phase.positionX,
        originY: phase.positionY,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [phase.positionX, phase.positionY]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      onMove(phase.id, dragRef.current.originX + dx, dragRef.current.originY + dy);
    },
    [phase.id, onMove]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const isConnectTarget = connectingFrom && connectingFrom.phaseId !== phase.id;

  const toggleOutput = (label: string) => {
    setActiveOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const playerPills = useMemo(() => {
    if (phase.phaseType === "single_match") return ["PA", "PB"];
    return Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);
  }, [phase.phaseType, playerCount]);

  const knockoutMatches = useMemo(() => {
    if (phase.phaseType !== "single_elimination") return [];
    const matches: { label: string; p1: string; p2: string }[] = [];
    for (let i = 0; i < Math.floor(playerCount / 2); i++) {
      matches.push({ label: `M${i + 1}`, p1: `P${i * 2 + 1}`, p2: `P${i * 2 + 2}` });
    }
    return matches;
  }, [phase.phaseType, playerCount]);

  const groupedOutputs = useMemo(() => {
    if (phase.phaseType === "single_elimination") {
      const groups: { label: string; defaultActive: boolean }[][] = [];
      let currentGroup: { label: string; defaultActive: boolean }[] = [];
      let lastGroup = -1;
      outputHandles.forEach((h) => {
        const g = (h as { group?: number }).group ?? 0;
        if (g !== lastGroup && currentGroup.length > 0) { groups.push(currentGroup); currentGroup = []; }
        currentGroup.push(h);
        lastGroup = g;
      });
      if (currentGroup.length > 0) groups.push(currentGroup);
      return groups;
    }
    return [outputHandles];
  }, [phase.phaseType, outputHandles]);

  // Report handle positions to BuilderCanvas
  useEffect(() => {
    if (!onHandlePositions) return;
    const positions: Record<string, HandlePosition> = {};

    positions["IN"] = {
      x: phase.positionX,
      y: phase.positionY + cardHeight / 2,
    };

    const circleX = phase.positionX + CARD_WIDTH + 20;

    let totalHandlesH = 0;
    groupedOutputs.forEach((group, gi) => {
      if (gi > 0) totalHandlesH += GROUP_SEP;
      totalHandlesH += group.length * HANDLE_H + Math.max(0, group.length - 1) * HANDLE_GAP_IN_GROUP;
    });

    let curY = phase.positionY + cardHeight / 2 - totalHandlesH / 2;
    groupedOutputs.forEach((group, gi) => {
      if (gi > 0) curY += GROUP_SEP;
      group.forEach((handle, hi) => {
        if (hi > 0) curY += HANDLE_GAP_IN_GROUP;
        positions[handle.label] = { x: circleX, y: curY + HANDLE_H / 2 };
        curY += HANDLE_H;
      });
    });

    onHandlePositions(phase.id, positions);
  }, [phase.id, phase.positionX, phase.positionY, cardHeight, groupedOutputs, onHandlePositions]);

  const getRankBadgeClass = (label: string): string => {
    if (label === "1st" || label === "W" || label.startsWith("W"))
      return "border-primary/60 bg-primary/15 text-primary";
    if (label === "2nd") return "border-amber-500/50 bg-amber-500/10 text-amber-500";
    if (label === "3rd") return "border-muted-foreground/30 bg-muted/30 text-muted-foreground";
    return "border-border bg-card text-muted-foreground";
  };

  return (
    <div
      className={`absolute select-none transition-shadow ${dragging || formatPopupOpen ? "z-50 shadow-lg" : "z-10 shadow-sm"}`}
      style={{ left: phase.positionX, top: phase.positionY, width: CARD_WIDTH }}
    >
      {/* ── IN connector ─────────────────────────────────────────────────────── */}
      {(() => {
        const isExact      = capacity !== undefined && incomingCount === capacity;
        const isOver       = capacity !== undefined && incomingCount >  capacity;
        const isIncomplete = capacity !== undefined && incomingCount > 0 && incomingCount < capacity;
        const isFull       = isExact || isOver;
        return (
          <button
            className={`absolute -left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 ${
              isOver ? "cursor-not-allowed" : ""
            } ${isConnectTarget && !isFull ? "animate-pulse" : ""}`}
            onClick={(e) => { e.stopPropagation(); onHandleClick(phase.id, "in", "IN"); }}
          >
            <div className="flex items-center gap-0">
              <span
                className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[7px] font-bold border transition-colors ${
                  isOver
                    ? "border-destructive bg-destructive/20 text-destructive"
                    : isIncomplete
                    ? "border-amber-500 bg-amber-500/20 text-amber-500"
                    : isExact
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-600"
                    : isConnectTarget
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary"
                }`}
              >
                IN
              </span>
              <span className="w-2 h-px bg-border" />
            </div>
            {capacity !== undefined && (
              <span
                className={`text-[6px] font-semibold leading-none ${
                  isOver       ? "text-destructive"    :
                  isIncomplete ? "text-amber-500"      :
                  isExact      ? "text-emerald-600"    :
                                 "text-muted-foreground"
                }`}
              >
                {incomingCount}/{capacity}
              </span>
            )}
          </button>
        );
      })()}

      {/* ── Card body ────────────────────────────────────────────────────────── */}
      <div ref={cardBodyRef} className="rounded-xl border border-border/60 bg-card overflow-visible">
        {/* Header */}
        <div className="relative flex items-center gap-1.5 px-2.5 py-2 bg-muted/30 border-b border-border/30 rounded-t-xl">
          <div
            className="cursor-grab active:cursor-grabbing touch-none shrink-0"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <Icon className={`w-4 h-4 ${meta.color} shrink-0`} />
          <span className="text-xs font-semibold flex-1 truncate">{phase.label}</span>
          {isStartPhase && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 shrink-0">
              START
            </span>
          )}
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
            {matchCount} {matchCount === 1 ? "match" : "matches"}
          </Badge>

          {/* Format settings button */}
          <button
            ref={formatBtnRef}
            className="relative h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); setFormatPopupOpen((o) => !o); }}
            title={hasOverride ? `Custom format: ${formatLabel(effectiveGlobal, currentOverride)}` : "Match format (using tournament default)"}
          >
            <Settings2 className="w-3 h-3" />
            {hasOverride && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 border border-card" />
            )}
          </button>

          <button
            className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); onDelete(phase.id); }}
          >
            <Trash2 className="w-3 h-3" />
          </button>

          {/* Format override popup */}
          {formatPopupOpen && (
             <div
               ref={formatPopupRef}
               className="absolute top-full right-0 mt-1 z-[9999] w-52 rounded-xl border border-accent/40 bg-background shadow-2xl p-3 space-y-3 ring-1 ring-accent/20"
               onClick={(e) => e.stopPropagation()}
             >
              {/* Popup header */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                  Match Format
                </span>
                {hasOverride ? (
                  <button
                    className="text-[9px] text-amber-500 hover:text-amber-400 underline transition-colors"
                    onClick={() => { onFormatOverride?.(phase.id, null); }}
                  >
                    Reset to default
                  </button>
                ) : (
                  <span className="text-[9px] text-muted-foreground/60">Using default</span>
                )}
              </div>

              {/* Scoring type toggle */}
              <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted/60">
                {(["points", "games"] as const).map((type) => (
                  <button
                    key={type}
                    className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                      mergedConfig.scoring_type === type
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => applyOverride({ scoring_type: type })}
                  >
                    {type === "points" ? "Points" : "Games"}
                  </button>
                ))}
              </div>

              {/* Format description */}
              <div className="text-center text-[10px] text-muted-foreground italic bg-muted/40 rounded-md py-1 px-2">
                {formatDescription(effectiveGlobal, currentOverride)}
              </div>

              {/* Points mode */}
              {mergedConfig.scoring_type === "points" && (
                <div className="space-y-1.5">
                  <span className="text-[9px] text-muted-foreground font-medium">Points target</span>
                  <div className="flex gap-1">
                    {[16, 21, 32].map((pts) => (
                      <button
                        key={pts}
                        className={`flex-1 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                          (mergedConfig.points_target ?? 21) === pts
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border/60 text-muted-foreground hover:border-muted-foreground"
                        }`}
                        onClick={() => applyOverride({ scoring_type: "points", points_target: pts })}
                      >
                        {pts}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Games mode */}
              {mergedConfig.scoring_type === "games" && (
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <span className="text-[9px] text-muted-foreground font-medium">Games per set</span>
                    <div className="flex gap-1">
                      {[4, 6].map((g) => (
                        <button
                          key={g}
                          className={`flex-1 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                            (mergedConfig.games_per_set ?? 4) === g
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border/60 text-muted-foreground hover:border-muted-foreground"
                          }`}
                          onClick={() => applyOverride({ scoring_type: "games", games_per_set: g })}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] text-muted-foreground font-medium">Sets per match</span>
                    <div className="flex gap-1">
                      {[1, 3].map((s) => (
                        <button
                          key={s}
                          className={`flex-1 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                            (mergedConfig.sets_per_match ?? 1) === s
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border/60 text-muted-foreground hover:border-muted-foreground"
                          }`}
                          onClick={() => applyOverride({ scoring_type: "games", sets_per_match: s })}
                        >
                          Best of {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] text-muted-foreground font-medium">Deuce rule</span>
                    <div className="flex gap-1">
                      {([
                        { value: "normal" as DeuceMode, label: "Normal" },
                        { value: "silver" as DeuceMode, label: "Silver" },
                        { value: "golden" as DeuceMode, label: "Golden" },
                      ]).map(({ value, label }) => (
                        <button
                          key={value}
                          className={`flex-1 py-0.5 rounded-md text-[9px] font-semibold border transition-colors ${
                            (mergedConfig.deuce_mode ?? "normal") === value
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border/60 text-muted-foreground hover:border-muted-foreground"
                          }`}
                          onClick={() => applyOverride({ scoring_type: "games", deuce_mode: value })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(mergedConfig.sets_per_match ?? 1) >= 3 && (
                    <button
                      className="w-full flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-muted/40 transition-colors"
                      onClick={() => applyOverride({
                        scoring_type: "games",
                        third_set_tiebreak: !mergedConfig.third_set_tiebreak,
                      })}
                    >
                      <span className="text-[9px] text-muted-foreground">3rd set tiebreak</span>
                      <div className={`w-7 h-4 rounded-full transition-colors relative flex-shrink-0 ${
                        mergedConfig.third_set_tiebreak ? "bg-primary" : "bg-muted-foreground/30"
                      }`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
                          mergedConfig.third_set_tiebreak ? "translate-x-3.5" : "translate-x-0.5"
                        }`} />
                      </div>
                    </button>
                  )}
                </div>
              )}

               {/* Format preview */}
               <div className="pt-1 border-t border-border/30">
                 <p className="text-[9px] text-muted-foreground">
                   This phase:{" "}
                   <span className={`font-semibold ${hasOverride ? "text-amber-400" : "text-foreground"}`}>
                     {formatLabel(effectiveGlobal, currentOverride)}
                   </span>
                   {hasOverride && (
                     <span className="ml-1 text-muted-foreground/60">
                       (default: {formatLabel(effectiveGlobal)})
                     </span>
                   )}
                 </p>
               </div>

               {/* Save button */}
               <button
                 className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold hover:bg-primary/90 transition-colors"
                 onClick={() => setFormatPopupOpen(false)}
               >
                 Save
               </button>
             </div>
          )}
        </div>

        {/* Phase label + stats row */}
        <div className="px-3 pt-1.5 flex items-center justify-between gap-2">
          <p className="text-[9px] text-muted-foreground font-medium">{meta.phaseLabel}</p>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <Users className="w-2.5 h-2.5" />
              {playerCount} {(phase.config as Record<string, unknown>)?.isIndividual ? "players" : "teams"}
            </span>
            <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <Hash className="w-2.5 h-2.5" />
              {timeLabel}
            </span>
          </div>
        </div>

        {/* Validation warning — too few */}
        {tooFewPlayers && (
          <div className="mx-3 mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-destructive/10 border border-destructive/25">
            <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
            <span className="text-[9px] text-destructive font-medium">
              Need ≥ 4 players per group (currently {playerCount})
            </span>
          </div>
        )}

        {/* Validation warning — too many (>8 teams = >28 matches per group) */}
        {tooManyInGroup && (
          <div className="mx-3 mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25">
            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="text-[9px] text-amber-500 font-medium">
              {playerCount} teams = {(playerCount * (playerCount - 1)) / 2} matches — consider splitting into smaller groups
            </span>
          </div>
        )}

        {/* Player pills */}
        <div className="px-3 pt-1.5 pb-1 flex flex-wrap gap-1">
          {playerPills.map((p) => (
            <span
              key={p}
              className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-muted text-[9px] font-semibold text-muted-foreground"
            >
              {p}
            </span>
          ))}
        </div>

        <div className="mx-3 border-t border-border/40" />

        {/* Match details */}
        <div className="px-3 py-2">
          {phase.phaseType === "round_robin" && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground">round-robin</span>
                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">{matchCount} matches</Badge>
                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto">{playerCount} players</Badge>
              </div>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {outputHandles.map((h) => (
                  <span
                    key={h.label}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[8px] font-semibold ${getRankBadgeClass(h.label)}`}
                  >
                    {h.label} →
                  </span>
                ))}
              </div>
            </div>
          )}

          {phase.phaseType === "single_elimination" && (
            <div className="space-y-1">
              {knockoutMatches.map((m, idx) => (
                <div key={m.label} className="flex items-center gap-1.5">
                  <span className="text-[8px] font-mono text-muted-foreground w-5">{m.label}</span>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/50 text-[8px] font-medium text-foreground">
                    {m.p1} <span className="text-muted-foreground">vs</span> {m.p2}
                  </span>
                  <div className="flex gap-0.5 ml-auto">
                    <span
                      className={`w-2.5 h-2.5 rounded-full border ${
                        activeOutputs.has(`W${idx + 1}`) ? "bg-primary border-primary" : "bg-transparent border-muted-foreground/40"
                      }`}
                      title={`W${idx + 1}`}
                    />
                    <span
                      className={`w-2.5 h-2.5 rounded-full border ${
                        activeOutputs.has(`L${idx + 1}`) ? "bg-primary border-primary" : "bg-transparent border-muted-foreground/40"
                      }`}
                      title={`L${idx + 1}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {phase.phaseType === "single_match" && (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/50 text-[8px] font-medium text-foreground">
                PA <span className="text-muted-foreground">vs</span> PB
              </span>
            </div>
          )}

          {(phase.phaseType === "americano" || phase.phaseType === "king_of_court") && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground">{meta.label} format</span>
              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">{matchCount} matches</Badge>
            </div>
          )}
        </div>
      </div>

      {/* ── Output handles ───────────────────────────────────────────────────── */}
      <div className="absolute -right-4 top-0 bottom-0 flex flex-col justify-center gap-0.5">
        {groupedOutputs.map((group, gi) => (
          <div key={gi} className="flex flex-col items-center gap-1">
            {gi > 0 && <div className="w-4 border-t border-border/30 my-0.5" />}
            {group.map((handle) => {
              const key          = `${phase.id}::${handle.label}`;
              const isActive     = activeOutputs.has(handle.label);
              const isConnecting = connectingFrom?.phaseId === phase.id && connectingFrom?.rank === handle.label;
              const isWired      = wiredOutputs?.has(key) ?? false;
              const isBestOf     = bestOfOutputs?.has(key) ?? false;

              // Show delete/remove hint when hovering a wired handle outside connecting mode
              const showDeleteHint = isWired && !connectingFrom && hoveredHandle === handle.label;

              // Tooltip text
              const titleText =
                isWired && !connectingFrom
                  ? isBestOf
                    ? `Click to remove "${handle.label}" from Best-of qualifier`
                    : `Click to delete "${handle.label}" connection`
                  : undefined;

              // ── Circle colour class ───────────────────────────────────────
              const circleClass = (() => {
                if (isConnecting) {
                  return "border-primary bg-primary text-primary-foreground";
                }
                if (showDeleteHint) {
                  return "border-destructive bg-destructive text-white scale-110 shadow-md shadow-destructive/30";
                }
                if (isWired && isBestOf) {
                  // Best-of qualifier — warm amber-orange to match the arrow colour
                  return "border-orange-400 bg-orange-500/20 text-orange-300";
                }
                if (isWired) {
                  if (handle.label.startsWith("W") || handle.label === "1st") return "border-emerald-500 bg-emerald-500 text-white";
                  if (handle.label === "2nd") return "border-amber-500 bg-amber-500 text-white";
                  return "border-muted-foreground bg-muted-foreground text-white";
                }
                if (isActive) {
                  if (handle.label.startsWith("W") || handle.label === "1st") return "border-primary/60 bg-primary/15 text-primary hover:bg-primary/25";
                  if (handle.label === "2nd") return "border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20";
                  return "border-muted-foreground/40 bg-muted/20 text-muted-foreground hover:bg-muted/40";
                }
                return "border-border bg-card text-muted-foreground hover:border-muted-foreground";
              })();

              // ── Icon inside circle ────────────────────────────────────────
              const circleIcon = (() => {
                if (showDeleteHint)       return <Trash2 className="w-3 h-3" />;
                if (isWired && isBestOf)  return <Star   className="w-3 h-3 fill-orange-300" />;
                if (isWired)              return <Check  className="w-3 h-3" />;
                return handle.label.length > 2 ? handle.label.slice(0, 2) : handle.label;
              })();

              return (
                <button
                  key={handle.label}
                  className="flex items-center gap-0"
                  title={titleText}
                  onMouseEnter={() => setHoveredHandle(handle.label)}
                  onMouseLeave={() => setHoveredHandle(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (connectingFrom) {
                      // In connecting mode — redirect source to this handle
                      onHandleClick(phase.id, "out", handle.label);
                    } else if (isWired) {
                      // Already wired — request delete/remove confirmation
                      onWiredHandleClick?.(phase.id, handle.label);
                    } else {
                      // Not wired — start a new connection
                      toggleOutput(handle.label);
                      onHandleClick(phase.id, "out", handle.label);
                    }
                  }}
                >
                  <span className="w-2 h-px bg-border" />
                  <span
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[7px] font-bold transition-all duration-150 ${circleClass}`}
                  >
                    {circleIcon}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PhaseBlockCard;