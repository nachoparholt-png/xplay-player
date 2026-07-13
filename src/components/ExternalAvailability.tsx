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
 */
import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { AVAILABILITY_ENABLED } from "@/lib/featureFlags";

interface Slot {
  id: string;
  starts_at: string;
  duration_mins: number;
  price_cents: number | null;
  currency: string | null;
  booking_url: string | null;
  fetched_at: string;
}

const STALE_MS = 30 * 60 * 1000;

const ExternalAvailability = ({ clubId, clubName }: { clubId: string; clubName?: string }) => {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSlots = useCallback(async () => {
    const { data } = await supabase
      .from("external_court_slots")
      .select("id, starts_at, duration_mins, price_cents, currency, booking_url, fetched_at")
      .eq("club_id", clubId)
      .gte("starts_at", new Date().toISOString())
      .lte("starts_at", new Date(Date.now() + 48 * 3600 * 1000).toISOString())
      .order("starts_at")
      .limit(60);
    return (data as Slot[]) || [];
  }, [clubId]);

  useEffect(() => {
    if (!AVAILABILITY_ENABLED) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
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
  }, [clubId, fetchSlots]);

  if (!AVAILABILITY_ENABLED) return null;

  // Group by day, dedupe by start time (multiple courts, same slot)
  const byDay = new Map<string, Map<string, Slot>>();
  for (const s of slots) {
    const day = s.starts_at.slice(0, 10);
    const time = format(new Date(s.starts_at), "HH:mm");
    if (!byDay.has(day)) byDay.set(day, new Map());
    const dayMap = byDay.get(day)!;
    if (!dayMap.has(time)) dayMap.set(time, s);
  }
  const bookingUrl = slots.find((s) => s.booking_url)?.booking_url;

  return (
    <div className="rounded-xl border border-border/40 bg-card p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
            Court availability{clubName ? ` · ${clubName}` : ""}
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
      ) : (
        <>
          {[...byDay.entries()].slice(0, 2).map(([day, times]) => (
            <div key={day}>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                {format(new Date(day + "T00:00:00"), "EEE d MMM")}
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {[...times.values()].slice(0, 12).map((s) => (
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
                ))}
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
