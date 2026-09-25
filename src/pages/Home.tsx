/**
 * Home — the player's landing screen (Home redesign, 25 Sep 2026).
 *
 * Top to bottom: greeting · Coming up (my next matches + tournaments) ·
 * Play at your clubs (the clubs I play at, with their next free slots) ·
 * Another club / Court Radar rows · Open games near you · pinned "New match".
 * One action per block, times in mono, lime = XPLAY, purple = tournament, amber = value.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Star, Radar, Trophy, CircleDot, CalendarX2 } from "lucide-react";
import { motion } from "framer-motion";
import { format, addDays } from "date-fns";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { distanceMiles, formatMiles } from "@/lib/distance";
import { isOtherClub, isMembersOnly, providerHasFeed, formatNextSlot } from "@/components/clubs/clubTier";
import { favouriteClubIds } from "@/lib/favouriteClubs";
import CreateMatchModal, { type CreateMatchInitial, type ClubSelection } from "@/components/CreateMatchModal";
import MatchJoinModal from "@/components/MatchJoinModal";
import CreateFab from "@/components/CreateFab";
import { TOURNAMENTS_ENABLED, AVAILABILITY_ENABLED } from "@/lib/featureFlags";

// ── Types ────────────────────────────────────────────────────────────────────
type UpcomingItem = {
  kind: "match" | "tournament";
  id: string;
  at: Date;
  time: string;
  durationMins: number | null;
  club: string;
  status: { text: string; tone: "amber" | "green" | "lime" | "muted" };
};

type ClubRow = {
  id: string;
  club_name: string;
  location: string | null;
  city: string | null;
  source: string;
  external_provider: string | null;
  latitude: number | null;
  longitude: number | null;
};

type SlotPill = {
  starts_at: string;
  duration_mins: number;
  /** whole-court price in GBP */
  price: number | null;
  /** per-player price in GBP (native clubs) */
  pricePP: number | null;
  booking_url: string | null;
  court_label: string | null;
};

type HomeClub = ClubRow & { distanceMi: number | null; slots: SlotPill[] };

type OpenGame = {
  id: string;
  club: string;
  time: string;
  date: string;
  levelMin: number;
  levelMax: number;
  maxPlayers: number;
  count: number;
};

const RECENT_KEY = "xplay.recentClubs";
const MATCH_ACTIVE = ["open", "almost_full", "full", "awaiting_score"] as const;
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min`);
const squash = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const greetingWord = () => { const h = new Date().getHours(); return h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening"; };

const toneClass: Record<UpcomingItem["status"]["tone"], string> = {
  amber: "text-secondary",
  green: "text-win",
  lime: "text-primary",
  muted: "text-muted-foreground",
};

/** Position already known (stored on the profile) or already granted — never prompts. */
async function quietPosition(userId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data } = await supabase.from("profiles").select("last_lat, last_lng").eq("user_id", userId).maybeSingle();
    const p = data as unknown as { last_lat: number | null; last_lng: number | null } | null;
    if (p?.last_lat != null && p?.last_lng != null) return { lat: p.last_lat, lng: p.last_lng };
  } catch { /* fall through */ }
  try {
    if (Capacitor.isNativePlatform()) {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") return null;
      const pos = await Geolocation.getCurrentPosition({ timeout: 6000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    if (!navigator.permissions || !navigator.geolocation) return null;
    const st = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    if (st.state !== "granted") return null;
    const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch { return null; }
}

// ── Page ─────────────────────────────────────────────────────────────────────
const Home = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [clubs, setClubs] = useState<HomeClub[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [openGames, setOpenGames] = useState<OpenGame[]>([]);
  const [openLoading, setOpenLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<CreateMatchInitial | null>(null);
  const [joinMatchId, setJoinMatchId] = useState<string | null>(null);

  const firstName = profile?.display_name?.split(" ")[0] || "Player";
  const today = new Date().toISOString().slice(0, 10);

  const openCreate = (initial: CreateMatchInitial | null) => { setCreateInitial(initial); setCreateOpen(true); };
  const toSelection = (c: ClubRow): ClubSelection => ({ id: c.id, club_name: c.club_name, location: c.location, city: c.city, source: c.source, external_provider: c.external_provider });

  // ── Coming up: my confirmed matches + my tournaments ──
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setUpcomingLoading(true);
      const items: UpcomingItem[] = [];
      const { data: joins } = await supabase.from("match_players").select("match_id").eq("user_id", user.id).eq("status", "confirmed");
      const ids = (joins || []).map((j) => j.match_id);
      if (ids.length) {
        const { data: rows } = await supabase.from("matches").select("*").in("id", ids).in("status", [...MATCH_ACTIVE])
          .gte("match_date", today).order("match_date", { ascending: true }).order("match_time", { ascending: true }).limit(8);
        const ms = (rows || []) as any[];
        const counts = new Map<string, number>();
        if (ms.length) {
          const { data: pl } = await supabase.from("match_players").select("match_id").in("match_id", ms.map((m) => m.id)).eq("status", "confirmed");
          (pl || []).forEach((p) => counts.set(p.match_id, (counts.get(p.match_id) ?? 0) + 1));
        }
        for (const m of ms) {
          const spots = m.max_players - (counts.get(m.id) ?? 0);
          const mine = m.organizer_id === user.id;
          let status: UpcomingItem["status"];
          if (["awaiting_score", "pending_review", "review_requested"].includes(m.status)) status = { text: "Add the score", tone: "lime" };
          else if (mine && m.court_booking_status === "not_booked") status = { text: "Book the court", tone: "amber" };
          else if (spots > 0) status = { text: `${spots} spot${spots === 1 ? "" : "s"} left`, tone: "amber" };
          else status = { text: "Court reserved", tone: "green" };
          items.push({ kind: "match", id: m.id, at: new Date(`${m.match_date}T${m.match_time}`), time: m.match_time.slice(0, 5), durationMins: m.duration_mins ?? null, club: m.club, status });
        }
      }
      if (TOURNAMENTS_ENABLED) {
        const sb = supabase as any;
        const { data: tp } = await sb.from("tournament_players").select("tournament_id").eq("user_id", user.id).eq("status", "confirmed");
        const tids = ((tp || []) as { tournament_id: string }[]).map((t) => t.tournament_id);
        if (tids.length) {
          const { data: ts } = await sb.from("tournaments").select("*").in("id", tids).gte("scheduled_date", today).neq("status", "cancelled").order("scheduled_date", { ascending: true }).limit(8);
          for (const t of (ts || []) as any[]) {
            const time = (t.scheduled_time as string | null)?.slice(0, 5) ?? "—";
            const at = new Date(`${t.scheduled_date}T${t.scheduled_time ?? "00:00"}`);
            items.push({ kind: "tournament", id: t.id, at, time, durationMins: t.total_time_mins ?? null, club: t.venue_name ?? t.club ?? t.name,
              status: (t.ticket_price_cents ?? 0) > 0 ? { text: "Ticket paid", tone: "green" } : { text: "Registered", tone: "green" } });
          }
        }
      }
      items.sort((a, b) => a.at.getTime() - b.at.getTime());
      if (!cancelled) { setUpcoming(items.slice(0, 4)); setUpcomingLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user, today]);

  // ── Play at your clubs ──
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setClubsLoading(true);
      const [{ data: clubRows }, { data: joins }, pos] = await Promise.all([
        (supabase as any).from("clubs").select("id, club_name, location, city, source, external_provider, latitude, longitude").eq("club_status", "active").neq("kind", "organiser") as Promise<{ data: ClubRow[] | null }>,
        supabase.from("match_players").select("match_id").eq("user_id", user.id).eq("status", "confirmed"),
        quietPosition(user.id),
      ]);
      const all = ((clubRows || []) as ClubRow[]);
      const byName = new Map(all.map((c) => [squash(c.club_name), c]));
      const picked: ClubRow[] = [];
      const add = (c: ClubRow | undefined) => { if (c && picked.length < 3 && !picked.some((p) => p.id === c.id)) picked.push(c); };

      // (0) favourite club (starred on the club page) always first
      favouriteClubIds().forEach((id) => add(all.find((c) => c.id === id)));
      // (a) clubs of my match history, most frequent first
      const ids = (joins || []).map((j) => j.match_id);
      if (ids.length) {
        const { data: hist } = await supabase.from("matches").select("club").in("id", ids).order("match_date", { ascending: false }).limit(100);
        const freq = new Map<string, number>();
        (hist || []).forEach((m) => { const k = squash(m.club ?? ""); if (k) freq.set(k, (freq.get(k) ?? 0) + 1); });
        [...freq.entries()].sort((a, b) => b[1] - a[1]).forEach(([k]) => add(byName.get(k)));
      }
      // (b) recent clubs on this phone (written by CreateMatchModal)
      try { (JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as string[]).forEach((id) => add(all.find((c) => c.id === id))); } catch { /* ignore */ }
      // (c) nearest clubs, only when the position is already known
      const dist = (c: ClubRow) => pos && c.latitude != null && c.longitude != null ? distanceMiles(pos.lat, pos.lng, c.latitude, c.longitude) : null;
      if (picked.length < 3 && pos) {
        [...all].filter((c) => dist(c) != null).sort((a, b) => (dist(a) ?? 999) - (dist(b) ?? 999)).forEach((c) => add(c));
      }

      // Slots per club
      const slotsFor = new Map<string, SlotPill[]>();
      const feedIds = picked.filter((c) => isOtherClub(c.source) && providerHasFeed(c.external_provider)).map((c) => c.id);
      const nativeIds = picked.filter((c) => !isOtherClub(c.source)).map((c) => c.id);
      const nowIso = new Date().toISOString();
      const weekIso = addDays(new Date(), 7).toISOString();
      if (AVAILABILITY_ENABLED && feedIds.length) {
        const { data } = await supabase.from("external_court_slots").select("club_id, starts_at, duration_mins, price_cents, booking_url")
          .in("club_id", feedIds).gte("starts_at", nowIso).lte("starts_at", weekIso).order("starts_at").limit(600);
        const byClub = new Map<string, Map<string, SlotPill>>();
        for (const s of (data || []) as any[]) {
          const m = byClub.get(s.club_id) ?? new Map<string, SlotPill>();
          const cur = m.get(s.starts_at);
          const price = s.price_cents != null ? s.price_cents / 100 : null;
          // cheapest option per start time (shortest duration wins ties)
          if (!cur || (price ?? Infinity) < (cur.price ?? Infinity) || ((price ?? Infinity) === (cur.price ?? Infinity) && s.duration_mins < cur.duration_mins)) {
            m.set(s.starts_at, { starts_at: s.starts_at, duration_mins: s.duration_mins, price, pricePP: null, booking_url: s.booking_url ?? null, court_label: null });
          }
          byClub.set(s.club_id, m);
        }
        byClub.forEach((m, id) => slotsFor.set(id, [...m.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3)));
      }
      if (nativeIds.length) {
        const { data: courts } = await supabase.from("courts").select("id, club_id, name, nickname").in("club_id", nativeIds).eq("active", true);
        const courtClub = new Map(((courts || []) as any[]).map((c) => [c.id, c]));
        if (courtClub.size) {
          const { data } = await supabase.from("court_slots").select("*").in("court_id", [...courtClub.keys()]).eq("status", "available").is("coaching_session_id", null)
            .gte("starts_at", nowIso).lte("starts_at", weekIso).order("starts_at").limit(300);
          const byClub = new Map<string, Map<string, SlotPill>>();
          for (const s of (data || []) as any[]) {
            const court = courtClub.get(s.court_id); if (!court) continue;
            const m = byClub.get(court.club_id) ?? new Map<string, SlotPill>();
            if (!m.has(s.starts_at)) {
              const price = s.price_cents != null ? Number(s.price_cents) / 100 : s.price != null ? Number(s.price) : null;
              const mins = Math.max(15, Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000));
              m.set(s.starts_at, { starts_at: s.starts_at, duration_mins: mins, price, pricePP: price != null ? price / 4 : null, booking_url: null, court_label: court.nickname || court.name });
            }
            byClub.set(court.club_id, m);
          }
          byClub.forEach((m, id) => slotsFor.set(id, [...m.values()].slice(0, 3)));
        }
      }

      if (!cancelled) {
        setClubs(picked.map((c) => ({ ...c, distanceMi: dist(c), slots: slotsFor.get(c.id) ?? [] })));
        setClubsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ── Open games near you ──
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setOpenLoading(true);
      const [{ data: rows }, { data: joins }] = await Promise.all([
        supabase.from("matches").select("*").in("status", ["open", "almost_full"]).gte("match_date", today)
          .order("match_date", { ascending: true }).order("match_time", { ascending: true }).limit(8),
        supabase.from("match_players").select("match_id").eq("user_id", user.id).eq("status", "confirmed"),
      ]);
      const mine = new Set((joins || []).map((j) => j.match_id));
      const list = ((rows || []) as any[]).filter((m) => !mine.has(m.id) && m.organizer_id !== user.id);
      const counts = new Map<string, number>();
      if (list.length) {
        const { data: pl } = await supabase.from("match_players").select("match_id").in("match_id", list.map((m) => m.id)).eq("status", "confirmed");
        (pl || []).forEach((p) => counts.set(p.match_id, (counts.get(p.match_id) ?? 0) + 1));
      }
      const games = list.map((m) => ({ id: m.id, club: m.club, time: m.match_time.slice(0, 5), date: m.match_date, levelMin: m.level_min, levelMax: m.level_max, maxPlayers: m.max_players, count: counts.get(m.id) ?? 0 }))
        .filter((g) => g.count < g.maxPlayers).slice(0, 2);
      if (!cancelled) { setOpenGames(games); setOpenLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user, today]);

  const dayLabel = (d: string) => { const { day } = formatNextSlot(d); return day; };

  return (
    <div className="px-4 pt-4 pb-32 space-y-7">
      {/* ── Greeting ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-[11px] font-black tracking-[0.14em] text-muted-foreground uppercase">{format(new Date(), "EEEE · d MMMM")}</div>
        <h1 className="font-display text-[28px] font-black italic uppercase leading-tight mt-0.5">{greetingWord()}, {firstName}</h1>
      </motion.div>

      {/* ── Coming up ── */}
      <section className="space-y-3">
        <SectionHead title="Coming up" action="See all" onAction={() => navigate("/activity")} />
        {upcomingLoading ? (
          <div className="flex gap-3 overflow-hidden">{[1, 2].map((i) => <div key={i} className="w-[240px] h-[132px] flex-shrink-0 rounded-2xl bg-muted animate-pulse" />)}</div>
        ) : upcoming.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border/70 p-5 flex items-center gap-4">
            <CalendarX2 className="w-6 h-6 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-display font-black italic uppercase text-base">No plans yet</div>
              <button onClick={() => navigate("/courts")} className="text-primary text-sm font-bold mt-0.5">Find a court ›</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 scrollbar-hide">
            {upcoming.map((it) => {
              const isT = it.kind === "tournament";
              return (
                <button key={`${it.kind}-${it.id}`} onClick={() => navigate(isT ? `/tournaments/${it.id}` : `/matches/${it.id}`)}
                  className="w-[240px] flex-shrink-0 snap-start text-left rounded-2xl bg-card border border-border/60 p-4 active:scale-[0.98] transition-transform">
                  <div className="flex items-center justify-between">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                      isT ? "bg-accent/25 text-accent-foreground" : "bg-primary text-primary-foreground")}>
                      {isT ? <Trophy className="w-3 h-3" /> : <CircleDot className="w-3 h-3" />}
                      {isT ? "Tournament" : "Match"}
                    </span>
                    <span className="text-[11px] font-bold text-muted-foreground">{dayLabel(it.at.toISOString())}</span>
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className="font-mono text-[30px] font-bold leading-none">{it.time}</span>
                    {it.durationMins ? <span className="font-mono text-xs text-muted-foreground">{fmtDur(it.durationMins)}</span> : null}
                  </div>
                  <div className="mt-2 text-sm font-bold truncate">{it.club}</div>
                  <div className={cn("text-xs font-semibold mt-0.5", toneClass[it.status.tone])}>{it.status.text}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Play at your clubs ── */}
      <section className="space-y-3">
        <SectionHead title="Play at your clubs" />
        {clubsLoading ? (
          <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-[150px] rounded-2xl bg-muted animate-pulse" />)}</div>
        ) : (
          clubs.map((c, idx) => {
            const other = isOtherClub(c.source);
            const members = other && isMembersOnly(c.external_provider);
            const tag = members ? "Members only" : other ? "Live courts" : "XPLAY club";
            return (
              <div key={c.id} className={cn("rounded-2xl bg-card border p-4 space-y-3", other ? "border-border/60" : "border-primary/70")}>
                <button onClick={() => navigate(`/clubs/${c.id}`, { state: { from: "/" } })} className="w-full flex items-center gap-2 text-left">
                  {idx === 0 && <Star className="w-4 h-4 text-secondary fill-secondary flex-shrink-0" />}
                  <span className="font-bold text-[15px] truncate flex-1">{c.club_name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider flex-shrink-0",
                    other ? "border border-border text-muted-foreground" : "bg-primary/15 text-primary")}>{tag}</span>
                  {c.distanceMi != null && <span className="font-mono text-[11px] text-muted-foreground flex-shrink-0">{formatMiles(c.distanceMi)}</span>}
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>

                <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5 scrollbar-hide">
                  {members ? (
                    <Pill onClick={() => openCreate({ club: toSelection(c) })}><span className="text-sm font-bold">Pick a time ›</span></Pill>
                  ) : (
                    c.slots.map((s) => {
                      const { day, time } = formatNextSlot(s.starts_at);
                      const price = s.pricePP != null ? `£${s.pricePP % 1 ? s.pricePP.toFixed(2) : s.pricePP.toFixed(0)} pp` : s.price != null ? `£${s.price.toFixed(0)}` : null;
                      return (
                        <Pill key={s.starts_at} onClick={() => openCreate({ club: toSelection(c), slot: { starts_at: s.starts_at, duration_mins: s.duration_mins, price_cents: s.price != null ? Math.round(s.price * 100) : null, booking_url: s.booking_url, court_label: s.court_label } })}>
                          <span className="block text-[11px] text-muted-foreground">{day} <span className="font-mono font-bold text-foreground">{time}</span></span>
                          <span className="block font-mono text-xs mt-0.5">{fmtDur(s.duration_mins)}{price ? ` · ${price}` : ""}</span>
                        </Pill>
                      );
                    })
                  )}
                  {!members && c.slots.length === 0 && (
                    <span className="self-center text-xs text-muted-foreground pr-1">No free courts listed</span>
                  )}
                  <Pill onClick={() => openCreate({ club: toSelection(c) })} muted><span className="text-sm font-bold whitespace-nowrap">All times ›</span></Pill>
                </div>
              </div>
            );
          })
        )}

        <button onClick={() => openCreate(null)} className="w-full rounded-2xl border-2 border-dashed border-border/70 px-4 py-3.5 flex items-center justify-between text-left active:bg-card/60">
          <span className="text-sm font-bold">Another club or any court</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <button onClick={() => navigate("/courts")} className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0"><Radar className="w-5 h-5 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">Court Radar</div>
            <div className="text-xs text-muted-foreground">Free courts anywhere</div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </section>

      {/* ── Open games near you ── */}
      <section className="space-y-3">
        <SectionHead title="Open games near you" action="More" onAction={() => navigate("/matches")} />
        {openLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />)}</div>
        ) : openGames.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No open games right now.</p>
        ) : (
          <div className="space-y-2">
            {openGames.map((g) => (
              <div key={g.id} className="rounded-2xl bg-card border border-border/60 px-4 py-3 flex items-center gap-3">
                <button onClick={() => navigate(`/matches/${g.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="flex-shrink-0">
                    <div className="font-mono text-xl font-bold leading-none">{g.time}</div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">{dayLabel(`${g.date}T${g.time}:00`)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{g.club}</div>
                    <div className="text-xs text-muted-foreground">Level {g.levelMin}–{g.levelMax} · {g.count} of {g.maxPlayers}</div>
                  </div>
                </button>
                <button onClick={() => setJoinMatchId(g.id)} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-black uppercase tracking-wider active:scale-95 flex-shrink-0">Join</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <CreateFab label="New match" onClick={() => openCreate(null)} />
      <CreateMatchModal open={createOpen} onOpenChange={setCreateOpen} initial={createInitial} />
      <MatchJoinModal matchId={joinMatchId} open={!!joinMatchId} onOpenChange={(o) => !o && setJoinMatchId(null)} />
    </div>
  );
};

// ── Bits ─────────────────────────────────────────────────────────────────────
const SectionHead = ({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) => (
  <div className="flex items-center justify-between">
    <h2 className="font-display text-sm font-black italic uppercase tracking-[0.08em]">{title}</h2>
    {action && onAction && <button onClick={onAction} className="text-xs font-bold text-primary">{action} ›</button>}
  </div>
);

const Pill = ({ children, onClick, muted }: { children: ReactNode; onClick: () => void; muted?: boolean }) => (
  <button type="button" onClick={onClick}
    className={cn("flex-shrink-0 rounded-xl px-3 py-2 text-left border active:scale-95 transition-transform min-h-[48px] flex flex-col justify-center",
      muted ? "border-border/60 bg-transparent" : "border-border bg-muted")}>
    {children}
  </button>
);

export default Home;
