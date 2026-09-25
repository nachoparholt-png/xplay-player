/**
 * ExternalAvailability — Layer 2 (club directory design doc)
 * ───────────────────────────────────────────────────────────
 * Read-only aggregated court availability for a non-XPLAY ("directory") club,
 * collected from external providers (Playtomic first). Booking happens on the
 * host platform via deep link — XPLAY never takes the transaction.
 *
 * Cache-aside: if the stored slots are stale (> 30 min) or absent, triggers an
 * on-demand collect for this club, then refetches. Fails soft to a quiet
 * "availability unavailable" state — never blocks match creation.
 *
 * Selectable mode (match creation): pass `onSelectSlot` and the time chips
 * become tappable — tapping one prefills the match date & time in the parent
 * form. The slot is still NOT a reservation; booking happens on the club's
 * own system via the deep link.
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
  /** When provided, slot chips become tappable and call back to prefill the form. */
  onSelectSlot?: (slot: ExternalSlot) => void;
  /** Currently selected date+time in the parent form — highlights the matching chip. */
  selected?: { date: string; time: string } | null;
  /** Match creation: show only this day's slots (yyyy-MM-dd). Null = no date picked yet. */
  date?: string | null;
  /** Match creation: how many slots are shown for `date` (0 lets the parent offer a manual grid). */
  onSlotCount?: (n: number) => void;
}

const STALE_MS = 30 * 60 * 1000;

const ExternalAvailability = ({ clubId, clubName, provider, onSelectSlot, selected, date, onSlotCount }: ExternalAvailabilityProps) => {
  const [slots, setSlots] = useState<ExternalSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Members-only clubs (David Lloyd): no feed, never call the collectors.
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
      const stale =
        data.length === 0 ||
        Date.now() - new Date(data[0].fetched_at).getTime() > STALE_MS;

      if (stale) {
        setRefreshing(true);
        try {
          // on-demand collect (fails soft — collector may be rate-limited/off).
          // Fire both aggregators; each is a no-op unless this club is mapped to it.
          await Promise.allSettled([
            supabase.functions.invoke("collect-playtomic-availability", {
              body: { mode: "collect", club_id: clubId, days: 2 },
            }),
            supabase.functions.invoke("collect-padelmates-availability", {
              body: { mode: "collect", club_id: clubId, days: 2 },
            }),
          ]);
          data = await fetchSlots();
        } catch {
          /* keep whatever we had */
        }
        if (!cancelled) setRefreshing(false);
      }
      if (!cancelled) { setSlots(data); setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [clubId, fetchSlots, provider]);

  // Group by day, dedupe by start time (multiple courts, same slot)
  const byDay = new Map<string, Map<string, ExternalSlot>>();
  for (const s of slots) {
    const day = s.starts_at.slice(0, 10);
    const time = format(new Date(s.starts_at), "HH:mm");
    if (!byDay.has(day)) byDay.set(day, new Map());
    const dayMap = byDay.get(day)!;
    if (!dayMap.has(time)) dayMap.set(time, s);
  }
  const bookingUrl = slots.find((s) => s.booking_url)?.booking_url;

  // Match creation: one day at a time. Report the count so the parent can fall back to a manual grid.
  const dayEntries = date ? [...byDay.entries()].filter(([d]) => d === date) : [...byDay.entries()].slice(0, 2);
  const shownCount = dayEntries.reduce((n, [, t]) => n + t.size, 0);
  useEffect(() => {
    if (!AVAILABILITY_ENABLED || membersOnly) { onSlotCount?.(0); return; }
    if (!loading) onSlotCount?.(shownCount);
  }, [loading, shownCount, onSlotCount, membersOnly]);

  // (hooks above this line — early returns must come after them)
  if (!AVAILABILITY_ENABLED) return null;

  if (membersOnly) {
    return (
      <p className="rounded-xl border border-border/40 bg-card p-3.5 text-xs text-foreground/85">
        Members only · book the court in the David Lloyd Clubs app, then mark it booked here.
      </p>
    );
  }

  const fmtDuration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min`);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const matchDateHasSlots = !!date && byDay.has(date);

  const isSelected = (s: ExternalSlot) =>
    !!selected &&
    s.starts_at.slice(0, 10) === selected.date &&
    format(new Date(s.starts_at), "HH:mm") === selected.time;

  return (
    <div className="rounded-xl border border-border/40 bg-card p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
            {date ? "Free courts on the club's booking site" : `Court availability${clubName ? ` · ${clubName}` : ""}`}
          </span>
        </div>
        {refreshing && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
      </div>

      {loading ? (
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : byDay.size === 0 ? (
        <p className="text-xs text-muted-foreground">
          Live availability isn't available for this club right now — check the club's own
          booking system for slots.
        </p>
      ) : date && !matchDateHasSlots ? (
        <p className="text-xs text-muted-foreground">
          {date === todayKey || date > todayKey
            ? "No free courts listed for this day yet. Pick another day, or choose a time manually below."
            : "Pick a day above to see the club's free courts."}
        </p>
      ) : (
        <>
          {onSelectSlot && (
            <p className="text-[11px] text-muted-foreground">
              Tap a free court to use its time. Price is per court for the whole slot, as listed by the club.
            </p>
          )}
          {dayEntries.map(([day, times]) => (
            <div key={day}>
              {!date && (
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {format(new Date(day + "T00:00:00"), "EEE d MMM")}
                </p>
              )}
              <div className={cn("gap-1.5 pb-1", date ? "grid grid-cols-3" : "flex overflow-x-auto")}>
                {[...times.values()].slice(0, date ? 60 : 12).map((s) =>
                  onSelectSlot ? (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectSlot(s)}
                      className={cn(
                        "flex-shrink-0 rounded-lg px-2.5 py-2 text-center border transition-colors",
                        isSelected(s)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
                      )}
                    >
                      <span className={cn(
                        "block font-mono text-sm font-bold",
                        !isSelected(s) && "text-emerald-400"
                      )}>
                        {format(new Date(s.starts_at), "HH:mm")}
                      </span>
                      <span className={cn(
                        "block text-[11px]",
                        isSelected(s) ? "text-primary-foreground/80" : "text-foreground/80"
                      )}>
                        {fmtDuration(s.duration_mins)}{s.price_cents != null ? ` · £${(s.price_cents / 100).toFixed(0)}` : ""}
                      </span>
                    </button>
                  ) : (
                    <div
                      key={s.id}
                      className="flex-shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-center"
                    >
                      <span className="block font-mono text-xs font-bold">
                        {format(new Date(s.starts_at), "HH:mm")}
                      </span>
                      {s.price_cents != null && (
                        <span className="block text-[11px] text-muted-foreground">
                          £{(s.price_cents / 100).toFixed(0)}
                        </span>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/70">
            Slot data from the club's booking provider — confirm when booking.
          </p>
        </>
      )}

      {bookingUrl && (
        <a
          href={bookingUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
        >
          Book on the club's system <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
};

export default ExternalAvailability;
