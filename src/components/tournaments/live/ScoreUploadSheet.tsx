/**
 * P6 — Score upload bottom sheet.
 *
 * Two team blocks, per-set steppers (− muted / + lime), "Add set" affordance,
 * full-width lime Submit. Writes directly to tournament_matches.result with
 * the canonical shape `{ team_a_score, team_b_score, sets, winner_team_id }`
 * — the score still needs opponent confirmation downstream (existing flow).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Pair, XPButton, XP, firstName, singleInitial } from './atoms';
import type { TMatchRow, TTeamRow, ProfileLite } from './types';

interface SetScore { team_a: number; team_b: number; }

export default function ScoreUploadSheet({
  match, teamsById, profilesById, meUserId, onClose, onSaved,
}: {
  match: TMatchRow;
  teamsById: Map<string, TTeamRow>;
  profilesById: Map<string, ProfileLite>;
  meUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialSets: SetScore[] = (() => {
    if (Array.isArray(match.result?.sets) && match.result.sets.length) {
      return match.result.sets.map((s: any) => ({
        team_a: Number(s.team_a ?? s.a ?? 0),
        team_b: Number(s.team_b ?? s.b ?? 0),
      }));
    }
    return [
      { team_a: 0, team_b: 0 },
      { team_a: 0, team_b: 0 },
      { team_a: 0, team_b: 0 },
    ];
  })();

  const [sets, setSets] = useState<SetScore[]>(initialSets);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setSets(initialSets); }, [match.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const teamA = match.team_a_id ? teamsById.get(match.team_a_id) : undefined;
  const teamB = match.team_b_id ? teamsById.get(match.team_b_id) : undefined;
  const myIsA = teamA && (teamA.player1_id === meUserId || teamA.player2_id === meUserId);
  void myIsA;

  const teamInfo = (t?: TTeamRow) => {
    if (!t) return { label: 'TBD', a: '?', b: '?' };
    const p1 = t.player1_id ? profilesById.get(t.player1_id) : undefined;
    const p2 = t.player2_id ? profilesById.get(t.player2_id) : undefined;
    const n1 = p1?.display_name ?? 'P1';
    const n2 = p2?.display_name;
    return {
      label: n2 ? `${firstName(n1)} · ${firstName(n2)}` : firstName(n1),
      a: singleInitial(n1),
      b: n2 ? singleInitial(n2) : '?',
    };
  };
  const aInfo = teamInfo(teamA);
  const bInfo = teamInfo(teamB);

  const submit = async () => {
    setSubmitting(true);
    try {
      const totalA = sets.reduce((s, x) => s + x.team_a, 0);
      const totalB = sets.reduce((s, x) => s + x.team_b, 0);
      const setsA  = sets.filter(s => s.team_a > s.team_b).length;
      const setsB  = sets.filter(s => s.team_b > s.team_a).length;
      const winnerId = setsA > setsB ? teamA?.id : setsB > setsA ? teamB?.id : undefined;
      const result = {
        team_a_score: totalA,
        team_b_score: totalB,
        sets: sets.filter(s => s.team_a !== 0 || s.team_b !== 0),
        winner_team_id: winnerId,
        submitted_by: meUserId,
        submitted_at: new Date().toISOString(),
      };
      const { error } = await (supabase.from('tournament_matches') as any)
        .update({ result, status: 'awaiting_score', completed_at: new Date().toISOString() })
        .eq('id', match.id);
      if (error) throw error;
      toast.success('Score submitted', { description: 'Your opponent will confirm.' });
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const Stepper = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      width: 110, height: 56, padding: 4, borderRadius: 14,
      background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)',
    }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(255,255,255,.06)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Lexend', sans-serif", fontWeight: 900, fontSize: 18,
          color: 'rgba(255,255,255,.5)',
        }}>−</button>
      <span style={{
        fontFamily: "'Lexend', sans-serif", fontWeight: 900, fontStyle: 'italic', fontSize: 26,
        color: 'white', minWidth: 24, textAlign: 'center',
      }}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        style={{
          width: 36, height: 36, borderRadius: 10,
          background: XP.lime, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Lexend', sans-serif", fontWeight: 900, fontSize: 18,
          color: XP.navy,
        }}>+</button>
    </div>
  );

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
          paddingBottom: 22, maxHeight: '90vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Grabber */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 3, background: 'rgba(255,255,255,.25)' }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '14px 22px 0', display: 'flex',
          justifyContent: 'space-between', alignItems: 'flex-end',
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 10, color: 'rgba(255,255,255,.5)',
              letterSpacing: '.08em',
            }}>R{match.round_number} · M{String(match.match_number).padStart(2, '0')} · {match.court_label ?? (match.court_number ? `Pista ${match.court_number}` : '')}</div>
            <div style={{
              fontFamily: "'Lexend', sans-serif", fontSize: 24, fontWeight: 900, fontStyle: 'italic',
              textTransform: 'uppercase', marginTop: 4,
            }}>Match score</div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 16, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            }}>✕</button>
        </div>

        {/* Teams row */}
        <div style={{
          padding: '18px 22px 6px',
          display: 'grid', gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div>
            <Pair a={{ i: aInfo.a, t: XP.lime }} b={{ i: aInfo.b, t: XP.lime }} size={32} />
            <div style={{
              fontFamily: "'Lexend', sans-serif", fontSize: 13, fontWeight: 800, fontStyle: 'italic',
              textTransform: 'uppercase', marginTop: 6,
            }}>{aInfo.label}</div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,.45)',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            }}>TEAM A</div>
          </div>
          <div style={{
            fontFamily: "'Lexend', sans-serif", fontSize: 13, fontWeight: 900, fontStyle: 'italic',
            opacity: 0.4,
          }}>VS</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Pair a={{ i: bInfo.a, t: XP.amber }} b={{ i: bInfo.b, t: XP.amber }} size={32} />
            </div>
            <div style={{
              fontFamily: "'Lexend', sans-serif", fontSize: 13, fontWeight: 800, fontStyle: 'italic',
              textTransform: 'uppercase', marginTop: 6,
            }}>{bInfo.label}</div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,.45)',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            }}>TEAM B</div>
          </div>
        </div>

        {/* Sets */}
        <div style={{ padding: '18px 22px 4px', flex: 1, overflow: 'auto' }}>
          {sets.map((s, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 28px 1fr',
              gap: 10, alignItems: 'center', padding: '10px 0',
              borderTop: '1px solid rgba(255,255,255,.06)',
            }}>
              <Stepper
                value={s.team_a}
                onChange={(n) => setSets((prev) =>
                  prev.map((row, k) => k === i ? { ...row, team_a: n } : row))}
              />
              <div style={{
                fontFamily: "'Lexend', sans-serif", fontSize: 10, fontWeight: 900,
                fontStyle: 'italic', textTransform: 'uppercase',
                color: 'rgba(255,255,255,.4)',
                textAlign: 'center', letterSpacing: '.12em',
              }}>SET {i + 1}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Stepper
                  value={s.team_b}
                  onChange={(n) => setSets((prev) =>
                    prev.map((row, k) => k === i ? { ...row, team_b: n } : row))}
                />
              </div>
            </div>
          ))}
          {sets.length < 5 && (
            <div style={{ padding: '14px 0 0', display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => setSets((prev) => [...prev, { team_a: 0, team_b: 0 }])}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 999,
                  border: '1.5px dashed rgba(255,255,255,.25)',
                  background: 'transparent', cursor: 'pointer',
                  fontFamily: "'Lexend', sans-serif", fontWeight: 800,
                  fontStyle: 'italic', fontSize: 11,
                  textTransform: 'uppercase', color: 'rgba(255,255,255,.7)',
                }}>+ Add set</button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px', flexShrink: 0,
          background: XP.navyDeep,
          borderTop: '1px solid rgba(255,255,255,.06)',
        }}>
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,.5)',
            marginBottom: 10, lineHeight: 1.4,
          }}>
            Both teams must confirm. {bInfo.label} will be asked to verify.
          </div>
          <XPButton tone="lime" size="lg" full onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit score'}
          </XPButton>
        </div>
      </div>
    </div>
  );
}
