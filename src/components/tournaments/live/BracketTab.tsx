/**
 * P4 — Bracket tab.
 * Toggle between Knockout (cards in columns by round) and Groups (standings
 * tables per group_id). Live matches stand out with lime border + glow.
 */
import { useMemo, useState } from 'react';
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

function MatchBox({
  a, b, sa, sb, winner, live,
}: {
  a: string;
  b: string;
  sa?: string | number;
  sb?: string | number;
  winner?: 'a' | 'b' | null;
  live?: boolean;
}) {
  const row = (name: string, score: any, isWin: boolean) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 8px',
      color: isWin ? 'white' : 'rgba(255,255,255,.5)',
      fontFamily: "'Lexend', sans-serif", fontSize: 10, fontWeight: 700, fontStyle: 'italic',
      textTransform: 'uppercase', letterSpacing: '.02em',
    }}>
      <span style={{
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{name}</span>
      <span style={{
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontWeight: 600,
        color: isWin ? XP.lime : 'rgba(255,255,255,.4)',
      }}>{score ?? '—'}</span>
    </div>
  );

  return (
    <div style={{
      width: '100%', borderRadius: 8, overflow: 'hidden', position: 'relative',
      background: 'rgba(255,255,255,.04)',
      border: live ? `1.5px solid ${XP.lime}` : '1px solid rgba(255,255,255,.08)',
      boxShadow: live ? '0 0 16px rgba(205,255,101,.25)' : 'none',
    }}>
      {live && (
        <div style={{
          position: 'absolute', top: -1, right: -1,
          background: XP.lime, color: XP.navy,
          fontFamily: "'Lexend', sans-serif", fontWeight: 900, fontSize: 7,
          letterSpacing: '.1em', textTransform: 'uppercase',
          padding: '2px 5px', borderRadius: '0 8px 0 6px',
        }}>● Live</div>
      )}
      {row(a, sa, winner === 'a')}
      <div style={{ height: 1, background: 'rgba(255,255,255,.06)' }} />
      {row(b, sb, winner === 'b')}
    </div>
  );
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
  void meUserId;

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
        <KnockoutView matches={matches} teamsById={teamsById} profilesById={profilesById} />
      ) : (
        <GroupsView matches={matches} teamsById={teamsById} profilesById={profilesById} meUserId={meUserId} />
      )}
    </div>
  );
}

/* ─── Knockout: columns by round ────────────────────────────────── */
function KnockoutView({
  matches, teamsById, profilesById,
}: {
  matches: TMatchRow[];
  teamsById: Map<string, TTeamRow>;
  profilesById: Map<string, ProfileLite>;
}) {
  const koMatches = matches.filter(m => m.round_type !== 'group' && m.round_type !== 'round_robin');
  if (koMatches.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
        Knockout bracket not yet drawn.
      </div>
    );
  }

  const rounds = Array.from(new Set(koMatches.map(m => m.round_number))).sort((a, b) => a - b);
  const labelFor = (r: number, total: number): string => {
    if (r === total) return 'Final';
    if (r === total - 1) return 'Semis';
    if (r === total - 2) return 'Quarters';
    return `Round ${r}`;
  };
  const total = rounds[rounds.length - 1];

  return (
    <div style={{ padding: '8px 14px' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${rounds.length}, 1fr)`,
        gap: 10, padding: '4px 0 12px',
        fontFamily: "'Lexend', sans-serif", fontSize: 9.5, fontWeight: 900,
        fontStyle: 'italic', letterSpacing: '.14em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,.5)',
      }}>
        {rounds.map((r, i) => (
          <span key={r} style={{ textAlign: i === rounds.length - 1 ? 'right' : i === 0 ? 'left' : 'center' }}>
            {labelFor(r, total)}
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rounds.length}, 1fr)`, gap: 10 }}>
        {rounds.map((r) => {
          const inRound = koMatches.filter(m => m.round_number === r);
          return (
            <div key={r} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {inRound.map((m) => {
                const a = m.team_a_id ? teamsById.get(m.team_a_id) : undefined;
                const b = m.team_b_id ? teamsById.get(m.team_b_id) : undefined;
                const sa = Array.isArray(m.result?.sets)
                  ? m.result.sets.filter((s: any) => (s.team_a ?? s.a) > (s.team_b ?? s.b)).length
                  : m.result?.team_a_score;
                const sb = Array.isArray(m.result?.sets)
                  ? m.result.sets.filter((s: any) => (s.team_b ?? s.b) > (s.team_a ?? s.a)).length
                  : m.result?.team_b_score;
                let winner: 'a' | 'b' | null = null;
                if (m.result?.winner_team_id === m.team_a_id) winner = 'a';
                else if (m.result?.winner_team_id === m.team_b_id) winner = 'b';
                return (
                  <MatchBox
                    key={m.id}
                    a={teamLabel(a, profilesById)}
                    b={teamLabel(b, profilesById)}
                    sa={sa}
                    sb={sb}
                    winner={winner}
                    live={m.status === 'in_progress'}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
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
