import { Clock, Hash, Users, AlertTriangle, Lightbulb, Minus, Plus } from "lucide-react";
import type { PhaseBlock, MatchConfig, ProgressionRule } from "@/lib/tournaments/types";
import { estimateMatchMinutes } from "@/lib/tournaments/timeEstimates";

interface Props {
  phases: PhaseBlock[];
  courtCount: number;
  totalTimeMins: number | null;
  matchConfig?: MatchConfig;
  rules?: ProgressionRule[];
  onCourtCountChange?: (count: number) => void;
  onTotalTimeMinsChange?: (mins: number | null) => void;
}

interface LevelStats {
  label: string;
  matches: number;
  estimatedMins: number;
  phaseCount: number;
}

// ── Dependency graph: group phases into parallel levels ────────────────────────

function buildDependencyLevels(phases: PhaseBlock[], rules: ProgressionRule[]): PhaseBlock[][] {
  if (phases.length === 0) return [];

  const phaseMap = new Map(phases.map(p => [p.id, p]));
  const inDegree = new Map(phases.map(p => [p.id, 0]));
  const outEdges = new Map<string, string[]>();

  for (const rule of rules) {
    if (!phaseMap.has(rule.fromPhaseId) || !phaseMap.has(rule.toPhaseId)) continue;
    inDegree.set(rule.toPhaseId, (inDegree.get(rule.toPhaseId) ?? 0) + 1);
    if (!outEdges.has(rule.fromPhaseId)) outEdges.set(rule.fromPhaseId, []);
    outEdges.get(rule.fromPhaseId)!.push(rule.toPhaseId);
  }

  const levels: PhaseBlock[][] = [];
  let current = phases.filter(p => (inDegree.get(p.id) ?? 0) === 0);

  while (current.length > 0) {
    levels.push(current);
    const next: PhaseBlock[] = [];
    for (const phase of current) {
      for (const nextId of (outEdges.get(phase.id) ?? [])) {
        const newDeg = (inDegree.get(nextId) ?? 1) - 1;
        inDegree.set(nextId, newDeg);
        if (newDeg === 0) {
          const nextPhase = phaseMap.get(nextId);
          if (nextPhase) next.push(nextPhase);
        }
      }
    }
    current = next;
  }

  // Orphaned phases (disconnected from graph) get their own level
  const visited = new Set(levels.flat().map(p => p.id));
  const orphans = phases.filter(p => !visited.has(p.id));
  if (orphans.length > 0) levels.push(orphans);

  return levels;
}

// ── Per-phase match count & duration ─────────────────────────────────────────

const DEFAULT_CONFIG: MatchConfig = { scoring_type: "points", points_target: 21 };

function matchesForPhase(
  p: PhaseBlock,
  globalMatchConfig?: MatchConfig
): { matches: number; mins: number } {
  const teams = (p.config.teams as number) || 4;

  // Resolve actual minutes for this phase (respects per-phase override)
  const base    = globalMatchConfig ?? DEFAULT_CONFIG;
  const merged  = p.matchConfigOverride
    ? { ...base, ...p.matchConfigOverride } as MatchConfig
    : base;
  const baseMins    = estimateMatchMinutes(merged);
  const defaultMins = baseMins;
  const knockoutMins = Math.round(baseMins * 1.2);

  switch (p.phaseType) {
    case "round_robin":
      return { matches: (teams * (teams - 1)) / 2, mins: defaultMins };
    case "single_elimination":
      return { matches: Math.max(1, teams - 1), mins: knockoutMins };
    case "single_match":
      return { matches: 1, mins: knockoutMins };
    case "americano":
      return { matches: (teams * (teams - 1)) / 2, mins: defaultMins };
    case "king_of_court":
      return { matches: (p.config.rounds as number) || teams, mins: defaultMins };
    default:
      return { matches: 0, mins: defaultMins };
  }
}

// ── Time estimation ───────────────────────────────────────────────────────────

function estimateWithCourts(
  phases: PhaseBlock[],
  courts: number,
  matchConfig?: MatchConfig,
  rules?: ProgressionRule[]
): { totalMatches: number; estimatedMins: number; perLevel: LevelStats[] } {
  const safeCourts    = Math.max(1, courts);
  const changeoverMins = 2;

  const perLevel: LevelStats[] = [];
  let totalMatches = 0;
  let totalMins = 0;

  // Group phases into dependency levels — same level runs in parallel
  const levels =
    rules && rules.length > 0
      ? buildDependencyLevels(phases, rules)
      : phases.map(p => [p]);

  for (let li = 0; li < levels.length; li++) {
    const levelPhases = levels[li];
    let levelMatches = 0;
    let levelMatchMins = 0;

    for (const p of levelPhases) {
      const { matches, mins } = matchesForPhase(p, matchConfig);
      levelMatches += matches;
      levelMatchMins = Math.max(levelMatchMins, mins);
      totalMatches += matches;
    }

    if (levelMatches === 0) continue;

    const rounds = Math.ceil(levelMatches / safeCourts);
    const levelMins = rounds * (levelMatchMins + changeoverMins);
    totalMins += levelMins;

    // Derive a human label for this level
    const types = new Set(levelPhases.map(p => p.phaseType));
    let label: string;
    if ([...types].every(t => t === "round_robin" || t === "americano")) {
      label = "Group Stage";
    } else if ([...types].every(t => t === "single_match" || t === "single_elimination")) {
      label = "Finals";
    } else {
      label = `Stage ${li + 1}`;
    }

    perLevel.push({ label, matches: levelMatches, estimatedMins: levelMins, phaseCount: levelPhases.length });
  }

  return { totalMatches, estimatedMins: totalMins, perLevel };
}

// ── Budget suggestion engine ──────────────────────────────────────────────────

interface Suggestion {
  label: string;
  detail: string;
  newCourts: number;
  newTimeMins: number;
}

function buildSuggestions(
  phases: PhaseBlock[],
  currentCourts: number,
  currentBudget: number,
  matchConfig?: MatchConfig,
  rules?: ProgressionRule[]
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const roundTo15 = (n: number) => Math.ceil(n / 15) * 15;

  for (let extraC = 1; extraC <= 6; extraC++) {
    const nc = currentCourts + extraC;
    const { estimatedMins } = estimateWithCourts(phases, nc, matchConfig, rules);
    if (estimatedMins <= currentBudget) {
      suggestions.push({
        label: `+${extraC} court${extraC > 1 ? "s" : ""}`,
        detail: `fits in ${fmtMins(estimatedMins)}`,
        newCourts: nc,
        newTimeMins: currentBudget,
      });
      break;
    }
  }

  const { estimatedMins: estBase } = estimateWithCourts(phases, currentCourts, matchConfig, rules);
  const extraT = roundTo15(estBase - currentBudget);
  if (extraT > 0) {
    suggestions.push({
      label: `+${fmtMins(extraT)} budget`,
      detail: `total ${fmtMins(currentBudget + extraT)}`,
      newCourts: currentCourts,
      newTimeMins: currentBudget + extraT,
    });
  }

  if (currentCourts < 12) {
    const { estimatedMins: est1C } = estimateWithCourts(phases, currentCourts + 1, matchConfig, rules);
    if (est1C > currentBudget) {
      const extraT1C = roundTo15(est1C - currentBudget);
      if (extraT1C < extraT && extraT1C > 0) {
        suggestions.push({
          label: `+1 court +${fmtMins(extraT1C)}`,
          detail: `fits in ${fmtMins(est1C)}`,
          newCourts: currentCourts + 1,
          newTimeMins: currentBudget + extraT1C,
        });
      }
    }
  }

  return suggestions.slice(0, 3);
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ── Counter button ────────────────────────────────────────────────────────────

const CounterBtn = ({
  value, label, onDecrement, onIncrement, min = 1, max = 99, formatValue,
}: {
  value: number; label: string; onDecrement: () => void; onIncrement: () => void;
  min?: number; max?: number; step?: number; formatValue?: (v: number) => string;
}) => (
  <div className="flex items-center gap-1">
    <span className="text-[10px] text-current opacity-60 font-medium">{label}</span>
    <button
      className="w-5 h-5 rounded flex items-center justify-center hover:bg-current/10 transition-colors disabled:opacity-30"
      onClick={onDecrement}
      disabled={value <= min}
    >
      <Minus className="w-3 h-3" />
    </button>
    <span className="text-xs font-bold min-w-[28px] text-center">
      {formatValue ? formatValue(value) : value}
    </span>
    <button
      className="w-5 h-5 rounded flex items-center justify-center hover:bg-current/10 transition-colors disabled:opacity-30"
      onClick={onIncrement}
      disabled={value >= max}
    >
      <Plus className="w-3 h-3" />
    </button>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

const SimulationBar = ({
  phases, courtCount, totalTimeMins, matchConfig, rules,
  onCourtCountChange, onTotalTimeMinsChange,
}: Props) => {
  const { totalMatches, estimatedMins, perLevel } = estimateWithCourts(
    phases, courtCount, matchConfig, rules
  );

  const budget = totalTimeMins ?? 0;
  const fit: "green" | "yellow" | "red" | "none" = !totalTimeMins
    ? "none"
    : estimatedMins <= totalTimeMins
    ? "green"
    : estimatedMins <= totalTimeMins * 1.2
    ? "yellow"
    : "red";

  const suggestions: Suggestion[] =
    (fit === "red" || fit === "yellow") && totalTimeMins
      ? buildSuggestions(phases, courtCount, totalTimeMins, matchConfig, rules)
      : [];

  const matchMinsUsed = matchConfig ? estimateMatchMinutes(matchConfig) : 14;
  const budgetMins = totalTimeMins ?? 0;
  const timeStep = 15;

  const fitBg: Record<typeof fit, string> = {
    green: "bg-emerald-500/12 border-emerald-500/30 text-emerald-700",
    yellow: "bg-amber-500/12 border-amber-500/30 text-amber-700",
    red: "bg-destructive/12 border-destructive/30 text-destructive",
    none: "bg-muted/40 border-border/30 text-muted-foreground",
  };
  const fitLabel: Record<typeof fit, string> = {
    green: "Fits ✓", yellow: "Tight", red: "Over budget", none: "No budget",
  };
  const fitPill: Record<typeof fit, string> = {
    green: "bg-emerald-500/20 text-emerald-700",
    yellow: "bg-amber-500/20 text-amber-700",
    red: "bg-destructive/20 text-destructive",
    none: "bg-muted text-muted-foreground",
  };

  if (phases.length === 0) {
    return (
      <div className="p-3 rounded-xl border border-border/30 bg-muted/20 text-center">
        <p className="text-xs text-muted-foreground">Add phases to see time simulation</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${fitBg[fit]}`}>

      {/* ── Main stats row ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">

        <div className="flex items-center gap-1.5">
          <Hash className="w-3.5 h-3.5 opacity-70" />
          <span className="text-xs font-semibold">{totalMatches} matches</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 opacity-70" />
          <span className="text-xs font-semibold">~{fmtMins(estimatedMins)}</span>
          <span className="text-[10px] opacity-50">({matchMinsUsed}m/match)</span>
        </div>

        <CounterBtn
          value={courtCount}
          label="Courts"
          min={1}
          max={20}
          onDecrement={() => onCourtCountChange?.(courtCount - 1)}
          onIncrement={() => onCourtCountChange?.(courtCount + 1)}
        />

        <div className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5 opacity-70" />
          <CounterBtn
            value={budgetMins || 60}
            label="Budget"
            min={30}
            max={600}
            step={timeStep}
            formatValue={fmtMins}
            onDecrement={() => onTotalTimeMinsChange?.((budgetMins || 60) - timeStep)}
            onIncrement={() => onTotalTimeMinsChange?.((budgetMins || 60) + timeStep)}
          />
          {!totalTimeMins && (
            <button
              className="text-[10px] underline underline-offset-2 opacity-60 hover:opacity-100 transition-opacity"
              onClick={() => onTotalTimeMinsChange?.(120)}
            >
              set budget
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {(fit === "red" || fit === "yellow") && totalTimeMins && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium opacity-80">
              <AlertTriangle className="w-3 h-3" />
              +{fmtMins(estimatedMins - totalTimeMins)} over
            </span>
          )}
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${fitPill[fit]}`}>
            {fitLabel[fit]}
          </span>
        </div>
      </div>

      {/* ── Per-level breakdown ── */}
      {perLevel.length > 1 && (
        <div className="flex border-t border-current/10">
          {perLevel.map((lv, i) => (
            <div
              key={i}
              className="flex-1 px-3 py-1.5 text-center border-r border-current/10 last:border-r-0"
            >
              <p className="text-[9px] font-semibold truncate opacity-80">
                {lv.label}
                {lv.phaseCount > 1 && (
                  <span className="ml-1 opacity-50 font-normal">×{lv.phaseCount} parallel</span>
                )}
              </p>
              <p className="text-[9px] opacity-55">
                {lv.matches} match{lv.matches !== 1 ? "es" : ""} · ~{fmtMins(lv.estimatedMins)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Smart suggestions ── */}
      {suggestions.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-current/10">
          <Lightbulb className="w-3.5 h-3.5 shrink-0 opacity-70" />
          <span className="text-[10px] font-semibold opacity-70">Try:</span>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-current/30 bg-current/10 hover:bg-current/20 transition-colors text-[10px] font-semibold"
                onClick={() => {
                  onCourtCountChange?.(s.newCourts);
                  onTotalTimeMinsChange?.(s.newTimeMins);
                }}
              >
                {s.label}
                <span className="opacity-60 font-normal">→ {s.detail}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationBar;
