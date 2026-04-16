import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Users, UserCircle, Trophy, Swords } from "lucide-react";
import type { BracketConfig, MatchConfig, TournamentFormat, CanvasState, PhaseBlock } from "@/lib/tournaments/types";

interface PlayerSlot {
  name: string | null; // null = empty slot
}

interface TeamSlot {
  id: string;
  players: PlayerSlot[];
  groupId?: string;
}

interface KnockoutSlot {
  roundType: string;
  roundLabel: string;
  matchNumber: number;
  teamA: string | null;
  teamB: string | null;
}

interface TournamentStructurePreviewProps {
  formatType: TournamentFormat;
  tournamentType: "pairs" | "individual";
  playerCount: number;
  courtCount: number;
  bracketConfig: BracketConfig;
  /** Filled player names in order of joining. Length = how many have joined. */
  filledPlayers?: string[];
  /** Slot indices that are available for selection (individual mode join) */
  selectableSlots?: number[];
  /** Currently selected slot index */
  selectedSlot?: number | null;
  /** Callback when a selectable slot is clicked */
  onSlotClick?: (slotIndex: number) => void;
  /** Canvas state from the visual builder — when present, overrides bracketConfig-derived structure */
  canvasState?: CanvasState;
}

const GROUP_COLORS = [
  "border-primary/30 bg-primary/5",
  "border-accent/30 bg-accent/5",
  "border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/5",
  "border-destructive/30 bg-destructive/5",
];

const ROUND_LABELS: Record<string, string> = {
  quarter: "Quarter-Finals",
  semi: "Semi-Finals",
  final: "Final",
  bronze: "3rd Place",
};

/** Derive a human-readable round label from a canvas phase */
function getCanvasRoundLabel(phase: PhaseBlock): string {
  if (phase.phaseType === "single_match") return phase.label || "Final";
  if (phase.phaseType === "single_elimination") {
    const teams = (phase.config as Record<string, unknown>)?.teams as number | undefined;
    if (!teams || teams <= 4) return phase.label || "Semi-Finals";
    if (teams <= 8) return phase.label || "Quarter-Finals";
    return phase.label || "Knockout";
  }
  return phase.label;
}

const TournamentStructurePreview = ({
  formatType,
  tournamentType,
  playerCount,
  courtCount,
  bracketConfig,
  filledPlayers = [],
  selectableSlots,
  selectedSlot,
  onSlotClick,
  canvasState,
}: TournamentStructurePreviewProps) => {
  const teamSize = tournamentType === "pairs" ? 2 : 1;
  const teamCount = tournamentType === "pairs" ? Math.floor(playerCount / 2) : playerCount;

  // ─── Canvas-driven structure ────────────────────────────────────────────────
  // When the visual builder has phases, derive groups and knockout from canvas.

  /** Groups built from round_robin phases in the canvas */
  const canvasGroups = useMemo(() => {
    if (!canvasState || canvasState.phases.length === 0) return null;
    const groupPhases = canvasState.phases
      .filter((p) => p.phaseType === "round_robin")
      .sort((a, b) => a.positionX - b.positionX || a.positionY - b.positionY);
    if (groupPhases.length === 0) return null;

    let teamOffset = 0;
    return groupPhases.map((phase, idx) => {
      const groupTeamCount =
        ((phase.config as Record<string, unknown>)?.teams as number | undefined) ?? 4;
      const groupLabel = String.fromCharCode(65 + idx); // A, B, C …

      const teams: TeamSlot[] = [];
      for (let i = 0; i < groupTeamCount; i++) {
        const teamIdx = teamOffset + i;
        const players: PlayerSlot[] = [];
        for (let p = 0; p < teamSize; p++) {
          const playerIdx = teamIdx * teamSize + p;
          players.push({
            name: playerIdx < filledPlayers.length ? filledPlayers[playerIdx] : null,
          });
        }
        teams.push({ id: `canvas_team_${teamIdx}`, players, groupId: groupLabel });
      }
      teamOffset += groupTeamCount;

      return { groupId: groupLabel, label: phase.label, teams };
    });
  }, [canvasState, teamSize, filledPlayers]);

  /** Knockout stages built from non-round_robin phases in the canvas */
  const canvasKnockout = useMemo(() => {
    if (!canvasState || canvasState.phases.length === 0) return null;
    const { phases, rules } = canvasState;

    const groupPhases = phases
      .filter((p) => p.phaseType === "round_robin")
      .sort((a, b) => a.positionX - b.positionX);

    const knockoutPhases = phases
      .filter((p) => p.phaseType !== "round_robin")
      .sort((a, b) => a.positionX - b.positionX);

    if (knockoutPhases.length === 0) return null;

    let matchNum = 1;
    return knockoutPhases.map((phase) => {
      // Collect all rules feeding INTO this phase, in creation order
      const incomingRules = rules.filter((r) => r.toPhaseId === phase.id);

      const sources = incomingRules
        .map((r) => {
          const fromPhase = phases.find((p) => p.id === r.fromPhaseId);
          if (!fromPhase) return null;
          if (fromPhase.phaseType === "round_robin") {
            const gIdx = groupPhases.findIndex((gp) => gp.id === fromPhase.id);
            const groupLetter = gIdx >= 0 ? String.fromCharCode(65 + gIdx) : "?";
            return `${r.fromRank} Grp ${groupLetter}`;
          }
          return `W from ${fromPhase.label}`;
        })
        .filter(Boolean) as string[];

      // Pair sources into matches (source[0] vs source[1], …)
      const matches: { teamA: string | null; teamB: string | null; matchNumber: number }[] = [];
      if (sources.length === 0) {
        const expectedTeams =
          phase.phaseType === "single_match"
            ? 2
            : (((phase.config as Record<string, unknown>)?.teams as number | undefined) ?? 4);
        const matchCount =
          phase.phaseType === "single_match" ? 1 : Math.floor(expectedTeams / 2);
        for (let i = 0; i < matchCount; i++) {
          matches.push({ teamA: null, teamB: null, matchNumber: matchNum++ });
        }
      } else {
        for (let i = 0; i < sources.length; i += 2) {
          matches.push({
            teamA: sources[i] ?? null,
            teamB: sources[i + 1] ?? null,
            matchNumber: matchNum++,
          });
        }
      }

      return { phase, roundLabel: getCanvasRoundLabel(phase), matches };
    });
  }, [canvasState]);

  // ─── Legacy (bracketConfig-driven) structure ────────────────────────────────

  const teamSlots: TeamSlot[] = useMemo(() => {
    const slots: TeamSlot[] = [];
    for (let i = 0; i < teamCount; i++) {
      const players: PlayerSlot[] = [];
      for (let p = 0; p < teamSize; p++) {
        const playerIndex = i * teamSize + p;
        players.push({
          name: playerIndex < filledPlayers.length ? filledPlayers[playerIndex] : null,
        });
      }
      slots.push({ id: `team_${i + 1}`, players });
    }
    return slots;
  }, [teamCount, teamSize, filledPlayers]);

  const legacyGroups: { groupId: string; teams: TeamSlot[] }[] = useMemo(() => {
    if (formatType !== "groups") return [];
    const groupCount =
      bracketConfig.group_count ||
      Math.max(1, Math.floor(teamCount / (bracketConfig.teams_per_group || 4)));
    const groupArrays: TeamSlot[][] = Array.from({ length: groupCount }, () => []);
    teamSlots.forEach((t, i) => {
      const gIdx = i % groupCount;
      const groupLabel = String.fromCharCode(65 + gIdx);
      groupArrays[gIdx].push({ ...t, groupId: groupLabel });
    });
    return groupArrays.map((teams, i) => ({
      groupId: String.fromCharCode(65 + i),
      teams,
    }));
  }, [formatType, teamSlots, bracketConfig, teamCount]);

  const knockoutSlots: KnockoutSlot[] = useMemo(() => {
    if (formatType !== "groups") return [];
    const knockoutStructure = bracketConfig.knockout_structure || "groups_only";
    if (knockoutStructure === "groups_only") return [];

    const groupCount =
      bracketConfig.group_count ||
      Math.max(1, Math.floor(teamCount / (bracketConfig.teams_per_group || 4)));
    const advancePerGroup = bracketConfig.advance_count || 2;
    const totalAdvancing = advancePerGroup * groupCount;

    let koRounds = 0;
    if (knockoutStructure === "groups_final") koRounds = 1;
    else if (knockoutStructure === "groups_semis_final") koRounds = 2;
    else if (knockoutStructure === "groups_quarters_semis_final") koRounds = 3;

    const slots: KnockoutSlot[] = [];
    let currentTeams = totalAdvancing;
    let matchNum = 1;

    for (let kr = 0; kr < koRounds; kr++) {
      const matchesInRound = Math.floor(currentTeams / 2);
      const roundType =
        kr === koRounds - 1 ? "final" : kr === koRounds - 2 ? "semi" : "quarter";

      for (let m = 0; m < matchesInRound; m++) {
        let teamA: string | null = null;
        let teamB: string | null = null;

        if (kr === 0 && legacyGroups.length > 0) {
          const seedingMode = bracketConfig.seeding_mode || "cross";
          if (seedingMode === "cross" && legacyGroups.length >= 2) {
            const gA = m % legacyGroups.length;
            const gB = (m + 1) % legacyGroups.length;
            const seedA = Math.floor(m / legacyGroups.length) + 1;
            const seedB = advancePerGroup - seedA + 1;
            teamA = `${seedA}${getOrdinal(seedA)} Grp ${legacyGroups[gA]?.groupId || "?"}`;
            teamB = `${seedB}${getOrdinal(seedB)} Grp ${legacyGroups[gB]?.groupId || "?"}`;
          } else {
            teamA = `Winner #${m * 2 + 1}`;
            teamB = `Winner #${m * 2 + 2}`;
          }
        }

        slots.push({
          roundType,
          roundLabel: ROUND_LABELS[roundType] || roundType,
          matchNumber: matchNum++,
          teamA,
          teamB,
        });
      }
      currentTeams = matchesInRound;
    }

    if (bracketConfig.bronze_match && koRounds >= 2) {
      slots.push({
        roundType: "bronze",
        roundLabel: "3rd Place",
        matchNumber: matchNum++,
        teamA: "Semi Loser 1",
        teamB: "Semi Loser 2",
      });
    }

    return slots;
  }, [formatType, bracketConfig, teamCount, legacyGroups]);

  // ─── Decide which data path to use ─────────────────────────────────────────
  const useCanvas = !!(canvasState && canvasState.phases.length > 0);
  const isRoundRobinStyle = formatType === "americano" || formatType === "king_of_court";

  const filledCount = filledPlayers.length;
  const totalSlots = playerCount;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Swords className="w-4 h-4 text-primary" />
          Tournament Structure
        </h3>
        <Badge variant="outline" className="text-[10px]">
          {filledCount}/{totalSlots} players
        </Badge>
      </div>

      {/* ── Canvas-driven groups ─────────────────────────────────────────────── */}
      {useCanvas && canvasGroups && canvasGroups.length > 0 && (
        <div className="space-y-3">
          {canvasGroups.map((g, gIdx) => (
            <div
              key={g.groupId}
              className={`rounded-xl border p-3 space-y-2 ${GROUP_COLORS[gIdx % GROUP_COLORS.length]}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">{g.label}</span>
                <Badge variant="outline" className="text-[9px]">
                  {g.teams.length} teams
                </Badge>
              </div>
              <div className="grid gap-1.5">
                {g.teams.map((t, tIdx) => {
                  const globalSlotIndex =
                    canvasGroups
                      .slice(0, gIdx)
                      .reduce((acc, prev) => acc + prev.teams.length, 0) + tIdx;
                  return (
                    <TeamSlotRow
                      key={t.id}
                      team={t}
                      index={tIdx + 1}
                      isPairs={tournamentType === "pairs"}
                      slotIndex={globalSlotIndex}
                      selectable={selectableSlots}
                      selectedSlot={selectedSlot}
                      onSlotClick={onSlotClick}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Legacy groups (bracketConfig path) ──────────────────────────────── */}
      {!useCanvas && formatType === "groups" && legacyGroups.length > 0 && (
        <div className="space-y-3">
          {legacyGroups.map((g, gIdx) => (
            <div
              key={g.groupId}
              className={`rounded-xl border p-3 space-y-2 ${GROUP_COLORS[gIdx % GROUP_COLORS.length]}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">Group {g.groupId}</span>
                <Badge variant="outline" className="text-[9px]">
                  {g.teams.length} teams
                </Badge>
              </div>
              <div className="grid gap-1.5">
                {g.teams.map((t, tIdx) => (
                  <TeamSlotRow
                    key={t.id}
                    team={t}
                    index={tIdx + 1}
                    isPairs={tournamentType === "pairs"}
                    slotIndex={tIdx + gIdx * g.teams.length}
                    selectable={selectableSlots}
                    selectedSlot={selectedSlot}
                    onSlotClick={onSlotClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Americano / KotC: simple slot list */}
      {isRoundRobinStyle && (
        <div className="rounded-xl border border-border/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold capitalize">
              {formatType.replace("_", " ")} — All vs All
            </span>
          </div>
          <div className="grid gap-1.5">
            {teamSlots.map((t, i) => (
              <TeamSlotRow
                key={t.id}
                team={t}
                index={i + 1}
                isPairs={tournamentType === "pairs"}
                slotIndex={i}
                selectable={selectableSlots}
                selectedSlot={selectedSlot}
                onSlotClick={onSlotClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Canvas-driven knockout ───────────────────────────────────────────── */}
      {useCanvas && canvasKnockout && canvasKnockout.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            Knockout Stage
          </h4>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {canvasKnockout.map((stage) => {
              const isFinal = stage.phase.phaseType === "single_match";
              return (
                <div key={stage.phase.id} className="flex-shrink-0 min-w-[180px] space-y-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center block">
                    {stage.roundLabel}
                  </span>
                  {stage.matches.map((m) => (
                    <div
                      key={m.matchNumber}
                      className={`rounded-xl border p-2.5 space-y-1 ${
                        isFinal
                          ? "border-primary/30 bg-primary/5"
                          : "bg-card border-border/50"
                      }`}
                    >
                      <KnockoutMatchSlot teamA={m.teamA} teamB={m.teamB} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Legacy knockout (bracketConfig path) ────────────────────────────── */}
      {!useCanvas && knockoutSlots.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            Knockout Stage
          </h4>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {Object.entries(
              knockoutSlots.reduce<Record<string, KnockoutSlot[]>>((acc, s) => {
                if (!acc[s.roundType]) acc[s.roundType] = [];
                acc[s.roundType].push(s);
                return acc;
              }, {})
            ).map(([roundType, slots]) => (
              <div key={roundType} className="flex-shrink-0 min-w-[180px] space-y-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center block">
                  {ROUND_LABELS[roundType] || roundType}
                </span>
                {slots.map((s) => (
                  <div
                    key={s.matchNumber}
                    className={`rounded-xl border p-2.5 space-y-1 ${
                      roundType === "bronze"
                        ? "border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/5"
                        : roundType === "final"
                          ? "border-primary/30 bg-primary/5"
                          : "bg-card border-border/50"
                    }`}
                  >
                    <KnockoutMatchSlot teamA={s.teamA} teamB={s.teamB} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const TeamSlotRow = ({
  team,
  index,
  isPairs,
  slotIndex,
  selectable,
  selectedSlot,
  onSlotClick,
}: {
  team: TeamSlot;
  index: number;
  isPairs: boolean;
  slotIndex?: number;
  selectable?: number[];
  selectedSlot?: number | null;
  onSlotClick?: (slotIndex: number) => void;
}) => {
  const allFilled = team.players.every((p) => p.name);
  const noneFilled = team.players.every((p) => !p.name);
  const isSelectable =
    selectable && slotIndex !== undefined && selectable.includes(slotIndex);
  const isSelected =
    selectedSlot !== undefined && selectedSlot !== null && slotIndex === selectedSlot;

  const handleClick = () => {
    if (isSelectable && onSlotClick && slotIndex !== undefined) {
      onSlotClick(slotIndex);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
        isSelected
          ? "bg-primary/10 border-2 border-primary ring-1 ring-primary/20"
          : isSelectable
            ? "bg-muted/20 border border-dashed border-primary/40 cursor-pointer hover:bg-primary/5"
            : allFilled
              ? "bg-background/80 border border-border/30"
              : noneFilled
                ? "bg-muted/30 border border-dashed border-border/40"
                : "bg-background/50 border border-dashed border-primary/30"
      }`}
    >
      <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">
        {index}
      </span>
      {isPairs ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <PlayerPill player={team.players[0]} />
          <span className="text-[10px] text-muted-foreground">&</span>
          <PlayerPill player={team.players[1]} />
        </div>
      ) : (
        <PlayerPill player={team.players[0]} />
      )}
      {isSelected && (
        <span className="text-[10px] font-bold text-primary ml-auto">✓</span>
      )}
    </div>
  );
};

const PlayerPill = ({ player }: { player: PlayerSlot }) => (
  <span
    className={`flex items-center gap-1 text-xs truncate ${
      player.name ? "font-medium" : "text-muted-foreground italic"
    }`}
  >
    <UserCircle
      className={`w-3.5 h-3.5 shrink-0 ${
        player.name ? "text-primary" : "text-muted-foreground/40"
      }`}
    />
    {player.name || "Empty slot"}
  </span>
);

const KnockoutMatchSlot = ({
  teamA,
  teamB,
}: {
  teamA: string | null;
  teamB: string | null;
}) => (
  <div className="space-y-1">
    <div className="flex items-center gap-2 text-xs">
      <span className={`truncate ${teamA ? "font-medium" : "text-muted-foreground italic"}`}>
        {teamA || "TBD"}
      </span>
    </div>
    <div className="border-t border-border/30" />
    <div className="flex items-center gap-2 text-xs">
      <span className={`truncate ${teamB ? "font-medium" : "text-muted-foreground italic"}`}>
        {teamB || "TBD"}
      </span>
    </div>
  </div>
);

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export default TournamentStructurePreview;
