/**
 * Tournament Live Mode — shared header (P2–P5).
 * Tournament name + LIVE pill + pace strip (round X of Y, matches done / total).
 */
import { useEffect, useState } from 'react';
import { XP, LiveDot } from './atoms';

interface Props {
  tournamentName: string;
  organizerLabel?: string;
  totalRounds?: number | null;
  currentRound?: number | null;
  matchesDone: number;
  matchesTotal: number;
  liveStartedAt?: string | null;
}

function fmtLiveDuration(startedAt: string | null | undefined): string {
  if (!startedAt) return '';
  const ms = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const total = Math.floor(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}H ${m}M IN` : `${m}M IN`;
}

export default function TournHeader({
  tournamentName, organizerLabel, totalRounds, currentRound,
  matchesDone, matchesTotal, liveStartedAt,
}: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const rounds = Math.max(totalRounds ?? 0, 1);
  const cur = Math.min(Math.max(currentRound ?? 0, 0), rounds);

  return (
    <div
      style={{
        padding: '56px 18px 14px',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        background: XP.navyDeep,
        color: 'white',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LiveDot />
          <span style={{
            fontFamily: "'Lexend', sans-serif", fontSize: 10, fontWeight: 900,
            fontStyle: 'italic', letterSpacing: '.18em', textTransform: 'uppercase',
            color: XP.lime,
          }}>Live Tournament</span>
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 10, color: 'rgba(255,255,255,.5)',
        }}>{fmtLiveDuration(liveStartedAt)}</div>
      </div>
      <div style={{
        fontFamily: "'Lexend', sans-serif", fontSize: 26, fontWeight: 900, fontStyle: 'italic',
        textTransform: 'uppercase', lineHeight: 0.95, letterSpacing: '-.025em', color: 'white',
      }}>
        {tournamentName}
      </div>
      {organizerLabel && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 6 }}>
          {organizerLabel}
        </div>
      )}

      {/* Pace strip */}
      <div style={{ marginTop: 14 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6,
        }}>
          <div style={{
            fontFamily: "'Lexend', sans-serif", fontSize: 11, fontWeight: 800, fontStyle: 'italic',
            textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.85)',
          }}>
            {rounds > 0 ? `Round ${Math.max(cur, 1)} of ${rounds}` : 'Tournament in progress'}
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 10, color: 'rgba(255,255,255,.5)',
          }}>
            {matchesDone} / {matchesTotal} MATCHES
          </div>
        </div>
        <div style={{
          height: 4, background: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden',
          display: 'grid', gridTemplateColumns: `repeat(${rounds}, 1fr)`, gap: 3,
        }}>
          {Array.from({ length: rounds }).map((_, i) => {
            const fillState: 0 | 0.5 | 1 = i < cur - 1 ? 1 : i === cur - 1 ? 0.5 : 0;
            return (
              <div key={i} style={{
                background: fillState >= 0.5 ? XP.lime : 'rgba(255,255,255,.08)',
                opacity: fillState === 0.5 ? 0.6 : 1,
                borderRadius: 2,
              }} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
