/**
 * P3 — Schedule tab.
 * Every match the player has, grouped by round, on a vertical timeline rail.
 * Next match glows lime; completed matches show win/loss with score line.
 */
import { XP, firstName } from './atoms';
import type { TMatchRow, TTeamRow, ProfileLite } from './types';

function fmtClock(ts: string | null): string {
  if (!ts) return 'TBD';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return ts.slice(11, 16); }
}

function oppLabel(
  match: TMatchRow,
  meUserId: string,
  teamsById: Map<string, TTeamRow>,
  profilesById: Map<string, ProfileLite>,
): string {
  const a = match.team_a_id ? teamsById.get(match.team_a_id) : undefined;
  const b = match.team_b_id ? teamsById.get(match.team_b_id) : undefined;
  const myIsA = !!a && (a.player1_id === meUserId || a.player2_id === meUserId);
  const opp = myIsA ? b : a;
  if (!opp) return 'TBD';
  const p1 = opp.player1_id ? profilesById.get(opp.player1_id) : undefined;
  const p2 = opp.player2_id ? profilesById.get(opp.player2_id) : undefined;
  const n1 = p1?.display_name ?? 'P1';
  const n2 = p2?.display_name;
  return n2 ? `${firstName(n1)} · ${firstName(n2)}` : firstName(n1);
}

type RowStatus = 'done' | 'next' | 'pending' | 'issue';
const STATUS_PILL: Record<RowStatus, { bg: string; fg: string; label: string }> = {
  done:    { bg: 'rgba(34,197,94,.16)', fg: XP.good, label: 'Completed' },
  next:    { bg: XP.lime,                fg: XP.navy, label: 'Up next · live' },
  pending: { bg: 'rgba(255,255,255,.06)', fg: 'rgba(255,255,255,.55)', label: 'Pending' },
  issue:   { bg: '#FEE2E2',              fg: '#991B1B', label: 'Score needed' },
};

export default function ScheduleTab({
  meUserId, matches, teamsById, profilesById,
}: {
  meUserId: string;
  matches: TMatchRow[];
  teamsById: Map<string, TTeamRow>;
  profilesById: Map<string, ProfileLite>;
}) {
  const my = matches.filter(m => {
    const ta = m.team_a_id ? teamsById.get(m.team_a_id) : undefined;
    const tb = m.team_b_id ? teamsById.get(m.team_b_id) : undefined;
    return (
      ta?.player1_id === meUserId || ta?.player2_id === meUserId ||
      tb?.player1_id === meUserId || tb?.player2_id === meUserId
    );
  }).sort((a, b) => {
    if (a.round_number !== b.round_number) return a.round_number - b.round_number;
    return (a.match_number ?? 0) - (b.match_number ?? 0);
  });

  // First pending = "up next"
  const nextId = my.find(m => m.status === 'pending')?.id;
  const completedCount = my.filter(m => m.status === 'completed' || m.status === 'awaiting_score').length;
  const remaining = my.length - completedCount;

  return (
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 92, color: 'white' }}>
      <div style={{
        padding: '10px 18px 6px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      }}>
        <div style={{
          fontFamily: "'Lexend', sans-serif", fontSize: 11, fontWeight: 800,
          letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)',
        }}>Your day · {my.length} matches</div>
        <div style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 10, color: 'rgba(255,255,255,.5)',
        }}>{completedCount} · {remaining} REMAINING</div>
      </div>

      <div style={{ padding: '0 18px', position: 'relative' }}>
        {/* timeline rail */}
        <div style={{
          position: 'absolute', left: 30, top: 16, bottom: 8,
          width: 2, background: 'rgba(255,255,255,.08)',
        }} />

        {my.length === 0 && (
          <div style={{
            padding: '60px 0', textAlign: 'center',
            color: 'rgba(255,255,255,.5)', fontSize: 13,
          }}>No matches drawn for you yet.</div>
        )}

        {my.map((m) => {
          const isDone   = m.status === 'completed';
          const isNext   = m.id === nextId;
          const needsSc  = m.status === 'awaiting_score' || (m.status === 'completed' && !m.result);
          const status: RowStatus = needsSc ? 'issue' : isDone ? 'done' : isNext ? 'next' : 'pending';
          const p = STATUS_PILL[status];
          const opp = oppLabel(m, meUserId, teamsById, profilesById);
          const isTBD = opp === 'TBD';

          /* Win/loss + score */
          let scoreLine: { won: boolean; text: string } | null = null;
          if (isDone && m.result) {
            const myTeam = m.team_a_id && teamsById.get(m.team_a_id)?.player1_id === meUserId ||
                           m.team_a_id && teamsById.get(m.team_a_id)?.player2_id === meUserId
                ? m.team_a_id : m.team_b_id;
            const won = m.result.winner_team_id === myTeam;
            const setsStr = Array.isArray(m.result.sets) && m.result.sets.length
              ? m.result.sets.map((s: any) => `${s.team_a ?? s.a}-${s.team_b ?? s.b}`).join(' ')
              : `${m.result.team_a_score ?? '?'}-${m.result.team_b_score ?? '?'}`;
            scoreLine = { won, text: setsStr };
          }

          return (
            <div key={m.id} style={{
              display: 'grid', gridTemplateColumns: '40px 1fr', gap: 14, padding: '10px 0',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <div style={{
                  fontFamily: "'Lexend', sans-serif", fontSize: 10, fontWeight: 900,
                  fontStyle: 'italic', color: 'rgba(255,255,255,.5)',
                }}>R{m.round_number}</div>
                <div style={{
                  marginTop: 4, width: 12, height: 12, borderRadius: 6,
                  background: status === 'next' ? XP.lime
                            : status === 'done' ? XP.good
                            : 'rgba(255,255,255,.12)',
                  boxShadow: status === 'next' ? '0 0 0 4px rgba(205,255,101,.25)' : 'none',
                  border: (status !== 'next' && status !== 'done') ? '1.5px solid rgba(255,255,255,.2)' : 'none',
                }} />
              </div>
              <div style={{
                borderRadius: 14, padding: '12px 14px',
                background: status === 'next' ? 'rgba(205,255,101,.08)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${status === 'next' ? XP.lime : 'rgba(255,255,255,.06)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 11, color: 'rgba(255,255,255,.55)',
                    }}>
                      {fmtClock(m.scheduled_at)} · {m.court_label ?? (m.court_number ? `Pista ${m.court_number}` : '—')} · M{String(m.match_number).padStart(2, '0')}
                    </div>
                    <div style={{
                      fontFamily: "'Lexend', sans-serif", fontSize: 14, fontWeight: 800, fontStyle: 'italic',
                      textTransform: 'uppercase', lineHeight: 1.1, marginTop: 4,
                      color: isTBD ? 'rgba(255,255,255,.4)' : 'white',
                    }}>{isTBD ? 'Opponent TBD' : `vs ${opp}`}</div>
                  </div>
                  <span style={{
                    background: p.bg, color: p.fg,
                    fontFamily: "'Lexend', sans-serif", fontWeight: 800, fontSize: 9,
                    letterSpacing: '.1em', textTransform: 'uppercase',
                    padding: '3px 7px', borderRadius: 999, whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>{p.label}</span>
                </div>
                {scoreLine && (
                  <div style={{
                    marginTop: 8,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 13, fontWeight: 600,
                    color: scoreLine.won ? XP.lime : '#ff8a6b',
                  }}>
                    {scoreLine.won ? 'WIN' : 'LOSS'} · {scoreLine.text}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
