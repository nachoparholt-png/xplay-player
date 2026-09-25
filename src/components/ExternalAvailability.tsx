/**
 * ExternalAvailability — Layer 2 (club directory design doc)
 * ───────────────────────────────────────────────────────────
 * Read-only aggregated court availability for a non-XPLAY ("directory") club,
 * collected from external providers (Playtomic, Padelmates). Booking happens on
 * the host platform via deep link — XPLAY never takes the transaction.
 *
 * Cache-aside: if the stored slots are stale (> 30 min) or absent, triggers an
 * on-demand collect for this club, then refetches. Fails soft — never blocks
 * match creation.
 *
 * Two layouts:
 *  - overview (no `date`): the next two days, one chip per start time (club page).
 *  - day (`date` given, match creation): that day's free courts grouped by start
 *    time, one pill per duration with its price — nothing deduped away, so 12:00
 *    shows 1h, 1h30 and 2h when the club lists all three. Tapping a pill calls
 *    `onSelectSlot` with that exact slot (time, length, price, booking link).
 */
import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { AVAILABILITY_ENABLED } from "@/lib/featureFlags";
import { isMembersOnly } from "@/components/clubs/clubTier";

export interface ExternalSlot {
  id: string;
  starts_at: string;
  duration_mins: number;
  price_cents: number | null;
  currency: string | null;
  booking_url: string | null;
  fetched_at: string;
}

interface ExternalAvailabilityProps {
  clubId: string;
  clubName?: string;
  /** clubs.external_provider when the caller has it; otherwise looked up here. */
  provider?: string | null;
  /** When provided, slots become tappable and call back with the exact slot. */
  onSelectSlot?: (slot: ExternalSlot) => void;
  /** Currently selected date+time (+duration) in the parent form — highlights the matching pill. */
  selected?: { date: string; time: string; duration?: number } | null;
  /** Match creation: show only this day's slots (yyyy-MM-dd). Null = no date picked yet. */
  date?: string | null;
  /** Match creation: how many slots are shown for `date` (0 lets the parent offer a manual grid). */
  onSlotCount?: (n: number) => void;
}

const STALE_MS = 30 * 60 * 1000;
const fmtDuration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min`);

const ExternalAvailability = ({ clubId, clubName, provider, onSelectSlot, selected, date, onSlotCount }: ExternalAvailabilityProps) => {
  const [slots, setSlots] = useState<ExternalSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [membersOnly, setMembersOnly] = useState(isMembersOnly(provider));

  const fetchSlots = useCallback(async () => {
    const { data } = await supabase
      .from("external_court_slots")
      .select("id, starts_at, duration_mins, price_cents, currency, booking_url, fetched_at")
      .eq("club_id", clubId)
      .gte("starts_at", new Date().toISOString())
      .lte("starts_at", new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString())
      .order("starts_at")
      .limit(400);
    return (data as ExternalSlot[]) || [];
  }, [clubId]);

  useEffect(() => {
    if (!AVAILABILITY_ENABLED) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      let prov = provider;
      if (prov === undefined) {
        const { data: c } = await supabase.from("clubs").select("external_provider").eq("id", clubId).maybeSingle();
        prov = (c as { external_provider?: string | null } | null)?.external_provider ?? null;
      }
      if (isMembersOnly(prov)) {
        if (!cancelled) { setMembersOnly(true); setSlots([]); setLoading(false); }
        return;
      }
      if (!cancelled) setMembersOnly(false);
      let data = await fetchSlots();
      const stale = data.length === 0 || Date.now() - new Date(data[0].fetched_at).getTime() > STALE_MS;
      if (stale) {
        setRefreshing(true);
        try {
          await Promise.allSettled([
            supabase.functions.invoke("collect-playtomic-availability", { body: { mode: "collect", club_id: clubId, days: 2 } }),
            supabase.functions.invoke("collect-padelmates-availability", { body: { mode: "collect", club_id: clubId, days: 2 } }),
          ]);
          data = await fetchSlots();
        } catch { /* keep whatever we had */ }
        if (!cancelled) setRefreshing(false);
      }
      if (!cancelled) { setSlots(data); setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [clubId, fetchSlots, provider]);

  // Group by day → start time → durations (cheapest per duration; never drop a duration).
  const byDay = new Map<string, Map<string, ExternalSlot[]>>();
  for (const s of slots) {
    const day = s.starts_at.slice(0, 10);
    const time = format(new Date(s.starts_at), "HH:mm");
    if (!byDay.has(day)) byDay.set(day, new Map());
    const dayMap = byDay.get(day)!;
    const arr = dayMap.get(time) ?? [];
    const same = arr.find((x) => x.duration_mins === s.duration_mins);
    if (!same) arr.push(s);
    else if ((s.price_cents ?? Infinity) < (same.price_cents ?? Infinity)) arr[arr.indexOf(same)] = s;
    dayMap.set(time, arr);
  }
  for (const dayMap of byDay.values()) for (const arr of dayMap.values()) arr.sort((a, b) => a.duration_mins - b.duration_mins);
  const bookingUrl = slots.find((s) => s.booking_url)?.booking_url;
  const dayEntries = date ? [...byDay.entries()].filter(([d]) => d === date) : [...byDay.entries()].slice(0, 2);
  const shownCount = dayEntries.reduce((n, [, t]) => n + [...t.values()].reduce((m, a) => m + a.length, 0), 0);
  const fetchedAgo = slots[0] ? Math.max(0, Math.round((Date.now() - new Date(slots[0].fetched_at).getTime()) / 60000)) : null;

  useEffect(() => {
    if (!AVAILABILITY_ENABLED || membersOnly) { onSlotCount?.(0); return; }
    if (!loading) onSlotCount?.(shownCount);
  }, [loading, shownCount, onSlotCount, membersOnly]);

  // (hooks above — early returns below)
  if (!AVAILABILITY_ENABLED) return null;
  if (membersOnly) {
    return (
      <p className="rounded-xl border border-border/40 bg-card p-3.5 text-xs text-foreground/85">
        Members only · book the court in the David Lloyd Clubs app, then mark it booked here.
      </p>
    );
  }

  const isSelected = (s: ExternalSlot) =>
    !!selected && s.starts_at.slice(0, 10) === selected.date && format(new Date(s.starts_at), "HH:mm") === selected.time &&
    (selected.duration == null || selected.duration === s.duration_mins);
  const providerName = provider === "padelmates" ? "Padelmates" : "Playtomic";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-display font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {date ? `Free courts · ${format(new Date(date + "T00:00:00"), "EEE d")}` : `Court availability${clubName ? ` · ${clubName}` : ""}`}
          </span>
        </div>
        {refreshing ? <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" /> : fetchedAgo != null && <span className="text-xs text-muted-foreground">updated {fetchedAgo} min ago</span>}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : byDay.size === 0 ? (
        <p className="text-sm text-muted-foreground">Live availability isn't available for this club right now. Pick a time manually and book on the club's system.</p>
      ) : date && dayEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No free courts listed on {providerName} for this day yet. Pick another day, or a time manually.</p>
      ) : !date ? (
        /* overview: two days, one chip per start time */
        <>
          {dayEntries.map(([day, times]) => (
            <div key={day}>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{format(new Date(day + "T00:00:00"), "EEE d MMM")}</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {[...times.entries()].slice(0, 12).map(([time, arr]) => {
                  const s = arr[0];
                  return onSelectSlot ? (
                    <button key={s.id} type="button" onClick={() => onSelectSlot(s)} className={cn("flex-shrink-0 rounded-lg px-2.5 py-1.5 text-center border", isSelected(s) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border")}>
                      <span className="block font-mono text-xs font-bold">{time}</span>
                      {s.price_cents != null && <span className="block text-[11px] text-muted-foreground">£{(s.price_cents / 100).toFixed(0)}</span>}
                    </button>
                  ) : (
                    <div key={s.id} className="flex-shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-center">
                      <span className="block font-mono text-xs font-bold">{time}</span>
                      {s.price_cents != null && <span className="block text-[11px] text-muted-foreground">£{(s.price_cents / 100).toFixed(0)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/70">Slot data from the club's booking provider — confirm when booking.</p>
        </>
      ) : (
        /* day: rows by start time, a pill per duration */
        <>
          <div className="space-y-2">
            {dayEntries.map(([, times]) => [...times.entries()].map(([time, arr]) => {
              const rowOn = arr.some(isSelected);
              return (
                <div key={time} className={cn("flex items-center gap-2.5 p-2.5 pl-3 rounded-xl bg-card border", rowOn ? "border-primary" : "border-border")}>
                  <div className={cn("w-[52px] font-mono text-base font-bold flex-shrink-0", rowOn && "text-primary")}>{time}</div>
                  <div className="flex gap-1.5 flex-wrap flex-1">
                    {arr.map((s) => {
                      const on = isSelected(s);
                      return (
                        <button key={s.id} type="button" onClick={() => onSelectSlot?.(s)}
                          className={cn("h-10 px-3 rounded-full text-[13px] font-bold border", on ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-foreground")}>
                          {fmtDuration(s.duration_mins)}{s.price_cents != null ? ` · £${(s.price_cents / 100).toFixed(0)}` : ""}{on ? " ✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }))}
          </div>
          <p className="text-xs text-muted-foreground">Price is for the whole court, as {providerName} lists it. Booking happens on {providerName} after you post.</p>
        </>
      )}

      {bookingUrl && !date && (
        <a href={bookingUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-muted text-sm font-semibold">
          Book on the club's system <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
};

export default ExternalAvailability;
