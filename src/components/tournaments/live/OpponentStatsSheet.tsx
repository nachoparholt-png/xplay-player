/**
 * P7 — Opponent Stats slide-up sheet.
 *
 * Triggered when the player taps an opponent's name in the My Match tab.
 * Pulls cross-tournament stats from the `player_tournament_stats` view +
 * recent form from `get_opponent_recent_form` RPC + head-to-head from
 * `get_h2h` RPC. All Phase-4 backend pieces from the design doc.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Av, XPButton, XPChip, XP } from './atoms';

interface PlayerStatsRow {
  user_id: string;
  tournaments_played: number | null;
  matches_played: number | null;
  wins: number | null;
  losses: number | null;
  avg_points_scored: number | null;
  avg_points_conceded: number | null;
  last_match_at: string | null;
}

interface RecentFormEntry {
  won: boolean;
  my_score: number;
  opp_score: number;
  completed_at: string;
}

interface H2H {
  matches_played: number;
  user_a_wins: number;
  user_b_wins: number;
}

function relativeTime(ts: string | null): string {
  if (!ts) return 'No matches yet';
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 0) return 'Just now';
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

export default function OpponentStatsSheet({
  opponentUserId, meUserId, opponentName, onClose,
}: {
  opponentUserId: string;
  meUserId: string;
  opponentName: string;
  onClose: () => void;
}) {
  /* Stats from view */
  const statsQ = useQuery({
    queryKey: ['opp_stats', opponentUserId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('player_tournament_stats') as any)
        .select('*')
        .eq('user_id', opponentUserId)
        .maybeSingle();
      if (error) throw error;
      return data as PlayerStatsRow | null;
    },
  });

  /* Recent form via RPC */
  const formQ = useQuery({
    queryKey: ['opp_form', opponentUserId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_opponent_recent_form', {
        _user_id: opponentUserId,
        _limit: 5,
      });
      if (error) throw error;
      return (data ?? []) as RecentFormEntry[];
    },
  });

  /* Head-to-head via RPC */
  const h2hQ = useQuery({
    queryKey: ['opp_h2h', opponentUserId, meUserId],
    enabled: !!meUserId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_h2h', {
        _user_a: meUserId,
        _user_b: opponentUserId,
      });
      if (error) throw error;
      return data as H2H;
    },
  });

  /* Profile for header */
  const profQ = useQuery({
    queryKey: ['opp_profile', opponentUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, full_name, padel_rating')
        .eq('user_id', opponentUserId)
        .maybeSingle();
      return data as any;
    },
  });

  const stats = statsQ.data;
  const form  = formQ.data ?? [];
  const h2h   = h2hQ.data;
  const prof  = profQ.data;

  const initials = (opponentName || 'P')[0].toUpperCase();
  const rating = prof?.padel_rating != null ? `LVL ${prof.padel_rating.toFixed?.(1) ?? prof.padel_rating}` : null;
  const winRate = stats && stats.wins != null && stats.losses != null && (stats.wins + stats.losses) > 0
    ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
    : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: XP.navy, color: 'white',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          boxShadow: '0 -20px 60px rgba(0,0,0,.5)',
          paddingBottom: 22, maxHeight: '90vh', overflow: 'auto',
        }}
      >
        {/* Grabber */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
          <div style={{ width: 40, height: 4, borderRadius: 3, background: 'rgba(255,255,255,.25)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '18px 22px 0' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Av initials={initials} size={56} tint={XP.amber} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: "'Lexend', sans-serif", fontSize: 22, fontWeight: 900,
                fontStyle: 'italic', textTransform: 'uppercase', lineHeight: 1,
              }}>{opponentName}</div>
              {rating && (
                <div style={{
                  fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 4,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                }}>{rating}</div>
              )}
            </div>
          </div>
        </div>

        {/* Big stats */}
        <div style={{
          padding: '22px 22px 0',
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
        }}>
          {([
            { n: stats?.tournaments_played ?? 0, l: 'Tournaments' },
            { n: stats != null && stats.wins != null
                ? `${stats.wins}W`
                : '—',
              l: stats != null && stats.losses != null && winRate != null
                ? `${stats.losses}L · ${winRate}%`
                : 'No data',
              highlight: true,
            },
            { n: stats?.avg_points_scored != null
                ? Number(stats.avg_points_scored).toFixed(1)
                : '—',
              l: 'Avg pts/m',
            },
          ]).map((s, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 14, padding: '12px 14px',
            }}>
              <div style={{
                fontFamily: "'Lexend', sans-serif", fontSize: 22, fontWeight: 900, fontStyle: 'italic',
                lineHeight: 1, color: s.highlight ? XP.lime : 'white',
              }}>{s.n}</div>
              <div style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 9.5, color: 'rgba(255,255,255,.5)',
                letterSpacing: '.06em', marginTop: 6,
              }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Recent form */}
        <div style={{ padding: '18px 22px 0' }}>
          <div style={{
            fontFamily: "'Lexend', sans-serif", fontSize: 11, fontWeight: 800,
            letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)',
          }}>Recent form · last {Math.max(form.length, 5)}</div>
          {form.length === 0 ? (
            <div style={{
              marginTop: 10, padding: 18, borderRadius: 12,
              background: 'rgba(255,255,255,.04)', textAlign: 'center',
              fontSize: 12, color: 'rgba(255,255,255,.5)',
            }}>No completed matches yet.</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {form.slice().reverse().map((r, i) => (
                <div key={i} style={{
                  flex: 1, height: 38, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: r.won ? XP.lime : 'rgba(255,255,255,.06)',
                  color: r.won ? XP.navy : 'rgba(255,255,255,.5)',
                  fontFamily: "'Lexend', sans-serif", fontWeight: 900,
                  fontStyle: 'italic', fontSize: 14,
                }}>{r.won ? 'W' : 'L'}</div>
              ))}
            </div>
          )}
          {form.length > 0 && (
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 8,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            }}>↳ MOST RECENT ON LEFT · {relativeTime(stats?.last_match_at ?? null).toUpperCase()}</div>
          )}
        </div>

        {/* Head-to-head */}
        {h2h && h2h.matches_played > 0 && (
          <div style={{ padding: '20px 22px 0' }}>
            <div style={{
              fontFamily: "'Lexend', sans-serif", fontSize: 11, fontWeight: 800,
              letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)',
            }}>Head-to-head with you</div>
            <div style={{
              marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 14,
            }}>
              <div style={{
                fontFamily: "'Lexend', sans-serif", fontSize: 38, fontWeight: 900, fontStyle: 'italic',
                color: XP.lime, lineHeight: 1,
              }}>{h2h.user_a_wins}W</div>
              <div style={{
                fontFamily: "'Lexend', sans-serif", fontSize: 26, fontWeight: 900, fontStyle: 'italic',
                color: 'rgba(255,255,255,.4)', lineHeight: 1,
              }}>· {h2h.user_b_wins}L</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', textAlign: 'right' }}>
                {h2h.matches_played} match{h2h.matches_played === 1 ? '' : 'es'} total
              </div>
            </div>
          </div>
        )}

        {!statsQ.data && !statsQ.isLoading && (
          <div style={{
            margin: '20px 22px 0', padding: 14,
            background: 'rgba(255,255,255,.04)', borderRadius: 12,
            textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.55)',
          }}>
            New face — no public match history yet.
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '20px 22px 0',
          marginTop: 18, borderTop: '1px solid rgba(255,255,255,.06)',
        }}>
          <XPButton tone="outline" size="md" full onClick={onClose}>Close</XPButton>
        </div>
      </div>
      {/* Lint quiet */}
      <span style={{ display: 'none' }}><XPChip>x</XPChip></span>
    </div>
  );
}
