/**
 * Two-tier club model (21 Sep 2026)
 * ─────────────────────────────────
 * XPLAY Club  = clubs.source 'xplay_partner' — hosted on XPLAY, book & pay in app.
 * Other club  = clubs.source 'directory'     — not hosted; we show availability from
 *               their own booking system, the player books there, XPLAY can't secure the court.
 * 'demo'/null = legacy native path (hidden from players by RLS) — treated as XPLAY-native.
 *
 * Colour rule: lime = XPLAY-native · neutral/sky = external · amber = points only.
 */
export const isOtherClub = (source?: string | null) => source === "directory";
export const isXplayClub = (source?: string | null) => !isOtherClub(source);

const PROVIDER_LABELS: Record<string, string> = {
  playtomic: "Playtomic",
  padelmates: "Padelmates",
  matchi: "Matchi",
};

/** "Playtomic" / "Padelmates" / null when the club has no availability feed. */
export const providerLabel = (provider?: string | null): string | null => {
  if (!provider) return null;
  return PROVIDER_LABELS[provider.toLowerCase()] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
};

export const clubInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w[0] ?? ""))
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** "Today 18:30" / "Tomorrow 07:00" / "Sat 09:30" */
export const formatNextSlot = (iso: string): { day: string; time: string } => {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(today)) / 86400000);
  const day =
    diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return { day, time };
};
