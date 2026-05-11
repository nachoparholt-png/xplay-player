/**
 * Tournament Live Mode — tab bar (P2–P5 layout).
 * Four tabs: My Match / Schedule / Bracket / Stats.
 */
import { XP } from './atoms';

export type LiveTabId = 'match' | 'schedule' | 'bracket' | 'stats';

const TABS: { id: LiveTabId; label: string }[] = [
  { id: 'match',    label: 'My Match' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'bracket',  label: 'Bracket' },
  { id: 'stats',    label: 'Stats' },
];

export default function TournTabs({
  active, onChange,
}: {
  active: LiveTabId;
  onChange: (t: LiveTabId) => void;
}) {
  return (
    <div style={{
      display: 'flex', gap: 22, padding: '14px 18px 0',
      borderBottom: '1px solid rgba(255,255,255,.08)',
      background: XP.navyDeep,
    }}>
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            paddingBottom: 12, position: 'relative',
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontFamily: "'Lexend', sans-serif", fontSize: 12, fontWeight: 800,
            fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '.04em',
            color: t.id === active ? 'white' : 'rgba(255,255,255,.45)',
          }}
        >
          {t.label}
          {t.id === active && (
            <span style={{
              position: 'absolute', bottom: -1, left: 0, right: 0, height: 2,
              background: XP.lime,
            }} />
          )}
        </button>
      ))}
    </div>
  );
}
