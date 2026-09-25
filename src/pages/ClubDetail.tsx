/**
 * Club page (25 Sep 2026) — one scroll, no tabs.
 * Header · member bar · BOOK (today's free courts → CreateMatchModal) · Membership · Club store ·
 * What's on (events, coaching, tournaments) · Details (address, hours, phone, rankings).
 * Directory clubs (clubs.source = 'directory') render OtherClubPage instead.
 */
import { useState, useEffect, type ReactNode } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Star, ChevronRight, ChevronDown, Trophy, GraduationCap, CalendarDays, Users } from "lucide-react";
import { format, getDay } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { formatInClubTz } from "@/utils/dateTimezone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Browser } from "@capacitor/browser";
import { cn } from "@/lib/utils";
import { distanceMiles, formatMiles } from "@/lib/distance";
import { isFavouriteClub, toggleFavouriteClub } from "@/lib/favouriteClubs";
import { type TierRow, isStaffTier, tierDiscount, money, periodShort, perPlayer } from "@/lib/clubs/membershipTiers";
import { TOURNAMENTS_ENABLED } from "@/lib/featureFlags";
import OtherClubPage from "@/components/clubs/OtherClubPage";
import { isOtherClub } from "@/components/clubs/clubTier";
import CreateMatchModal, { type CreateMatchInitial, type ClubSelection } from "@/components/CreateMatchModal";

// ── Local types (columns not all in generated types) ─────────────────────────
interface ClubRow {
  id: string;
  club_name: string;
  logo_url?: string | null;
  banner_url?: string | null;
  image_url?: string | null;
  club_description?: string | null;
  description?: string | null;
  city?: string | null;
  country?: string | null;
  location?: string | null;
  address_line_1?: string | null;
  postcode?: string | null;
  contact_phone?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  email?: string | null;
  website?: string | null;
  operating_hours?: string | null;
  currency_symbol?: string | null;
  timezone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
  source?: string | null;
  external_provider?: string | null;
}

interface ClubEventRow {
  id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  price_cents: number;
  max_attendees?: number | null;
  status: string;
}

interface OperatingHourRow {
  day_of_week: number;
  is_closed: boolean;
  open_time?: string | null;
  close_time?: string | null;
}

interface ClubMembershipRow {
  id: string;
  user_id: string;
  club_id: string;
  role: string;
  tier_id: string | null;
  active: boolean;
  status?: string | null;
  cancels_at?: string | null;
}

type SlotPill = { starts_at: string; duration_mins: number; price: number | null; court_label: string | null };
type StoreItem = { id: string; name: string; xp_price: number | null; price_cents: number };
type OnItem = {
  kind: "tournament" | "coaching" | "event";
  id: string;
  at: Date;
  name: string;
  priceCents: number | null;
};

const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min`);
const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");
const openExternal = async (url: string) => {
  try { await Browser.open({ url }); } catch { window.open(url, "_blank", "noopener"); }
};

const ClubDetail = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const handleBack = () => {
    const from = (location.state as any)?.from;
    if (from) navigate(from);
    else if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const [club, setClub] = useState<ClubRow | null>(null);
  const [courts, setCourts] = useState<any[]>([]);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [events, setEvents] = useState<ClubEventRow[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [eventAttendees, setEventAttendees] = useState<Record<string, number>>({});
  const [myEventSignups, setMyEventSignups] = useState<Set<string>>(new Set());
  const [myMembership, setMyMembership] = useState<ClubMembershipRow | null>(null);
  const [enrollments, setEnrollments] = useState<Record<string, number>>({});
  const [myEnrollments, setMyEnrollments] = useState<Set<string>>(new Set());
  const [operatingHours, setOperatingHours] = useState<OperatingHourRow[]>([]);
  const [slots, setSlots] = useState<SlotPill[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [distanceMi, setDistanceMi] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [fav, setFav] = useState(false);
  const [allOn, setAllOn] = useState(false);
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [allHours, setAllHours] = useState(false);
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<CreateMatchInitial | null>(null);

  useEffect(() => { if (clubId) setFav(isFavouriteClub(clubId)); }, [clubId]);

  const fetchClubData = async () => {
    if (!clubId) return;
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const sb = supabase as any;

    const [clubRes, courtsRes, tiersRes, sessRes, eventsRes, hoursRes, memRes, storeRes, tourRes] = await Promise.all([
      supabase.from("clubs").select("*").eq("id", clubId).maybeSingle(),
      supabase.from("courts").select("*").eq("club_id", clubId).eq("active", true),
      supabase.from("membership_tiers").select("*").eq("club_id", clubId).eq("active", true).order("sort_order"),
      supabase.from("coaching_sessions").select("*").eq("club_id", clubId).eq("status", "scheduled").gte("starts_at", new Date().toISOString()).order("starts_at"),
      // club_events stores a local date + time (event_date, start_time, end_time).
      sb.from("club_events").select("*").eq("club_id", clubId).eq("status", "published").gte("event_date", today).order("event_date").order("start_time"),
      supabase.from("club_operating_hours").select("*").eq("club_id", clubId).order("day_of_week"),
      user
        ? supabase.from("club_memberships").select("*").eq("user_id", user.id).eq("club_id", clubId).eq("active", true).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      // Same query as ClubMarketTab / ClubStore
      sb.from("club_market_products").select("id, name, xp_price, price_cents").eq("club_id", clubId).eq("active", true).order("created_at", { ascending: false }).limit(3),
      TOURNAMENTS_ENABLED
        ? sb.from("tournaments").select("id, name, scheduled_date, scheduled_time, ticket_price_cents, status, club_id, venue_club_id")
            .or(`club_id.eq.${clubId},venue_club_id.eq.${clubId}`).in("status", ["active", "confirmed"]).gte("scheduled_date", today).order("scheduled_date").limit(6)
        : Promise.resolve({ data: [] }),
    ]);

    if (clubRes.error || !clubRes.data) { setLoading(false); return; }
    const c = clubRes.data as ClubRow;
    setClub(c);
    setCourts(courtsRes.data || []);
    setTiers((tiersRes.data || []) as TierRow[]);
    setSessions(sessRes.data || []);
    const tz = c.timezone || "Europe/London";
    const toIso = (date: string, time?: string | null) => (time ? fromZonedTime(`${date}T${time}`, tz).toISOString() : null);
    setEvents(((eventsRes.data as any[]) || []).map((e) => ({
      ...e,
      starts_at: toIso(e.event_date, e.start_time) ?? fromZonedTime(`${e.event_date}T00:00:00`, tz).toISOString(),
      ends_at: toIso(e.event_date, e.end_time),
    })));
    setOperatingHours(hoursRes.data || []);
    setMyMembership((memRes.data as ClubMembershipRow | null) ?? null);
    setStoreItems(((storeRes.data as StoreItem[]) || []));
    setTournaments((tourRes.data as any[]) || []);

    // Today's free courts (from now), one pill per start time
    const courtRows = (courtsRes.data || []) as any[];
    if (courtRows.length) {
      const byId = new Map(courtRows.map((x) => [x.id, x]));
      const { data: sl } = await supabase.from("court_slots").select("*").in("court_id", [...byId.keys()]).eq("status", "available").is("coaching_session_id", null)
        .gte("starts_at", new Date().toISOString()).lte("starts_at", endOfDay.toISOString()).order("starts_at").limit(120);
      const seen = new Map<string, SlotPill>();
      for (const s of (sl || []) as any[]) {
        if (seen.has(s.starts_at)) continue;
        const court = byId.get(s.court_id);
        const price = s.price_cents != null ? Number(s.price_cents) / 100 : s.price != null ? Number(s.price) : null;
        const mins = Math.max(15, Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000));
        seen.set(s.starts_at, { starts_at: s.starts_at, duration_mins: mins, price, court_label: court?.nickname || court?.name || null });
      }
      setSlots([...seen.values()]);
    } else setSlots([]);

    // Distance, only when the position is already on the profile
    if (user && c.latitude != null && c.longitude != null) {
      const { data: p } = await supabase.from("profiles").select("last_lat, last_lng").eq("user_id", user.id).maybeSingle();
      const pos = p as unknown as { last_lat: number | null; last_lng: number | null } | null;
      setDistanceMi(pos?.last_lat != null && pos?.last_lng != null ? distanceMiles(pos.last_lat, pos.last_lng, c.latitude, c.longitude) : null);
    }

    // Attendee / enrolment counts
    if (user) {
      const eventIds = (eventsRes.data || []).map((e: any) => e.id);
      const sessIds = (sessRes.data || []).map((s: any) => s.id);
      const [attendeesRes, enrollRes] = await Promise.all([
        eventIds.length ? sb.from("club_event_attendees").select("event_id, user_id").in("event_id", eventIds).eq("status", "signed_up") : Promise.resolve({ data: [] }),
        sessIds.length ? supabase.from("coaching_enrollments").select("coaching_session_id, player_id").in("coaching_session_id", sessIds).eq("status", "confirmed") : Promise.resolve({ data: [] }),
      ]);
      const counts: Record<string, number> = {}; const mySigs = new Set<string>();
      (attendeesRes.data || []).forEach((a: any) => { counts[a.event_id] = (counts[a.event_id] || 0) + 1; if (a.user_id === user.id) mySigs.add(a.event_id); });
      setEventAttendees(counts); setMyEventSignups(mySigs);
      const eCounts: Record<string, number> = {}; const myE = new Set<string>();
      (enrollRes.data || []).forEach((e: any) => { eCounts[e.coaching_session_id] = (eCounts[e.coaching_session_id] || 0) + 1; if (e.player_id === user.id) myE.add(e.coaching_session_id); });
      setEnrollments(eCounts); setMyEnrollments(myE);
    }
    setLoading(false);
  };

  useEffect(() => { fetchClubData(); }, [clubId, user]);

  useEffect(() => {
    if (!clubId) return;
    const channel = supabase
      .channel(`club-detail-${clubId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "clubs", filter: `id=eq.${clubId}` }, () => fetchClubData())
      .on("postgres_changes", { event: "*", schema: "public", table: "membership_tiers", filter: `club_id=eq.${clubId}` }, () => fetchClubData())
      .on("postgres_changes", { event: "*", schema: "public", table: "courts", filter: `club_id=eq.${clubId}` }, () => fetchClubData())
      .on("postgres_changes", { event: "*", schema: "public", table: "court_slots" }, () => fetchClubData())
      .on("postgres_changes", { event: "*", schema: "public", table: "coaching_sessions", filter: `club_id=eq.${clubId}` }, () => fetchClubData())
      .on("postgres_changes", { event: "*", schema: "public", table: "club_operating_hours", filter: `club_id=eq.${clubId}` }, () => fetchClubData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clubId]);

  // ── Coaching enrol / event sign-up (unchanged flows) ──
  const handleEnrollCoaching = async (sessionId: string) => {
    setActionLoading(sessionId);
    try {
      const { data, error } = await supabase.functions.invoke("enroll-coaching-slot", { body: { coaching_session_id: sessionId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) { await Browser.open({ url: data.url }); return; }
      toast.success("Enrolled");
      setMyEnrollments((prev) => new Set(prev).add(sessionId));
      setEnrollments((prev) => ({ ...prev, [sessionId]: (prev[sessionId] || 0) + 1 }));
    } catch (e: any) { toast.error(e.message || "Failed"); } finally { setActionLoading(null); }
  };

  const handleSignUpEvent = async (eventId: string) => {
    setActionLoading(eventId);
    try {
      const { data, error } = await supabase.functions.invoke("signup-club-event", { body: { event_id: eventId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) { await Browser.open({ url: data.url }); return; }
      toast.success("Signed up");
      setMyEventSignups((prev) => new Set(prev).add(eventId));
      setEventAttendees((prev) => ({ ...prev, [eventId]: (prev[eventId] || 0) + 1 }));
    } catch (e: any) { toast.error(e.message || "Failed"); } finally { setActionLoading(null); }
  };

  // ── Derived ──
  const myTier = myMembership?.tier_id ? tiers.find((t) => t.id === myMembership.tier_id) ?? null : null;
  const discount = tierDiscount(myTier);
  const currency: string = club?.currency_symbol ?? "£";
  const playerTiers = tiers.filter((t) => !isStaffTier(t));
  const cheapest = playerTiers.length ? [...playerTiers].sort((a, b) => a.price_cents - b.price_cents)[0] : null;
  const todayDow = getDay(new Date());
  const todayHours = operatingHours.find((h) => h.day_of_week === todayDow) ?? null;
  const sameEveryDay = operatingHours.length >= 7 && operatingHours.every((h) => h.is_closed === operatingHours[0].is_closed && h.open_time === operatingHours[0].open_time && h.close_time === operatingHours[0].close_time);
  const openUntil = todayHours ? (todayHours.is_closed ? "Closed today" : `Open until ${hhmm(todayHours.close_time)}`) : null;

  const toSelection = (c: ClubRow): ClubSelection => ({ id: c.id, club_name: c.club_name, location: c.location ?? null, city: c.city ?? null, source: c.source ?? undefined, external_provider: c.external_provider ?? null });
  const openCreate = (initial: CreateMatchInitial) => { setCreateInitial(initial); setCreateOpen(true); };

  const whatsOn: OnItem[] = [
    ...tournaments.map((t) => ({ kind: "tournament" as const, id: t.id, at: new Date(`${t.scheduled_date}T${t.scheduled_time ?? "00:00"}`), name: t.name, priceCents: t.ticket_price_cents ?? null })),
    ...sessions.map((s) => ({ kind: "coaching" as const, id: s.id, at: new Date(s.starts_at), name: s.title, priceCents: s.price_cents != null ? Number(s.price_cents) : s.price != null ? Math.round(Number(s.price) * 100) : null })),
    ...events.map((e) => ({ kind: "event" as const, id: e.id, at: new Date(e.starts_at), name: e.title, priceCents: e.price_cents ?? null })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const address = [club?.address_line_1 || club?.location, club?.city, club?.postcode].filter(Boolean).join(", ");
  const mapsUrl = club?.latitude != null && club?.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${club.latitude},${club.longitude}${club.google_place_id ? `&query_place_id=${club.google_place_id}` : ""}`
    : address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
  const phone = club?.contact_phone || club?.phone || null;
  const cover = club?.banner_url || club?.image_url || null;

  if (loading) {
    return <div className="flex justify-center items-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!club) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-muted-foreground">Club not found</p>
        <button onClick={handleBack} className="text-primary text-sm mt-2">Go back</button>
      </div>
    );
  }
  if (isOtherClub(club.source)) return <OtherClubPage club={club} onBack={handleBack} />;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="pb-28">
      {/* ── Header ── */}
      <div className={cn("relative h-44 overflow-hidden", !cover && "bg-gradient-to-b from-accent/40 to-background")}>
        {cover && <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <button onClick={handleBack} aria-label="Back" className="absolute top-3 left-3 w-9 h-9 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-95">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button onClick={() => { if (clubId) setFav(toggleFavouriteClub(clubId)); }} aria-label="Favourite" className="absolute top-3 right-3 w-9 h-9 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-95">
          <Star className={cn("w-4 h-4", fav ? "text-secondary fill-secondary" : "text-foreground")} />
        </button>
      </div>

      <div className="px-4 -mt-6 relative space-y-6">
        <div className="space-y-1.5">
          <h1 className="font-display font-black italic uppercase leading-none tracking-tight" style={{ fontSize: "clamp(26px, 7.5vw, 36px)" }}>{club.club_name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">XPLAY club</span>
            <span className="font-mono text-xs text-muted-foreground">
              {[distanceMi != null ? formatMiles(distanceMi) : null, `${courts.length} court${courts.length === 1 ? "" : "s"}`, openUntil].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>

        {/* ── Member bar ── */}
        {myTier && (
          <button onClick={() => navigate(`/clubs/${clubId}/membership`)} className="w-full rounded-xl border border-secondary/70 px-3.5 py-2.5 flex items-center justify-between text-left">
            <span className="text-sm font-bold">{myTier.name} member{discount > 0 ? <span className="text-secondary"> · {discount}% off</span> : null}</span>
            <span className="text-xs font-bold text-secondary">Manage ›</span>
          </button>
        )}

        {/* ── BOOK ── */}
        <section className="rounded-2xl border-2 border-primary p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-black italic uppercase tracking-[0.08em]">Book</h2>
            <span className="text-xs font-bold text-muted-foreground">Today · <span className="font-mono text-foreground">{format(new Date(), "EEE d")}</span></span>
          </div>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing free today</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5 scrollbar-hide">
              {slots.slice(0, 3).map((s) => (
                <Pill key={s.starts_at} onClick={() => openCreate({ club: toSelection(club), slot: { starts_at: s.starts_at, duration_mins: s.duration_mins, price_cents: s.price != null ? Math.round(s.price * 100) : null, court_label: s.court_label } })}>
                  <span className="block font-mono font-bold text-base leading-none">{format(new Date(s.starts_at), "HH:mm")}</span>
                  <span className="block font-mono text-xs text-muted-foreground mt-1">{fmtDur(s.duration_mins)}{s.price != null ? ` · ${perPlayer(s.price, discount, currency)} pp` : ""}</span>
                </Pill>
              ))}
            </div>
          )}
          <button onClick={() => openCreate({ club: toSelection(club) })} className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-display font-black italic uppercase text-sm tracking-wider active:scale-[0.98] transition-transform">
            All days and times
          </button>
        </section>

        {/* ── Membership ── */}
        {(playerTiers.length > 0 || myTier) && (
          <section className="space-y-3">
            <SectionHead title="Membership" />
            {myTier ? (
              <Row onClick={() => navigate(`/clubs/${clubId}/membership`)}>
                <span className="text-sm font-bold flex-1">{myTier.name} · <span className="font-mono font-normal">{money(myTier.price_cents, currency)}/{periodShort(myTier.billing_period)}</span></span>
                <span className="text-xs font-bold text-primary">Manage ›</span>
              </Row>
            ) : cheapest ? (
              <button onClick={() => navigate(`/clubs/${clubId}/membership`)} className="w-full rounded-2xl bg-card border border-border/60 p-4 text-left flex items-center gap-3 active:scale-[0.99] transition-transform">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">Get a membership · <span className="font-mono font-normal">from {money(cheapest.price_cents, currency)}/{periodShort(cheapest.billing_period)}</span></div>
                  {tierDiscount(cheapest) > 0 && <div className="text-xs text-secondary font-semibold mt-0.5">{tierDiscount(cheapest)}% off every court</div>}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ) : null}
          </section>
        )}

        {/* ── Club store ── */}
        {storeItems.length > 0 && (
          <section className="space-y-3">
            <SectionHead title="Club store" action="All" onAction={() => navigate(`/clubs/${clubId}/store`)} />
            <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/60">
              {storeItems.map((p) => (
                <button key={p.id} onClick={() => navigate(`/clubs/${clubId}/store`)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
                  <span className="text-sm font-bold flex-1 truncate">{p.name}</span>
                  {p.xp_price != null ? (
                    <span className="font-mono text-sm font-bold text-secondary">{p.xp_price.toLocaleString()} XP</span>
                  ) : p.price_cents > 0 ? (
                    <span className="font-mono text-sm">{money(p.price_cents, currency)}</span>
                  ) : null}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── What's on ── */}
        {whatsOn.length > 0 && (
          <section className="space-y-3">
            <SectionHead title="What's on" action={whatsOn.length > 2 ? (allOn ? "Less" : "All") : undefined} onAction={() => setAllOn((v) => !v)} />
            <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/60">
              {(allOn ? whatsOn : whatsOn.slice(0, 2)).map((it) => {
                const key = `${it.kind}-${it.id}`;
                const expanded = openOn === key;
                const Icon = it.kind === "tournament" ? Trophy : it.kind === "coaching" ? GraduationCap : CalendarDays;
                const onTap = () => (it.kind === "tournament" ? navigate(`/tournaments/${it.id}`) : setOpenOn(expanded ? null : key));
                return (
                  <div key={key}>
                    <button onClick={onTap} className="w-full px-4 py-3 flex items-center gap-3 text-left">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", it.kind === "tournament" ? "bg-accent/25 text-accent-foreground" : "bg-muted text-foreground")}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate">{it.name}</div>
                        <div className="text-xs text-muted-foreground">{format(it.at, "EEE d MMM")} · <span className="font-mono">{format(it.at, "HH:mm")}</span></div>
                      </div>
                      {it.priceCents != null && it.priceCents > 0 && <span className="font-mono text-sm">{money(it.priceCents, currency)}</span>}
                      {it.kind === "tournament" ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />}
                    </button>
                    {expanded && it.kind === "coaching" && (() => {
                      const s = sessions.find((x) => x.id === it.id);
                      const used = enrollments[it.id] || 0;
                      const left = s?.max_players ?? s?.max_participants ? (s.max_players ?? s.max_participants) - used : null;
                      const mine = myEnrollments.has(it.id);
                      return (
                        <div className="px-4 pb-4 space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {formatInClubTz(s?.starts_at, "HH:mm", club.timezone)}–{formatInClubTz(s?.ends_at, "HH:mm", club.timezone)}
                            {left != null && <> · <Users className="inline w-3 h-3" /> {left > 0 ? `${left} spots` : "Full"}</>}
                          </p>
                          <button onClick={() => handleEnrollCoaching(it.id)} disabled={mine || actionLoading === it.id || (left != null && left <= 0)}
                            className="w-full py-2.5 rounded-xl text-xs font-display font-black uppercase tracking-wider bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground active:scale-[0.98]">
                            {mine ? "Enrolled" : actionLoading === it.id ? "…" : "Enrol"}
                          </button>
                        </div>
                      );
                    })()}
                    {expanded && it.kind === "event" && (() => {
                      const e = events.find((x) => x.id === it.id);
                      const count = eventAttendees[it.id] || 0;
                      const left = e?.max_attendees ? e.max_attendees - count : null;
                      const mine = myEventSignups.has(it.id);
                      return (
                        <div className="px-4 pb-4 space-y-2">
                          {e?.description && <p className="text-xs text-muted-foreground line-clamp-3">{e.description}</p>}
                          {left != null && <p className="text-xs text-muted-foreground"><Users className="inline w-3 h-3" /> {left > 0 ? `${left} spots` : "Full"}</p>}
                          <button onClick={() => handleSignUpEvent(it.id)} disabled={mine || actionLoading === it.id || (left != null && left <= 0)}
                            className="w-full py-2.5 rounded-xl text-xs font-display font-black uppercase tracking-wider bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground active:scale-[0.98]">
                            {mine ? "Going" : actionLoading === it.id ? "…" : "Join"}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Details ── */}
        <section className="space-y-3">
          <SectionHead title="Details" />
          <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/60">
            {address && (
              <Row>
                <span className="text-sm flex-1 min-w-0 truncate">{address}</span>
                {mapsUrl && <button onClick={() => openExternal(mapsUrl)} className="text-xs font-bold text-primary">Map</button>}
              </Row>
            )}
            {(operatingHours.length > 0 || club.operating_hours) && (
              <div>
                <Row>
                  <span className="text-sm flex-1 min-w-0 truncate">
                    {todayHours ? (
                      todayHours.is_closed ? "Closed today" : <><span className="font-mono">{hhmm(todayHours.open_time)}–{hhmm(todayHours.close_time)}</span> · {sameEveryDay ? "daily" : "today"}</>
                    ) : club.operating_hours}
                  </span>
                  {operatingHours.length > 0 && !sameEveryDay && (
                    <button onClick={() => setAllHours((v) => !v)} className="text-xs font-bold text-primary">{allHours ? "Less" : "All hours"}</button>
                  )}
                </Row>
                {allHours && (
                  <div className="px-4 pb-3 space-y-1">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                      const h = operatingHours.find((x) => x.day_of_week === d);
                      return (
                        <div key={d} className={cn("flex justify-between text-xs", d === todayDow ? "text-foreground font-bold" : "text-muted-foreground")}>
                          <span>{dayNames[d]}</span>
                          <span className="font-mono">{h ? (h.is_closed ? "Closed" : `${hhmm(h.open_time)}–${hhmm(h.close_time)}`) : "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {phone && (
              <Row>
                <span className="text-sm flex-1 font-mono">{phone}</span>
                <a href={`tel:${phone.replace(/\s+/g, "")}`} className="text-xs font-bold text-primary">Call</a>
              </Row>
            )}
            {club.website && (
              <Row>
                <span className="text-sm flex-1 min-w-0 truncate">{club.website.replace(/^https?:\/\//, "")}</span>
                <button onClick={() => openExternal(club.website!)} className="text-xs font-bold text-primary">Open</button>
              </Row>
            )}
            <div>
              <Row onClick={() => setRankingsOpen((v) => !v)}>
                <span className="text-sm font-bold flex-1">Club rankings</span>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", rankingsOpen && "rotate-180")} />
              </Row>
              {rankingsOpen && <p className="px-4 pb-3 text-xs text-muted-foreground">Club rankings coming soon.</p>}
            </div>
          </div>
        </section>
      </div>

      <CreateMatchModal open={createOpen} onOpenChange={setCreateOpen} initial={createInitial} />
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

const Row = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
  onClick ? (
    <button onClick={onClick} className="w-full px-4 py-3 flex items-center gap-3 text-left">{children}</button>
  ) : (
    <div className="px-4 py-3 flex items-center gap-3">{children}</div>
  );

const Pill = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="flex-shrink-0 rounded-xl px-3.5 py-2.5 text-left border border-border bg-muted active:scale-95 transition-transform min-h-[52px] flex flex-col justify-center">
    {children}
  </button>
);

export default ClubDetail;
