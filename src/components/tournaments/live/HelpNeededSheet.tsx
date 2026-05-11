/**
 * P8a — Help Needed dropdown menu.
 *
 * Opened from the My Match hero card. 6 request types per the design:
 * Balls / Water / Referee / Injury / Equipment / Other. Selecting any one
 * inserts a tournament_help_requests row — the AFTER-INSERT trigger in
 * the DB then notifies the organizer.
 *
 * Subsequent states (P8b sent / P8c acknowledged) are rendered by the
 * MyMatchTab hero card using the live `myOpenHelp` row, so this component
 * just handles the menu + insert.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { XP } from './atoms';
import type { TMatchRow } from './types';

type RequestType = 'balls' | 'water' | 'referee' | 'injury' | 'equipment' | 'other';

const ITEMS: { id: RequestType; icon: string; label: string; desc: string; alert?: boolean }[] = [
  { id: 'balls',     icon: '●',  label: 'Balls',     desc: 'Need a new set' },
  { id: 'water',     icon: '💧', label: 'Water',     desc: 'Bottle / refill' },
  { id: 'referee',   icon: '⚖︎',  label: 'Referee',  desc: 'Call dispute' },
  { id: 'injury',    icon: '+',  label: 'Injury',    desc: 'First aid please', alert: true },
  { id: 'equipment', icon: '⛏︎',  label: 'Equipment', desc: 'Court issue' },
  { id: 'other',     icon: '⋯',  label: 'Other',     desc: 'Write a note' },
];

export default function HelpNeededSheet({
  tournamentId, match, meUserId, onClose, onSent,
}: {
  tournamentId: string;
  match: TMatchRow;
  meUserId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [selected, setSelected] = useState<RequestType | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const send = async (type: RequestType, noteText?: string) => {
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from('tournament_help_requests').insert({
        tournament_id: tournamentId,
        match_id: match.id,
        requested_by: meUserId,
        court_number: match.court_number,
        court_label: match.court_label,
        request_type: type,
        note: noteText && noteText.trim() ? noteText.trim() : null,
        status: 'open',
      });
      if (error) throw error;
      toast.success('Organizer notified', {
        description: `Coming to ${match.court_label ?? (match.court_number ? `Pista ${match.court_number}` : 'your court')} · ${type}`,
      });
      onSent();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send');
    } finally {
      setSubmitting(false);
    }
  };

  const courtLabel = match.court_label ?? (match.court_number ? `Pista ${match.court_number}` : 'your court');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: XP.navyDeep, color: 'white',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          boxShadow: '0 -20px 60px rgba(0,0,0,.5)',
          paddingBottom: 22, maxHeight: '90vh', overflow: 'auto',
          border: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
          <div style={{ width: 40, height: 4, borderRadius: 3, background: 'rgba(255,255,255,.25)' }} />
        </div>

        <div style={{ padding: '14px 16px 8px' }}>
          <div style={{
            fontFamily: "'Lexend', sans-serif", fontSize: 10, fontWeight: 900, fontStyle: 'italic',
            letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)',
          }}>What do you need on {courtLabel}?</div>
        </div>

        {selected === 'other' ? (
          <div style={{ padding: '6px 16px 16px' }}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 240))}
              placeholder="Describe what you need…"
              autoFocus
              style={{
                width: '100%', minHeight: 96, padding: 12,
                borderRadius: 12, border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.04)', color: 'white', outline: 'none',
                fontFamily: 'Manrope, sans-serif', fontSize: 14, resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                onClick={() => setSelected(null)}
                style={{
                  flex: 1, padding: '12px 14px', borderRadius: 12,
                  background: 'rgba(255,255,255,.06)', color: 'white',
                  border: 'none', cursor: 'pointer',
                  fontFamily: "'Lexend', sans-serif", fontWeight: 800, fontStyle: 'italic',
                  textTransform: 'uppercase', fontSize: 12,
                }}>Back</button>
              <button
                disabled={submitting || !note.trim()}
                onClick={() => send('other', note)}
                style={{
                  flex: 2, padding: '12px 14px', borderRadius: 12,
                  background: note.trim() ? XP.lime : 'rgba(205,255,101,.4)',
                  color: XP.navy, border: 'none',
                  cursor: note.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: "'Lexend', sans-serif", fontWeight: 800, fontStyle: 'italic',
                  textTransform: 'uppercase', fontSize: 12,
                }}>
                {submitting ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {ITEMS.map((it) => (
              <button
                key={it.id}
                disabled={submitting}
                onClick={() => {
                  if (it.id === 'other') setSelected('other');
                  else send(it.id);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '12px 16px',
                  borderRadius: 12, margin: '2px 6px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: it.alert ? 'rgba(255,107,53,.18)' : 'rgba(255,255,255,.06)',
                  color: it.alert ? XP.warn : 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Lexend', sans-serif", fontWeight: 900, fontSize: 14,
                }}>{it.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: "'Lexend', sans-serif", fontWeight: 800, fontStyle: 'italic',
                    textTransform: 'uppercase', fontSize: 13, letterSpacing: '.02em',
                    color: it.alert ? XP.warn : 'white',
                  }}>{it.label}</div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.5)', marginTop: 1 }}>
                    {it.desc}
                  </div>
                </div>
                <div style={{
                  color: 'rgba(255,255,255,.4)',
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12,
                }}>›</div>
              </button>
            ))}
            <div style={{
              padding: '12px 18px 4px',
              borderTop: '1px solid rgba(255,255,255,.06)',
              marginTop: 4,
              fontSize: 10, color: 'rgba(255,255,255,.4)',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              letterSpacing: '.04em',
            }}>↳ THE ORGANIZER IS NOTIFIED INSTANTLY</div>
          </>
        )}
      </div>
    </div>
  );
}
