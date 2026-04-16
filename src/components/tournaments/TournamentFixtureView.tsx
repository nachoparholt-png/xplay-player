import { useState, useMemo } from "react";
import { Clock, Users, Grid3x3, CalendarDays, Trophy } from "lucide-react";
import type { TournamentFormat, BracketConfig, CanvasState } from "@/lib/tournaments/types";

interface TournamentFixtureViewProps {
  formatType?: TournamentFormat;
  tournamentType: "pairs" | "individual";
  playerCount: number;
  courtCount: number;
  bracketConfig?: BracketConfig;
  filledPlayers?: string[];
  canvasState?: CanvasState;
  startTime?: string;
  matchDurationMins?: number;
  changeoverMins?: number;
}

const GROUP_PALETTE = [
  { bg: "rgba(200,255,62,0.07)", border: "rgba(200,255,62,0.20)", accent: "#C8FF3E" },
  { bg: "rgba(62,207,255,0.07)", border: "rgba(62,207,255,0.20)", accent: "#3ECFFF" },
  { bg: "rgba(255,107,53,0.07)", border: "rgba(255,107,53,0.20)", accent: "#FF6B35" },
  { bg: "rgba(180,124,255,0.07)", border: "rgba(180,124,255,0.20)", accent: "#B47CFF" },
  { bg: "rgba(255,200,50,0.07)", border: "rgba(255,200,50,0.20)", accent: "#FFC832" },
  { bg: "rgba(50,255,160,0.07)", border: "rgba(50,255,160,0.20)", accent: "#32FFA0" },
];

function getRRMatchOrder(n: number): [number, number][] {
  if (n === 4) return [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]];
  if (n === 3) return [[0,1],[0,2],[1,2]];
  if (n === 2) return [[0,1]];
  const m: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) m.push([i, j]);
  return m;
}

function addMins(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export default function TournamentFixtureView({
  tournamentType,
  filledPlayers = [],
  canvasState,
  startTime = "10:00",
  matchDurationMins = 22,
  changeoverMins = 2,
}: TournamentFixtureViewProps) {
  const [tab, setTab] = useState<"schedule" | "draws">("schedule");
  const slotMins = matchDurationMins + changeoverMins;
  const teamSize = tournamentType === "pairs" ? 2 : 1;

  const groups = useMemo(() => {
    if (!canvasState?.phases?.length) return [];
    const groupPhases = canvasState.phases
      .filter(p => p.phaseType === "round_robin")
      .sort((a, b) => (a.positionX - b.positionX) || (a.positionY - b.positionY));

    let teamOffset = 0;
    return groupPhases.map((phase, gIdx) => {
      const pal = GROUP_PALETTE[gIdx % GROUP_PALETTE.length];
      const letter = String.fromCharCode(65 + gIdx);
      const groupTeamCount = (phase.config?.teams as number) || 4;

      const teams = Array.from({ length: groupTeamCount }, (_, tIdx) => {
        const globalTeamIdx = teamOffset + tIdx;
        const players = Array.from({ length: teamSize }, (_, p) => {
          const pIdx = globalTeamIdx * teamSize + p;
          return pIdx < filledPlayers.length ? filledPlayers[pIdx] : null;
        });
        return { id: `${letter}${tIdx + 1}`, seed: tIdx + 1, players };
      });

      teamOffset += groupTeamCount;

      return {
        letter,
        label: phase.label || `Group ${letter}`,
        courtNumber: gIdx + 1,
        pal,
        teams,
        matches: getRRMatchOrder(groupTeamCount),
      };
    });
  }, [canvasState, filledPlayers, teamSize]);

  const knockoutPhases = useMemo(() => {
    if (!canvasState?.phases?.length) return [];
    return canvasState.phases
      .filter(p => p.phaseType !== "round_robin")
      .sort((a, b) => a.positionX - b.positionX);
  }, [canvasState]);

  const maxMatchCount = Math.max(...groups.map(g => g.matches.length), 0);
  const finalsTime = addMins(startTime, maxMatchCount * slotMins + changeoverMins);

  if (!groups.length) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/20 p-8 text-center">
        <Grid3x3 className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          No group phases configured yet.<br />
          Set up groups in the Format step.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{groups.length} groups · {Math.round(groups.reduce((s, g) => s + g.matches.length, 0) / groups.length)} matches each</span>
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{matchDurationMins}min/match + {changeoverMins}min changeover</span>
        <span className="flex items-center gap-1"><Grid3x3 className="h-3.5 w-3.5" />{groups.length} courts parallel</span>
        {knockoutPhases.length > 0 && (
          <span className="flex items-center gap-1"><Trophy className="h-3.5 w-3.5" />Finals ~{finalsTime}</span>
        )}
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 bg-muted/30 rounded-lg p-1 w-fit">
        {(["schedule", "draws"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/70"
            }`}
          >
            {t === "schedule" ? "Match Schedule" : "Group Draws"}
          </button>
        ))}
      </div>

      {/* TAB 1 — MATCH SCHEDULE */}
      {tab === "schedule" && (
        <div className="overflow-x-auto rounded-xl border border-border/40">
          {/* Column headers */}
          <div className="grid gap-px bg-border/20" style={{ gridTemplateColumns: `60px 70px repeat(${groups.length}, 1fr)` }}>
            <div className="bg-muted/40 px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Slot</div>
            <div className="bg-muted/40 px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Time</div>
            {groups.map(g => (
              <div key={g.letter} className="bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase" style={{ color: g.pal.accent }}>
                Court {g.courtNumber} · {g.label}
              </div>
            ))}
          </div>

          {/* Match rows */}
          {Array.from({ length: maxMatchCount }, (_, slotIdx) => (
            <div
              key={slotIdx}
              className="grid gap-px"
              style={{
                gridTemplateColumns: `60px 70px repeat(${groups.length}, 1fr)`,
                backgroundColor: slotIdx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
              }}
            >
              <div className="px-2 py-2.5 text-xs font-mono text-muted-foreground/60">M{slotIdx + 1}</div>
              <div className="px-2 py-2.5 text-xs font-mono text-muted-foreground">
                {addMins(startTime, slotIdx * slotMins)}
              </div>
              {groups.map(g => {
                const match = g.matches[slotIdx];
                if (!match) return <div key={g.letter} className="px-3 py-2.5" />;
                const teamA = g.teams[match[0]];
                const teamB = g.teams[match[1]];
                return (
                  <div key={g.letter} className="px-3 py-2 flex items-center gap-1.5 text-xs" style={{ borderLeft: `2px solid ${g.pal.border}` }}>
                    <MatchTeam team={teamA} accent={g.pal.accent} />
                    <span className="text-muted-foreground/40 text-[10px]">VS</span>
                    <MatchTeam team={teamB} accent={g.pal.accent} align="right" />
                  </div>
                );
              })}
            </div>
          ))}

          {/* Finals row */}
          {knockoutPhases.length > 0 && (
            <div className="grid gap-px border-t border-primary/20" style={{ gridTemplateColumns: `60px 70px repeat(${groups.length}, 1fr)` }}>
              <div className="px-2 py-2.5 text-xs font-bold text-primary">Finals</div>
              <div className="px-2 py-2.5 text-xs font-mono text-primary">{finalsTime}</div>
              {groups.map((g, idx) => {
                const final = knockoutPhases[idx];
                return (
                  <div key={g.letter} className="px-3 py-2.5" style={{ borderLeft: `2px solid ${g.pal.border}` }}>
                    {final ? (
                      <>
                        <div className="text-xs font-semibold text-foreground">{final.label}</div>
                        <div className="text-[10px] text-muted-foreground">Winner {g.letter} + prev group</div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground/40">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2 — GROUP DRAWS */}
      {tab === "draws" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map(g => (
            <div key={g.letter} className="rounded-xl border overflow-hidden" style={{ borderColor: g.pal.border, backgroundColor: g.pal.bg }}>
              {/* Group header */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: g.pal.border }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black" style={{ backgroundColor: g.pal.accent, color: "#000" }}>
                    {g.letter}
                  </div>
                  <span className="text-sm font-semibold text-foreground">{g.label}</span>
                </div>
                <div className="flex gap-2 text-[10px] text-muted-foreground">
                  <span>Court {g.courtNumber}</span>
                  <span>{g.matches.length} matches</span>
                </div>
              </div>

              {/* Team list */}
              <div className="divide-y" style={{ borderColor: g.pal.border + "40" }}>
                {g.teams.map((team, idx) => {
                  const names = team.players.filter(Boolean) as string[];
                  return (
                    <div key={team.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-[10px] font-mono text-muted-foreground/50 w-4">{idx + 1}</span>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: g.pal.accent + "22", color: g.pal.accent }}>
                        {team.id}
                      </span>
                      <div className="flex-1 min-w-0">
                        {names.length > 0 ? (
                          <span className="text-xs text-foreground truncate">{names.join(" · ")}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40 italic">
                            {teamSize === 2 ? `Player ${idx * 2 + 1} & Player ${idx * 2 + 2}` : `Player ${idx + 1}`}
                          </span>
                        )}
                        {teamSize === 2 && names.length > 0 && (
                          <span className="ml-1.5 text-[9px] text-muted-foreground/40">doubles pair</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Match count badge */}
              <div className="px-4 py-2 text-[10px] text-muted-foreground/50 border-t" style={{ borderColor: g.pal.border + "40" }}>
                {g.matches.length} round-robin matches · ~{addMins(startTime, (g.matches.length - 1) * slotMins)} finish
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchTeam({
  team,
  accent,
  align = "left",
}: {
  team: { id: string; players: (string | null)[] };
  accent: string;
  align?: "left" | "right";
}) {
  const names = team.players.filter(Boolean) as string[];
  return (
    <div className={`flex items-center gap-1 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="font-bold text-[11px]" style={{ color: accent }}>{team.id}</span>
      {names.length > 0 ? (
        <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
          {names.length === 2 ? names.map(n => n.split(" ")[0]).join(" & ") : names[0]}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground/30">TBD</span>
      )}
    </div>
  );
}
