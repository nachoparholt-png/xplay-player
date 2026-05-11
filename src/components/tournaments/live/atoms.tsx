/**
 * XPLAY Tournament Live Mode — mobile (player) atoms.
 * Mirrors xp-phone.jsx from the Claude Design handoff.
 *
 * Inline-style based on purpose — the design's navy/lime palette is
 * its own visual identity that should not bleed into other parts of
 * the app. Every Tournament Live screen renders inside a `position:
 * relative` parent the Capacitor viewport already provides.
 */
import * as React from 'react';

export const XP = {
  lime: '#CDFF65',
  limeDark: '#A8D648',
  amber: '#FFBF00',
  purple: '#5924C6',
  navy: '#1A2833',
  navyDeep: '#0D1820',
  sky: '#B4CBD5',
  ink: '#0A0F14',
  paper: '#F7F4EE',
  warn: '#FF6B35',
  good: '#22C55E',
};

/* ─── Avatar ──────────────────────────────────────────────────── */
export function Av({
  initials, size = 32, tint = XP.lime, dark = true,
}: {
  initials: string;
  size?: number;
  tint?: string;
  dark?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%',
        background: dark ? XP.navy : XP.paper,
        color: tint,
        border: `1.5px solid ${tint}`,
        fontFamily: "'Lexend', sans-serif",
        fontWeight: 800,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >{initials}</span>
  );
}

export function Pair({
  a, b, size = 30,
}: {
  a: { i: string; t?: string };
  b: { i: string; t?: string };
  size?: number;
}) {
  return (
    <span style={{ display: 'inline-flex' }}>
      <Av initials={a.i} size={size} tint={a.t ?? XP.lime} />
      <span style={{ marginLeft: -10 }}>
        <Av initials={b.i} size={size} tint={b.t ?? XP.amber} />
      </span>
    </span>
  );
}

/* ─── Chip ────────────────────────────────────────────────────── */
type ChipTone = 'lime' | 'amber' | 'purple' | 'ghost' | 'warn' | 'good';
const CHIP_TONES: Record<ChipTone, { bg: string; fg: string; border?: string }> = {
  lime:   { bg: XP.lime,                fg: XP.navy },
  amber:  { bg: XP.amber,               fg: XP.navy },
  purple: { bg: XP.purple,              fg: 'white' },
  ghost:  { bg: 'rgba(255,255,255,.1)', fg: 'white', border: '1px solid rgba(255,255,255,.2)' },
  warn:   { bg: '#FEE2E2',              fg: '#991B1B' },
  good:   { bg: 'rgba(34,197,94,.16)',  fg: XP.good },
};

export function XPChip({
  tone = 'lime', children,
}: {
  tone?: ChipTone;
  children: React.ReactNode;
}) {
  const t = CHIP_TONES[tone];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 9px', borderRadius: 999,
        fontFamily: "'Lexend', sans-serif",
        fontWeight: 700, fontSize: 10,
        letterSpacing: '.08em', textTransform: 'uppercase',
        background: t.bg, color: t.fg, border: t.border,
        whiteSpace: 'nowrap',
      }}
    >{children}</span>
  );
}

/* ─── Button ──────────────────────────────────────────────────── */
type BtnTone = 'lime' | 'amber' | 'purple' | 'outline' | 'dark';
type BtnSize = 'sm' | 'md' | 'lg';
const BTN_TONES: Record<BtnTone, { bg: string; fg: string; border?: string }> = {
  lime:    { bg: XP.lime,            fg: XP.navy },
  amber:   { bg: XP.amber,           fg: XP.navy },
  purple:  { bg: XP.purple,          fg: 'white' },
  outline: { bg: 'transparent',      fg: 'white', border: '1.5px solid rgba(255,255,255,.3)' },
  dark:    { bg: XP.navy,            fg: 'white' },
};
const BTN_SIZES: Record<BtnSize, React.CSSProperties> = {
  sm: { padding: '8px 14px',  fontSize: 12, height: 34 },
  md: { padding: '12px 18px', fontSize: 14, height: 44 },
  lg: { padding: '14px 22px', fontSize: 15, height: 52 },
};

export function XPButton({
  children, tone = 'lime', size = 'md', full, icon, onClick, disabled, type,
}: {
  children: React.ReactNode;
  tone?: BtnTone;
  size?: BtnSize;
  full?: boolean;
  icon?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const t = BTN_TONES[tone]; const s = BTN_SIZES[size];
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderRadius: 14, width: full ? '100%' : undefined,
        fontFamily: "'Lexend', sans-serif",
        fontWeight: 800, letterSpacing: '.02em',
        textTransform: 'uppercase', fontStyle: 'italic',
        background: t.bg, color: t.fg, border: t.border ?? 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 100ms ease, background 100ms ease',
        ...s,
      }}
    >{icon}{children}</button>
  );
}

/* ─── Live dot ─────────────────────────────────────────────────── */
export function LiveDot({ red, dark }: { red?: boolean; dark?: boolean }) {
  const cls = ['xp-live-dot'];
  if (red) cls.push('red');
  if (dark) cls.push('dark');
  return <span className={cls.join(' ')} />;
}

/* ─── Helpers ──────────────────────────────────────────────────── */
export function initialsOf(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function singleInitial(name?: string | null): string {
  return (name?.trim()[0] ?? '?').toUpperCase();
}

export function firstName(name?: string | null): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0];
}
