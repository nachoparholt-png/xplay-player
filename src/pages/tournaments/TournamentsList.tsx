import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Mail, Navigation, ChevronDown, ChevronUp, BellRing, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Tournament } from "@/lib/tournaments/types";
import {
  Chip, FormatChip, Mono, DateBlock, SectionHead, EmptyLine, VenueLine, HUE, tint,
} from "@/components/tournaments/PlayerAtoms";
import {
  type SeatCounts, type VenueClub,
  countdownLabel, dateBlockParts, distanceMiles, fetchClubs, fetchSeatCounts, formatDayTime,
  formatGBP, formatLabel, formatMiles, isPastTournament, levelRange, refundDeadline, tournamentStart, venueProvider,
} from "@/lib/tournaments/playerView";

/* ── types ─────────────────────────────────────────── */
type TRow = Tournament & {
  venue_club_id?: string | null;
  venue_name?: string | null;
  venue_address?: string | null;
  registration_deadline?: string | null;
  cancellation_policy?: string | null;
  skill_level_min?: number | null;
  skill_level_max?: number | null;
  waitlist_enabled?: boolean | null;
  live_ended_at?: string | null;
  slug?: string | null;
};

type MyStatus = { kind: "registered" | "comp" | "waitlist"; position?: number; partnerId?: string | null };
type Invite =
  | { source: "invitation"; id: string; tournamentId: string; invitedBy: string | null }
  | { source: "guest"; id: string; tournamentId: string; invitedBy: string | null; amountCents: number | null };

const NOTIFY_KEY = "xplay.tournaments.notifyNearby";
const DISMISSED_GUEST_KEY = "xplay.tournaments.dismissedGuestEntries";
const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/* ── component ─────────────────────────────────────── */
const TournamentsList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<Record<string, TRow>>({});
  const [clubs, setClubs] = useState<Record<string, VenueClub>>({});
  const [seats, setSeats] = useState<Record<string, SeatCounts>>({});
  const [myStatus, setMyStatus] = useState<Record<string, MyStatus>>({});
  const [invites, setInvites] = useState<Invite[]>([]);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [partnerNames, setPartnerNames] = useState<Record<string, string>>({});
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [showAllOpen, setShowAllOpen] = useState(false);
  const [notify, setNotify] = useState<boolean>(() => readLS(NOTIFY_KEY) !== "off");
  const [dismissedGuest, setDismissedGuest] = useState<string[]>(() => {
    try { return JSON.parse(readLS(DISMISSED_GUEST_KEY) || "[]"); } catch { return []; }
  });

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const sb = supabase as any;
    const today = new Date().toISOString().slice(0, 10);

    const [profileRes, playersRes, guestRes, waitRes, invRes, openRes] = await Promise.all([
      sb.from("profiles").select("last_lat, last_lng, email").eq("user_id", user.id).maybeSingle(),
      sb.from("tournament_players").select("tournament_id, partner_user_id").eq("user_id", user.id).eq("status", "confirmed"),
      sb.from("tournament_guest_entries").select("id, tournament_id, entry_type, invited_by, amount_cents").eq("claimed_user_id", user.id),
      sb.from("tournament_waitlist").select("tournament_id, position").eq("user_id", user.id).is("resolved", null),
      sb.from("tournament_invitations").select("id, tournament_id, invited_by").eq("status", "pending")
        .or(`invited_user_id.eq.${user.id}${user.email ? `,invited_email.eq.${user.email}` : ""}`),
      sb.from("tournaments").select("*").eq("visibility", "public").eq("status", "active").gte("scheduled_date", today)
        .order("scheduled_date", { ascending: true }).limit(60),
    ]);

    const profile = profileRes.data as { last_lat: number | null; last_lng: number | null } | null;
    if (profile?.last_lat != null && profile?.last_lng != null) setLocation({ lat: profile.last_lat, lng: profile.last_lng });

    // ── My status per tournament ──
    const status: Record<string, MyStatus> = {};
    ((playersRes.data as { tournament_id: string; partner_user_id: string | null }[]) || []).forEach((p) => {
      status[p.tournament_id] = { kind: "registered", partnerId: p.partner_user_id };
    });
    const pendingGuests: Invite[] = [];
    ((guestRes.data as { id: string; tournament_id: string; entry_type: string; invited_by: string | null; amount_cents: number | null }[]) || []).forEach((g) => {
      if (g.entry_type === "comp") status[g.tournament_id] = { ...(status[g.tournament_id] || {}), kind: "comp" };
      else if (g.entry_type === "paid" || g.entry_type === "paid_offline") status[g.tournament_id] = status[g.tournament_id] || { kind: "registered" };
      else if (g.entry_type === "awaiting_payment") pendingGuests.push({ source: "guest", id: g.id, tournamentId: g.tournament_id, invitedBy: g.invited_by, amountCents: g.amount_cents });
    });
    ((waitRes.data as { tournament_id: string; position: number }[]) || []).forEach((w) => {
      if (!status[w.tournament_id]) status[w.tournament_id] = { kind: "waitlist", position: w.position };
    });
    setMyStatus(status);

    const invList: Invite[] = [
      ...(((invRes.data as { id: string; tournament_id: string; invited_by: string | null }[]) || [])
        .filter((i) => !status[i.tournament_id])
        .map((i) => ({ source: "invitation" as const, id: i.id, tournamentId: i.tournament_id, invitedBy: i.invited_by }))),
      ...pendingGuests.filter((g) => !status[g.tournamentId]),
    ];
    setInvites(invList);

    // ── Tournament rows: mine + invited (fetched by id) + open (already fetched) ──
    const openRows = ((openRes.data as TRow[]) || []).filter((t) => !status[t.id]);
    const neededIds = Array.from(new Set([...Object.keys(status), ...invList.map((i) => i.tournamentId)]));
    const byId: Record<string, TRow> = {};
    openRows.forEach((t) => { byId[t.id] = t; });
    const missing = neededIds.filter((id) => !byId[id]);
    if (missing.length) {
      const { data } = await sb.from("tournaments").select("*").in("id", missing);
      ((data as TRow[]) || []).forEach((t) => { byId[t.id] = t; });
    }
    setTournaments(byId);
    setOpenIds(openRows.map((t) => t.id));

    // ── Clubs (organiser + venue), seats for open rows, partner names ──
    const clubIds = Object.values(byId).flatMap((t) => [t.club_id, t.venue_club_id].filter(Boolean) as string[]);
    const partnerIds = Object.values(status).map((s) => s.partnerId).filter(Boolean) as string[];
    const [clubMap, seatMap, partnersRes] = await Promise.all([
      fetchClubs(clubIds),
      fetchSeatCounts(openRows.map((t) => t.id)),
      partnerIds.length ? sb.from("profiles").select("user_id, display_name").in("user_id", partnerIds) : Promise.resolve({ data: [] }),
    ]);
    setClubs(clubMap);
    setSeats(seatMap);
    const names: Record<string, string> = {};
    ((partnersRes.data as { user_id: string; display_name: string | null }[]) || []).forEach((p) => { if (p.display_name) names[p.user_id] = p.display_name; });
    setPartnerNames(names);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  /* ── derived lists ── */
  const venueLabel = (t: TRow) =>
    t.venue_name || (t.venue_club_id && clubs[t.venue_club_id]?.club_name) || (t.club_id && clubs[t.club_id]?.club_name) || t.club || "Venue TBC";
  const organiserName = (t: TRow) => (t.club_id && clubs[t.club_id]?.club_name) || t.club || "The organiser";
  const providerOf = (t: TRow) => venueProvider(t.venue_club_id ? clubs[t.venue_club_id] : null);

  const mine = useMemo(() => {
    const rows = Object.keys(myStatus).map((id) => tournaments[id]).filter(Boolean) as TRow[];
    const sortByStart = (a: TRow, b: TRow) => (tournamentStart(a)?.getTime() ?? Infinity) - (tournamentStart(b)?.getTime() ?? Infinity);
    return {
      upcoming: rows.filter((t) => !isPastTournament(t)).sort(sortByStart),
      past: rows.filter((t) => isPastTournament(t)).sort((a, b) => sortByStart(b, a)),
    };
  }, [myStatus, tournaments]);

  const invited = useMemo(
    () => invites.filter((i) => !(i.source === "guest" && dismissedGuest.includes(i.id))).map((i) => ({ inv: i, t: tournaments[i.tournamentId] })).filter((x) => x.t),
    [invites, tournaments, dismissedGuest],
  );

  const open = useMemo(() => {
    const now = Date.now();
    const rows = openIds.map((id) => tournaments[id]).filter(Boolean) as TRow[];
    const list = rows
      .filter((t) => !t.live_ended_at)
      .filter((t) => !t.registration_deadline || new Date(t.registration_deadline).getTime() > now)
      .filter((t) => (tournamentStart(t)?.getTime() ?? Infinity) > now)
      .map((t) => {
        const c = t.venue_club_id ? clubs[t.venue_club_id] : null;
        const dist = location && c?.latitude != null && c?.longitude != null
          ? distanceMiles(location.lat, location.lng, c.latitude, c.longitude) : null;
        return { t, dist };
      });
    list.sort((a, b) => {
      if (a.dist != null && b.dist != null) return a.dist - b.dist;
      if (a.dist != null) return -1;
      if (b.dist != null) return 1;
      return (tournamentStart(a.t)?.getTime() ?? 0) - (tournamentStart(b.t)?.getTime() ?? 0);
    });
    return list;
  }, [openIds, tournaments, clubs, location]);

  /* ── actions ── */
  const accept = (t: TRow) => navigate(`/tournaments/${t.id}?join=1`);

  const decline = async (inv: Invite) => {
    const sb = supabase as any;
    if (inv.source === "invitation") {
      const { error } = await sb.from("tournament_invitations").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", inv.id);
      if (error) { toast({ title: "Couldn't decline", description: error.message, variant: "destructive" }); return; }
    } else {
      // Players only have SELECT on guest entries; try the update and fall back to hiding it locally.
      const { error } = await sb.from("tournament_guest_entries").update({ entry_type: "withdrawn", withdrawn_at: new Date().toISOString() }).eq("id", inv.id);
      if (error) {
        const next = [...dismissedGuest, inv.id];
        setDismissedGuest(next);
        writeLS(DISMISSED_GUEST_KEY, JSON.stringify(next));
      }
    }
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
    toast({ title: "Invitation declined" });
  };

  const toggleNotify = (on: boolean) => { setNotify(on); writeLS(NOTIFY_KEY, on ? "on" : "off"); };

  const visibleOpen = showAllOpen ? open : open.slice(0, 8);

  return (
    <div className="px-4 pt-6 pb-8 space-y-6 overflow-x-hidden">
      {/* Header */}
      <div>
        <h1 className="font-display text-[30px] font-black italic uppercase leading-[0.95] tracking-[-0.02em] text-foreground">Tournaments</h1>
        <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <Navigation className="w-[13px] h-[13px]" style={{ color: HUE.lime }} />
          {location ? <span>Nearest first · from your last location</span> : <span>Turn on location in Play to sort by distance</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── My tournaments ── */}
          <section>
            <SectionHead title="My tournaments" n={mine.upcoming.length} />
            {mine.upcoming.length === 0 ? (
              <EmptyLine icon={<Trophy className="w-[18px] h-[18px]" />} title="Nothing yet — join one below" body="Join a tournament and it shows up here with your countdown." />
            ) : (
              <div className="space-y-2.5">
                {mine.upcoming.map((t, i) => (
                  <MyCard key={t.id} t={t} i={i} st={myStatus[t.id]} venue={venueLabel(t)} provider={providerOf(t)}
                    partner={myStatus[t.id]?.partnerId ? partnerNames[myStatus[t.id].partnerId as string] : undefined}
                    onOpen={() => navigate(`/tournaments/${t.id}`)} />
                ))}
              </div>
            )}
            {mine.past.length > 0 && (
              <div className="mt-2.5">
                <button onClick={() => setPastOpen((v) => !v)} className="w-full flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                  <span className="text-[13px] font-bold text-foreground">Past <Mono className="ml-1" style={{ color: HUE.sky }}>{mine.past.length}</Mono></span>
                  {pastOpen ? <ChevronUp className="w-4 h-4 text-foreground" /> : <ChevronDown className="w-4 h-4 text-foreground" />}
                </button>
                {pastOpen && (
                  <div className="mt-2 rounded-2xl border border-border bg-card overflow-hidden">
                    {mine.past.map((t, i) => {
                      const d = dateBlockParts(t);
                      return (
                        <button key={t.id} onClick={() => navigate(`/tournaments/${t.id}`)}
                          className={`w-full text-left grid grid-cols-[44px_minmax(0,1fr)_auto] gap-3 items-center px-3.5 py-3 ${i < mine.past.length - 1 ? "border-b border-border" : ""}`}>
                          <div className="flex flex-col items-center">
                            <Mono className="text-[10px] font-bold">{d.dow}</Mono>
                            <Mono className="text-[18px] font-bold leading-[1.1]">{d.day}</Mono>
                            <Mono className="text-[10px] font-bold">{d.mon}</Mono>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] font-extrabold text-foreground truncate">{t.name}</p>
                            <p className="text-[12px] font-semibold text-foreground/90 truncate">{venueLabel(t)}</p>
                          </div>
                          {t.status === "cancelled" ? <Chip k="cancelled" sm /> : <Chip k={myStatus[t.id]?.kind === "comp" ? "comp" : myStatus[t.id]?.kind === "waitlist" ? "waitlist" : "registered"} sm />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Invited ── */}
          <section>
            <SectionHead title="Invited" n={invited.length} />
            {invited.length === 0 ? (
              <EmptyLine icon={<Mail className="w-[18px] h-[18px]" />} title="No invitations right now" body="When a club, organiser or friend invites you, it lands here." />
            ) : (
              <div className="space-y-2.5">
                {invited.map(({ inv, t }) => {
                  const d = dateBlockParts(t as TRow);
                  const price = (t as TRow).ticket_price_cents ?? 0;
                  const dl = refundDeadline(t as TRow);
                  return (
                    <div key={inv.id} className="rounded-2xl p-3.5" style={{ border: `1.5px dashed ${HUE.outline}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <OrgAvatar club={(t as TRow).club_id ? clubs[(t as TRow).club_id as string] : null} />
                          <span className="text-[13px] font-bold text-foreground truncate">{organiserName(t as TRow)} invited you</span>
                        </div>
                        <Chip k="invited" sm />
                      </div>
                      <button onClick={() => navigate(`/tournaments/${t.id}`)} className="w-full text-left flex items-start gap-3 mt-3">
                        <DateBlock dow={d.dow} day={d.day} mon={d.mon} />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <h3 className="font-display font-extrabold text-[17px] leading-[1.2] tracking-[-0.01em] text-foreground">{t.name}</h3>
                          <VenueLine venue={venueLabel(t as TRow)} provider={providerOf(t as TRow)} />
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <FormatChip>{formatLabel(t.format_type, t.tournament_type)}</FormatChip>
                            {t.scheduled_time && <Mono className="text-[12px]">{t.scheduled_time.slice(0, 5)}</Mono>}
                            {t.visibility !== "public" && <Chip k="private" sm />}
                          </div>
                        </div>
                      </button>
                      <div className="flex gap-2 mt-3.5">
                        <Button className="flex-1 h-11 rounded-xl font-bold" onClick={() => accept(t as TRow)}>
                          {price > 0 ? <>Accept &amp; pay <Mono className="ml-1">{formatGBP(price)}</Mono></> : "Accept"}
                        </Button>
                        <Button variant="ghost" className="h-11 rounded-xl font-bold text-foreground" onClick={() => decline(inv)}>Decline</Button>
                      </div>
                      {price > 0 && dl && dl.getTime() > Date.now() && (
                        <p className="text-[12px] font-medium text-foreground mt-2">Full refund until <Mono className="text-[12px]">{formatDayTime(dl)}</Mono></p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Open near you ── */}
          <section>
            <SectionHead title="Open near you" n={open.length} right={open.length > 0 ? <span className="text-[12px] font-semibold text-foreground">{location ? "Nearest first" : "Soonest first"}</span> : undefined} />
            {open.length === 0 ? (
              <div className="rounded-2xl bg-card border border-border p-5 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-[60px] h-[60px] rounded-full flex items-center justify-center" style={{ background: tint(HUE.lime, 16), border: `1px solid ${tint(HUE.lime, 45)}` }}>
                    <Trophy className="w-7 h-7" style={{ color: HUE.lime }} />
                  </div>
                  <h3 className="font-display font-extrabold text-[18px] text-foreground">No open tournaments near you yet</h3>
                  <p className="text-[14px] font-medium text-foreground">We'll notify you when one appears.</p>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-[14px] px-3.5 py-3 text-left bg-background" style={{ border: `1px solid ${tint(HUE.lime, 45)}` }}>
                  <div className="flex items-center gap-2.5">
                    <BellRing className="w-[18px] h-[18px]" style={{ color: HUE.lime }} />
                    <div>
                      <p className="text-[14px] font-extrabold text-foreground">Notify me</p>
                      <p className="text-[12px] font-medium text-foreground/90">Push + email · your area</p>
                    </div>
                  </div>
                  <Switch checked={notify} onCheckedChange={toggleNotify} aria-label="Notify me about new tournaments nearby" />
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-card border border-border overflow-hidden">
                  {visibleOpen.map(({ t, dist }, i) => (
                    <OpenRow key={t.id} t={t} dist={dist} last={i === visibleOpen.length - 1} venue={venueLabel(t)} seats={seats[t.id]} onOpen={() => navigate(`/tournaments/${t.id}`)} />
                  ))}
                </div>
                {open.length > visibleOpen.length && (
                  <div className="text-center mt-3">
                    <button onClick={() => setShowAllOpen(true)} className="inline-flex items-center gap-1 text-[13px] font-extrabold" style={{ color: HUE.lime }}>
                      Show {open.length - visibleOpen.length} more <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
};

/* ── sub-components ────────────────────────────────── */
function OrgAvatar({ club, size = 24 }: { club: VenueClub | null | undefined; size?: number }) {
  const name = club?.club_name || "?";
  return club?.logo_url ? (
    <img src={club.logo_url} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full shrink-0 inline-flex items-center justify-center text-[11px] font-extrabold text-foreground" style={{ width: size, height: size, background: tint(HUE.sky, 22) }}>
      {name[0]?.toUpperCase()}
    </span>
  );
}

function MyCard({ t, i, st, venue, provider, partner, onOpen }: {
  t: TRow; i: number; st: MyStatus; venue: string; provider: ReturnType<typeof venueProvider>; partner?: string; onOpen: () => void;
}) {
  const reg = st.kind !== "waitlist";
  const d = dateBlockParts(t);
  const cd = countdownLabel(t);
  const live = !!t.is_live;
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
      onClick={onOpen}
      className="w-full text-left rounded-2xl bg-card p-3.5"
      style={{ border: `1px solid ${tint(reg ? HUE.lime : HUE.amber, 45)}` }}
    >
      <div className="flex items-start gap-3">
        <DateBlock dow={d.dow} day={d.day} mon={d.mon} tone={reg ? "lime" : "amber"} />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display font-extrabold text-[17px] leading-[1.2] tracking-[-0.01em] text-foreground">{t.name}</h3>
            {st.kind === "comp" ? <Chip k="comp" sm /> : st.kind === "waitlist" ? <Chip k="waitlist" sm>Waitlist #{st.position ?? "–"}</Chip> : <Chip k="registered" sm />}
          </div>
          <VenueLine venue={venue} provider={provider} />
          <div className="flex items-center gap-1.5 flex-wrap">
            <FormatChip>{formatLabel(t.format_type, t.tournament_type)}</FormatChip>
            {t.scheduled_time && <Mono className="text-[12px]">{t.scheduled_time.slice(0, 5)}</Mono>}
          </div>
        </div>
      </div>
      <div className="h-px bg-border my-3" />
      <div className="flex items-center justify-between gap-2">
        {t.tournament_type === "pairs" && partner ? (
          <span className="text-[13px] font-semibold text-foreground truncate">with {partner}</span>
        ) : st.kind === "waitlist" ? (
          <span className="text-[13px] font-semibold text-foreground">12h to pay if a place frees up</span>
        ) : t.tournament_type === "pairs" ? (
          <span className="text-[13px] font-semibold text-foreground">No partner yet</span>
        ) : <span />}
        <div className="flex items-center gap-2.5 shrink-0">
          <Mono className="text-[13px] font-bold inline-flex items-center gap-1.5" style={{ color: reg || live ? HUE.lime : "hsl(var(--foreground))" }}>
            {live && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: HUE.lime }} />}
            {cd}
          </Mono>
          {reg && <Chip k="xp" sm />}
        </div>
      </div>
    </motion.button>
  );
}

function OpenRow({ t, dist, last, venue, seats, onOpen }: { t: TRow; dist: number | null; last: boolean; venue: string; seats?: SeatCounts; onOpen: () => void }) {
  const d = dateBlockParts(t);
  const free = seats?.free;
  const few = free != null && free <= 3;
  const lvl = levelRange(t.skill_level_min, t.skill_level_max);
  return (
    <button onClick={onOpen} className={`w-full text-left grid grid-cols-[44px_minmax(0,1fr)_auto] gap-3 items-center px-3.5 py-3 ${last ? "" : "border-b border-border"}`}>
      <div className="flex flex-col items-center">
        <Mono className="text-[10px] font-bold">{d.dow}</Mono>
        <Mono className="text-[20px] font-bold leading-[1.1]">{d.day}</Mono>
        <Mono className="text-[10px] font-bold">{d.mon}</Mono>
      </div>
      <div className="min-w-0 space-y-[3px]">
        <p className="text-[14px] font-extrabold leading-[1.25] text-foreground">{t.name}</p>
        <p className="text-[12px] font-semibold text-foreground truncate">
          {venue}{dist != null && <> · <Mono className="text-[12px]">{formatMiles(dist)}</Mono></>}
        </p>
        <div className="flex items-center gap-1.5">
          {t.scheduled_time && <Mono className="text-[11px]" style={{ color: HUE.sky }}>{t.scheduled_time.slice(0, 5)}</Mono>}
          {lvl && <Mono className="text-[11px]" style={{ color: HUE.sky }}>Lvl {lvl}</Mono>}
          <Chip k="public" sm />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Mono className="text-[15px] font-bold">{formatGBP(t.ticket_price_cents)}</Mono>
        {free == null ? (
          <Mono className="text-[11px] font-bold inline-flex items-center gap-1"><Users className="w-3 h-3" />{t.player_count}</Mono>
        ) : free <= 0 ? (
          <Chip k="full" sm />
        ) : few ? (
          <Chip k="left" sm>{free} left</Chip>
        ) : (
          <Mono className="text-[11px] font-bold">{free} left</Mono>
        )}
      </div>
    </button>
  );
}

export default TournamentsList;
