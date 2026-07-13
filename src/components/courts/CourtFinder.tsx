/**
 * CourtFinder — cross-app court availability search (design flow5, FC1–FC6).
 * ──────────────────────────────────────────────────────────────────────────
 * UX round 12 Jun (device feedback):
 *  - grid cells show START TIME (+from-price) instead of price-only; ALL slot
 *    variants for that club+hour are picked inside the sheet (time · length · £)
 *  - sheet sits ABOVE the tab bar (z-60 + safe-area padding) and locks
 *    background scroll while open
 *  - organize-first flow: primary CTA creates the match immediately
 *    (court-pending); "Book on Playtomic" is secondary here and also lives on
 *    the match page banner afterwards
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, ExternalLink, Zap, X, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Geolocation } from "@capacitor/geolocation";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const LONDON = { lat: 51.5074, lng: -0.1278, label: "London (city-wide)" };

type Slot = {
  club_id: string;
  club_name: string;
  source: string;
  provider: string;
  distance_m: number;
  slot_id: string;
  court_label: string | null;
  starts_at: string;
  duration_mins: number;
  price_cents: number | null;
  currency: string | null;
  booking_url: string | null;
  is_native: boolean;
  fetched_at: string;
};

type SheetData = {
  slots: Slot[]; // all variants for the tapped club+hour, sorted
  native: boolean;
};

type Window = "morning" | "afternoon" | "evening" | "all";
const WINDOWS: Record<Window, [number, number]> = {
  morning: [6, 12],
  afternoon: [12, 17],
  evening: [17, 23],
  all: [6, 23],
};

const fmtDur = (m: number) => (m < 60 ? `${m}min` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${m % 60}`);

const CourtFinder = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [coords, setCoords] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [win, setWin] = useState<Window>("evening");
  const [radiusKm, setRadiusKm] = useState(5);
  const [xplayOnly, setXplayOnly] = useState(false);
  const [results, setResults] = useState<Slot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [variantIdx, setVariantIdx] = useState(0);
  const [sheetStage, setSheetStage] = useState<"detail" | "confirm">("detail");
  const [creating, setCreating] = useState(false);

  // lock background scroll while the sheet is open (device feedback)
  useEffect(() => {
    if (sheet) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [sheet]);

  const askLocation = async () => {
    setLocating(true);
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000 });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Near you" });
    } catch {
      toast({ title: "Couldn't get your location", description: "Searching London-wide instead — you can still find courts." });
      setCoords(LONDON);
      setRadiusKm(15);
    } finally {
      setLocating(false);
    }
  };

  const runSearch = useCallback(
    async (overrides?: { radiusKm?: number; win?: Window; dayOffset?: number }) => {
      const c = coords ?? LONDON;
      const r = overrides?.radiusKm ?? radiusKm;
      const w = overrides?.win ?? win;
      const d = overrides?.dayOffset ?? dayOffset;
      if (overrides?.radiusKm) setRadiusKm(overrides.radiusKm);
      if (overrides?.win) setWin(overrides.win);
      if (overrides?.dayOffset !== undefined) setDayOffset(overrides.dayOffset);
      if (!coords) setCoords(c);

      setLoading(true);
      const day = addDays(new Date(), d);
      const [h0, h1] = WINDOWS[w];
      const from = new Date(day); from.setHours(h0, 0, 0, 0);
      const to = new Date(day); to.setHours(h1, 59, 59, 999);
      const now = new Date();
      const effFrom = from < now ? now : from;

      const { data, error } = await supabase.rpc("search_court_availability", {
        _lat: c.lat,
        _lng: c.lng,
        _radius_m: r * 1000,
        _from: effFrom.toISOString(),
        _to: to.toISOString(),
      });
      if (error) {
        toast({ title: "Search failed", description: error.message, variant: "destructive" });
        setResults([]);
      } else {
        setResults((data as Slot[]) || []);
      }
      setLoading(false);
    },
    [coords, radiusKm, win, dayOffset]
  );

  /* group results into clubs × hours — ALL variants kept per cell */
  const grid = useMemo(() => {
    if (!results) return null;
    const filtered = xplayOnly ? results.filter((s) => s.is_native) : results;
    const hoursSet = new Set<number>();
    const clubs = new Map<string, { name: string; dist: number; native: boolean; provider: string; fetched: string; byHour: Map<number, Slot[]> }>();
    for (const s of filtered) {
      const h = new Date(s.starts_at).getHours();
      hoursSet.add(h);
      if (!clubs.has(s.club_id)) {
        clubs.set(s.club_id, { name: s.club_name, dist: s.distance_m, native: s.is_native, provider: s.provider, fetched: s.fetched_at, byHour: new Map() });
      }
      const c = clubs.get(s.club_id)!;
      const arr = c.byHour.get(h) ?? [];
      arr.push(s);
      c.byHour.set(h, arr);
    }
    // sort each cell's variants by start time, then price
    for (const c of clubs.values()) {
      for (const arr of c.byHour.values()) {
        arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || (a.price_cents ?? 1e9) - (b.price_cents ?? 1e9));
      }
    }
    const hours = [...hoursSet].sort((a, b) => a - b).slice(0, 6);
    const clubRows = [...clubs.entries()]
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 12);
    return { hours, clubRows };
  }, [results, xplayOnly]);

  const dayLabel = (d: number) => (d === 0 ? "Today" : d === 1 ? "Tomorrow" : format(addDays(new Date(), d), "EEE"));
  const minsAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

  const openSheet = (slots: Slot[]) => {
    setSheet({ slots, native: slots[0].is_native });
    setVariantIdx(0);
    setSheetStage("detail");
  };
  const closeSheet = () => { setSheet(null); setSheetStage("detail"); setVariantIdx(0); };
  const sel = sheet?.slots[variantIdx];

  /* create the XPLAY match for an external slot */
  const createLinkedMatch = async (slot: Slot, booked: boolean) => {
    if (!user || creating) return;
    setCreating(true);
    const start = new Date(slot.starts_at);
    const level = profile?.padel_level ?? 3.0;
    const { data, error } = await supabase.from("matches").insert({
      organizer_id: user.id,
      club: slot.club_name,
      court: slot.court_label && !/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(slot.court_label) ? slot.court_label : null,
      match_date: format(start, "yyyy-MM-dd"),
      match_time: format(start, "HH:mm"),
      format: "social",
      level_min: Math.max(1, Math.round((level - 0.75) * 10) / 10),
      level_max: Math.min(7, Math.round((level + 0.75) * 10) / 10),
      max_players: 4,
      price_per_player: 0,
      visibility: "public",
      duration_mins: slot.duration_mins,
      court_booking_status: booked ? "booked" : "not_booked",
      external_booking_url: slot.booking_url,
    }).select().single();

    if (error || !data) {
      toast({ title: "Couldn't create the match", description: error?.message, variant: "destructive" });
      setCreating(false);
      return;
    }
    await supabase.from("match_players").insert({ match_id: data.id, user_id: user.id, team: "A", status: "confirmed" });
    setCreating(false);
    closeSheet();
    toast({
      title: booked ? "Linked match created — court booked ✓" : "Match created — gathering players",
      description: booked ? "Players can join freely." : "Book the court any time — the link is on the match page.",
    });
    navigate(`/matches/${data.id}`);
  };

  const chip = (label: string, on: boolean, onClick: () => void, key?: string) => (
    <button
      key={key ?? label}
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 rounded-full font-display text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap transition-colors",
        on ? "bg-primary/15 border border-primary/40 text-primary" : "bg-muted/40 border border-border/40 text-foreground/70"
      )}
    >
      {label}
    </button>
  );

  /* ── render ── */
  return (
    <div className="space-y-4 pb-8">
      {/* FC1 hero */}
      {!results && (
        <div className="pt-1">
          <h2 className="font-display text-[28px] font-black italic uppercase leading-[0.95]">
            Find a court
            <br />
            <span className="text-primary">anywhere.</span>
          </h2>
          <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
            One search across XPLAY clubs, Playtomic and Padelmates. No more checking four apps.
          </p>
        </div>
      )}

      {/* location */}
      {coords ? (
        <button
          onClick={askLocation}
          className="w-full flex items-center gap-3 bg-card border border-border/40 rounded-[14px] px-4 py-3.5 text-left"
        >
          <MapPin className="w-[18px] h-[18px] text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">Searching near</div>
            <div className="text-[15px] font-bold truncate">{coords.label} · {radiusKm} km</div>
          </div>
          <span className="font-display text-[11px] font-extrabold uppercase text-primary">Change</span>
        </button>
      ) : (
        <div className="rounded-[18px] p-4 bg-[#5924C6]/10 border border-[#5924C6]/40">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-xl bg-[#5924C6]/30 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-[#c4a5ff]" />
            </div>
            <h3 className="font-display text-base font-extrabold italic uppercase">Use your location?</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We'll show courts nearest you first and sort by travel distance. We never share where you are with clubs.
          </p>
          <div className="flex gap-2 mt-3.5">
            <button
              onClick={askLocation}
              disabled={locating}
              className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 font-display text-xs font-extrabold uppercase tracking-wide active:scale-[0.98] transition-transform"
            >
              {locating ? "Locating…" : "Use my location"}
            </button>
            <button
              onClick={() => { setCoords(LONDON); setRadiusKm(15); }}
              className="flex-1 border border-border rounded-xl py-3 font-display text-xs font-extrabold uppercase tracking-wide text-foreground/80"
            >
              Search London
            </button>
          </div>
        </div>
      )}

      {/* date chips — full week */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <button
            key={d}
            onClick={() => setDayOffset(d)}
            className={cn(
              "flex-shrink-0 min-w-[76px] py-2.5 px-3 rounded-xl text-center transition-colors",
              dayOffset === d ? "bg-primary text-primary-foreground" : "bg-muted/40 border border-border/40 text-foreground/80"
            )}
          >
            <div className="font-display text-xs font-extrabold uppercase tracking-wide">{dayLabel(d)}</div>
            <div className="font-mono text-[10px] opacity-70 mt-0.5">{format(addDays(new Date(), d), "d MMM")}</div>
          </button>
        ))}
      </div>

      {/* time windows */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["morning", "afternoon", "evening", "all"] as Window[]).map((w) =>
          chip(w === "all" ? "All day" : w, win === w, () => setWin(w), w)
        )}
      </div>

      {/* search CTA */}
      <button
        onClick={() => runSearch()}
        disabled={loading}
        className="w-full bg-primary text-primary-foreground rounded-[14px] py-4 font-display font-black italic text-[15px] uppercase tracking-wide active:scale-[0.99] transition-transform"
      >
        {loading ? "Searching…" : `Show courts · ${win === "all" ? "All day" : win}`}
      </button>

      {/* FC2 results */}
      {results && grid && grid.clubRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {chip(`Radius ${radiusKm}km`, false, () => runSearch({ radiusKm: radiusKm === 5 ? 10 : 5 }))}
            {chip("XPLAY only", xplayOnly, () => setXplayOnly(!xplayOnly))}
            <button onClick={() => runSearch()} className="px-3 py-2.5 rounded-full bg-muted/40 border border-border/40" aria-label="Refresh">
              <RefreshCw className={cn("w-3.5 h-3.5 text-foreground/60", loading && "animate-spin")} />
            </button>
          </div>

          {/* how-to hint */}
          <p className="text-[10.5px] text-muted-foreground/70 px-1">
            Each cell = first free start time in that hour · tap to see every slot &amp; length.
          </p>

          <div className="grid gap-1.5" style={{ gridTemplateColumns: `88px repeat(${grid.hours.length}, 1fr)` }}>
            <div />
            {grid.hours.map((h) => (
              <div key={h} className="font-mono text-[11px] font-bold text-muted-foreground text-center">{h}:00</div>
            ))}
          </div>

          {grid.clubRows.map((c) => (
            <div key={c.id}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[12.5px] font-bold truncate max-w-[160px]">{c.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{(c.dist / 1000).toFixed(1)} km</span>
                <span className="ml-auto">
                  {c.native ? (
                    <span className="inline-flex items-center gap-1 bg-primary/15 border border-primary/40 rounded-full px-2 py-0.5 font-display text-[10px] font-extrabold uppercase text-primary">
                      <Zap className="w-2.5 h-2.5 fill-primary" /> XPLAY club
                    </span>
                  ) : (
                    <span className="border border-border rounded-full px-2 py-0.5 text-[11px] font-bold text-muted-foreground capitalize">{c.provider}</span>
                  )}
                </span>
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `88px repeat(${grid.hours.length}, 1fr)` }}>
                <div className="flex items-center">
                  {!c.native && (
                    <span className="font-mono text-[10px] text-muted-foreground/60 leading-tight">
                      fetched<br />{minsAgo(c.fetched)} min ago
                    </span>
                  )}
                </div>
                {grid.hours.map((h) => {
                  const slots = c.byHour.get(h);
                  if (!slots?.length)
                    return <div key={h} className="h-11 rounded-lg bg-muted/20 border border-dashed border-border/30" />;
                  const first = slots[0];
                  const fromPrice = Math.min(...slots.map((s) => s.price_cents ?? Infinity));
                  return (
                    <button
                      key={h}
                      onClick={() => openSheet(slots)}
                      className={cn(
                        "h-11 rounded-lg flex flex-col items-center justify-center active:scale-95 transition-transform",
                        first.is_native ? "bg-primary text-primary-foreground" : "bg-muted/60 border border-border/60 text-foreground"
                      )}
                    >
                      <span className="font-mono text-[12px] font-bold leading-none">{format(new Date(first.starts_at), "HH:mm")}</span>
                      <span className={cn("text-[11px] font-semibold mt-0.5", first.is_native ? "opacity-70" : "text-muted-foreground")}>
                        {Number.isFinite(fromPrice) ? `£${Math.round(fromPrice / 100)}` : fmtDur(first.duration_mins)}
                        {slots.length > 1 ? ` · ${slots.length}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex gap-4 items-center pt-1">
            <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <span className="w-3.5 h-3.5 rounded bg-primary inline-block" /> Book in-app
            </span>
            <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <span className="w-3.5 h-3.5 rounded bg-muted/60 border border-border inline-block" /> Book on host platform
            </span>
          </div>
        </div>
      )}

      {/* FC6 empty state */}
      {results && grid && grid.clubRows.length === 0 && !loading && (
        <div className="space-y-3">
          <div className="text-center pt-4">
            <h3 className="font-display text-2xl font-black italic uppercase">Nothing free {win === "all" ? "today" : `this ${win}`}</h3>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
              No courts within {radiusKm} km for that window. Here's what's close.
            </p>
          </div>
          {[
            { t: "Try all day", s: "Widen the time window", fn: () => runSearch({ win: "all" }) },
            { t: `Expand to ${radiusKm === 5 ? 10 : 25} km`, s: "More clubs, more slots", fn: () => runSearch({ radiusKm: radiusKm === 5 ? 10 : 25 }) },
            { t: `${dayLabel(dayOffset + 1)} instead`, s: "Same window, next day", fn: () => runSearch({ dayOffset: dayOffset + 1 }) },
          ].map((a) => (
            <button
              key={a.t}
              onClick={a.fn}
              className="w-full flex items-center gap-3 bg-card border border-border/40 rounded-[14px] px-4 py-3.5 text-left"
            >
              <div className="flex-1">
                <div className="font-display text-sm font-extrabold uppercase">{a.t}</div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5">{a.s}</div>
              </div>
              <span className="bg-primary/15 text-primary rounded-full px-4 py-2 font-display text-[11px] font-extrabold uppercase">Go</span>
            </button>
          ))}
          <div className="rounded-2xl p-4 bg-amber-400/10 border border-amber-400/40">
            <h4 className="font-display text-base font-black italic uppercase">Create an open match anyway</h4>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Post it as Court-pending — gather players now, lock a court when one frees up.
            </p>
            <button
              onClick={() => navigate("/matches/create")}
              className="mt-3 w-full bg-amber-400 text-[#1A2833] rounded-xl py-3 font-display font-black italic text-[13px] uppercase tracking-wide active:scale-[0.98] transition-transform"
            >
              Create open match →
            </button>
          </div>
        </div>
      )}

      {/* ── slot sheet (above tab bar, scroll-locked) ── */}
      <AnimatePresence>
        {sheet && sel && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeSheet}
              className="fixed inset-0 bg-black/70 z-[60]"
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className={cn(
                "fixed left-0 right-0 bottom-0 z-[60] bg-background rounded-t-[28px] p-5 border-t max-h-[85dvh] overflow-y-auto",
                sheet.native ? "border-primary/40" : "border-border/40"
              )}
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 28px)" }}
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

              {sheetStage === "confirm" ? (
                /* FC4 — after choosing to book externally first */
                <div>
                  <div className="text-center mb-2">
                    <span className="border border-border rounded-full px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground capitalize">{sel.provider}</span>
                  </div>
                  <h3 className="font-display text-[24px] font-black italic uppercase text-center leading-[0.95]">
                    Did you get
                    <br />
                    the court?
                  </h3>
                  <p className="text-[13px] text-muted-foreground text-center mt-2.5 leading-relaxed">
                    {sel.club_name} · {format(new Date(sel.starts_at), "EEE HH:mm")} · {fmtDur(sel.duration_mins)}
                  </p>
                  <button
                    onClick={() => createLinkedMatch(sel, true)}
                    disabled={creating}
                    className="mt-5 w-full flex items-center gap-3 bg-green-500 text-white rounded-2xl px-4 py-4 text-left active:scale-[0.98] transition-transform"
                  >
                    <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-5 h-5" strokeWidth={3} />
                    </span>
                    <span>
                      <span className="block font-display text-base font-black italic uppercase">Yes — court booked ✓</span>
                      <span className="block text-[11px] opacity-85">Creates the match as booked · players join freely</span>
                    </span>
                  </button>
                  <button
                    onClick={() => createLinkedMatch(sel, false)}
                    disabled={creating}
                    className="mt-2.5 w-full flex items-center gap-3 bg-[#FF6B35]/10 border border-[#FF6B35]/40 rounded-2xl px-4 py-4 text-left active:scale-[0.98] transition-transform"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#FF6B35]/20 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-4 h-4 text-[#FF6B35]" />
                    </span>
                    <span>
                      <span className="block font-display text-base font-black italic uppercase text-[#FF8A5C]">Not yet</span>
                      <span className="block text-[11px] text-[#FF8A5C]/80">Creates it Court-pending · confirm later from the match page</span>
                    </span>
                  </button>
                </div>
              ) : (
                <div>
                  {/* header */}
                  {sheet.native ? (
                    <span className="inline-flex items-center gap-1 bg-primary/15 border border-primary/40 rounded-full px-2.5 py-1 font-display text-[10px] font-extrabold uppercase text-primary mb-3">
                      <Zap className="w-2.5 h-2.5 fill-primary" /> XPLAY club
                    </span>
                  ) : (
                    <span className="border border-border rounded-full px-2.5 py-1 text-[10px] font-bold text-muted-foreground capitalize mb-3 inline-block">{sel.provider}</span>
                  )}
                  <h3 className="font-display text-[22px] font-black italic uppercase leading-none">{sel.club_name}</h3>
                  <p className="text-[13px] text-muted-foreground mt-1.5">
                    {format(new Date(sel.starts_at), "EEE d MMM")} · {(sel.distance_m / 1000).toFixed(1)} km away
                  </p>

                  {/* variant picker — every slot in this hour: time · length · price */}
                  <div className="mt-4">
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground mb-2">
                      Pick a slot
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {sheet.slots.map((s, i) => (
                        <button
                          key={s.slot_id + s.duration_mins}
                          onClick={() => setVariantIdx(i)}
                          className={cn(
                            "flex-shrink-0 rounded-xl px-3.5 py-2.5 text-center border transition-colors",
                            i === variantIdx ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border/50"
                          )}
                        >
                          <div className="font-mono text-[15px] font-bold leading-none">{format(new Date(s.starts_at), "HH:mm")}</div>
                          <div className={cn("text-[10px] font-semibold mt-1", i === variantIdx ? "opacity-75" : "text-muted-foreground")}>
                            {fmtDur(s.duration_mins)}{s.price_cents != null ? ` · £${Math.round(s.price_cents / 100)}` : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {sheet.native ? (
                    /* FC3a — XPLAY slot */
                    <>
                      <div className="flex items-center gap-2 mt-3.5 bg-amber-400/10 border border-amber-400/30 rounded-xl px-3.5 py-3">
                        <Zap className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0" />
                        <span className="text-xs">+100 XP for playing this match · <b className="text-amber-400">worth £1</b></span>
                      </div>
                      <button
                        onClick={() => {
                          closeSheet();
                          navigate("/matches/create", { state: { prefillClubId: sel.club_id, prefillClubName: sel.club_name } });
                        }}
                        className="mt-4 w-full bg-primary text-primary-foreground rounded-[14px] py-4 font-display font-black italic text-[15px] uppercase tracking-wide active:scale-[0.98] transition-transform"
                      >
                        Book court & create match
                      </button>
                      <p className="text-[11px] text-muted-foreground/60 text-center mt-3">Court guaranteed instantly · paid in-app</p>
                    </>
                  ) : (
                    /* FC3b — external slot: ORGANIZE-FIRST (device feedback) */
                    <>
                      <div className="bg-primary/5 border border-primary/25 rounded-[14px] px-4 py-3 mt-3.5">
                        <p className="text-xs leading-relaxed">
                          We'll create your XPLAY match for{" "}
                          <b>{format(new Date(sel.starts_at), "EEE HH:mm")} · {fmtDur(sel.duration_mins)}</b> at {sel.club_name} —
                          players can join while you sort the court. The Playtomic booking link stays on the match page.
                        </p>
                      </div>
                      <div className="flex items-start gap-2 mt-2.5 px-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <span className="text-[11px] text-muted-foreground leading-relaxed">
                          Indicative price {sel.price_cents != null ? `£${Math.round(sel.price_cents / 100)}` : "—"} · fetched {minsAgo(sel.fetched_at)} min ago — confirm on {sel.provider} when booking.
                        </span>
                      </div>
                      <button
                        onClick={() => createLinkedMatch(sel, false)}
                        disabled={creating}
                        className="mt-4 w-full bg-primary text-primary-foreground rounded-[14px] py-4 font-display font-black italic text-[15px] uppercase tracking-wide active:scale-[0.98] transition-transform"
                      >
                        {creating ? "Creating…" : "Create match · gather players"}
                      </button>
                      <a
                        href={sel.booking_url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setTimeout(() => setSheetStage("confirm"), 600)}
                        className="mt-2.5 w-full border border-border rounded-[14px] py-3.5 font-display text-[12.5px] font-bold uppercase tracking-wide text-foreground/70 flex items-center justify-center gap-2"
                      >
                        Book on {sel.provider} first <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </>
                  )}
                </div>
              )}

              <button onClick={closeSheet} className="absolute top-4 right-4 p-1.5 text-muted-foreground" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CourtFinder;
