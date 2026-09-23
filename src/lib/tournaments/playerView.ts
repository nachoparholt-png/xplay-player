/**
 * Player-side tournament helpers (Tournaments page PL1/PL2 + detail PL3/PL5).
 * Pure functions + tiny fetchers; no React here.
 */
import { supabase } from "@/integrations/supabase/client";

export const MONO_FONT = "'JetBrains Mono', ui-monospace, monospace";

export type SeatCounts = {
  total: number;
  seated: number;
  guests_holding: number;
  awaiting: number;
  waitlist: number;
  free: number;
};

export type VenueClub = {
  id: string;
  club_name: string | null;
  location: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  external_provider: string | null;
  logo_url?: string | null;
  kind?: string | null;
};

/** Start of the tournament as a Date (local time). Null when no date. */
export function tournamentStart(t: { scheduled_date: string | null; scheduled_time: string | null }): Date | null {
  if (!t.scheduled_date) return null;
  const time = (t.scheduled_time || "12:00").slice(0, 5);
  const d = new Date(`${t.scheduled_date}T${time}:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function dateBlockParts(t: { scheduled_date: string | null; scheduled_time: string | null }) {
  const d = tournamentStart(t);
  if (!d) return { dow: "TBC", day: "–", mon: "" };
  return {
    dow: d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase(),
    day: String(d.getDate()).padStart(2, "0"),
    mon: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
  };
}

export function formatDayTime(d: Date | null, withYear = false) {
  if (!d) return "Date TBC";
  const date = d.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}),
  });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export function formatShortDate(d: Date | null) {
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "Live now" / "Today 09:00" / "Tomorrow" / "in 6 days" / "Ended" */
export function countdownLabel(
  t: { scheduled_date: string | null; scheduled_time: string | null; is_live?: boolean | null; status?: string },
  now = new Date(),
) {
  if (t.is_live) return "Live now";
  const start = tournamentStart(t);
  if (!start) return "Date TBC";
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diffDays = Math.round((startDay.getTime() - dayStart.getTime()) / 86400000);
  if (diffDays < 0 || t.status === "completed") return "Ended";
  if (diffDays === 0) return `Today ${start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 14) return `in ${diffDays} days`;
  const weeks = Math.round(diffDays / 7);
  return weeks < 9 ? `in ${weeks} weeks` : `in ${Math.round(diffDays / 30)} months`;
}

export function isPastTournament(t: { scheduled_date: string | null; scheduled_time: string | null; status: string }, now = new Date()) {
  if (t.status === "completed" || t.status === "cancelled") return true;
  const start = tournamentStart(t);
  if (!start) return false;
  const endOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return endOfDay.getTime() < now.getTime();
}

export function formatLabel(formatType: string | null | undefined, tournamentType: string | null | undefined) {
  const f =
    formatType === "groups" ? "Groups + knockout"
    : formatType === "americano" ? "Americano"
    : formatType === "king_of_court" ? "King of the court"
    : (formatType || "Tournament").replace(/_/g, " ");
  const k = tournamentType === "pairs" ? "Pairs" : "Individual";
  return `${f} · ${k}`;
}

export function formatGBP(cents: number | null | undefined) {
  const c = cents ?? 0;
  if (c <= 0) return "Free";
  const pounds = c / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

export function levelRange(min: number | null | undefined, max: number | null | undefined) {
  if (min == null && max == null) return null;
  const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
  if (min != null && max != null) return `${f(min)}–${f(max)}`;
  return min != null ? `${f(min)}+` : `≤${f(max as number)}`;
}

export function cancellationPolicyText(
  policy: string | null | undefined,
  customText: string | null | undefined,
) {
  switch (policy) {
    case "flexible":
      return "Full refund if the organiser cancels, and full refund if you withdraw any time before the start.";
    case "strict":
      return "Full refund if the organiser cancels. No refund if you withdraw.";
    case "custom":
      return customText?.trim() || "See the organiser's cancellation terms.";
    case "standard":
    default:
      return "Full refund if the organiser cancels. Withdraw more than 48h before the start: full refund; within 48h: no refund.";
  }
}

/** Deadline until which a withdrawal is fully refunded, or null when never / unknown. */
export function refundDeadline(t: {
  scheduled_date: string | null;
  scheduled_time: string | null;
  registration_deadline?: string | null;
  cancellation_policy?: string | null;
}): Date | null {
  const start = tournamentStart(t);
  if (t.cancellation_policy === "strict") return null;
  if (t.cancellation_policy === "flexible") return start;
  if (t.cancellation_policy === "custom") return t.registration_deadline ? new Date(t.registration_deadline) : null;
  // standard: registration_deadline if set, else start − 48h
  if (t.registration_deadline) return new Date(t.registration_deadline);
  return start ? new Date(start.getTime() - 48 * 3600 * 1000) : null;
}

export function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatMiles(mi: number) {
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

/** Seats for a set of tournaments via the `tournament_seat_counts` RPC (one call each). */
export async function fetchSeatCounts(ids: string[]): Promise<Record<string, SeatCounts>> {
  const out: Record<string, SeatCounts> = {};
  await Promise.all(
    ids.map(async (id) => {
      const { data } = await (supabase as any).rpc("tournament_seat_counts", { p_tournament_id: id });
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        out[id] = {
          total: Number(row.total ?? 0),
          seated: Number(row.seated ?? 0),
          guests_holding: Number(row.guests_holding ?? 0),
          awaiting: Number(row.awaiting ?? 0),
          waitlist: Number(row.waitlist ?? 0),
          free: Number(row.free ?? 0),
        };
      }
    }),
  );
  return out;
}

export async function fetchClubs(ids: string[]): Promise<Record<string, VenueClub>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data } = await (supabase as any)
    .from("clubs")
    .select("id, club_name, location, city, latitude, longitude, source, external_provider, logo_url, kind")
    .in("id", unique);
  const map: Record<string, VenueClub> = {};
  ((data as VenueClub[]) || []).forEach((c) => { map[c.id] = c; });
  return map;
}

export function publicTournamentUrl(t: { slug?: string | null; id: string }) {
  return t.slug
    ? `https://xplay-landing-delta.vercel.app/t/${t.slug}`
    : `https://xplay-landing-delta.vercel.app/t/${t.id}`;
}

/** Venue provider chip semantics: 'xclub' | 'playtomic' | 'padelmates' | 'external' | null */
export function venueProvider(club: VenueClub | null | undefined): { kind: "xclub" | "external"; label: string } | null {
  if (!club) return null;
  if (club.source === "xplay_partner") return { kind: "xclub", label: "XPLAY Club" };
  const p = (club.external_provider || "").toLowerCase();
  if (p.includes("playtomic")) return { kind: "external", label: "via Playtomic" };
  if (p.includes("padelmates") || p.includes("padel mates")) return { kind: "external", label: "via Padelmates" };
  if (p) return { kind: "external", label: `via ${club.external_provider}` };
  return null;
}
