/**
 * membership_tiers helpers (25 Sep 2026).
 * Live columns: court_discount_pct, coaching_discount_pct, market_discount_pct, benefits_json (string[]),
 * price_cents, billing_period. Older rows/types may still carry court_discount / benefits / tier_tag,
 * so every reader falls back to those.
 */
export interface TierRow {
  id: string;
  club_id?: string;
  name: string;
  price_cents: number;
  billing_period?: string | null;
  court_discount_pct?: number | null;
  court_discount?: number | null;
  coaching_discount_pct?: number | null;
  market_discount_pct?: number | null;
  advance_booking_days?: number | null;
  benefits_json?: unknown;
  benefits?: unknown;
  tier_tag?: string | null;
  sort_order?: number | null;
}

export const isStaffTier = (t: TierRow) =>
  t.tier_tag === "staff" || t.name.trim().toLowerCase() === "staff";

/** Court discount in %, 0 when none. */
export const tierDiscount = (t?: TierRow | null): number =>
  Math.max(0, Number(t?.court_discount_pct ?? t?.court_discount ?? 0) || 0);

export const tierMarketDiscount = (t?: TierRow | null): number =>
  Math.max(0, Number(t?.market_discount_pct ?? 0) || 0);

/** Benefits as short lines. Accepts string[] / {label|text}[] / "a; b" / "a\nb". */
export const tierBenefits = (t?: TierRow | null): string[] => {
  const raw = t?.benefits_json ?? t?.benefits;
  let list: string[] = [];
  if (Array.isArray(raw)) {
    list = raw.map((b) => (typeof b === "string" ? b : (b as any)?.label ?? (b as any)?.text ?? (b as any)?.title ?? "")).map(String);
  } else if (typeof raw === "string") {
    list = raw.split(/[\n;]+/);
  }
  return list.map((s) => s.trim()).filter(Boolean);
};

const PERIOD: Record<string, string> = { monthly: "mo", month: "mo", yearly: "yr", annual: "yr", year: "yr", weekly: "wk", week: "wk" };
export const periodShort = (p?: string | null) => PERIOD[(p ?? "monthly").toLowerCase()] ?? "mo";
export const periodLong = (p?: string | null) => {
  const k = (p ?? "monthly").toLowerCase();
  return k.startsWith("year") || k === "annual" ? "a year" : k.startsWith("week") ? "a week" : "a month";
};

export const money = (pence: number, symbol = "£") => {
  const v = pence / 100;
  return `${symbol}${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2)}`;
};

/** Price per player after the member discount, whole pounds when round. */
export const perPlayer = (courtPrice: number, discountPct: number, symbol = "£") => {
  const pp = (courtPrice / 4) * (1 - discountPct / 100);
  return `${symbol}${pp % 1 ? pp.toFixed(2) : pp.toFixed(0)}`;
};
