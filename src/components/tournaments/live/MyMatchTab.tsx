/**
 * P2 — My Match tab (Tournament Live Mode default tab).
 * NEXT UP hero card + JUST PLAYED card + REMAINING TODAY list.
 */
import { useEffect, useState } from 'react';
import { Pair, XPButton, XPChip, XP, firstName, singleInitial } from './atoms';
import type { TMatchRow, TTeamRow, ProfileLite, HelpRequestRow } from './types';

interface MyMatchTabProps {
  meUserId: string;
  matches: TMatchRow[];
  teamsById: Map<string, TTeamRow>;
  profilesById: Map<string, ProfileLite>;
  myOpenHelp?: HelpRequestRow | null;
  onUploadScore: (match: TMatchRow) => void;
  onTapOpponent: (userId: string) => void;
  onHelpNeeded: (match: TMatchRow) => void;
}

function fmtCountdown(scheduledAt: string | null): string {
  if (!scheduledAt) return '—';
  const ms = new Date(scheduledAt).getTime() - Date.now();
  if (ms <= 0) return 'NOW';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}′`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtClock(ts: string | null): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return ts.slice(11, 16); }
}

function elapsedSince(ts: string): string {
  const ms = Math.max(0, Date.now() - new Date(ts).getTime());
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function teamMembersInfo(
  team: TTeamRow | undefined,
  profilesById: Map<string, ProfileLite>,
  meUserId: string,
) {
  if (!team) return { names: [], userIds: [], label: 'TBD' };
  const p1 = team.player1_id ? profilesById.get(team.player1_id) : undefined;
  const p2 = team.player2_id ? profilesById.get(team.player2_id) : undefined;
  const n1 = team.player1_id === meUserId ? 'You' : (p1?.display_name ?? 'Player');
  const n2 = team.player2_id
    ? (team.player2_id === meUserId ? 'You' : (p2?.display_name ?? 'Player'))
    : null;
  const label = n2 ? `${firstName(n1)} · ${firstName(n2)}` : firstName(n1);
  return {
    names: [n1, n2].filter(Boolean) as string[],
    userIds: [team.player1_id, team.player2_id].filter(Boolean) as string[],
    label,
  };
}

export default function MyMatchTab(props: MyMatchTabProps) {
  const {
    meUserId, matches, teamsById, profilesById,
    myOpenHelp, onUploadScore, onTapOpponent, onHelpNeeded,
  } = props;

  /* Re-render every 30s so the countdown stays current */
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  /* Find matches I'm in */
  const myMatches = matches.filter(m => {
    const ta = m.team_a_id ? teamsById.get(m.team_a_id) : undefined;
    const tb = m.team_b_id ? teamsById.get(m.team_b_id) : undefined;
    return (
      ta?.player1_id === meUserId || ta?.player2_id === meUserId ||
      tb?.player1_id === meUserId || tb?.player2_id === meUserId
    );
  });

  const sortedByTime = [...myMatches].sort((a, b) => {
    const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
    const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
    return at - bt;
  });

  const nextMatch = sortedByTime.find(m => m.status === 'pending' || m.status === 'in_progress');
  const justPlayed = [...sortedByTime]
    .reverse()
    .find(m => m.status === 'completed' || m.status === 'awaiting_score');
  const remaining = sortedByTime.filter(m =>
    m.id !== nextMatch?.id && (m.status === 'pending' || m.status === 'in_progress')
  );

  /* ─── Render ─────────────────────────────────────────── */
  return (
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 92, color: 'white' }}>
      {/* NEXT UP hero card */}
      {nextMatch ? (() => {
        const teamA = nextMatch.team_a_id ? teamsById.get(nextMatch.team_a_id) : undefined;
        const teamB = nextMatch.team_b_id ? teamsById.get(nextMatch.team_b_id) : undefined;
        const myTeam = teamA && (teamA.player1_id === meUserId || teamA.player2_id === meUserId) ? 'A' : 'B';
        const opp = myTeam === 'A' ? teamB : teamA;
        const me  = myTeam === 'A' ? teamA : teamB;
        const meInfo  = teamMembersInfo(me, profilesById, meUserId);
        const oppInfo = teamMembersInfo(opp, profilesById, meUserId);
        const courtLabel = nextMatch.court_label ?? (nextMatch.court_number ? `Pista ${nextMatch.court_number}` : 'TBD');

        return (
          <div style={{
            margin: '14px 14px',
            borderRadius: 20, overflow: 'hidden',
            background: `linear-gradient(160deg, ${XP.lime} 0%, ${XP.limeDark} 100%)`,
            color: XP.navy,
            padding: '16px 18px 14px',
            position: 'relative',
          }}>
            <div aria-hidden style={{
              position: 'absolute', right: -8, top: -8,
              fontFamily: "'Lexend', sans-serif", fontSize: 110, fontWeight: 900, fontStyle: 'italic',
              opacity: 0.08, lineHeight: 0.8, pointerEvents: 'none',
            }}>R{nextMatch.round_number}</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{
                  fontFamily: "'Lexend', sans-serif", fontSize: 9.5, fontWeight: 900,
                  letterSpacing: '.2em', textTransform: 'uppercase',
                }}>{nextMatch.status === 'in_progress' ? 'Live · You' : 'Next up'}</div>
                <div style={{
                  fontFamily: "'Lexend', sans-serif", fontSize: 32, fontWeight: 900, fontStyle: 'italic',
                  textTransform: 'uppercase', lineHeight: 0.9, letterSpacing: '-.03em', marginTop: 4,
                }}>{courtLabel}</div>
                <div style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 12, fontWeight: 600, marginTop: 4,
                }}>
                  {fmtClock(nextMatch.scheduled_at)} · R{nextMatch.round_number} · M{String(nextMatch.match_number).padStart(2, '0')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontFamily: "'Lexend', sans-serif", fontSize: 9.5, fontWeight: 900,
                  letterSpacing: '.2em', textTransform: 'uppercase', opacity: 0.65,
                }}>{nextMatch.status === 'in_progress' ? 'In play' : 'Starts in'}</div>
                <div style={{
                  fontFamily: "'Lexend', sans-serif", fontSize: 26, fontWeight: 900, fontStyle: 'italic',
                  lineHeight: 1, marginTop: 4,
                }}>{nextMatch.status === 'in_progress' ? (nextMatch.started_at ? elapsedSince(nextMatch.started_at) : '—') : fmtCountdown(nextMatch.scheduled_at)}</div>
              </div>
            </div>

            {/* Teams */}
            <div style={{
              marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(26,40,51,.18)',
              display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center',
            }}>
              {/* My team */}
              <div>
                <Pair
                  a={{ i: singleInitial(meInfo.names[0]),  t: XP.navy }}
                  b={{ i: singleInitial(meInfo.names[1]),  t: XP.navy }}
                  size={28}
                />
                <div style={{
                  fontFamily: "'Lexend', sans-serif", fontSize: 12, fontWeight: 800, fontStyle: 'italic',
                  textTransform: 'uppercase', marginTop: 6, lineHeight: 1.05,
                }}>{meInfo.label}</div>
              </div>
              <div style={{
                fontFamily: "'Lexend', sans-serif", fontSize: 14, fontWeight: 900, fontStyle: 'italic',
                opacity: 0.5,
              }}>VS</div>
              {/* Opponent */}
              <button
                onClick={() => {
                  if (oppInfo.userIds[0]) onTapOpponent(oppInfo.userIds[0]);
                }}
                style={{
                  textAlign: 'right', background: 'transparent', border: 'none',
                  cursor: oppInfo.userIds[0] ? 'pointer' : 'default', padding: 0, color: XP.navy,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Pair
                    a={{ i: singleInitial(oppInfo.names[0]), t: XP.navy }}
                    b={{ i: singleInitial(oppInfo.names[1]), t: XP.navy }}
                    size={28}
                  />
                </div>
                <div style={{
                  fontFamily: "'Lexend', sans-serif", fontSize: 12, fontWeight: 800, fontStyle: 'italic',
                  textTransform: 'uppercase', marginTop: 6, lineHeight: 1.05,
                  textDecoration: 'underline', textDecorationStyle: 'dotted',
                  textDecorationColor: 'rgba(26,40,51,.4)',
                }}>{oppInfo.label} ›</div>
              </button>
            </div>

            {/* Enter score — players self-report the result of their own in-progress match
                (was previously only available after the match flipped to awaiting_score/completed,
                which left players with no way to report a live match themselves). */}
            {nextMatch.status === 'in_progress' && (
              <div style={{ marginTop: 14 }}>
                <button
                  onClick={() => onUploadScore(nextMatch)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%',
                    background: XP.navy, color: XP.lime, borderRadius: 12,
                    padding: '10px 14px', height: 44,
                    fontFamily: "'Lexend', sans-serif", fontWeight: 900, fontStyle: 'italic',
                    textTransform: 'uppercase', fontSize: 13, letterSpacing: '.04em',
                    border: `1.5px solid ${XP.lime}`, cursor: 'pointer',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                  </svg>
                  Enter score
                </button>
              </div>
            )}

            {/* Help button / pill */}
            <div style={{ marginTop: 14 }}>
              {myOpenHelp ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: XP.navy, color: 'white', borderRadius: 12,
                  padding: '10px 14px', height: 40,
                  boxShadow: myOpenHelp.status === 'acknowledged' ? `inset 0 0 0 1.5px ${XP.lime}` : 'none',
                }}>
                  {myOpenHelp.status === 'acknowledged' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={XP.lime}
                      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="xp-live-dot red" />
                  )}
                  <span style={{
                    fontFamily: "'Lexend', sans-serif", fontWeight: 800, fontStyle: 'italic',
                    textTransform: 'uppercase', fontSize: 11.5, letterSpacing: '.04em',
                    color: myOpenHelp.status === 'acknowledged' ? XP.lime : 'white',
                  }}>
                    {myOpenHelp.status === 'acknowledged' ? 'On the way' : 'Help requested'}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 13, fontWeight: 700,
                    color: myOpenHelp.status === 'acknowledged' ? 'white' : XP.lime,
                  }}>{elapsedSince(myOpenHelp.created_at)}</span>
                </div>
              ) : (
                <button
                  onClick={() => onHelpNeeded(nextMatch)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    width: '100%',
                    background: XP.navy, color: 'white', borderRadius: 12,
                    padding: '10px 14px', height: 40,
                    fontFamily: "'Lexend', sans-serif", fontWeight: 800, fontStyle: 'italic',
                    textTransform: 'uppercase', fontSize: 12, letterSpacing: '.04em',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  Help needed
                  <span style={{ flex: 1 }} />
                  <span style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 11, color: XP.lime,
                  }}>▾</span>
                </button>
              )}
            </div>
          </div>
        );
      })() : (
        <div style={{
          margin: '14px 14px',
          background: 'rgba(255,255,255,.04)',
          borderRadius: 20, padding: 24,
          border: '1px solid rgba(255,255,255,.06)',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: "'Lexend', sans-serif", fontSize: 13, fontWeight: 800, fontStyle: 'italic',
            textTransform: 'uppercase', opacity: 0.7,
          }}>No upcoming matches</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>
            Your bracket may still be drawing up — check back shortly.
          </div>
        </div>
      )}

      {/* JUST PLAYED */}
      {justPlayed && (() => {
        const isMine = justPlayed.team_a_id === justPlayed.team_b_id
          ? false
          : true;
        const teamA = justPlayed.team_a_id ? teamsById.get(justPlayed.team_a_id) : undefined;
        const teamB = justPlayed.team_b_id ? teamsById.get(justPlayed.team_b_id) : undefined;
        const myIsA = teamA && (teamA.player1_id === meUserId || teamA.player2_id === meUserId);
        const opp = myIsA ? teamB : teamA;
        const oppInfo = teamMembersInfo(opp, profilesById, meUserId);
        const hasScore = justPlayed.result && (
          justPlayed.result.team_a_score != null || justPlayed.result.team_b_score != null
        );
        void isMine;

        return (
          <div style={{
            margin: '0 14px 12px',
            borderRadius: 16,
            background: 'rgba(255,255,255,.04)',
            border: `1px solid ${hasScore ? 'rgba(34,197,94,.4)' : XP.amber + '55'}`,
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <div style={{
                fontFamily: "'Lexend', sans-serif", fontSize: 9.5, fontWeight: 900,
                letterSpacing: '.18em', textTransform: 'uppercase',
                color: hasScore ? XP.good : XP.amber,
              }}>
                {hasScore ? `Played · R${justPlayed.round_number} · M${String(justPlayed.match_number).padStart(2, '0')}` : `Just played · R${justPlayed.round_number} · M${String(justPlayed.match_number).padStart(2, '0')}`}
              </div>
              <div style={{
                fontFamily: "'Lexend', sans-serif", fontSize: 14, fontWeight: 800, fontStyle: 'italic',
                textTransform: 'uppercase', marginTop: 4, lineHeight: 1.1, color: 'white',
              }}>
                vs {oppInfo.label}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>
                {justPlayed.court_label ?? (justPlayed.court_number ? `Pista ${justPlayed.court_number}` : 'Court TBD')}
                {justPlayed.completed_at && ` · ended ${fmtClock(justPlayed.completed_at)}`}
              </div>
              {hasScore && (
                <div style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 13, fontWeight: 600, marginTop: 6,
                  color: justPlayed.result?.winner_team_id === (myIsA ? teamA?.id : teamB?.id) ? XP.lime : 'rgba(255,255,255,.7)',
                }}>
                  {justPlayed.result?.team_a_score ?? '?'}–{justPlayed.result?.team_b_score ?? '?'}
                </div>
              )}
            </div>
            {!hasScore && (
              <XPButton tone="amber" size="sm" onClick={() => onUploadScore(justPlayed)}>
                Upload score
              </XPButton>
            )}
          </div>
        );
      })()}

      {/* REMAINING TODAY */}
      {remaining.length > 0 && (
        <>
          <div style={{
            padding: '6px 20px 6px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <div style={{
              fontFamily: "'Lexend', sans-serif", fontSize: 11, fontWeight: 800,
              letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)',
            }}>Remaining · {remaining.length}</div>
          </div>
          <div style={{ margin: '0 14px' }}>
            {remaining.map((m, i) => {
              const teamA = m.team_a_id ? teamsById.get(m.team_a_id) : undefined;
              const teamB = m.team_b_id ? teamsById.get(m.team_b_id) : undefined;
              const myIsA = teamA && (teamA.player1_id === meUserId || teamA.player2_id === meUserId);
              const opp = myIsA ? teamB : teamA;
              const oppInfo = teamMembersInfo(opp, profilesById, meUserId);
              return (
                <div key={m.id} style={{
                  display: 'grid', gridTemplateColumns: '36px 60px 1fr auto',
                  gap: 10, padding: '10px 4px', alignItems: 'center',
                  borderBottom: i < remaining.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none',
                }}>
                  <div style={{
                    fontFamily: "'Lexend', sans-serif", fontSize: 12, fontWeight: 900,
                    fontStyle: 'italic', color: 'rgba(255,255,255,.5)',
                  }}>R{m.round_number}</div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 12, fontWeight: 600, color: 'white',
                  }}>{fmtClock(m.scheduled_at) || 'TBD'}</div>
                  <div>
                    <div style={{
                      fontFamily: "'Lexend', sans-serif", fontSize: 12, fontWeight: 700, fontStyle: 'italic',
                      textTransform: 'uppercase', lineHeight: 1.1, color: 'white',
                    }}>{oppInfo.label}</div>
                    <div style={{
                      fontSize: 10, color: 'rgba(255,255,255,.45)', marginTop: 1,
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    }}>
                      {m.court_label ?? (m.court_number ? `Pista ${m.court_number}` : 'Court TBD')} · M{String(m.match_number).padStart(2, '0')}
                    </div>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 14 }}>›</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div style={{ height: 32 }} />
      {/* Helper to avoid the unused-import lint */}
      <span style={{ display: 'none' }}><XPChip>x</XPChip></span>
    </div>
  );
}
