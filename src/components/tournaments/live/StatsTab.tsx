/**
 * P5 — Stats / live standings tab.
 * KPI strip (rank · record · pt diff) + standings table; the logged-in row
 * is highlighted lime.
 */
import { useMemo } from 'react';
import { XP, firstName } from './atoms';
import type { TMatchRow, TTeamRow, ProfileLite } from './types';

function teamLabel(
  team: TTeamRow,
  profilesById: Map<string, ProfileLite>,
): string {
  const p1 = team.player1_id ? profilesById.get(team.player1_id) : undefined;
  const p2 = team.player2_id ? profilesById.get(team.player2_id) : undefined;
  const n1 = p1?.display_name ?? 'P1';
  const n2 = p2?.display_name;
  return n2 ? `${firstName(n1)} · ${firstName(n2)}` : firstName(n1);
}

export default function StatsTab({
  meUserId, matches, teamsById, profilesById,
}: {
  meUserId: string;
  matches: TMatchRow[];
  teamsById: Map<string, TTeamRow>;
  profilesById: Map<string, ProfileLite>;
}) {
  const standings = useMemo(() => {
    const rows = Array.from(teamsById.values()).map((team) => {
      let played = 0, wins = 0, losses = 0, pf = 0, pa = 0;
      for (const m of matches) {
        if (m.team_a_id !== team.id && m.team_b_id !== team.id) continue;
        // 'awaiting_score' = a player sent the score (24 Sep: counts, same as the organiser's screen)
        if ((m.status !== 'completed' && m.status !== 'awaiting_score') || !m.result) continue;
        played += 1;
        const myA = m.team_a_id === team.id;
        const myScore  = myA ? Number(m.result.team_a_score ?? 0) : Number(m.result.team_b_score ?? 0);
        const oppScore = myA ? Number(m.result.team_b_score ?? 0) : Number(m.result.team_a_score ?? 0);
        pf += myScore; pa += oppScore;
        if (m.result.winner_team_id === team.id) wins += 1;
        else if (m.result.winner_team_id) losses += 1;
      }
      const isMe = team.player1_id === meUserId || team.player2_id === meUserId;
      return {
        team, isMe, played, wins, losses, pf, diff: pf - pa,
      };
    });
    return rows.sort((x, y) => {
      if (y.wins !== x.wins) return y.wins - x.wins;
      if (y.diff !== x.diff) return y.diff - x.diff;
      return y.pf - x.pf;
    });
  }, [matches, teamsById, meUserId]);

  // One table per group when the tournament has groups (before 24 Sep all
  // groups were mixed in a single table).
  const groups = useMemo(() => {
    const keys = Array.from(new Set(standings.map(r => r.team.group_id).filter((g): g is string => !!g))).sort();
    if (keys.length <= 1) return [{ key: null as string | null, rows: standings }];
    return keys.map(k => ({ key: k as string | null, rows: standings.filter(r => r.team.group_id === k) }));
  }, [standings]);

  const myGroup = groups.find(g => g.rows.some(r => r.isMe));
  const myRow = myGroup?.rows.find(r => r.isMe);
  const myRank = myRow && myGroup ? myGroup.rows.indexOf(myRow) + 1 : null;

  return (
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 92, color: 'white' }}>
      {/* KPI strip */}
      <div style={{
        padding: '14px 18px',
        display: 'flex', gap: 22,
        borderBottom: '1px solid rgba(255,255,255,.08)',
      }}>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 9, color: 'rgba(255,255,255,.45)',
            letterSpacing: '.08em',
          }}>YOUR RANK</div>
          <div style={{
            fontFamily: "'Lexend', sans-serif", fontSize: 22, fontWeight: 900, fontStyle: 'italic',
            color: XP.lime,
          }}>{myRank ? `#${myRank}` : '—'}</div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,.1)' }} />
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 9, color: 'rgba(255,255,255,.45)',
            letterSpacing: '.08em',
          }}>RECORD</div>
          <div style={{
            fontFamily: "'Lexend', sans-serif", fontSize: 18, fontWeight: 900, fontStyle: 'italic',
          }}>{myRow ? `${myRow.wins}W · ${myRow.losses}L` : '—'}</div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,.1)' }} />
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 9, color: 'rgba(255,255,255,.45)',
            letterSpacing: '.08em',
          }}>PT DIFF</div>
          <div style={{
            fontFamily: "'Lexend', sans-serif", fontSize: 18, fontWeight: 900, fontStyle: 'italic',
            color: myRow && myRow.diff >= 0 ? XP.lime : '#ff8a6b',
          }}>{myRow ? (myRow.diff > 0 ? `+${myRow.diff}` : myRow.diff) : '—'}</div>
        </div>
      </div>

      <div style={{
        padding: '14px 18px 6px',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <div style={{
          fontFamily: "'Lexend', sans-serif", fontSize: 11, fontWeight: 800,
          letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)',
        }}>Live standings · {standings.length} teams</div>
        <div style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 9.5, color: 'rgba(255,255,255,.4)',
        }}>LIVE UPDATES</div>
      </div>

      <div style={{ margin: '0 14px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '24px 1fr 26px 22px 22px 36px 38px',
          padding: '6px 14px',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 9, color: 'rgba(255,255,255,.45)',
          letterSpacing: '.06em', textTransform: 'uppercase',
        }}>
          <span>#</span><span>Team</span>
          <span style={{ textAlign: 'center' }}>P</span>
          <span style={{ textAlign: 'center' }}>W</span>
          <span style={{ textAlign: 'center' }}>L</span>
          <span style={{ textAlign: 'right' }}>Pts</span>
          <span style={{ textAlign: 'right' }}>±</span>
        </div>
        {standings.length === 0 && (
          <div style={{
            padding: 32, textAlign: 'center',
            color: 'rgba(255,255,255,.5)', fontSize: 13,
          }}>No teams yet.</div>
        )}
        {groups.map((g) => (
          <div key={g.key ?? 'all'}>
            {g.key && (
              <div style={{
                padding: '14px 14px 6px',
                fontFamily: "'Lexend', sans-serif", fontSize: 13, fontWeight: 900, fontStyle: 'italic',
                textTransform: 'uppercase', color: 'white',
              }}>Group {g.key}</div>
            )}
        {g.rows.map((r, i) => (
          <div key={r.team.id} style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr 26px 22px 22px 36px 38px',
            alignItems: 'center', padding: '10px 14px', borderRadius: 10,
            background: r.isMe ? 'rgba(205,255,101,.1)' : 'transparent',
            border: r.isMe ? `1px solid ${XP.lime}55` : '1px solid transparent',
            marginBottom: 2,
          }}>
            <span style={{
              fontFamily: "'Lexend', sans-serif", fontSize: 12, fontWeight: 900, fontStyle: 'italic',
              color: i < 4 ? XP.lime : 'rgba(255,255,255,.4)',
            }}>{i + 1}</span>
            <span style={{
              fontFamily: "'Lexend', sans-serif", fontSize: 12.5, fontWeight: 800, fontStyle: 'italic',
              textTransform: 'uppercase', color: r.isMe ? XP.lime : 'white',
            }}>{teamLabel(r.team, profilesById)}</span>
            <span style={{
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12, color: 'rgba(255,255,255,.7)',
            }}>{r.played}</span>
            <span style={{
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12, fontWeight: 600,
            }}>{r.wins}</span>
            <span style={{
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12, color: 'rgba(255,255,255,.5)',
            }}>{r.losses}</span>
            <span style={{
              textAlign: 'right',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12, fontWeight: 700,
            }}>{r.pf}</span>
            <span style={{
              textAlign: 'right',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 11,
              color: r.diff > 0 ? XP.lime : r.diff < 0 ? '#ff8a6b' : 'rgba(255,255,255,.5)',
            }}>{r.diff > 0 ? `+${r.diff}` : r.diff}</span>
          </div>
        ))}
          </div>
        ))}
      </div>
    </div>
  );
}
