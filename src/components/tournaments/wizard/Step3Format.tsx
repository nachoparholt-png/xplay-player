import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Grid3X3, RefreshCw, Crown, AlertTriangle, ChevronDown, Settings2, Layers, Info, Trophy, Star, Save, CheckCircle2 } from "lucide-react";
import type { WizardState, TournamentFormat, BracketConfig, MatchConfig, PhaseBlock, CanvasState, ProgressionRule } from "@/lib/tournaments/types";
import { resolveAdvancementMode } from "@/lib/tournaments/knockoutPopulator";
import { useState, useEffect, useCallback, useRef } from "react";
import BuilderCanvas from "./canvas/BuilderCanvas";

interface Props {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
}

const FORMAT_OPTIONS: { value: TournamentFormat; icon: typeof Grid3X3; label: string; desc: string }[] = [
  { value: "groups", icon: Grid3X3, label: "Groups", desc: "Round-robin groups + optional knockout" },
  { value: "americano", icon: RefreshCw, label: "Americano", desc: "Everyone plays everyone, individual leaderboard" },
  { value: "king_of_court", icon: Crown, label: "King of the Court", desc: "Winners stay on, challengers rotate" },
];

// ── Canvas layout constants ───────────────────────────────────────────────
const COL_X = [40, 360, 660, 960]; // X positions for each stage column
const GROUP_ROW_H = 220;            // Vertical spacing between group cards

/** Generate default canvas blocks AND connection rules from a standard format. */
function generateCanvasFromFormat(
  format: TournamentFormat,
  teamCount: number,
  bracketConfig: BracketConfig
): CanvasState {
  const phases: PhaseBlock[] = [];
  const rules: ProgressionRule[] = [];
  let phaseCounter = 0;
  let ruleCounter = 0;

  const makeId = () => `phase-auto-${++phaseCounter}`;
  const makeRuleId = () => `rule-auto-${++ruleCounter}`;

  /** Helper: connect every group to a target phase (1st + 2nd place) */
  const connectGroupsTo = (
    groupPhases: PhaseBlock[],
    targetId: string,
    ranks: string[]
  ) => {
    groupPhases.forEach((gp) => {
      ranks.forEach((rank) => {
        rules.push({ id: makeRuleId(), fromPhaseId: gp.id, toPhaseId: targetId, fromRank: rank, toSlot: "IN" });
      });
    });
  };

  /** Helper: connect winner handles of one phase to the next */
  const connectWinnersTo = (fromId: string, toId: string, matchCount: number) => {
    for (let m = 1; m <= matchCount; m++) {
      rules.push({ id: makeRuleId(), fromPhaseId: fromId, toPhaseId: toId, fromRank: `W${m}`, toSlot: "IN" });
    }
  };

  if (format === "groups") {
    const groupCount = bracketConfig.group_count ?? Math.max(2, Math.floor(teamCount / 4));
    const basePerGroup = Math.floor(teamCount / groupCount);
    const remainder = teamCount % groupCount;

    // Vertical center of the group column (used to center knockout phases)
    const groupColumnCenterY = 40 + ((groupCount - 1) * GROUP_ROW_H) / 2;

    // ── Group phases ──────────────────────────────────────────────────────
    const groupPhases: PhaseBlock[] = [];
    for (let i = 0; i < groupCount; i++) {
      const p: PhaseBlock = {
        id: makeId(),
        phaseType: "round_robin",
        label: `Group ${String.fromCharCode(65 + i)}`,
        positionX: COL_X[0],
        positionY: 40 + i * GROUP_ROW_H,
        config: { teams: basePerGroup + (i < remainder ? 1 : 0) },
        sortOrder: i,
      };
      phases.push(p);
      groupPhases.push(p);
    }

    const ks = bracketConfig.knockout_structure;
    if (ks && ks !== "groups_only") {
      let quartersId: string | null = null;
      let semisId: string | null = null;

      // ── Quarter-finals ─────────────────────────────────────────────────
      if (ks === "groups_quarters_semis_final") {
        const qId = makeId();
        quartersId = qId;
        phases.push({
          id: qId,
          phaseType: "single_elimination",
          label: "Quarter-finals",
          positionX: COL_X[1],
          positionY: Math.max(40, groupColumnCenterY - 120),
          config: { teams: 8 },
          sortOrder: groupCount,
        });
        // Groups 1st + 2nd → Quarters
        connectGroupsTo(groupPhases, qId, ["1st", "2nd"]);
      }

      // ── Semi-finals ────────────────────────────────────────────────────
      if (ks === "groups_semis_final" || ks === "groups_quarters_semis_final") {
        const sId = makeId();
        semisId = sId;
        const semisCol = quartersId ? COL_X[2] : COL_X[1];
        phases.push({
          id: sId,
          phaseType: "single_elimination",
          label: "Semi-finals",
          positionX: semisCol,
          positionY: Math.max(40, groupColumnCenterY - 80),
          config: { teams: 4 },
          sortOrder: phases.length,
        });

        if (quartersId) {
          // Quarters W1-W4 → Semis
          connectWinnersTo(quartersId, sId, 4);
        } else {
          // Groups 1st + 2nd → Semis
          connectGroupsTo(groupPhases, sId, ["1st", "2nd"]);
        }
      }

      // ── Final(s) ─────────────────────────────────────────────────────
      if (semisId) {
        // Single final fed by semis
        const finalId = makeId();
        let finalCol: number;
        if (ks === "groups_semis_final") finalCol = COL_X[2];
        else finalCol = COL_X[3];

        phases.push({
          id: finalId,
          phaseType: "single_match",
          label: "Final",
          positionX: finalCol,
          positionY: Math.max(40, groupColumnCenterY - 40),
          config: {},
          sortOrder: phases.length,
        });
        connectWinnersTo(semisId, finalId, 2);
      } else if (groupCount >= 4 && groupCount % 2 === 0) {
        // Split finals: pair groups into halves → one final each
        const halfCount = groupCount / 2;
        const finalCol = COL_X[1];
        for (let h = 0; h < 2; h++) {
          const finalId = makeId();
          const halfGroups = groupPhases.slice(h * halfCount, (h + 1) * halfCount);
          const topY = halfGroups[0].positionY;
          const bottomY = halfGroups[halfGroups.length - 1].positionY;
          const centerY = (topY + bottomY) / 2;

          phases.push({
            id: finalId,
            phaseType: "single_match",
            label: `Final ${h + 1}`,
            positionX: finalCol,
            positionY: centerY,
            config: {},
            sortOrder: phases.length,
          });
          // Only group winners advance
          halfGroups.forEach((gp) => {
            rules.push({ id: makeRuleId(), fromPhaseId: gp.id, toPhaseId: finalId, fromRank: "1st", toSlot: "IN" });
          });
        }
      } else {
        // Default: single final with all group winners
        const finalId = makeId();
        phases.push({
          id: finalId,
          phaseType: "single_match",
          label: "Final",
          positionX: COL_X[1],
          positionY: Math.max(40, groupColumnCenterY - 40),
          config: {},
          sortOrder: phases.length,
        });
        connectGroupsTo(groupPhases, finalId, ["1st"]);
      }
    }
  } else if (format === "americano") {
    phases.push({
      id: makeId(),
      phaseType: "americano",
      label: "Americano",
      positionX: COL_X[0],
      positionY: 40,
      config: { teams: teamCount, isIndividual: true },
      sortOrder: 0,
    });
  } else if (format === "king_of_court") {
    phases.push({
      id: makeId(),
      phaseType: "king_of_court",
      label: "King of Court",
      positionX: COL_X[0],
      positionY: 40,
      config: { teams: teamCount, rounds: bracketConfig.king_rounds ?? Math.max(teamCount, 6) },
      sortOrder: 0,
    });
  }

  return { phases, rules };
}

function summarizeCanvas(canvas: CanvasState): string {
  if (canvas.phases.length === 0) return "";
  const groups = canvas.phases.filter((p) => p.phaseType === "round_robin").length;
  const kos = canvas.phases.filter((p) => p.phaseType === "single_elimination" || p.phaseType === "single_match").length;
  const parts: string[] = [];
  if (groups) parts.push(`${groups} group${groups > 1 ? "s" : ""}`);
  if (kos) parts.push(`${kos} knockout stage${kos > 1 ? "s" : ""}`);
  const others = canvas.phases.length - groups - kos;
  if (others) parts.push(`${others} other phase${others > 1 ? "s" : ""}`);
  return parts.join(" → ");
}

/** Generates a detailed human-readable summary for the Review page after saving the builder. */
function buildSavedCanvasSummary(canvas: CanvasState): string {
  if (canvas.phases.length === 0) return "";

  const parts: string[] = [];

  const groups = canvas.phases.filter((p) => p.phaseType === "round_robin");
  const eliminations = canvas.phases.filter((p) => p.phaseType === "single_elimination");
  const finals = canvas.phases.filter((p) => p.phaseType === "single_match");
  const americano = canvas.phases.filter((p) => p.phaseType === "americano");
  const kingOfCourt = canvas.phases.filter((p) => p.phaseType === "king_of_court");

  if (groups.length > 0) {
    const teamsPerGroup = groups[0].config?.teams as number | undefined;
    const groupLabel = `${groups.length} group${groups.length > 1 ? "s" : ""}`;
    const teamsLabel = teamsPerGroup ? ` · ${teamsPerGroup} team${teamsPerGroup !== 1 ? "s" : ""} each` : "";
    parts.push(`${groupLabel}${teamsLabel}`);
  }

  eliminations.forEach((e) => parts.push(e.label));
  finals.forEach((f) => parts.push(f.label));

  if (americano.length > 0) {
    const teams = americano[0].config?.teams as number | undefined;
    parts.push(`Americano${teams ? ` · ${teams} teams` : ""}`);
  }

  if (kingOfCourt.length > 0) {
    const teams = kingOfCourt[0].config?.teams as number | undefined;
    const rounds = kingOfCourt[0].config?.rounds as number | undefined;
    parts.push(`King of Court${teams ? ` · ${teams} teams` : ""}${rounds ? ` · ${rounds} rounds` : ""}`);
  }

  return parts.join(" → ");
}

const Step3Format = ({ state, update }: Props) => {
  const canvas = state.canvasState ?? { phases: [], rules: [] };
  const [koConfigOpen, setKoConfigOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const initialCanvasRef = useRef<CanvasState | null>(null);

  const teamCount = state.tournamentType === "pairs"
    ? Math.floor(state.playerCount / 2)
    : state.playerCount;

  const bc = state.bracketConfig;

  const setBC = (partial: Partial<BracketConfig>) => {
    const newBC = { ...bc, ...partial };
    update({ bracketConfig: newBC });
    const newCanvas = generateCanvasFromFormat(state.formatType, teamCount, newBC);

    // Redistribute teams evenly across all group phases
    const groupPhases = newCanvas.phases.filter(p => p.phaseType === "round_robin");
    if (groupPhases.length > 0) {
      const base = Math.floor(teamCount / groupPhases.length);
      const rem = teamCount % groupPhases.length;
      let groupIdx = 0;
      newCanvas.phases = newCanvas.phases.map(p => {
        if (p.phaseType !== "round_robin") return p;
        const updated = { ...p, config: { ...p.config, teams: base + (groupIdx < rem ? 1 : 0) } };
        groupIdx++;
        return updated;
      });
    }

    update({ canvasState: newCanvas });
  };

  const groupCount = bc.group_count ?? Math.max(2, Math.floor(teamCount / 4));
  const teamsPerGroup = Math.floor(teamCount / groupCount);

  const knockoutStructures = [
    { value: "groups_only", label: "Groups only (no knockout)" },
    { value: "groups_final", label: "Groups → Final" },
    { value: "groups_semis_final", label: "Groups → Semis → Final" },
    { value: "groups_quarters_semis_final", label: "Groups → Quarters → Semis → Final" },
  ];

  const hasSemis = bc.knockout_structure === "groups_semis_final" || bc.knockout_structure === "groups_quarters_semis_final";
  const hasKnockout = bc.knockout_structure && bc.knockout_structure !== "groups_only";

  // ── Advancement explanation ───────────────────────────────────────────────
  // Split finals: when groups_final + even group count ≥ 4, we create 2 finals
  const isSplitFinals = bc.knockout_structure === "groups_final" && groupCount >= 4 && groupCount % 2 === 0;

  // How many slots does the first knockout round need?
  const knockoutFirstRoundSlots =
    isSplitFinals ? groupCount : // each final gets groupCount/2 winners, total slots = groupCount
    bc.knockout_structure === "groups_final" ? 2 :
    bc.knockout_structure === "groups_semis_final" ? 4 :
    bc.knockout_structure === "groups_quarters_semis_final" ? 8 : 0;

  const knockoutStageName =
    isSplitFinals ? "Finals" :
    bc.knockout_structure === "groups_final" ? "Final" :
    bc.knockout_structure === "groups_semis_final" ? "Semi-finals" :
    bc.knockout_structure === "groups_quarters_semis_final" ? "Quarter-finals" : "";

  const advancePerGroup = isSplitFinals ? 1 : (bc.advance_count ?? 2);
  const { mode: advancementMode, numBestRunnerUps } = hasKnockout && knockoutFirstRoundSlots > 0
    ? (isSplitFinals
        ? { mode: "perfect" as const, numBestRunnerUps: 0 }
        : resolveAdvancementMode(groupCount, advancePerGroup, knockoutFirstRoundSlots))
    : { mode: "perfect" as const, numBestRunnerUps: 0 };

  const americanoRounds = (teamCount * (teamCount - 1)) / 2;

  const koConfig = bc.knockout_match_config || state.matchConfig;
  const setKoConfig = (partial: Partial<MatchConfig>) =>
    setBC({ knockout_match_config: { ...koConfig, ...partial } });

  // Auto-generate canvas when format changes
  const regenerateCanvas = useCallback(() => {
    const newCanvas = generateCanvasFromFormat(state.formatType, teamCount, state.bracketConfig);
    initialCanvasRef.current = { phases: [...newCanvas.phases], rules: [...newCanvas.rules] };
    update({ canvasState: newCanvas });
  }, [state.formatType, teamCount, state.bracketConfig, update]);

  // Regenerate canvas when format or key bracket config changes
  useEffect(() => {
    if (canvas.phases.length === 0) {
      regenerateCanvas();
    }
  }, [state.formatType, bc.knockout_structure, bc.group_count]);

  const handleFormatChange = (format: TournamentFormat) => {
    update({ formatType: format });
    const newCanvas = generateCanvasFromFormat(format, teamCount, state.bracketConfig);
    initialCanvasRef.current = { phases: [...newCanvas.phases], rules: [...newCanvas.rules] };
    update({ canvasState: newCanvas, savedCanvasSummary: null });
  };

  const handleCanvasChange = (newCanvas: CanvasState) => {
    update({ canvasState: newCanvas });
  };

  const handleCourtCountChange = (count: number) => {
    update({ courtCount: Math.max(1, Math.min(20, count)) });
  };

  const handleTotalTimeMinsChange = (mins: number | null) => {
    update({ totalTimeMins: mins === null ? null : Math.max(30, mins) });
  };

  const canvasSummary = summarizeCanvas(canvas);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Pick your format</p>

      <div className="space-y-3">
        {FORMAT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = state.formatType === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => handleFormatChange(opt.value)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border/50 bg-card hover:border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className={`text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Groups sub-config */}
      {state.formatType === "groups" && (
        <div className="space-y-4 p-4 rounded-xl border border-border/50 bg-card">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Knockout structure</Label>
            <Select
              value={bc.knockout_structure ?? "groups_only"}
              onValueChange={(v) => {
                setBC({ knockout_structure: v as "groups_only" | "groups_final" | "groups_semis_final" | "groups_quarters_semis_final" });
                // Regenerate canvas when knockout structure changes
                const newBc = { ...state.bracketConfig, knockout_structure: v as "groups_only" | "groups_final" | "groups_semis_final" | "groups_quarters_semis_final" };
                const newCanvas = generateCanvasFromFormat(state.formatType, teamCount, newBc);
                initialCanvasRef.current = { phases: [...newCanvas.phases], rules: [...newCanvas.rules] };
                update({ canvasState: newCanvas, savedCanvasSummary: null });
              }}
            >
              <SelectTrigger className="rounded-xl h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {knockoutStructures.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Groups</Label>
            <Select
              value={String(groupCount)}
              onValueChange={(v) => {
                const newGroupCount = parseInt(v);
                setBC({ group_count: newGroupCount });
                const newBc = { ...state.bracketConfig, group_count: newGroupCount };
                const newCanvas = generateCanvasFromFormat(state.formatType, teamCount, newBc);
                initialCanvasRef.current = { phases: [...newCanvas.phases], rules: [...newCanvas.rules] };
                update({ canvasState: newCanvas, savedCanvasSummary: null });
              }}
            >
              <SelectTrigger className="rounded-xl h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 6, 8]
                  .filter((g) => g <= teamCount && Math.ceil(teamCount / g) >= 4)
                  .map((g) => {
                    const perGroup = Math.ceil(teamCount / g);
                    return (
                      <SelectItem key={g} value={String(g)}>
                        {g} groups · {perGroup} {state.tournamentType === "pairs" ? "teams" : "players"} each
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {teamsPerGroup} {state.tournamentType === "pairs" ? "teams" : "players"} per group
              {teamsPerGroup < 4 && (
                <span className="text-destructive ml-1">(min. 4 required)</span>
              )}
            </p>
          </div>

          {hasKnockout && groupCount >= 2 && !isSplitFinals && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Knockout seeding</Label>
              <Select
                value={bc.seeding_mode ?? "cross"}
                onValueChange={(v) => setBC({ seeding_mode: v as "straight" | "cross" })}
              >
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cross">Cross-seeded (1st A vs 2nd B)</SelectItem>
                  <SelectItem value="straight">Straight (1st A vs 2nd A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Advancement explanation box ── */}
          {hasKnockout && knockoutFirstRoundSlots > 0 && (
            <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs ${
              advancementMode === "best-runner-up"
                ? "bg-amber-500/10 border-amber-500/25 text-amber-700"
                : advancementMode === "short"
                ? "bg-destructive/10 border-destructive/20 text-destructive"
                : "bg-primary/8 border-primary/20 text-primary"
            }`}>
              {advancementMode === "best-runner-up" ? (
                <Star className="w-4 h-4 shrink-0 mt-0.5" />
              ) : advancementMode === "short" ? (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <Trophy className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                {advancementMode === "perfect" && (
                  <>
                    <p className="font-semibold">
                      {isSplitFinals
                        ? `Split finals: ${groupCount / 2} groups per final — each group winner advances. 2 Champions.`
                        : `Top ${advancePerGroup} from each group advance — ${knockoutFirstRoundSlots} teams enter the ${knockoutStageName}.`
                      }
                    </p>
                    <p className="opacity-70">
                      {isSplitFinals
                        ? `Groups ${Array.from({ length: groupCount / 2 }, (_, i) => String.fromCharCode(65 + i)).join("+")} → Final 1, Groups ${Array.from({ length: groupCount / 2 }, (_, i) => String.fromCharCode(65 + groupCount / 2 + i)).join("+")} → Final 2.`
                        : `${groupCount} groups × ${advancePerGroup} advancing = ${knockoutFirstRoundSlots} spots. Perfect fit.`
                      }
                    </p>
                  </>
                )}
                {advancementMode === "best-runner-up" && (
                  <>
                    <p className="font-semibold">
                      Best runner-up rule applies — {groupCount} group winners + {numBestRunnerUps} best runner-up{numBestRunnerUps > 1 ? "s" : ""} advance to the {knockoutStageName}.
                    </p>
                    <p className="opacity-80">
                      Because {groupCount} groups × {advancePerGroup} advancing = {groupCount * advancePerGroup} teams but the {knockoutStageName} only has {knockoutFirstRoundSlots} slots,
                      all group winners qualify automatically. The remaining {numBestRunnerUps} spot{numBestRunnerUps > 1 ? "s are" : " is"} given to the best runner-up{numBestRunnerUps > 1 ? "s" : ""} across all groups,
                      ranked by: <strong>most points → best point difference → most points scored</strong>.
                    </p>
                  </>
                )}
                {advancementMode === "short" && (
                  <>
                    <p className="font-semibold">
                      Not enough teams: {groupCount} groups × {advancePerGroup} advancing = {groupCount * advancePerGroup} teams, but {knockoutStageName} needs {knockoutFirstRoundSlots}.
                    </p>
                    <p className="opacity-80">
                      Consider reducing the number of groups, advancing more teams per group, or choosing a smaller knockout structure.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}



          {teamCount < 4 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Need at least 4 {state.tournamentType === "pairs" ? "teams" : "players"} for groups format.</span>
            </div>
          )}
        </div>
      )}

      {/* Americano info */}
      {state.formatType === "americano" && (
        <div className="p-4 rounded-xl border border-border/50 bg-card">
          <p className="text-sm font-semibold">{americanoRounds} total matches</p>
          <p className="text-xs text-muted-foreground mt-1">
            Each {state.tournamentType === "pairs" ? "team" : "player"} plays {teamCount - 1} matches (one against every other)
          </p>
        </div>
      )}

      {/* King of the Court */}
      {state.formatType === "king_of_court" && (
        <div className="p-4 rounded-xl border border-border/50 bg-card space-y-3">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Number of rounds</Label>
            <Input
              type="number"
              min={teamCount}
              max={50}
              value={bc.king_rounds ?? Math.max(teamCount, 6)}
              onChange={(e) => setBC({ king_rounds: parseInt(e.target.value) || teamCount })}
              className="rounded-xl h-11 w-32"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Winners stay on court, losers rotate to the next challenge.
          </p>
        </div>
      )}

      {/* Advanced: Visual Builder */}
      <Collapsible open={canvasOpen} onOpenChange={setCanvasOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-3 rounded-xl border border-border/30 bg-muted/20 hover:bg-muted/40 transition-colors">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold flex-1">Advanced: Visual Builder</span>
          {!canvasOpen && state.savedCanvasSummary && (
            <span className="flex items-center gap-1 text-[11px] text-accent mr-2">
              <CheckCircle2 className="w-3 h-3" />
              Saved
            </span>
          )}
          {!canvasOpen && !state.savedCanvasSummary && canvasSummary && (
            <span className="text-[11px] text-muted-foreground mr-2">{canvasSummary}</span>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${canvasOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <BuilderCanvas
            canvasState={canvas}
            onChange={handleCanvasChange}
            courtCount={state.courtCount}
            totalTimeMins={state.totalTimeMins}
            initialCanvasState={initialCanvasRef.current ?? undefined}
            totalPlayers={teamCount}
            matchConfig={state.matchConfig}
            onCourtCountChange={handleCourtCountChange}
            onTotalTimeMinsChange={handleTotalTimeMinsChange}
          />

          {/* Save layout button */}
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => {
                const summary = buildSavedCanvasSummary(canvas);
                if (summary) {
                  update({ savedCanvasSummary: summary });
                }
              }}
              disabled={canvas.phases.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                canvas.phases.length === 0
                  ? "bg-muted/40 text-muted-foreground cursor-not-allowed"
                  : state.savedCanvasSummary && state.savedCanvasSummary === buildSavedCanvasSummary(canvas)
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {state.savedCanvasSummary && state.savedCanvasSummary === buildSavedCanvasSummary(canvas) ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Layout saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save layout
                </>
              )}
            </button>
            {state.savedCanvasSummary && state.savedCanvasSummary !== buildSavedCanvasSummary(canvas) && (
              <span className="text-[11px] text-muted-foreground">Unsaved changes</span>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default Step3Format;
