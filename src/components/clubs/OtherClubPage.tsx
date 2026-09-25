/**
 * OtherClubPage (25 Sep 2026) — a club that is NOT hosted by XPLAY (clubs.source = 'directory').
 * One scroll: header · Free today (live feed, cheapest per start) · Set up a match / Book on <provider> ·
 * Open games here · Details · Claim. Members-only chains (David Lloyd) have no feed.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, ExternalLink, RefreshCw, ChevronRight } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { AVAILABILITY_ENABLED } from "@/lib/featureFlags";
import { distanceMiles, formatMiles } from "@/lib/distance";
import { isFavouriteClub, toggleFavouriteClub } from "@/lib/favouriteClubs";
import { isMembersOnly, providerLabel, formatNextSlot } from "./clubTier";
import ClaimClubSheet from "./ClaimClubSheet";
import CreateMatchModal, { type CreateMatchInitial, type ClubSelection } from "@/components/CreateMatchModal";
import MatchJoinModal from "@/components/MatchJoinModal";

interface Slot {
  id: string;
  provider: string | null;
  starts_at: string;
  duration_mins: number | null;
  price_cents: number | null;
  booking_url: string | null;
  fetched_at: string;
}

interface MatchRow {
  id: string;
  match_date: string;
  match_time: string;
  level_min: number | null;
  level_max: number | null;
  max_players: number | null;
  organizer_id: string | null;
  _players: number;
}

const STALE_MS = 30 * 60 * 1000;
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}` : ""}` : `${m} min`);
const openExternal = async (url: string) => {
  try { await Browser.open({ url }); } catch { window.open(url, "_blank", "noopener"); }
};

const OtherClubPage = ({ club, onBack }: { club: any; onBack: () => void }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [courtCount, setCourtCount] = useState<number | null>(null);
  const [distanceMi, setDistanceMi] = useState<number | null>(null);
  const [fav, setFav] = useState(() => isFavouriteClub(club.id));
  const [claimOpen, setClaimOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<CreateMatchInitial | null>(null);
  const [joinMatchId, setJoinMatchId] = useState<string | null>(null);
  const [allGames, setAllGames] = useState(false);

  const currency = club.currency_symbol ?? "£";
  const membersOnly = isMembersOnly(club.external_provider);
  const provider = providerLabel(slots[0]?.provider ?? club.external_provider);

  const fetchSlots = useCallback(async () => {
    const { data } = await supabase
      .from("external_court_slots")
      .select("id, provider, starts_at, duration_mins, price_cents, booking_url, fetched_at")
      .eq("club_id", club.id)
      .gte("starts_at", new Date().toISOString())
      .lte("starts_at", new Date(Date.now() + 48 * 3600 * 1000).toISOString())
      .order("starts_at")
      .order("price_cents")
      .limit(200);
    return (data as Slot[]) || [];
  }, [club.id]);

  // Availability — cache-aside, same contract as ExternalAvailability (fails soft)
  useEffect(() => {
    if (!AVAILABILITY_ENABLED || membersOnly) { setLoadingSlots(false); return; }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      let data = await fetchSlots();
      const stale = data.length === 0 || Date.now() - new Date(data[0].fetched_at).getTime() > STALE_MS;
      if (!cancelled) { setSlots(data); setLoadingSlots(false); }
      if (stale) {
        if (!cancelled) setRefreshing(true);
        try {
          await Promise.allSettled([
            supabase.functions.invoke("collect-playtomic-availability", { body: { mode: "collect", club_id: club.id, days: 2 } }),
            supabase.functions.invoke("collect-padelmates-availability", { body: { mode: "collect", club_id: club.id, days: 2 } }),
          ]);
          data = await fetchSlots();
          if (!cancelled) setSlots(data);
        } catch { /* keep what we had */ }
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [club.id, fetchSlots, membersOnly]);

  // Courts count + distance (position only when already on the profile)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase.from("courts").select("id", { count: "exact", head: true }).eq("club_id", club.id).eq("active", true);
      if (!cancelled) setCourtCount(count ?? null);
      if (user && club.latitude != null && club.longitude != null) {
        const { data: p } = await supabase.from("profiles").select("last_lat, last_lng").eq("user_id", user.id).maybeSingle();
        const pos = p as unknown as { last_lat: number | null; last_lng: number | null } | null;
        if (!cancelled && pos?.last_lat != null && pos?.last_lng != null) setDistanceMi(distanceMiles(pos.last_lat, pos.last_lng, club.latitude, club.longitude));
      }
    })();
    return () => { cancelled = true; };
  }, [club.id, user]);

  // Open XPLAY games at this club (matches.club is free text = club name)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("matches")
        .select("id, match_date, match_time, level_min, level_max, max_players, organizer_id")
        .eq("club", club.club_name)
        .in("status", ["open", "almost_full"])
        .gte("match_date", today)
        .order("match_date")
        .order("match_time")
        .limit(8);
      const rows = (data as any[]) || [];
      if (rows.length === 0) { if (!cancelled) setMatches([]); return; }
      const { data: players } = await supabase.from("match_players").select("match_id").in("match_id", rows.map((r) => r.id)).eq("status", "confirmed");
      const counts: Record<string, number> = {};
      (players || []).forEach((p: any) => { counts[p.match_id] = (counts[p.match_id] || 0) + 1; });
      if (!cancelled) setMatches(rows.map((r) => ({ ...r, _players: counts[r.id] || 0 })));
    })();
    return () => { cancelled = true; };
  }, [club.club_name]);

  // Free today: cheapest per start time, today only
  // If nothing is free today, fall back to the first day that has something ("Next free · Tomorrow")
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const futureSlots = slots.filter((s) => new Date(s.starts_at).getTime() > Date.now());
  const firstDayKey = futureSlots.some((s) => format(new Date(s.starts_at), "yyyy-MM-dd") === todayKey)
    ? todayKey
    : futureSlots.length ? format(new Date(futureSlots[0].starts_at), "yyyy-MM-dd") : todayKey;
  const byStart = new Map<string, Slot>();
  for (const s of futureSlots) {
    if (format(new Date(s.starts_at), "yyyy-MM-dd") !== firstDayKey) continue;
    const cur = byStart.get(s.starts_at);
    if (!cur || (s.price_cents ?? Infinity) < (cur.price_cents ?? Infinity)) byStart.set(s.starts_at, s);
  }
  const todaySlots = [...byStart.values()].slice(0, 3);
  const slotsAreToday = firstDayKey === todayKey;
  const slotsDayLabel = slotsAreToday ? "Free today" : `Next free · ${formatNextSlot(firstDayKey + "T12:00:00").day}`;
  const bookingUrl: string | null = club.external_booking_url ?? slots.find((s) => s.booking_url)?.booking_url ?? null;
  const website: string | null = club.website ?? null;
  const address = [club.address_line_1, club.city, club.postcode].filter(Boolean).join(", ") || club.location || "";
  const mapsUrl = club.latitude != null && club.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${club.latitude},${club.longitude}${club.google_place_id ? `&query_place_id=${club.google_place_id}` : ""}`
    : address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
  const phone: string | null = club.contact_phone || club.phone || null;
  const hours: string | null = club.operating_hours || (club.opening_time && club.closing_time ? `${club.opening_time}–${club.closing_time}` : null);
  const selection: ClubSelection = { id: club.id, club_name: club.club_name, location: club.location ?? null, city: club.city ?? null, source: club.source, external_provider: club.external_provider };
  const openCreate = (initial: CreateMatchInitial) => { setCreateInitial(initial); setCreateOpen(true); };
  const appUrl = membersOnly ? (bookingUrl || website) : bookingUrl;
  const games = allGames ? matches : matches.slice(0, 3);

  return (
    <div className="pb-8">
      {/* ── Header ── */}
      <div className="relative h-28 bg-gradient-to-b from-muted to-background">
        <button onClick={onBack} aria-label="Back" className="absolute top-3 left-3 w-9 h-9 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-95">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button onClick={() => setFav(toggleFavouriteClub(club.id))} aria-label="Favourite" className="absolute top-3 right-3 w-9 h-9 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-95">
          <Star className={cn("w-4 h-4", fav ? "text-secondary fill-secondary" : "text-foreground")} />
        </button>
      </div>

      <div className="px-4 -mt-4 relative space-y-6">
        <div className="space-y-1.5">
          <h1 className="font-display font-black italic uppercase leading-none tracking-tight" style={{ fontSize: "clamp(26px, 7.5vw, 36px)" }}>{club.club_name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full border border-border text-muted-foreground px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">{membersOnly ? "Members only" : "Live courts"}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {[distanceMi != null ? formatMiles(distanceMi) : null, courtCount ? `${courtCount} court${courtCount === 1 ? "" : "s"}` : null, provider ? `books on ${provider}` : null].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>

        {/* ── Free today ── */}
        <section className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-black italic uppercase tracking-[0.08em]">{membersOnly ? "Book a court" : slotsDayLabel}</h2>
            {!membersOnly && slots.length > 0 && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} /> updated {formatDistanceToNowStrict(new Date(slots[0].fetched_at))} ago
              </span>
            )}
          </div>
          {membersOnly ? (
            <p className="text-sm text-muted-foreground">Pick a time, book in the {provider ?? "club"} app</p>
          ) : loadingSlots ? (
            <div className="flex gap-2">{[1, 2, 3].map((i) => <div key={i} className="h-[52px] w-[92px] rounded-xl bg-muted animate-pulse" />)}</div>
          ) : todaySlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{refreshing ? "Checking…" : "Nothing free today"}</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5 scrollbar-hide">
              {todaySlots.map((s) => (
                <Pill key={s.id} onClick={() => openCreate({ club: selection, slot: { starts_at: s.starts_at, duration_mins: s.duration_mins, price_cents: s.price_cents, booking_url: s.booking_url } })}>
                  <span className="block font-mono font-bold text-base leading-none">{formatNextSlot(s.starts_at).time}</span>
                  <span className="block font-mono text-xs text-muted-foreground mt-1">{fmtDur(s.duration_mins ?? 90)}{s.price_cents != null ? ` · ${currency}${Math.round(s.price_cents / 100)}` : ""}</span>
                </Pill>
              ))}
            </div>
          )}
          <button onClick={() => openCreate({ club: selection })} className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-display font-black italic uppercase text-sm tracking-wider active:scale-[0.98] transition-transform">
            Set up a match here
          </button>
          {appUrl && (
            <button onClick={() => openExternal(appUrl)} className="w-full rounded-xl border border-border py-3 text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
              {membersOnly ? `Open the ${provider ?? "club"} app` : `Book on ${provider ?? "the club's site"}`} <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </section>

        {/* ── Open games ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-black italic uppercase tracking-[0.08em]">Open games</h2>
            {matches.length > 3 && <button onClick={() => setAllGames((v) => !v)} className="text-xs font-bold text-primary">{allGames ? "Less" : "All"} ›</button>}
          </div>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open games here yet.</p>
          ) : (
            <div className="space-y-2">
              {games.map((m) => {
                const mine = m.organizer_id === user?.id;
                const full = (m.max_players ?? 4) - m._players <= 0;
                return (
                  <div key={m.id} className="rounded-2xl bg-card border border-border/60 px-4 py-3 flex items-center gap-3">
                    <button onClick={() => navigate(`/matches/${m.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <div className="flex-shrink-0">
                        <div className="font-mono text-xl font-bold leading-none">{m.match_time?.slice(0, 5)}</div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">{formatNextSlot(`${m.match_date}T${m.match_time}`).day}</div>
                      </div>
                      <div className="min-w-0 text-xs text-muted-foreground">
                        {m.level_min != null && m.level_max != null ? <>Level {Number(m.level_min).toFixed(1)}–{Number(m.level_max).toFixed(1)} · </> : null}{m._players} of {m.max_players ?? 4}
                      </div>
                    </button>
                    {mine ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <button onClick={() => setJoinMatchId(m.id)} disabled={full} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-black uppercase tracking-wider active:scale-95 flex-shrink-0 disabled:opacity-50">
                        {full ? "Full" : "Join"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Details ── */}
        {(address || hours || phone || website) && (
          <section className="space-y-3">
            <h2 className="font-display text-sm font-black italic uppercase tracking-[0.08em]">Details</h2>
            <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/60">
              {address && (
                <Row>
                  <span className="text-sm flex-1 min-w-0 truncate">{address}</span>
                  {mapsUrl && <button onClick={() => openExternal(mapsUrl)} className="text-xs font-bold text-primary">Map</button>}
                </Row>
              )}
              {hours && <Row><span className="text-sm flex-1 font-mono">{hours}</span></Row>}
              {phone && (
                <Row>
                  <span className="text-sm flex-1 font-mono">{phone}</span>
                  <a href={`tel:${phone.replace(/\s+/g, "")}`} className="text-xs font-bold text-primary">Call</a>
                </Row>
              )}
              {website && (
                <Row>
                  <span className="text-sm flex-1 min-w-0 truncate">{website.replace(/^https?:\/\//, "")}</span>
                  <button onClick={() => openExternal(website)} className="text-xs font-bold text-primary">Open</button>
                </Row>
              )}
            </div>
          </section>
        )}

        {/* ── Claim ── */}
        <section className="rounded-2xl border border-dashed border-border p-4 flex items-center gap-3">
          <span className="text-sm font-bold flex-1">Is this your club?</span>
          <button onClick={() => setClaimOpen(true)} className="rounded-full border border-primary text-primary px-4 py-2 text-xs font-bold">Claim it</button>
        </section>
      </div>

      <ClaimClubSheet open={claimOpen} onOpenChange={setClaimOpen} clubId={club.id} clubName={club.club_name} />
      <CreateMatchModal open={createOpen} onOpenChange={setCreateOpen} initial={createInitial} />
      <MatchJoinModal matchId={joinMatchId} open={!!joinMatchId} onOpenChange={(o) => !o && setJoinMatchId(null)} />
    </div>
  );
};

const Row = ({ children }: { children: ReactNode }) => <div className="px-4 py-3 flex items-center gap-3">{children}</div>;

const Pill = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="flex-shrink-0 rounded-xl px-3.5 py-2.5 text-left border border-border bg-muted active:scale-95 transition-transform min-h-[52px] flex flex-col justify-center">
    {children}
  </button>
);

export default OtherClubPage;
