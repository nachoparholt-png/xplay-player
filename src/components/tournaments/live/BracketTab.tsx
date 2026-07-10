/**
 * P4 — Bracket tab.
 * Knockout view is an Apple Sports-style bracket (approved design
 * XPLAY_Bracket_AppleSports_Preview_v4.html):
 *   - stage selector rail with per-round line glyphs + trophy, and a
 *     draggable range window (chevron handles, max 3 stages)
 *   - density-tiered match cards (full detail → codes) as the window widens
 *   - thin elbow connectors + neighbouring round "peeking" in at the edges
 *   - tap a team row to follow its path through the bracket
 * Groups mode keeps the standings tables per group_id.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { XP, firstName } from './atoms';
import type { TMatchRow, TTeamRow, ProfileLite } from './types';

function teamLabel(
  team: TTeamRow | undefined,
  profilesById: Map<string, ProfileLite>,
): string {
  if (!team) return 'TBD';
  const p1 = team.player1_id ? profilesById.get(team.player1_id) : undefined;
  const p2 = team.player2_id ? profilesById.get(team.player2_id) : undefined;
  const n1 = p1?.display_name ?? 'P1';
  const n2 = p2?.display_name;
  return n2 ? `${firstName(n1)} · ${firstName(n2)}` : firstName(n1);
}

export default function BracketTab({
  meUserId, matches, teamsById, profilesById, defaultMode,
}: {
  meUserId: string;
  matches: TMatchRow[];
  teamsById: Map<string, TTeamRow>;
  profilesById: Map<string, ProfileLite>;
  defaultMode?: 'ko' | 'groups';
}) {
  /* Detect formats present in this tournament's matches */
  const hasGroups = useMemo(() =>
    matches.some(m => m.round_type === 'group' || m.round_type === 'round_robin'),
  [matches]);
  const hasKO = useMemo(() =>
    matches.some(m => m.round_type !== 'group' && m.round_type !== 'round_robin'),
  [matches]);

  const initialMode: 'ko' | 'groups' =
    defaultMode ?? (hasGroups && !hasKO ? 'groups' : 'ko');
  const [mode, setMode] = useState<'ko' | 'groups'>(initialMode);

  return (
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 92, color: 'white' }}>
      {/* Sub-toggle pills */}
      <div style={{ padding: '12px 18px 6px', display: 'flex', gap: 6 }}>
        {(['ko', 'groups'] as const).map((m) => {
          const enabled = m === 'ko' ? hasKO || !hasGroups : hasGroups;
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => enabled && setMode(m)}
              disabled={!enabled}
              style={{
                padding: '6px 12px', borderRadius: 999,
                background: active ? XP.lime : 'rgba(255,255,255,.06)',
                color: active ? XP.navy : 'rgba(255,255,255,.7)',
                fontFamily: "'Lexend', sans-serif", fontSize: 10, fontWeight: 800,
                fontStyle: 'italic', letterSpacing: '.08em', textTransform: 'uppercase',
                border: 'none', cursor: enabled ? 'pointer' : 'not-allowed',
                opacity: enabled ? 1 : 0.4,
              }}
            >{m === 'ko' ? 'Knockout' : 'Groups'}</button>
          );
        })}
      </div>

      {mode === 'ko' ? (
        <KnockoutView meUserId={meUserId} matches={matches} teamsById={teamsById} profilesById={profilesById} />
      ) : (
        <GroupsView matches={matches} teamsById={teamsById} profilesById={profilesById} meUserId={meUserId} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Knockout — Apple Sports-style bracket
   ════════════════════════════════════════════════════════════════ */

const LINE = 'rgba(148,178,205,.28)';
const CARD = 'rgba(255,255,255,.055)';
const CARD_HD = 'rgba(0,0,0,.22)';
const MAXW = 3;

type Density = 'lg' | 'md' | 'sm';

interface Stage {
  num: number;
  code: string;
  title: string;
  matches: TMatchRow[];
}

function stageCode(r: number, total: number): string {
  if (r === total) return 'F';
  if (r === total - 1) return 'SF';
  if (r === total - 2) return 'QF';
  if (r === total - 3) return 'R16';
  return `R${r}`;
}
function stageTitle(r: number, total: number): string {
  if (r === total) return 'Final';
  if (r === total - 1) return 'Semi-finals';
  if (r === total - 2) return 'Quarter-finals';
  if (r === total - 3) return 'Round of 16';
  return `Round ${r}`;
}

/** Deterministic accent colour per team id (the "flag" sliver). */
function teamColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 62%, 58%)`;
}

function setsOf(m: TMatchRow): { a: number; b: number }[] {
  if (!Array.isArray(m.result?.sets)) return [];
  return m.result.sets.map((s: any) => ({
    a: Number(s.team_a ?? s.a ?? 0),
    b: Number(s.team_b ?? s.b ?? 0),
  }));
}
function setsWon(m: TMatchRow, side: 'a' | 'b'): number | null {
  const sets = setsOf(m);
  if (sets.length === 0) {
    const sc = side === 'a' ? m.result?.team_a_score : m.result?.team_b_score;
    return sc == null ? null : Number(sc);
  }
  return sets.filter(s => (side === 'a' ? s.a > s.b : s.b > s.a)).length;
}
function whenLabel(m: TMatchRow): string {
  const court = m.court_label || (m.court_number != null ? `Court ${m.court_number}` : null);
  if (m.status === 'in_progress') {
    const sets = setsOf(m);
    return [court, sets.length ? `Set ${sets.length}` : 'In play'].filter(Boolean).join(' · ');
  }
  const iso = m.scheduled_at || m.started_at;
  let t: string | null = null;
  if (iso) {
    try { t = new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { /* noop */ }
  }
  return [court, t].filter(Boolean).join(' · ') || (m.status === 'completed' ? 'Final score' : 'Upcoming');
}

const FONT = "'Lexend', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

function KnockoutView({
  meUserId, matches, teamsById, profilesById,
}: {
  meUserId: string;
  matches: TMatchRow[];
  teamsById: Map<string, TTeamRow>;
  profilesById: Map<string, ProfileLite>;
}) {
  const koMatches = useMemo(() =>
    matches.filter(m =>
      m.round_type !== 'group' && m.round_type !== 'round_robin' && m.round_type !== 'bronze'
      && m.status !== 'bye' && m.round_type !== 'americano_bye' && m.round_type !== 'king_bye'),
  [matches]);
  const bronzeMatches = useMemo(() => matches.filter(m => m.round_type === 'bronze'), [matches]);

  const stages: Stage[] = useMemo(() => {
    const nums = Array.from(new Set(koMatches.map(m => m.round_number))).sort((a, b) => a - b);
    const total = nums[nums.length - 1] ?? 1;
    return nums.map(r => ({
      num: r,
      code: stageCode(r, total),
      title: stageTitle(r, total),
      matches: koMatches.filter(m => m.round_number === r).sort((a, b) => a.match_number - b.match_number),
    }));
  }, [koMatches]);

  const N = stages.length;

  /* Default window: the stage with a live match, else last stage with results, else first. */
  const defaultIdx = useMemo(() => {
    const live = stages.findIndex(s => s.matches.some(m => m.status === 'in_progress'));
    if (live >= 0) return live;
    let last = 0;
    stages.forEach((s, i) => { if (s.matches.some(m => m.status === 'completed')) last = i; });
    return last;
  }, [stages]);

  const [range, setRange] = useState<[number, number]>([defaultIdx, defaultIdx]);
  const [follow, setFollow] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: 'l' | 'r' | 'move'; grabOffset: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Clamp range if stage count changes (e.g. realtime updates)
  useEffect(() => {
    setRange(([lo, hi]) => [
      Math.min(Math.max(lo, 0), Math.max(N - 1, 0)),
      Math.min(Math.max(hi, 0), Math.max(N - 1, 0)),
    ]);
  }, [N]);

  const stageAt = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(N - 1, Math.floor((clientX - r.left) / r.width * N)));
  };

  const startDrag = (mode: 'l' | 'r' | 'move') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { mode, grabOffset: mode === 'move' ? stageAt(e.clientX) - range[0] : 0 };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const i = stageAt(e.clientX);
      setRange(([lo, hi]) => {
        if (drag.mode === 'l') {
          const nl = Math.max(Math.min(Math.max(i, hi - (MAXW - 1)), hi), 0);
          return nl === lo ? [lo, hi] : [nl, hi];
        }
        if (drag.mode === 'r') {
          const nh = Math.min(Math.max(Math.min(i, lo + (MAXW - 1)), lo), N - 1);
          return nh === hi ? [lo, hi] : [lo, nh];
        }
        const w = hi - lo;
        const nl = Math.min(Math.max(i - drag.grabOffset, 0), N - 1 - w);
        return nl === lo ? [lo, hi] : [nl, nl + w];
      });
    };
    const onUp = () => { dragRef.current = null; setDragging(false); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, N]);

  const onTrackTap = (e: React.PointerEvent) => {
    // Slide the window (keep width) to the tapped stage
    const i = stageAt(e.clientX);
    setRange(([lo, hi]) => {
      const w = hi - lo;
      const nl = Math.min(Math.max(i - Math.floor(w / 2), 0), N - 1 - w);
      return [nl, nl + w];
    });
  };

  if (koMatches.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
        Knockout bracket not yet drawn.
      </div>
    );
  }

  const [lo, hi] = range;
  const n = hi - lo + 1;
  const density: Density = n === 1 ? 'lg' : n === 2 ? 'md' : 'sm';
  const visible = stages.slice(lo, hi + 1);
  const unit = density === 'lg' ? 132 : density === 'md' ? 96 : 64;
  const bodyH = Math.max((visible[0]?.matches.length ?? 1) * unit, 320);

  /* Champion */
  const finalStage = stages[stages.length - 1];
  const finalMatch = finalStage?.matches[0];
  let champion: string | null = null;
  if (finalMatch?.status === 'completed' && finalMatch.result?.winner_team_id) {
    champion = teamLabel(teamsById.get(finalMatch.result.winner_team_id), profilesById);
  }

  const followedTeam = follow ? teamsById.get(follow) : undefined;

  return (
    <div>
      {/* ── Stage selector rail ── */}
      <div style={{ padding: '4px 18px 0', userSelect: 'none' }}>
        <div style={{ display: 'flex', marginBottom: 6 }}>
          {stages.map((s, i) => (
            <div key={s.num} style={{
              flex: 1, textAlign: 'center', fontFamily: FONT, fontSize: 11.5, fontWeight: 700,
              letterSpacing: '.04em',
              color: i >= lo && i <= hi ? 'white' : 'rgba(255,255,255,.35)',
              transition: 'color .18s ease',
            }}>{s.code}</div>
          ))}
        </div>
        <div
          ref={trackRef}
          onPointerDown={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest('[data-win]')) return;
            onTrackTap(e);
          }}
          style={{
            position: 'relative', height: 48, background: 'rgba(148,178,205,.10)',
            borderRadius: 15, display: 'flex', touchAction: 'none',
          }}
        >
          {/* window */}
          <div
            data-win
            onPointerDown={(e) => {
              const t = e.target as HTMLElement;
              if (t.closest('[data-handle]')) return;
              startDrag('move')(e);
            }}
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${(lo / N) * 100}%`, width: `${(n / N) * 100}%`,
              background: dragging ? 'rgba(222,235,245,.22)' : 'rgba(222,235,245,.15)',
              borderRadius: 15, zIndex: 0,
              transition: dragging ? 'none' : 'left .16s ease, width .16s ease',
              cursor: dragging ? 'grabbing' : 'grab',
            }}
          >
            <Handle side="l" onPointerDown={startDrag('l')} />
            <Handle side="r" onPointerDown={startDrag('r')} />
          </div>
          {/* glyph cells */}
          {stages.map((s, i) => {
            const sel = i >= lo && i <= hi;
            const isFinal = i === stages.length - 1;
            return (
              <div key={s.num} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', zIndex: 1,
              }}>
                {isFinal ? (
                  <svg width="19" height="19" viewBox="0 0 24 24" style={{ opacity: sel ? 1 : 0.5, transition: 'opacity .18s ease' }}>
                    <path d="M7 4h10v5a5 5 0 0 1-10 0V4zM7 5H4.5c0 3 1.2 4.6 3 5M17 5h2.5c0 3-1.2 4.6-3 5M12 14v3m-3.5 3h7m-5.5-3h4l.8 3H7.7l.8-3z"
                      fill="none" stroke="#deebf5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3.5, width: '42%' }}>
                    {Array.from({ length: Math.min(s.matches.length, 4) }).map((_, k) => (
                      <span key={k} style={{
                        display: 'block', height: 3.2, borderRadius: 2,
                        background: sel ? 'rgba(238,244,249,.95)' : 'rgba(222,235,245,.45)',
                        transition: 'background .18s ease',
                      }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,.35)',
          textAlign: 'center', padding: '5px 0 2px', letterSpacing: '.03em',
        }}>
          drag ‹ › to resize · drag the middle to slide
        </div>
      </div>

      {/* ── Follow banner ── */}
      {follow && followedTeam && (
        <div style={{
          margin: '4px 18px 2px', padding: '7px 12px', borderRadius: 11,
          background: 'rgba(205,255,101,.12)', border: '1px solid rgba(205,255,101,.25)',
          fontFamily: FONT, fontSize: 11, color: XP.lime,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          ⚡ Following <b>{teamLabel(followedTeam, profilesById)}</b>
          <span onClick={() => setFollow(null)} style={{ marginLeft: 'auto', cursor: 'pointer', opacity: .7, fontWeight: 900 }}>✕</span>
        </div>
      )}

      {/* ── Bracket canvas ── */}
      <div style={{ display: 'flex', padding: '10px 0 4px' }}>
        {lo > 0 && (
          <PeekCol stage={stages[lo - 1]} side="l" density={density} bodyH={bodyH}
            {...{ meUserId, teamsById, profilesById, follow, setFollow }} />
        )}
        {visible.map((stage, ci) => (
          <StageCol
            key={stage.num}
            stage={stage}
            density={density}
            bodyH={bodyH}
            linked={ci < visible.length - 1 || hi < N - 1}
            hasPrev={ci > 0 || lo > 0}
            isFinalStage={lo + ci === stages.length - 1}
            champion={champion}
            bronzeMatches={lo + ci === stages.length - 1 && density !== 'sm' ? bronzeMatches : []}
            {...{ meUserId, teamsById, profilesById, follow, setFollow }}
          />
        ))}
        {hi < N - 1 && (
          <PeekCol stage={stages[hi + 1]} side="r" density={density} bodyH={bodyH}
            {...{ meUserId, teamsById, profilesById, follow, setFollow }} />
        )}
      </div>
    </div>
  );
}

function Handle({ side, onPointerDown }: { side: 'l' | 'r'; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      data-handle
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute', top: 0, bottom: 0, width: 17,
        [side === 'l' ? 'left' : 'right']: 0,
        background: '#f4f8fb', zIndex: 3,
        borderRadius: side === 'l' ? '15px 0 0 15px' : '0 15px 15px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'ew-resize', touchAction: 'none',
      } as React.CSSProperties}
    >
      {/* fat invisible touch target */}
      <div style={{ position: 'absolute', inset: -9 }} />
      <span style={{
        color: '#16222c', fontSize: 13, fontWeight: 900, lineHeight: 1,
        pointerEvents: 'none', fontFamily: '-apple-system, sans-serif',
      }}>{side === 'l' ? '‹' : '›'}</span>
    </div>
  );
}

/* ── Columns ── */

interface ColCtx {
  meUserId: string;
  teamsById: Map<string, TTeamRow>;
  profilesById: Map<string, ProfileLite>;
  follow: string | null;
  setFollow: (id: string | null) => void;
}

function StageCol({
  stage, density, bodyH, linked, hasPrev, isFinalStage, champion, bronzeMatches,
  meUserId, teamsById, profilesById, follow, setFollow,
}: ColCtx & {
  stage: Stage; density: Density; bodyH: number;
  linked: boolean; hasPrev: boolean; isFinalStage: boolean;
  champion: string | null; bronzeMatches: TMatchRow[];
}) {
  const ms = stage.matches;
  const ctx = { meUserId, teamsById, profilesById, follow, setFollow };
  return (
    <div style={{ flex: 1, minWidth: 0, padding: density === 'sm' ? '0 5px' : '0 7px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: bodyH, position: 'relative' }}>
        {ms.length === 1 ? (
          <PairWrap linked={linked} onPath={isOnPath(ms[0], follow)} single>
            <Slot hasPrev={hasPrev}><MatchCard m={ms[0]} density={density} {...ctx} /></Slot>
          </PairWrap>
        ) : (
          chunk2(ms).map((pair, i) => (
            <PairWrap key={i} linked={linked} onPath={pair.some(m => isOnPath(m, follow))}>
              {pair.map(m => (
                <Slot key={m.id} hasPrev={hasPrev}><MatchCard m={m} density={density} {...ctx} /></Slot>
              ))}
            </PairWrap>
          ))
        )}
      </div>
      {isFinalStage && (
        <div style={{
          marginTop: 12, borderRadius: 13, textAlign: 'center',
          border: '1px solid rgba(245,196,81,.22)',
          background: 'linear-gradient(180deg, rgba(245,196,81,.08), rgba(245,196,81,.02))',
          padding: density === 'sm' ? '8px 6px' : '11px 8px',
        }}>
          <div style={{
            fontFamily: FONT, fontSize: density === 'sm' ? 7 : 8.5, letterSpacing: '.2em',
            color: '#f5c451', fontWeight: 700, textTransform: 'uppercase',
          }}>🏆 Champion</div>
          <div style={{
            fontFamily: FONT, marginTop: 3,
            ...(champion
              ? { fontSize: density === 'sm' ? 9 : 12, fontWeight: 900, fontStyle: 'italic' as const, textTransform: 'uppercase' as const, color: '#f5c451' }
              : { fontSize: density === 'sm' ? 8.5 : 10, fontWeight: 600, color: 'rgba(255,255,255,.4)' }),
          }}>{champion ?? 'TBD'}</div>
        </div>
      )}
      {bronzeMatches.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontFamily: FONT, fontSize: 9, fontWeight: 900, fontStyle: 'italic',
            textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.5)',
            padding: '0 2px 6px',
          }}>🥉 Bronze</div>
          {bronzeMatches.map(m => <MatchCard key={m.id} m={m} density={density} {...ctx} />)}
        </div>
      )}
    </div>
  );
}

function PeekCol({
  stage, side, density, bodyH, meUserId, teamsById, profilesById, follow, setFollow,
}: ColCtx & { stage: Stage; side: 'l' | 'r'; density: Density; bodyH: number }) {
  const ms = stage.matches;
  const ctx = { meUserId, teamsById, profilesById, follow, setFollow };
  return (
    <div style={{ flex: '0 0 20px', overflow: 'hidden' }}>
      <div style={{ width: 170, marginLeft: side === 'l' ? -150 : 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: bodyH }}>
          {chunk2(ms).map((pair, i) => (
            <PairWrap key={i} linked={side === 'l'} onPath={false}>
              {pair.map(m => (
                <Slot key={m.id} hasPrev={false}><MatchCard m={m} density={density} peek {...ctx} /></Slot>
              ))}
            </PairWrap>
          ))}
        </div>
      </div>
    </div>
  );
}

function chunk2<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

function isOnPath(m: TMatchRow, follow: string | null): boolean {
  return !!follow && (m.team_a_id === follow || m.team_b_id === follow);
}

function PairWrap({ children, linked, onPath, single }: {
  children: React.ReactNode; linked: boolean; onPath: boolean; single?: boolean;
}) {
  const lineCol = onPath ? 'rgba(205,255,101,.6)' : LINE;
  return (
    <div style={{ flex: single ? 1 : 2, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {children}
      {linked && !single && (
        <>
          {/* elbow spine */}
          <div style={{
            position: 'absolute', right: -8, top: '25%', bottom: '25%', width: 8,
            border: `1.5px solid ${lineCol}`, borderLeft: 'none',
            borderRadius: '0 8px 8px 0', pointerEvents: 'none',
          }} />
          {/* tee into next column */}
          <div style={{
            position: 'absolute', right: -14, top: '50%', width: 6, height: 1.5,
            background: lineCol, pointerEvents: 'none',
          }} />
        </>
      )}
    </div>
  );
}

function Slot({ children, hasPrev }: { children: React.ReactNode; hasPrev: boolean }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative', minHeight: 0, padding: '5px 0' }}>
      {hasPrev && (
        <div style={{
          position: 'absolute', left: -8, top: '50%', width: 8, height: 1.5,
          background: LINE, pointerEvents: 'none',
        }} />
      )}
      {children}
    </div>
  );
}

/* ── Match card ── */

function MatchCard({
  m, density, peek, meUserId, teamsById, profilesById, follow, setFollow,
}: ColCtx & { m: TMatchRow; density: Density; peek?: boolean }) {
  const live = m.status === 'in_progress';
  const onPath = isOnPath(m, follow);
  const isMine = [m.team_a_id, m.team_b_id].some(tid => {
    const t = tid ? teamsById.get(tid) : undefined;
    return t && (t.player1_id === meUserId || t.player2_id === meUserId);
  });

  const ring = live
    ? '0 0 0 1.5px rgba(205,255,101,.5), 0 0 18px rgba(205,255,101,.07)'
    : onPath
    ? '0 0 0 1.5px rgba(205,255,101,.55)'
    : '0 1px 0 rgba(0,0,0,.15)';

  return (
    <div style={{
      background: CARD, borderRadius: density === 'sm' ? 11 : 13,
      overflow: 'hidden', width: '100%', boxShadow: ring,
      transition: 'box-shadow .2s ease',
    }}>
      {density !== 'sm' && (
        <div style={{
          background: CARD_HD, padding: density === 'md' ? '5px 10px' : '6px 12px',
          fontFamily: FONT, fontSize: density === 'md' ? 9 : 10, fontWeight: 600,
          color: 'rgba(255,255,255,.55)', letterSpacing: '.02em',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{whenLabel(m)}</span>
          {live ? (
            <span style={{
              color: XP.lime, display: 'inline-flex', alignItems: 'center', gap: 4,
              fontWeight: 700, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase',
            }}>
              <span className="xp-live-dot" /> Live
            </span>
          ) : isMine && density === 'lg' ? (
            <span style={{
              color: XP.lime, fontWeight: 700, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase',
            }}>You</span>
          ) : null}
        </div>
      )}
      <TeamLine m={m} side="a" density={density} peek={peek} {...{ teamsById, profilesById, setFollow, follow }} />
      <div style={{ height: 1, background: 'rgba(148,178,205,.08)' }} />
      <TeamLine m={m} side="b" density={density} peek={peek} {...{ teamsById, profilesById, setFollow, follow }} />
    </div>
  );
}

function TeamLine({
  m, side, density, peek, teamsById, profilesById, follow, setFollow,
}: {
  m: TMatchRow; side: 'a' | 'b'; density: Density; peek?: boolean;
  teamsById: Map<string, TTeamRow>; profilesById: Map<string, ProfileLite>;
  follow: string | null; setFollow: (id: string | null) => void;
}) {
  const tid = side === 'a' ? m.team_a_id : m.team_b_id;
  const team = tid ? teamsById.get(tid) : undefined;
  const won = setsWon(m, side);
  const otherWon = setsWon(m, side === 'a' ? 'b' : 'a');
  const isWinner = !!m.result?.winner_team_id && m.result.winner_team_id === tid;
  const isLoser = !!m.result?.winner_team_id && !!tid && m.result.winner_team_id !== tid;

  const p1 = team?.player1_id ? profilesById.get(team.player1_id) : undefined;
  const nameFull = teamLabel(team, profilesById);
  const nameCode = team
    ? (firstName(p1?.display_name ?? team.team_name) || 'TBD').slice(0, 3).toUpperCase()
    : 'TBD';
  const name = density === 'sm' ? nameCode : nameFull;

  const badgeSize = density === 'lg' ? 26 : density === 'md' ? 21 : 18;
  const initials = team
    ? `${(p1?.display_name ?? 'P')[0] ?? 'P'}${team.player2_id ? (profilesById.get(team.player2_id)?.display_name ?? 'P')[0] ?? '' : ''}`.toUpperCase()
    : '';

  const sets = setsOf(m);
  const showSetDetail = density === 'lg' && sets.length > 0;

  return (
    <div
      onClick={(e) => {
        if (!tid || peek) return;
        e.stopPropagation();
        setFollow(follow === tid ? null : tid);
      }}
      style={{
        display: 'flex', alignItems: 'center',
        gap: density === 'sm' ? 6 : density === 'md' ? 7 : 9,
        padding: density === 'sm' ? '6px 8px' : density === 'md' ? '6.5px 10px' : '8px 12px',
        opacity: isLoser ? 0.55 : 1,
        cursor: tid ? 'pointer' : 'default',
      }}
    >
      {/* circular badge with team-colour sliver */}
      <span style={{
        width: badgeSize, height: badgeSize, borderRadius: '50%', flexShrink: 0,
        background: team ? 'rgba(255,255,255,.09)' : 'rgba(148,178,205,.12)',
        position: 'relative', overflow: 'hidden',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {team && (
          <span style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '34%',
            background: teamColor(team.id), opacity: .85,
          }} />
        )}
        {density !== 'sm' && team && (
          <b style={{
            position: 'relative', zIndex: 1, fontFamily: FONT, fontWeight: 900,
            fontSize: badgeSize * 0.33, color: isWinner ? 'white' : 'rgba(255,255,255,.75)',
          }}>{initials}</b>
        )}
      </span>

      <span style={{
        flex: 1, minWidth: 0, fontFamily: FONT,
        fontSize: density === 'sm' ? 11 : density === 'md' ? 11.5 : 13.5,
        fontWeight: density === 'sm' ? 700 : 600,
        letterSpacing: density === 'sm' ? '.03em' : undefined,
        color: team ? 'white' : 'rgba(255,255,255,.35)',
        fontStyle: team ? undefined : 'italic',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        lineHeight: 1.1,
      }}>{team ? name : (side === 'b' && !m.team_b_id ? 'TBD' : name)}</span>

      {showSetDetail && (
        <span style={{ display: 'flex', gap: 3, fontFamily: MONO, marginRight: 2 }}>
          {sets.map((s, i) => {
            const mine = side === 'a' ? s.a : s.b;
            const theirs = side === 'a' ? s.b : s.a;
            const liveSet = m.status === 'in_progress' && i === sets.length - 1;
            const wonSet = mine > theirs;
            return (
              <span key={i} style={{
                minWidth: 18, height: 18, borderRadius: 5,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
                background: isWinner && wonSet ? 'rgba(205,255,101,.14)' : 'rgba(148,178,205,.09)',
                color: liveSet ? XP.lime : isWinner && wonSet ? XP.lime : 'rgba(255,255,255,.55)',
                outline: liveSet ? '1px solid rgba(205,255,101,.4)' : 'none',
              }}>{mine}</span>
            );
          })}
        </span>
      )}

      <span style={{
        fontFamily: MONO, fontWeight: 700,
        fontSize: density === 'sm' ? 11.5 : density === 'md' ? 12.5 : 14,
        minWidth: 14, textAlign: 'right',
        color: won == null ? 'rgba(255,255,255,.3)' : isWinner ? XP.lime : isLoser ? 'rgba(255,255,255,.5)' : 'white',
      }}>{won == null ? '–' : won}</span>
    </div>
  );
}

/* ─── Groups: standings tables per group_id ──────────────────────── */
function GroupsView({
  matches, teamsById, profilesById, meUserId,
}: {
  matches: TMatchRow[];
  teamsById: Map<string, TTeamRow>;
  profilesById: Map<string, ProfileLite>;
  meUserId: string;
}) {
  const grouped = useMemo(() => {
    const teamsByGroup = new Map<string, TTeamRow[]>();
    for (const t of teamsById.values()) {
      const g = t.group_id ?? 'A';
      if (!teamsByGroup.has(g)) teamsByGroup.set(g, []);
      teamsByGroup.get(g)!.push(t);
    }
    return teamsByGroup;
  }, [teamsById]);

  const standingsForTeam = (teamId: string) => {
    let wins = 0, losses = 0, pf = 0, pa = 0, played = 0, hasLive = false;
    for (const m of matches) {
      if (m.team_a_id !== teamId && m.team_b_id !== teamId) continue;
      if (m.status === 'in_progress') hasLive = true;
      if (m.status !== 'completed' || !m.result) continue;
      played += 1;
      const myA = m.team_a_id === teamId;
      const myScore  = myA ? (m.result.team_a_score ?? 0) : (m.result.team_b_score ?? 0);
      const oppScore = myA ? (m.result.team_b_score ?? 0) : (m.result.team_a_score ?? 0);
      pf += Number(myScore); pa += Number(oppScore);
      if (m.result.winner_team_id === teamId) wins += 1;
      else if (m.result.winner_team_id) losses += 1;
    }
    return { played, wins, losses, diff: pf - pa, hasLive };
  };

  const sortedGroups = Array.from(grouped.keys()).sort();
  if (sortedGroups.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
        Groups not drawn yet.
      </div>
    );
  }

  return (
    <>
      {sortedGroups.map((g) => {
        const teams = grouped.get(g)!;
        const rows = teams.map((t) => {
          const s = standingsForTeam(t.id);
          const isMe = t.player1_id === meUserId || t.player2_id === meUserId;
          return { team: t, ...s, isMe };
        }).sort((x, y) => {
          if (y.wins !== x.wins) return y.wins - x.wins;
          if (y.diff !== x.diff) return y.diff - x.diff;
          return 0;
        });
        const hasLive = rows.some(r => r.hasLive);

        return (
          <div key={g} style={{ marginBottom: 16 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '0 18px 8px',
            }}>
              <div style={{
                fontFamily: "'Lexend', sans-serif", fontSize: 14, fontWeight: 900, fontStyle: 'italic',
                textTransform: 'uppercase', letterSpacing: '-.01em',
              }}>Group {g}</div>
              {hasLive && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: "'Lexend', sans-serif", fontSize: 9, fontWeight: 900,
                  fontStyle: 'italic', letterSpacing: '.16em', textTransform: 'uppercase',
                  color: XP.lime,
                }}>
                  <span className="xp-live-dot" /> Live
                </div>
              )}
            </div>
            <div style={{
              margin: '0 14px',
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 14, overflow: 'hidden',
            }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '24px 1fr 28px 28px 36px',
                padding: '8px 14px',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 9, color: 'rgba(255,255,255,.45)',
                letterSpacing: '.08em', textTransform: 'uppercase',
              }}>
                <span>#</span><span>Team</span>
                <span style={{ textAlign: 'center' }}>W</span>
                <span style={{ textAlign: 'center' }}>L</span>
                <span style={{ textAlign: 'right' }}>±</span>
              </div>
              {rows.map((r, i) => (
                <div key={r.team.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr 28px 28px 36px',
                  alignItems: 'center', padding: '10px 14px',
                  background: r.isMe ? 'rgba(205,255,101,.08)' : 'transparent',
                  borderTop: '1px solid rgba(255,255,255,.04)',
                }}>
                  <span style={{
                    fontFamily: "'Lexend', sans-serif", fontSize: 11, fontWeight: 900, fontStyle: 'italic',
                    color: i < 2 ? XP.lime : 'rgba(255,255,255,.4)',
                  }}>{i + 1}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontFamily: "'Lexend', sans-serif", fontSize: 11.5, fontWeight: 800, fontStyle: 'italic',
                      textTransform: 'uppercase', letterSpacing: '.01em',
                      color: r.isMe ? XP.lime : 'white',
                    }}>{teamLabel(r.team, profilesById)}</span>
                    {r.hasLive && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: XP.lime, color: XP.navy, padding: '1px 5px', borderRadius: 4,
                        fontFamily: "'Lexend', sans-serif", fontSize: 7.5, fontWeight: 900,
                        letterSpacing: '.1em', textTransform: 'uppercase',
                      }}>● Live</span>
                    )}
                  </span>
                  <span style={{
                    textAlign: 'center',
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 12, fontWeight: 600,
                  }}>{r.wins}</span>
                  <span style={{
                    textAlign: 'center',
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.55)',
                  }}>{r.losses}</span>
                  <span style={{
                    textAlign: 'right',
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 11, fontWeight: 600,
                    color: r.diff > 0 ? XP.lime
                          : r.diff < 0 ? '#ff8a6b' : 'rgba(255,255,255,.5)',
                  }}>{r.diff > 0 ? `+${r.diff}` : r.diff}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div style={{
        padding: '4px 20px',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10, color: 'rgba(255,255,255,.4)',
      }}>↳ Top 2 from each group advance to knockout.</div>
    </>
  );
}
