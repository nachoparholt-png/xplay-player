import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Clock, Phone, Mail, Globe, Car, Zap, Info, TrendingUp, TrendingDown, CalendarDays } from "lucide-react";
import { getDay } from "date-fns";
import { formatInClubTz } from "@/utils/dateTimezone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Browser } from "@capacitor/browser";
import CourtAvailabilityGrid from "@/components/clubs/CourtAvailabilityGrid";
import MembershipCard from "@/components/clubs/MembershipCard";
import EventCard from "@/components/clubs/EventCard";
import ClubMarketTab from "@/components/clubs/ClubMarketTab";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Local type interfaces ──────────────────────────────────────────────────
// For tables not yet in the generated types.ts, or for columns added by
// migrations after the last `supabase gen types` run.

interface ClubRow {
  id: string;
  club_name: string;
  logo_url?: string | null;
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
  parking_info?: string | null;
  amenities?: string | null;
  operating_hours?: string | null;
  /** Added by migration — not yet in generated types */
  currency_symbol?: string | null;
  timezone?: string | null;
}

interface MembershipTierRow {
  id: string;
  name: string;
  tier_tag?: string | null;
  price_cents: number;
  billing_period: string;
  court_discount?: number | null;
  coaching_discount?: number | null;
  advance_booking_days?: number | null;
  benefits?: string[] | null;
  benefits_json?: string[] | null;
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

interface ClubEventAttendeeRow {
  event_id: string;
  user_id: string;
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
  expires_at?: string | null;
  status?: string | null;
  cancels_at?: string | null;
  stripe_subscription_id?: string | null;
}

type ClubTab = "info" | "courts" | "memberships" | "rankings" | "shop" | "events";

const ClubDetail = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Smart back: go to the page that linked us here, or fall back to /matches
  const handleBack = () => {
    const from = (location.state as any)?.from;
    if (from) {
      navigate(from);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/matches");
    }
  };
  const [club, setClub] = useState<ClubRow | null>(null);
  const [courts, setCourts] = useState<any[]>([]);
  const [tiers, setTiers] = useState<MembershipTierRow[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [events, setEvents] = useState<ClubEventRow[]>([]);
  const [eventAttendees, setEventAttendees] = useState<Record<string, number>>({});
  const [myEventSignups, setMyEventSignups] = useState<Set<string>>(new Set());
  const [myMembership, setMyMembership] = useState<ClubMembershipRow | null>(null);
  const [enrollments, setEnrollments] = useState<Record<string, number>>({});
  const [myEnrollments, setMyEnrollments] = useState<Set<string>>(new Set());
  const [operatingHours, setOperatingHours] = useState<OperatingHourRow[]>([]);
  const initialTab = (searchParams.get("tab") as ClubTab) ?? "courts";
  const [tab, setTab] = useState<ClubTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [switchConfirm, setSwitchConfirm] = useState<{ tierId: string; tierName: string; isUpgrade: boolean; isDowngrade: boolean } | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchClubData = async () => {
    if (!clubId) return;
    setLoading(true);

    // ── Round trip 1: all club-level data in parallel ──────────────────────
    const [clubRes, courtsRes, tiersRes, sessRes, eventsRes, hoursRes, memRes] = await Promise.all([
      supabase.from("clubs").select("*").eq("id", clubId).maybeSingle(),
      supabase.from("courts").select("*").eq("club_id", clubId).eq("active", true),
      supabase.from("membership_tiers").select("*").eq("club_id", clubId).eq("active", true).order("sort_order"),
      supabase.from("coaching_sessions").select("*").eq("club_id", clubId).eq("status", "scheduled").gte("starts_at", new Date().toISOString()).order("starts_at"),
      supabase.from("club_events").select("*").eq("club_id", clubId).eq("status", "published").gte("starts_at", new Date().toISOString()).order("starts_at"),
      supabase.from("club_operating_hours").select("*").eq("club_id", clubId).order("day_of_week"),
      user
        ? supabase.from("club_memberships").select("*").eq("user_id", user.id).eq("club_id", clubId).eq("active", true).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (clubRes.error) { setLoading(false); return; }
    setClub(clubRes.data as ClubRow);
    setCourts(courtsRes.data || []);
    setTiers(tiersRes.data || []);
    setSessions(sessRes.data || []);
    setEvents(eventsRes.data || []);
    setOperatingHours(hoursRes.data || []);
    setMyMembership((memRes.data as ClubMembershipRow | null) ?? null);

    // ── Round trip 2: attendee / enrollment counts in parallel ─────────────
    if (user) {
      const eventIds = (eventsRes.data || []).map((e: any) => e.id);
      const sessIds  = (sessRes.data  || []).map((s: any) => s.id);

      const [attendeesRes, enrollRes] = await Promise.all([
        eventIds.length > 0
          ? supabase.from("club_event_attendees").select("event_id, user_id").in("event_id", eventIds).eq("status", "signed_up")
          : Promise.resolve({ data: [] }),
        sessIds.length > 0
          ? supabase.from("coaching_enrollments").select("coaching_session_id, player_id").in("coaching_session_id", sessIds).eq("status", "confirmed")
          : Promise.resolve({ data: [] }),
      ]);

      const counts: Record<string, number> = {};
      const mySigs = new Set<string>();
      (attendeesRes.data || []).forEach((a: any) => {
        counts[a.event_id] = (counts[a.event_id] || 0) + 1;
        if (a.user_id === user.id) mySigs.add(a.event_id);
      });
      setEventAttendees(counts);
      setMyEventSignups(mySigs);

      const eCounts: Record<string, number> = {};
      const myE = new Set<string>();
      (enrollRes.data || []).forEach((e: any) => {
        eCounts[e.coaching_session_id] = (eCounts[e.coaching_session_id] || 0) + 1;
        if (e.player_id === user.id) myE.add(e.coaching_session_id);
      });
      setEnrollments(eCounts);
      setMyEnrollments(myE);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchClubData();
  }, [clubId, user]);

  // Realtime: re-fetch when membership_tiers, courts, coaching_sessions, or club_memberships change for this club
  useEffect(() => {
    if (!clubId) return;
    const channel = supabase
      .channel(`club-detail-${clubId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clubs', filter: `id=eq.${clubId}` }, () => fetchClubData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_tiers', filter: `club_id=eq.${clubId}` }, () => fetchClubData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courts', filter: `club_id=eq.${clubId}` }, () => fetchClubData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'court_slots' }, () => fetchClubData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coaching_sessions', filter: `club_id=eq.${clubId}` }, () => fetchClubData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'club_operating_hours', filter: `club_id=eq.${clubId}` }, () => fetchClubData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clubId]);

  // ── Re-check membership after in-app browser closes (post-Stripe payment) ──
  const prevMembershipIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    let handle: Awaited<ReturnType<typeof Browser.addListener>> | null = null;

    Browser.addListener("browserFinished", async () => {
      if (!user || !clubId) return;
      const { data: mem } = await supabase
        .from("club_memberships")
        .select("*")
        .eq("user_id", user.id)
        .eq("club_id", clubId)
        .eq("active", true)
        .maybeSingle();
      const prev = prevMembershipIdRef.current;
      const incoming = (mem as ClubMembershipRow | null)?.id ?? null;
      setMyMembership(mem as ClubMembershipRow | null);
      prevMembershipIdRef.current = incoming;
      if (incoming && incoming !== prev) {
        toast.success("Membership activated! Welcome aboard 🎉");
      }
    }).then((h) => { handle = h; });

    return () => { handle?.remove(); };
  }, [user, clubId]);

  // Track current membership id in ref so browserFinished closure sees latest value
  useEffect(() => {
    prevMembershipIdRef.current = myMembership?.id ?? null;
  }, [myMembership]);

  const handleSelectMembership = (tier: MembershipTierRow) => {
    // If already a member on a different paid tier, show confirmation dialog
    if (myMembership?.tier_id && myMembership.tier_id !== tier.id) {
      const currentTier = tiers.find((t) => t.id === myMembership.tier_id);
      const isUpgrade = tier.price_cents > (currentTier?.price_cents ?? 0);
      const isDowngrade = tier.price_cents < (currentTier?.price_cents ?? 0);
      setSwitchConfirm({ tierId: tier.id, tierName: tier.name, isUpgrade, isDowngrade });
      return;
    }
    handlePurchaseMembership(tier.id);
  };

  const handlePurchaseMembership = async (tierId: string) => {
    setActionLoading(tierId);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-membership", {
        body: { tier_id: tierId, club_id: clubId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Paid tier → open Stripe checkout in in-app browser
      if (data?.url) {
        await Browser.open({ url: data.url });
        return;
      }
      // Free tier → activated immediately
      toast.success("Membership activated!");
      const { data: mem } = await supabase
        .from("club_memberships")
        .select("*")
        .eq("user_id", user!.id)
        .eq("club_id", clubId!)
        .eq("active", true)
        .maybeSingle();
      setMyMembership(mem as ClubMembershipRow | null);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelMembership = async () => {
    if (!myMembership) return;
    setCancelLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-membership", {
        body: { membership_id: myMembership.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Optimistically update local state
      setMyMembership((prev) =>
        prev ? { ...prev, status: "cancelling", cancels_at: data?.cancels_at ?? null } : null
      );
      toast.success(
        data?.cancels_at
          ? `Membership will cancel on ${new Date(data.cancels_at).toLocaleDateString()}`
          : "Membership cancelled"
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel membership");
    } finally {
      setCancelLoading(false);
      setCancelConfirmOpen(false);
    }
  };

  const handleEnrollCoaching = async (sessionId: string) => {
    setActionLoading(sessionId);
    try {
      const { data, error } = await supabase.functions.invoke("enroll-coaching-slot", {
        body: { coaching_session_id: sessionId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Paid session → open Stripe checkout in in-app browser
      if (data?.url) {
        await Browser.open({ url: data.url });
        return;
      }
      // Free session → enrolled immediately
      toast.success("Enrolled successfully!");
      setMyEnrollments((prev) => new Set(prev).add(sessionId));
      setEnrollments((prev) => ({ ...prev, [sessionId]: (prev[sessionId] || 0) + 1 }));
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSignUpEvent = async (eventId: string) => {
    setActionLoading(eventId);
    try {
      const { data, error } = await supabase.functions.invoke("signup-club-event", {
        body: { event_id: eventId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Paid event → open Stripe checkout in in-app browser
      if (data?.url) {
        await Browser.open({ url: data.url });
        return;
      }
      // Free event → signed up immediately
      toast.success("Signed up!");
      setMyEventSignups((prev) => new Set(prev).add(eventId));
      setEventAttendees((prev) => ({ ...prev, [eventId]: (prev[eventId] || 0) + 1 }));
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const memberTierName = myMembership?.tier_id ? tiers.find((t) => t.id === myMembership.tier_id)?.name : null;
  const currencySymbol: string = club?.currency_symbol ?? '£';

  const tabs: { key: ClubTab; label: string }[] = [
    { key: "info", label: "Info" },
    { key: "courts", label: "Courts" },
    { key: "memberships", label: `Memberships${tiers.length > 0 ? ` (${tiers.length})` : ""}` },
    { key: "events", label: `Events${events.length > 0 ? ` (${events.length})` : ""}` },
    { key: "rankings", label: "Rankings" },
    { key: "shop", label: "Shop" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-muted-foreground">Club not found</p>
        <button onClick={() => handleBack()} className="text-primary text-sm mt-2">Go back</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Hero header with gradient ── */}
      <div className="relative bg-gradient-to-b from-accent/40 via-accent/20 to-background px-6 pt-6 pb-8 space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button onClick={() => handleBack()} className="p-2 -ml-2 active:scale-95 transition-transform">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          {!myMembership ? (
            <button
              onClick={() => setTab("memberships")}
              className="text-[11px] font-display font-bold uppercase tracking-wider bg-primary text-primary-foreground px-5 py-2.5 rounded-xl active:scale-95 transition-transform shadow-lg shadow-primary/30"
            >
              Join Now
            </button>
          ) : (
            <button
              onClick={() => setTab("memberships")}
              className="text-[9px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-3 py-1.5 rounded-full border border-primary/30 active:scale-95 transition-transform"
            >
              {memberTierName?.toUpperCase() || myMembership.role?.replace("_", " ").toUpperCase() || "MEMBER"} ✓
            </button>
          )}
        </div>

        {/* Club avatar + name */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-20 h-20 rounded-full border-2 border-foreground/20 bg-background flex items-center justify-center shadow-lg shadow-accent/20 overflow-hidden">
            {club.logo_url ? (
              <img src={club.logo_url} alt={club.club_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-accent/30 border border-accent/40 flex items-center justify-center">
                <span className="text-sm font-display font-black text-primary">
                  {club.club_name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                </span>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <h1
              className="font-display font-black text-foreground uppercase leading-none tracking-tight"
              style={{ fontSize: 'clamp(28px, 8vw, 40px)', fontStyle: 'italic' }}
            >
              {club.club_name}
            </h1>
            {(club.city || club.location) && (
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                <MapPin className="w-3 h-3 text-primary" />
                {club.city ? `${club.city.toUpperCase()}, ${(club.country || 'UK').toUpperCase()}` : club.location}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Pill tabs ── */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-full transition-all ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="px-6 pb-6">
      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
        {/* ── COURTS TAB ── */}
        {tab === "courts" && (
          <div className="space-y-4">
            <CourtAvailabilityGrid clubId={clubId!} courts={courts} membershipDiscount={myMembership ? (tiers.find((t) => t.id === myMembership?.tier_id)?.court_discount || 0) : 0} memberTierName={memberTierName} currencySymbol={currencySymbol} />
          </div>
        )}

        {/* ── EVENTS TAB ── */}
        {tab === "events" && (
          <div className="space-y-3">
            {events.length === 0 ? (
              <div className="text-center py-14 space-y-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <CalendarDays className="w-7 h-7 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">No upcoming events</p>
                <p className="text-xs text-muted-foreground">Check back soon — events will appear here when the club publishes them.</p>
              </div>
            ) : (
              events.map((event) => (
                <EventCard
                  key={event.id}
                  id={event.id}
                  title={event.title}
                  description={event.description}
                  startsAt={event.starts_at}
                  endsAt={event.ends_at}
                  timezone={club?.timezone}
                  priceCents={event.price_cents}
                  maxAttendees={event.max_attendees}
                  attendeeCount={eventAttendees[event.id] || 0}
                  isSignedUp={myEventSignups.has(event.id)}
                  onSignUp={() => handleSignUpEvent(event.id)}
                  loading={actionLoading === event.id}
                  currencySymbol={currencySymbol}
                />
              ))
            )}
          </div>
        )}

        {/* ── MEMBERSHIPS TAB ── */}
        {tab === "memberships" && (
          <div className="space-y-3">
            {/* Show current role-based membership only for actual staff roles, never for regular players */}
            {myMembership && !myMembership.tier_id && ["staff", "manager", "coach", "admin"].includes(myMembership.role || "") && (
              <MembershipCard
                id={myMembership.id}
                name={myMembership.role?.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Member"}
                tierTag="staff"
                priceCents={0}
                billingPeriod="monthly"
                courtDiscount={0}
                coachingDiscount={0}
                advanceBookingDays={3}
                benefits={["Club access", "Open match visibility"]}
                isCurrentPlan={true}
                hideAction
                currencySymbol={currencySymbol}
              />
            )}
            {tiers.length === 0 && !myMembership ? (
              <div className="text-center py-10 space-y-2">
                <p className="text-sm text-muted-foreground">No membership plans available</p>
              </div>
            ) : (
              tiers.filter((tier) => tier.tier_tag !== 'staff').map((tier) => {
                const currentTier = myMembership?.tier_id ? tiers.find((t) => t.id === myMembership.tier_id) : undefined;
                return (
                  <MembershipCard
                    key={tier.id}
                    id={tier.id}
                    name={tier.name}
                    tierTag={tier.tier_tag || "default"}
                    priceCents={tier.price_cents}
                    billingPeriod={tier.billing_period}
                    courtDiscount={tier.court_discount || 0}
                    coachingDiscount={tier.coaching_discount || 0}
                    advanceBookingDays={tier.advance_booking_days || 7}
                    benefits={tier.benefits || tier.benefits_json || []}
                    isCurrentPlan={myMembership?.tier_id === tier.id}
                    currentMembershipPriceCents={currentTier?.price_cents}
                    onSelect={() => handleSelectMembership(tier)}
                    loading={actionLoading === tier.id}
                    currencySymbol={currencySymbol}
                  />
                );
              })
            )}

            {/* ── Cancellation status + cancel button ── */}
            {myMembership?.tier_id && (
              <div className="mt-2 space-y-2">
                {myMembership.status === "cancelling" && myMembership.cancels_at && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-400 flex items-center gap-2">
                    <span>⚠</span>
                    <span>
                      Your membership is active until{" "}
                      <strong>{new Date(myMembership.cancels_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</strong>
                      , then it will end.
                    </span>
                  </div>
                )}
                {myMembership.status === "active" && (
                  <button
                    onClick={() => setCancelConfirmOpen(true)}
                    className="w-full py-2.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider border border-destructive/40 text-destructive/80 hover:bg-destructive/10 transition-all active:scale-[0.98]"
                  >
                    Cancel Membership
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── INFO TAB ── */}
        {tab === "info" && (
          <div className="space-y-4">
            {(club.club_description || club.description) && (
              <div className="bg-card rounded-2xl border border-border/50 p-4">
                <p className="text-sm text-foreground leading-relaxed">{club.club_description || club.description}</p>
              </div>
            )}

            <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
              {(club.address_line_1 || club.location) && (
                <p className="text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  {[club.address_line_1 || club.location, club.city, club.postcode].filter(Boolean).join(', ')}
                </p>
              )}
              {(club.contact_phone || club.phone) && <p className="text-sm flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> {club.contact_phone || club.phone}</p>}
              {(club.contact_email || club.email) && <p className="text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> {club.contact_email || club.email}</p>}
              {club.website && <p className="text-sm flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /> <a href={club.website} target="_blank" rel="noopener noreferrer" className="text-primary underline">{club.website}</a></p>}
              {club.parking_info && <p className="text-sm flex items-center gap-2"><Car className="w-4 h-4 text-primary" /> {club.parking_info}</p>}
            </div>

            {/* Operating Hours */}
            {operatingHours.length > 0 ? (
              <div className="bg-card rounded-2xl border border-border/50 p-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-primary" /> Opening Hours
                </h3>
                <div className="space-y-1.5">
                  {(() => {
                    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                    const today = getDay(new Date());
                    // Show Mon–Sun order: [1,2,3,4,5,6,0]
                    const orderedDays = [1, 2, 3, 4, 5, 6, 0];
                    return orderedDays.map((d) => {
                      const h = operatingHours.find((oh) => oh.day_of_week === d);
                      const isToday = d === today;
                      return (
                        <div key={d} className={`flex justify-between text-sm py-1 px-2 rounded-lg ${isToday ? "bg-primary/10 font-semibold" : ""}`}>
                          <span className={isToday ? "text-primary" : "text-muted-foreground"}>{dayNames[d]}</span>
                          <span className={isToday ? "text-foreground" : "text-muted-foreground"}>
                            {h ? (h.is_closed ? "Closed" : `${h.open_time} – ${h.close_time}`) : "—"}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : club.operating_hours ? (
              <div className="bg-card rounded-2xl border border-border/50 p-4">
                <p className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> {club.operating_hours}</p>
              </div>
            ) : null}

            {club.amenities && (
              <div className="bg-card rounded-2xl border border-border/50 p-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Amenities</h3>
                <p className="text-sm text-foreground">{club.amenities}</p>
              </div>
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-card rounded-xl border border-border/50 p-3 text-center">
                <p className="text-lg font-bold text-foreground">{courts.length}</p>
                <p className="text-[10px] text-muted-foreground">Courts</p>
              </div>
              <div className="bg-card rounded-xl border border-border/50 p-3 text-center">
                <p className="text-lg font-bold text-foreground">{tiers.length}</p>
                <p className="text-[10px] text-muted-foreground">Plans</p>
              </div>
              <div className="bg-card rounded-xl border border-border/50 p-3 text-center">
                <p className="text-lg font-bold text-foreground">{sessions.length}</p>
                <p className="text-[10px] text-muted-foreground">Coaching</p>
              </div>
            </div>

            {/* Coaching sessions preview */}
            {sessions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Coaching</h3>
                {sessions.slice(0, 2).map((session) => {
                  const spotsUsed = enrollments[session.id] || 0;
                  const spotsLeft = session.max_players ? session.max_players - spotsUsed : null;
                  const isEnrolled = myEnrollments.has(session.id);
                  const tz = club?.timezone;
                  return (
                    <div key={session.id} className="bg-card rounded-2xl border border-border/50 p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-display font-bold text-sm text-foreground">{session.title}</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">{session.session_type} session</p>
                        </div>
                        {session.price_cents > 0 && (
                          <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">
                            {currencySymbol}{(session.price_cents / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatInClubTz(session.starts_at, "EEE d MMM", tz)} {formatInClubTz(session.starts_at, "HH:mm", tz)} – {formatInClubTz(session.ends_at, "HH:mm", tz)}
                        </span>
                        {spotsLeft !== null && <span>{spotsLeft > 0 ? `${spotsLeft} spots` : "Full"}</span>}
                      </div>
                      <button
                        onClick={() => handleEnrollCoaching(session.id)}
                        disabled={isEnrolled || actionLoading === session.id || (spotsLeft !== null && spotsLeft <= 0)}
                        className="w-full py-2 rounded-xl text-xs font-display font-bold uppercase tracking-wider transition-all disabled:opacity-50 active:scale-[0.98] bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
                      >
                        {isEnrolled ? "Enrolled ✓" : actionLoading === session.id ? "..." : "Enroll"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Events preview — tap "See all" to go to Events tab */}
            {events.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Upcoming Events</h3>
                  {events.length > 2 && (
                    <button
                      onClick={() => setTab("events")}
                      className="text-[10px] font-bold text-primary uppercase tracking-wider hover:underline"
                    >
                      See all {events.length} →
                    </button>
                  )}
                </div>
                {events.slice(0, 2).map((event) => (
                  <EventCard
                    key={event.id}
                    id={event.id}
                    title={event.title}
                    description={event.description}
                    startsAt={event.starts_at}
                    endsAt={event.ends_at}
                    timezone={club?.timezone}
                    priceCents={event.price_cents}
                    maxAttendees={event.max_attendees}
                    attendeeCount={eventAttendees[event.id] || 0}
                    isSignedUp={myEventSignups.has(event.id)}
                    onSignUp={() => handleSignUpEvent(event.id)}
                    loading={actionLoading === event.id}
                    currencySymbol={currencySymbol}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── RANKINGS TAB ── */}
        {tab === "rankings" && (
          <div className="text-center py-12 space-y-2">
            <p className="text-sm text-muted-foreground">Club rankings coming soon</p>
            <p className="text-xs text-muted-foreground/60">See how players rank within this club</p>
          </div>
        )}

        {/* ── SHOP TAB ── */}
        {tab === "shop" && (
          <ClubMarketTab
            clubId={clubId!}
            clubName={club?.club_name ?? ""}
            membershipDiscount={
              myMembership?.tier_id
                ? (tiers.find(t => t.id === myMembership.tier_id) as any)?.market_discount_pct ?? 0
                : 0
            }
          />
        )}
      </motion.div>
      </div>

      {/* Membership switch confirmation dialog */}
      <AlertDialog open={!!switchConfirm} onOpenChange={(open) => { if (!open) setSwitchConfirm(null); }}>
        <AlertDialogContent className="bg-card border border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display">
              {switchConfirm?.isUpgrade && <TrendingUp className="w-5 h-5 text-primary" />}
              {switchConfirm?.isDowngrade && <TrendingDown className="w-5 h-5 text-secondary" />}
              {switchConfirm?.isUpgrade ? "Upgrade" : switchConfirm?.isDowngrade ? "Downgrade" : "Switch"} to {switchConfirm?.tierName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed">
              {switchConfirm?.isUpgrade
                ? "Your current membership will be cancelled and you'll be charged for the new plan. Any remaining time on your current plan will be credited."
                : switchConfirm?.isDowngrade
                ? "Your current membership will be cancelled and replaced with this lower-tier plan. Changes take effect at the start of the next billing cycle."
                : "Your current membership will be replaced with this new plan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-primary text-primary-foreground font-bold"
              onClick={() => {
                if (switchConfirm) {
                  handlePurchaseMembership(switchConfirm.tierId);
                  setSwitchConfirm(null);
                }
              }}
            >
              Confirm {switchConfirm?.isUpgrade ? "Upgrade" : switchConfirm?.isDowngrade ? "Downgrade" : "Switch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel membership confirmation dialog */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={(open) => { if (!open) setCancelConfirmOpen(false); }}>
        <AlertDialogContent className="bg-card border border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-destructive">Cancel Membership?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed">
              Your membership will remain active until the end of the current billing period, then it will not renew.
              You'll keep full access and benefits until then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={cancelLoading}>Keep Membership</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground font-bold"
              disabled={cancelLoading}
              onClick={(e) => {
                e.preventDefault();
                handleCancelMembership();
              }}
            >
              {cancelLoading ? "Cancelling…" : "Yes, Cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClubDetail;
