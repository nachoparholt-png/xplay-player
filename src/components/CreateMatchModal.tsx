/**
 * CreateMatchModal — the ONE way to create a match (25 Sep 2026 redesign).
 *
 * Three steps, one question per screen: Where → When → Who, then a Done panel.
 * Every entry point uses it: the Matches tab (blank), the Clubs page ("Organise a
 * match here" → step 2 with the club set), the Courts tab (a tapped slot → step 3
 * with club, time, length and booking link set) and the Playtomic paste (step 3).
 *
 * Venue tiers (see XPLAY_Club_Data_Availability_Design.md):
 *  - native club   = XPLAY partner/demo: real courts, XPLAY reserves the slot, payment in-app.
 *  - directory club = Playtomic / Padelmates feed: the club's free courts are the time
 *                     picker; the court is booked on the club's site (deep link after posting).
 *  - members-only  = David Lloyd: plain time picker, booking in the DL app.
 *  - any court     = free text, nothing from our database.
 */
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, addDays, startOfDay, isSameDay } from "date-fns";
import { ClipboardPaste, ChevronRight, ChevronLeft, X, Search, ExternalLink, Check, Clock, ShieldCheck, UserPlus, Share2, Building2 } from "lucide-react";
import { Stripe, PaymentSheetEventsEnum } from "@capacitor-community/stripe";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { isMembersOnly } from "@/components/clubs/clubTier";
import ExternalAvailability, { type ExternalSlot } from "@/components/ExternalAvailability";
import { useMatchChat } from "@/hooks/useMatchChat";
import { parsePlaytomicClipboard, findBestClubMatch } from "@/lib/parsePlaytomic";
import { STAKES_ENABLED } from "@/lib/featureFlags";

export type ClubSelection = {
  id: string;
  club_name: string;
  location: string | null;
  city: string | null;
  source?: string; // 'xplay_partner' | 'directory' | 'demo'
  external_provider?: string | null;
};

/** What an entry point already knows. Everything optional. */
export interface CreateMatchInitial {
  club?: ClubSelection | null;
  clubId?: string | null;
  /** A tapped slot (Court Finder / club page): date, time, length and the booking link. */
  slot?: {
    starts_at: string;
    duration_mins?: number | null;
    price_cents?: number | null;
    booking_url?: string | null;
    court_label?: string | null;
  } | null;
  /** Court Finder "Book first": the organiser already booked this slot on the club's site. */
  courtBooked?: boolean;
}

interface CreateMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (matchId: string) => void;
  initial?: CreateMatchInitial | null;
}

const TIME_SLOTS = Array.from({ length: 36 }, (_, i) => {
  const hour = Math.floor(i / 2) + 6;
  const min = i % 2 === 0 ? "00" : "30";
  return `${hour.toString().padStart(2, "0")}:${min}`;
});
type DayPart = "morning" | "afternoon" | "evening";
const DAY_PARTS: Record<DayPart, { label: string; from: string; to: string }> = {
  morning: { label: "Morning", from: "06:00", to: "12:00" },
  afternoon: { label: "Afternoon", from: "12:00", to: "17:00" },
  evening: { label: "Evening", from: "17:00", to: "24:00" },
};
const RECENT_KEY = "xplay.recentClubs";
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min`);

type Step = 1 | 2 | 3 | 4;

const CreateMatchModal = ({ open, onOpenChange, onCreated, initial }: CreateMatchModalProps) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { getOrCreateMatchChat } = useMatchChat();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Where ──
  const [clubs, setClubs] = useState<ClubSelection[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [venueKind, setVenueKind] = useState<"club" | "custom">("club");
  const [selectedClub, setSelectedClub] = useState<ClubSelection | null>(null);
  const [customVenueName, setCustomVenueName] = useState("");
  const [courtName, setCourtName] = useState(""); // free text, all tiers (native clubs without DB courts too)

  // ── Native club: real courts + slots ──
  const [courts, setCourts] = useState<any[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const [selectedCourtObj, setSelectedCourtObj] = useState<any | null>(null);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // ── When ──
  const [matchDate, setMatchDate] = useState<Date | undefined>();
  const [matchTime, setMatchTime] = useState("");
  const [durationMins, setDurationMins] = useState(90);
  const [dayPart, setDayPart] = useState<DayPart>("evening");
  const [manualTime, setManualTime] = useState(false);
  const [liveSlotCount, setLiveSlotCount] = useState<number | null>(null);
  const [liveSlot, setLiveSlot] = useState<ExternalSlot | null>(null); // the tapped club slot (price + booking link)
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  useEffect(() => {
    if (!matchTime) return;
    const part = (Object.keys(DAY_PARTS) as DayPart[]).find((k) => matchTime >= DAY_PARTS[k].from && matchTime < DAY_PARTS[k].to);
    if (part) setDayPart(part);
  }, [matchTime]);

  // ── Who ──
  const [matchFormat, setMatchFormat] = useState<"competitive" | "social">("competitive");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [courtFeeInput, setCourtFeeInput] = useState("");
  const [courtBooked, setCourtBooked] = useState<boolean | null>(null); // external courts: Yes / Not yet
  const playerLevel = profile?.padel_level ?? 3.0;
  const suggestedMax = Math.min(7.0, playerLevel + 1.0);
  const [levelMin, setLevelMin] = useState(Math.max(0.5, playerLevel - 1.0));
  const [showLevelEditor, setShowLevelEditor] = useState(false);
  const [notes, setNotes] = useState("");

  // ── Done ──
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [bookingUrl, setBookingUrl] = useState<string | null>(null);

  // ── Tiers ──
  const isDirectoryClub = venueKind === "club" && selectedClub?.source === "directory";
  const membersOnly = isDirectoryClub && isMembersOnly(selectedClub?.external_provider);
  const hasLiveFeed = isDirectoryClub && !membersOnly;
  const isNativeClub = venueKind === "club" && !!selectedClub && !isDirectoryClub;
  const isExternalCourt = venueKind === "custom" || isDirectoryClub;
  const useSmartSlots = isNativeClub && courts.length > 0;
  const venueName = venueKind === "club" ? selectedClub?.club_name ?? "" : customVenueName.trim();
  const tierLabel = venueKind === "custom" ? "Any court"
    : membersOnly ? "Members only · book in the David Lloyd app"
    : isDirectoryClub ? `Live courts · ${selectedClub?.external_provider === "padelmates" ? "Padelmates" : "Playtomic"}`
    : "XPLAY club · we reserve the court";
  const nextSevenDays = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i));

  const resetAll = () => {
    setStep(1); setSearch(""); setVenueKind("club"); setSelectedClub(null); setCustomVenueName(""); setCourtName("");
    setCourts([]); setSelectedCourtObj(null); setAvailableSlots([]);
    setMatchDate(undefined); setMatchTime(""); setDurationMins(90); setManualTime(false); setLiveSlotCount(null); setLiveSlot(null);
    setMatchFormat("competitive"); setVisibility("public"); setCourtFeeInput(""); setCourtBooked(null); setShowLevelEditor(false); setNotes("");
    setCreatedId(null); setBookingUrl(null); setErrorMsg(null); setLoading(false);
  };

  // ── Open: load the club list, apply what the entry point already knows ──
  useEffect(() => {
    if (!open) { resetAll(); return; }
    const lvl = profile?.padel_level ?? 3.0;
    setLevelMin(Math.max(0.5, lvl - 1.0));
    setClubsLoading(true);
    supabase
      .from("clubs")
      .select("id, club_name, location, city, source, external_provider")
      .eq("club_status", "active")
      .neq("kind", "organiser")
      .order("source", { ascending: false })
      .order("club_name")
      .then(({ data }) => { setClubs((data as ClubSelection[]) || []); setClubsLoading(false); });

    const applyInitial = async () => {
      if (!initial) return;
      let club = initial.club ?? null;
      if (!club && initial.clubId) {
        const { data } = await supabase.from("clubs").select("id, club_name, location, city, source, external_provider").eq("id", initial.clubId).maybeSingle();
        club = (data as ClubSelection) ?? null;
      }
      if (club) { setVenueKind("club"); setSelectedClub(club); if (!initial.slot) setMatchDate(startOfDay(new Date())); setStep(2); }
      if (initial.slot) {
        const d = new Date(initial.slot.starts_at);
        setMatchDate(startOfDay(d));
        setMatchTime(format(d, "HH:mm"));
        if (initial.slot.duration_mins) setDurationMins(initial.slot.duration_mins);
        if (initial.slot.court_label && !/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(initial.slot.court_label)) setCourtName(initial.slot.court_label);
        setLiveSlot({
          id: "initial", starts_at: initial.slot.starts_at, duration_mins: initial.slot.duration_mins ?? 90,
          price_cents: initial.slot.price_cents ?? null, currency: "GBP", booking_url: initial.slot.booking_url ?? null, fetched_at: new Date().toISOString(),
        });
        if (club) setStep(3);
      }
      if (initial.courtBooked != null) setCourtBooked(initial.courtBooked);
    };
    applyInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Native club: courts ──
  useEffect(() => {
    if (!isNativeClub || !selectedClub) { setCourts([]); setSelectedCourtObj(null); return; }
    setCourtsLoading(true);
    supabase.from("courts").select("*").eq("club_id", selectedClub.id).eq("active", true).order("name")
      .then(({ data }) => { setCourts(data || []); setCourtsLoading(false); });
  }, [selectedClub, isNativeClub]);

  // ── Native club: slots for court + date ──
  useEffect(() => {
    if (!isNativeClub || !selectedCourtObj || !matchDate) { setAvailableSlots([]); return; }
    setSlotsLoading(true);
    const dayStart = new Date(matchDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(matchDate); dayEnd.setHours(23, 59, 59, 999);
    supabase.from("court_slots").select("*").eq("court_id", selectedCourtObj.id).eq("status", "available").is("coaching_session_id", null)
      .gte("starts_at", dayStart.toISOString()).lte("starts_at", dayEnd.toISOString()).order("starts_at")
      .then(({ data }) => {
        setAvailableSlots(data || []); setSlotsLoading(false);
        if (matchTime && !(data || []).some((s) => format(new Date(s.starts_at), "HH:mm") === matchTime)) setMatchTime("");
      });
  }, [selectedCourtObj, matchDate, isNativeClub]);

  const selectedSlot = useMemo(
    () => availableSlots.find((s) => format(new Date(s.starts_at), "HH:mm") === matchTime) ?? null,
    [availableSlots, matchTime]
  );
  const slotHasPrice = selectedSlot !== null && Number(selectedSlot.price ?? 0) > 0;
  const manualFeeAmount = Number(courtFeeInput) || 0;
  const requiresPayment = visibility === "private" && (slotHasPrice || manualFeeAmount > 0);
  const courtPrice = selectedSlot?.price ? Number(selectedSlot.price) : liveSlot?.price_cents != null ? liveSlot.price_cents / 100 : null;

  // ── Recent clubs (this phone) ──
  const recentIds: string[] = useMemo(() => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } }, [open]);
  const rememberClub = (id: string) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentIds.filter((x) => x !== id)].slice(0, 3))); } catch { /* ignore */ } };

  const squash = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const words = search.toLowerCase().split(/\s+/).map(squash).filter(Boolean);
  const filteredClubs = clubs.filter((c) => words.every((w) => squash([c.club_name, c.location, c.city].filter(Boolean).join(" ")).includes(w)));
  const recentClubs = recentIds.map((id) => clubs.find((c) => c.id === id)).filter(Boolean) as ClubSelection[];

  const pickClub = (club: ClubSelection) => {
    setVenueKind("club"); setSelectedClub(club); setCustomVenueName("");
    setSelectedCourtObj(null); setAvailableSlots([]); setMatchTime(""); setLiveSlot(null); setManualTime(false); setLiveSlotCount(null); setCourtBooked(null);
    if (!matchDate) setMatchDate(startOfDay(new Date()));
    setErrorMsg(null); setStep(2);
  };
  const pickAnyCourt = () => {
    setVenueKind("custom"); setSelectedClub(null); setCourts([]); setSelectedCourtObj(null); setAvailableSlots([]);
    setMatchTime(""); setLiveSlot(null); setCourtBooked(null); setErrorMsg(null);
    if (!matchDate) setMatchDate(startOfDay(new Date()));
    setStep(2);
  };

  // ── Paste from Playtomic (shortcut: fills all three steps) ──
  const handlePasteAutofill = async () => {
    try {
      setPasteLoading(true);
      let clipText = "";
      try { clipText = await navigator.clipboard.readText(); } catch { clipText = ""; }
      if (!clipText || clipText.trim().length < 10) {
        toast({ title: "Nothing to paste yet", description: "In Playtomic open the booking, tap Share → Copy, then come back and tap this again." });
        return;
      }
      const parsed = parsePlaytomicClipboard(clipText);
      let club: ClubSelection | null = null;
      if (parsed.clubName) { const m = findBestClubMatch(clubs as any, parsed.clubName); if (m) club = m as ClubSelection; }
      if (club) { setVenueKind("club"); setSelectedClub(club); } else if (parsed.clubName) { setVenueKind("custom"); setCustomVenueName(parsed.clubName); }
      if (parsed.date) setMatchDate(parsed.date);
      if (parsed.time && TIME_SLOTS.includes(parsed.time)) setMatchTime(parsed.time);
      if (parsed.players.length > 0) {
        const levels = parsed.players.map((p) => p.level);
        setLevelMin(Math.max(0.5, Math.floor(Math.max(0.5, Math.min(...levels) - 0.5) * 2) / 2));
        setNotes(parsed.players.map((p) => `${p.name} (${p.level})`).join(", "));
      }
      setCourtBooked(true); // they pasted a booking
      setStep(parsed.date && parsed.time ? 3 : 2);
      toast({ title: "Filled in from Playtomic", description: `${parsed.clubName || "Match"}${parsed.players.length ? ` · ${parsed.players.length} player(s)` : ""}. Check it and post.` });
    } catch {
      toast({ title: "Couldn't read that", description: "Copy the booking from Playtomic (Share → Copy) and tap again, or pick the club below." });
    } finally { setPasteLoading(false); }
  };

  const handleLiveSlot = (slot: ExternalSlot) => {
    const d = new Date(slot.starts_at);
    setMatchDate(startOfDay(d)); setMatchTime(format(d, "HH:mm"));
    if (slot.duration_mins) setDurationMins(slot.duration_mins);
    setLiveSlot(slot); setErrorMsg(null);
  };

  // ── Step gates ──
  const whenReady = !!matchDate && !!matchTime && (!useSmartSlots || !!selectedCourtObj);
  const goWho = () => {
    if (!matchDate) return setErrorMsg("Pick a day.");
    if (useSmartSlots && !selectedCourtObj) return setErrorMsg("Pick a court.");
    if (!matchTime) return setErrorMsg("Pick a time.");
    setErrorMsg(null); setStep(3);
  };

  // ── Post ──
  const handleCreate = async () => {
    if (!user) return;
    if (!venueName) { setErrorMsg("Where are you playing?"); setStep(venueKind === "custom" ? 2 : 1); return; }
    if (!matchDate || !matchTime) { setErrorMsg("Pick a day and time."); setStep(2); return; }
    if (isExternalCourt && courtBooked === null) { setErrorMsg("Is the court booked?"); return; }
    setErrorMsg(null); setLoading(true);

    const courtValue = isNativeClub && selectedCourtObj ? (selectedCourtObj.nickname || selectedCourtObj.name) : (courtName.trim() || null);

    let paymentIntentData: any = null;
    if (requiresPayment) {
      const piBody = slotHasPrice && selectedSlot
        ? { court_slot_id: selectedSlot.id, max_players: 4 }
        : { court_price_cents: Math.round(manualFeeAmount * 100), currency: "gbp", max_players: 4 };
      const { data: piData, error: piError } = await supabase.functions.invoke("create-private-match-payment-intent", { body: piBody });
      if (piError || piData?.error) {
        toast({ title: "Payment setup failed", description: piData?.error ?? piError?.message ?? "Could not initialise payment.", variant: "destructive" });
        setLoading(false); return;
      }
      try {
        await Stripe.createPaymentSheet({ paymentIntentClientSecret: piData.clientSecret, merchantDisplayName: "XPLAY", style: "alwaysDark", withZipCode: false });
        const { paymentResult } = await Stripe.presentPaymentSheet();
        if (paymentResult !== PaymentSheetEventsEnum.Completed) {
          toast({ title: paymentResult === PaymentSheetEventsEnum.Canceled ? "Payment cancelled" : "Payment failed", description: "Your match was not created. No charge was made.", variant: paymentResult === PaymentSheetEventsEnum.Canceled ? "default" : "destructive" });
          setLoading(false); return;
        }
      } catch (stripeErr: any) {
        toast({ title: "Payment error", description: stripeErr?.message ?? "Payment could not be completed.", variant: "destructive" });
        setLoading(false); return;
      }
      paymentIntentData = {
        payment_intent_id: piData.payment_intent_id, stripe_customer_id: piData.stripe_customer_id, total_cents: piData.total_cents,
        organiser_share_cents: piData.organiser_share_cents, per_spot_full_price_cents: piData.per_spot_full_price_cents,
        organiser_discount_pct: piData.discount_pct, spots_count: piData.max_players, currency: piData.currency,
      };
    }

    const { data, error } = await supabase.from("matches").insert({
      organizer_id: user.id,
      club: venueName,
      court: courtValue,
      match_date: format(matchDate, "yyyy-MM-dd"),
      match_time: matchTime,
      format: matchFormat,
      level_min: levelMin,
      level_max: suggestedMax,
      max_players: 4,
      price_per_player: 0,
      visibility,
      notes: notes || null,
      court_booking_status: isExternalCourt ? (courtBooked ? "booked" : "not_booked") : null,
      external_booking_url: isExternalCourt ? (liveSlot?.booking_url ?? null) : null,
      duration_mins: selectedSlot
        ? Math.max(15, Math.round((new Date(selectedSlot.ends_at).getTime() - new Date(selectedSlot.starts_at).getTime()) / 60000))
        : durationMins,
    }).select().single();

    if (error || !data) {
      toast({ title: "Couldn't post the match", description: error?.message, variant: "destructive" });
      setLoading(false); return;
    }
    const { error: joinErr } = await supabase.from("match_players").insert({ match_id: data.id, user_id: user.id, team: "A", status: "confirmed" });
    if (joinErr) console.error("Host auto-join failed:", joinErr.message);
    await getOrCreateMatchChat(data.id, `${venueName}${courtValue ? ` — ${courtValue}` : ""}`);
    if (STAKES_ENABLED && matchFormat !== "social") {
      try { await supabase.functions.invoke("create-match-market", { body: { match_id: data.id } }); } catch (e) { console.error(e); }
    }
    if (paymentIntentData) {
      const { error: escrowErr } = await supabase.functions.invoke("record-private-match-escrow", {
        body: {
          match_id: data.id, payment_intent_id: paymentIntentData.payment_intent_id, per_spot_full_price_cents: paymentIntentData.per_spot_full_price_cents,
          organiser_share_cents: paymentIntentData.organiser_share_cents, organiser_discount_pct: paymentIntentData.organiser_discount_pct,
          spots_count: paymentIntentData.spots_count, total_charged_cents: paymentIntentData.total_cents, stripe_customer_id: paymentIntentData.stripe_customer_id, currency: paymentIntentData.currency,
        },
      });
      if (escrowErr) console.error("Failed to record escrow:", escrowErr);
    }
    if (selectedClub) rememberClub(selectedClub.id);
    setLoading(false);
    setCreatedId(data.id);
    setBookingUrl(isExternalCourt && !courtBooked ? (liveSlot?.booking_url ?? null) : null);
    setStep(4);
  };

  const markBooked = async () => {
    if (!createdId) return;
    const { error } = await supabase.from("matches").update({ court_booking_status: "booked" }).eq("id", createdId);
    if (error) toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
    else { setBookingUrl(null); toast({ title: "Court marked as booked", description: "Players will see the court is secured." }); }
  };
  const finish = () => { const id = createdId; onOpenChange(false); if (id) onCreated?.(id); };

  // ── Small UI helpers ──
  const Label = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[11px] font-display font-bold uppercase tracking-[0.12em] text-muted-foreground">{children}</div>
  );
  const pill = (on: boolean, extra = "") => cn(
    "h-12 rounded-full text-sm font-bold transition-colors border px-3",
    on ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground", extra
  );
  const TierTag = ({ club }: { club: ClubSelection }) => {
    const dir = club.source === "directory";
    const mo = dir && isMembersOnly(club.external_provider);
    return (
      <span className={cn("text-xs font-bold", mo ? "text-foreground" : dir ? "text-primary" : "text-secondary")}>
        {mo ? "Members only" : dir ? "● Live courts" : "XPLAY club"}
        <span className="font-normal text-muted-foreground"> · {mo ? "book in the DL app" : dir ? (club.external_provider === "padelmates" ? "Padelmates" : "Playtomic") : "we reserve the court"}</span>
      </span>
    );
  };
  const ClubRow = ({ club }: { club: ClubSelection }) => (
    <button type="button" onClick={() => pickClub(club)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-left active:scale-[0.99] transition-transform">
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-display font-black flex-shrink-0",
        club.source === "directory" ? (isMembersOnly(club.external_provider) ? "bg-muted text-foreground" : "bg-primary text-primary-foreground") : "bg-accent text-white")}>
        {club.club_name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold truncate">{club.club_name}</div>
        <div className="text-xs truncate"><TierTag club={club} /></div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
  const Header = ({ title, sub, back }: { title: string; sub?: string; back?: () => void }) => (
    <>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        {back ? (
          <button type="button" onClick={back} aria-label="Back" className="w-11 h-11 rounded-full bg-card border border-border flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
        ) : (
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close" className="w-11 h-11 rounded-full bg-card border border-border flex items-center justify-center"><X className="w-5 h-5" /></button>
        )}
        <div className="text-[11px] font-display font-bold uppercase tracking-[0.12em] text-muted-foreground">{step < 4 ? `Step ${step} of 3` : "Done"}</div>
        <div className="w-11" />
      </div>
      <div className="flex gap-1.5 px-4 pb-4">
        {[1, 2, 3].map((i) => <div key={i} className={cn("h-1 flex-1 rounded-full", step >= i ? "bg-primary" : "bg-muted")} />)}
      </div>
      <div className="px-4 pb-3 space-y-1">
        <h2 className="font-display text-[28px] font-black italic uppercase leading-[0.95]">{title}</h2>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
    </>
  );
  const DayChips = () => (
    <div className="flex gap-2 overflow-x-auto pb-1 w-full max-w-full">
      {nextSevenDays.map((day, i) => {
        const on = !!matchDate && isSameDay(matchDate, day);
        return (
          <button key={i} type="button" onClick={() => { setMatchDate(day); if (useSmartSlots || hasLiveFeed) { setMatchTime(""); setLiveSlot(null); } setErrorMsg(null); }}
            className={cn("flex-shrink-0 w-14 h-[58px] rounded-xl border flex flex-col items-center justify-center font-display", on ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border")}>
            <span className="text-[13px] font-black">{format(day, "EEE")}</span>
            <span className={cn("text-xs font-bold", !on && "text-muted-foreground")}>{format(day, "d")}</span>
          </button>
        );
      })}
      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex-shrink-0 w-14 h-[58px] rounded-xl border border-border bg-card text-xs font-bold text-muted-foreground">More</button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={matchDate} onSelect={(d) => { setMatchDate(d); setMatchTime(""); setLiveSlot(null); setDatePickerOpen(false); }}
            disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))} initialFocus className="p-3" />
        </PopoverContent>
      </Popover>
    </div>
  );
  const PlainTimePicker = () => (
    <div className="space-y-3">
      <Label>Start time</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {(Object.keys(DAY_PARTS) as DayPart[]).map((p) => (
          <button key={p} type="button" onClick={() => setDayPart(p)}
            className={cn("h-10 rounded-full text-[11px] font-display font-bold uppercase tracking-wide border", dayPart === p ? "bg-muted text-primary border-primary" : "bg-card text-muted-foreground border-border")}>
            {DAY_PARTS[p].label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {TIME_SLOTS.filter((t) => t >= DAY_PARTS[dayPart].from && t < DAY_PARTS[dayPart].to).map((t) => (
          <button key={t} type="button" onClick={() => { setMatchTime(t); setLiveSlot(null); setErrorMsg(null); }}
            className={cn("h-11 rounded-xl font-mono text-[15px] font-bold border", matchTime === t ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border")}>
            {t}
          </button>
        ))}
      </div>
      <Label>How long</Label>
      <div className="grid grid-cols-3 gap-2">
        {[60, 90, 120].map((d) => (
          <button key={d} type="button" onClick={() => setDurationMins(d)} className={pill(durationMins === d, "h-11")}>
            {d === 60 ? "1 hour" : d === 90 ? "1h 30" : "2 hours"}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!block !max-h-[92dvh] !w-screen !max-w-[100vw] min-w-0 overflow-y-auto overflow-x-hidden p-0 gap-0 bg-background border-border/50 rounded-t-3xl rounded-b-none border-x-0 border-b-0 [&>button.absolute]:hidden"
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, top: "auto", width: "100vw", maxWidth: "100vw", transform: "none", paddingBottom: "env(safe-area-inset-bottom)", boxSizing: "border-box" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{step === 1 ? "Where are you playing?" : step === 2 ? "When?" : step === 3 ? "Who's playing?" : "Match posted"}</DialogTitle>
        <div className="flex justify-center pt-2"><div className="w-10 h-1 rounded-full bg-border" /></div>

        {/* ════════════ STEP 1 · WHERE ════════════ */}
        {step === 1 && (
          <div className="pb-6 w-full max-w-full min-w-0 overflow-x-hidden">
            <Header title="Where are you playing?" sub="A club, or any court you already have." />
            <div className="px-4 space-y-4">
              <div className="flex items-center gap-2.5 h-[52px] px-3.5 rounded-xl bg-muted border border-border">
                <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a club or a place" aria-label="Search a club or a place"
                  className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground" style={{ fontSize: "16px" }} />
                {search && <button type="button" aria-label="Clear" onClick={() => setSearch("")} className="w-8 h-8 flex items-center justify-center text-muted-foreground"><X className="w-4 h-4" /></button>}
              </div>

              {!search && (
                <button type="button" onClick={pickAnyCourt} className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border text-left active:scale-[0.99] transition-transform">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0"><Building2 className="w-5 h-5 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold">Any court</div>
                    <div className="text-[13px] text-muted-foreground">Just type where. Nothing else needed.</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              )}

              {!search && recentClubs.length > 0 && (
                <div className="space-y-2"><Label>Recent</Label>{recentClubs.map((c) => <ClubRow key={c.id} club={c} />)}</div>
              )}

              <div className="space-y-2">
                <Label>{search ? "Clubs" : "All clubs"}</Label>
                {clubsLoading ? (
                  <div className="text-sm text-muted-foreground py-2">Loading clubs…</div>
                ) : filteredClubs.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
                    <p className="text-sm">No club called "{search}".</p>
                    <button type="button" onClick={() => { setCustomVenueName(search); pickAnyCourt(); }} className="text-sm font-bold text-primary">Use "{search}" as the place →</button>
                  </div>
                ) : (
                  filteredClubs.slice(0, search ? 30 : 12).map((c) => <ClubRow key={c.id} club={c} />)
                )}
                {!search && filteredClubs.length > 12 && <p className="text-xs text-muted-foreground px-1">Type to find the other {filteredClubs.length - 12} clubs.</p>}
              </div>

              <button type="button" onClick={handlePasteAutofill} disabled={pasteLoading}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-card border border-dashed border-muted-foreground/50 text-left">
                <ClipboardPaste className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-bold">{pasteLoading ? "Reading…" : "Already booked on Playtomic?"}</div>
                  <div className="text-xs text-muted-foreground">Copy the booking there, paste it here. Fills the 3 steps.</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ════════════ STEP 2 · WHEN ════════════ */}
        {step === 2 && (
          <div className="pb-6 w-full max-w-full min-w-0 overflow-x-hidden">
            <Header title="When?" sub={venueKind === "custom" ? (customVenueName.trim() ? `${customVenueName.trim()} · you sort the booking` : "Any court · you sort the booking") : `${venueName} · ${tierLabel}`} back={() => setStep(1)} />
            <div className="px-4 space-y-4">
              {venueKind === "custom" && (
                <div className="space-y-2">
                  <Label>Where exactly</Label>
                  <input value={customVenueName} onChange={(e) => setCustomVenueName(e.target.value)} placeholder="e.g. Rocket Padel Battersea, Court 2" aria-label="Where exactly"
                    className="w-full h-[52px] px-3.5 rounded-xl bg-muted border border-border outline-none focus:border-primary text-foreground placeholder:text-muted-foreground" style={{ fontSize: "16px" }} />
                </div>
              )}

              <DayChips />

              {/* native club: court, then real slots */}
              {isNativeClub && (
                <div className="space-y-3">
                  <Label>Court</Label>
                  {courtsLoading ? <div className="text-sm text-muted-foreground">Loading courts…</div> : courts.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {courts.map((c) => (
                        <button key={c.id} type="button" onClick={() => { setSelectedCourtObj(c); setMatchTime(""); setErrorMsg(null); }}
                          className={pill(selectedCourtObj?.id === c.id, "flex-shrink-0 h-11 px-4")}>
                          {c.nickname || c.name}{(c.court_type || c.surface) ? ` · ${[c.court_type, c.surface].filter(Boolean).join(" ")}` : ""}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input value={courtName} onChange={(e) => setCourtName(e.target.value)} placeholder="Court name (optional)" aria-label="Court name"
                      className="w-full h-12 px-3.5 rounded-xl bg-muted border border-border outline-none text-foreground placeholder:text-muted-foreground" style={{ fontSize: "16px" }} />
                  )}
                  {useSmartSlots && (
                    <>
                      <div className="flex items-center justify-between"><Label>{selectedCourtObj ? `${selectedCourtObj.nickname || selectedCourtObj.name}${matchDate ? ` · ${format(matchDate, "EEE d")}` : ""}` : "Free slots"}</Label><span className="text-xs text-muted-foreground">live from the club</span></div>
                      {!selectedCourtObj || !matchDate ? (
                        <p className="text-sm text-muted-foreground">{!matchDate ? "Pick a day" : "Pick a court"} to see the free slots.</p>
                      ) : slotsLoading ? (
                        <p className="text-sm text-muted-foreground">Loading slots…</p>
                      ) : availableSlots.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No free slots on this court that day. Try another day or court.</p>
                      ) : (
                        <div className="space-y-2">
                          {availableSlots.map((slot) => {
                            const time = format(new Date(slot.starts_at), "HH:mm");
                            const mins = Math.round((new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60000);
                            const on = matchTime === time;
                            return (
                              <div key={slot.id} className={cn("flex items-center gap-2.5 p-2.5 pl-3 rounded-xl bg-card border", on ? "border-primary" : "border-border")}>
                                <div className={cn("w-[52px] font-mono text-base font-bold", on && "text-primary")}>{time}</div>
                                <button type="button" onClick={() => { setMatchTime(time); setErrorMsg(null); }} className={pill(on, "h-10 text-[13px]")}>
                                  {fmtDur(mins)}{slot.price ? ` · £${Number(slot.price).toFixed(0)}` : " · Free"}{on ? " ✓" : ""}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {selectedSlot && (
                        <div className="flex gap-2.5 p-3 rounded-xl bg-muted border border-secondary text-[13px] leading-snug">
                          <Check className="w-5 h-5 text-secondary flex-shrink-0" />
                          <div><span className="font-bold text-secondary">Reserved for you when you post.</span> {selectedCourtObj.nickname || selectedCourtObj.name}, {format(matchDate!, "EEE")} {matchTime}{selectedSlot.price ? ` · £${Number(selectedSlot.price).toFixed(0)} for the court, £${(Number(selectedSlot.price) / 4).toFixed(2)} each with 4` : ""}.</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* directory club with a live feed: the club's free courts ARE the time picker */}
              {hasLiveFeed && selectedClub && !manualTime && (
                <div className="space-y-2">
                  <ExternalAvailability
                    clubId={selectedClub.id} provider={selectedClub.external_provider}
                    date={matchDate ? format(matchDate, "yyyy-MM-dd") : null}
                    onSelectSlot={handleLiveSlot} onSlotCount={setLiveSlotCount}
                    selected={matchDate && matchTime ? { date: format(matchDate, "yyyy-MM-dd"), time: matchTime, duration: durationMins } : null}
                  />
                  <button type="button" onClick={() => { setManualTime(true); setLiveSlot(null); }} className="text-sm font-bold text-primary px-1 py-2">
                    {liveSlotCount === 0 ? "Pick a time manually" : "Any other time"}
                  </button>
                </div>
              )}
              {hasLiveFeed && manualTime && (
                <div className="space-y-2">
                  <PlainTimePicker />
                  <button type="button" onClick={() => setManualTime(false)} className="text-sm font-bold text-primary px-1 py-2">Back to the club's free courts</button>
                </div>
              )}

              {/* any court / members-only / native club without DB courts */}
              {(venueKind === "custom" || membersOnly || (isNativeClub && !useSmartSlots && !courtsLoading)) && <PlainTimePicker />}
              {membersOnly && <p className="text-xs text-muted-foreground">Members only: book the court in the David Lloyd app, then say it's booked on the next step.</p>}

              {errorMsg && <p className="text-sm font-semibold text-destructive">{errorMsg}</p>}
              <button type="button" onClick={goWho} disabled={!whenReady}
                className={cn("w-full h-14 rounded-full font-display font-black italic uppercase text-base tracking-wide", whenReady ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {whenReady ? `Next · ${format(matchDate!, "EEE")} ${matchTime}, ${fmtDur(selectedSlot ? Math.round((new Date(selectedSlot.ends_at).getTime() - new Date(selectedSlot.starts_at).getTime()) / 60000) : durationMins)}` : "Pick a day and time"}
              </button>
            </div>
          </div>
        )}

        {/* ════════════ STEP 3 · WHO & POST ════════════ */}
        {step === 3 && (
          <div className="pb-6 w-full max-w-full min-w-0 overflow-x-hidden">
            <Header title="Who's playing?" back={() => setStep(2)} />
            <div className="px-4 space-y-4">
              <div className="p-3.5 rounded-2xl bg-card border border-border space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold truncate">{venueName}</div>
                    <div className="text-[13px] text-muted-foreground truncate">{tierLabel}</div>
                  </div>
                  <button type="button" onClick={() => setStep(1)} className="text-[13px] font-bold text-primary px-1 py-2">Edit</button>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-bold font-mono">{matchDate ? format(matchDate, "EEE d MMM") : ""} · {matchTime}</div>
                    <div className="text-[13px] text-muted-foreground">
                      {fmtDur(selectedSlot ? Math.round((new Date(selectedSlot.ends_at).getTime() - new Date(selectedSlot.starts_at).getTime()) / 60000) : durationMins)}
                      {courtPrice != null && courtPrice > 0 ? ` · court £${courtPrice.toFixed(0)} · £${(courtPrice / 4).toFixed(2)} each` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => setStep(2)} className="text-[13px] font-bold text-primary px-1 py-2">Edit</button>
                </div>
                {(!isNativeClub || courts.length === 0) && (
                  <>
                    <div className="h-px bg-border" />
                    <input value={courtName} onChange={(e) => setCourtName(e.target.value)} placeholder="Court number (optional)" aria-label="Court number"
                      className="w-full h-11 px-3 rounded-xl bg-muted border border-border outline-none text-foreground placeholder:text-muted-foreground" style={{ fontSize: "16px" }} />
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label>Type of match</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setMatchFormat("competitive")} className={pill(matchFormat === "competitive")}>Competitive · counts</button>
                  <button type="button" onClick={() => setMatchFormat("social")} className={pill(matchFormat === "social")}>Social · just play</button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Level range</Label>
                <div className="p-3 rounded-xl bg-card border border-border flex items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-lg font-bold">{levelMin.toFixed(1)} – {suggestedMax.toFixed(1)}</div>
                    <div className="text-[13px] text-muted-foreground">around your {playerLevel.toFixed(1)}. Outside this range players ask to join.</div>
                  </div>
                  <button type="button" onClick={() => setShowLevelEditor((v) => !v)} className="h-10 px-3.5 rounded-full bg-muted border border-border text-[13px] font-bold flex-shrink-0">{showLevelEditor ? "Done" : "Change"}</button>
                </div>
                {showLevelEditor && (
                  <div className="p-3 rounded-xl bg-card border border-border space-y-2">
                    <div className="flex justify-between text-xs font-semibold"><span>Min {levelMin.toFixed(1)}</span><span>Max {suggestedMax.toFixed(1)}</span></div>
                    <Slider value={[levelMin]} onValueChange={([v]) => setLevelMin(v)} min={0.5} max={suggestedMax - 0.5} step={0.5} />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Who can join</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setVisibility("public"); setCourtFeeInput(""); }} className={pill(visibility === "public")}>Anyone at my level</button>
                  <button type="button" onClick={() => setVisibility("private")} className={pill(visibility === "private")}>Only people I invite</button>
                </div>
              </div>

              {visibility === "private" && (
                <div className={cn("rounded-xl border p-3.5 space-y-2.5", requiresPayment ? "bg-muted border-secondary" : "bg-card border-border")}>
                  <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-secondary" /><span className="text-sm font-bold">{requiresPayment ? "You pay the court now" : "Private match"}</span></div>
                  {slotHasPrice && selectedSlot?.price ? (
                    <p className="text-[13px] text-muted-foreground">Court £{Number(selectedSlot.price).toFixed(0)} · £{(Number(selectedSlot.price) / 4).toFixed(2)} per spot. You pay upfront and get refunded as each player joins.</p>
                  ) : (
                    <>
                      <label className="text-[13px] text-muted-foreground block" htmlFor="courtfee">Court fee total in £ (optional)</label>
                      <input id="courtfee" type="number" inputMode="decimal" min="0" step="1" value={courtFeeInput} onChange={(e) => setCourtFeeInput(e.target.value)} placeholder="e.g. 80"
                        className="w-full h-11 px-3 rounded-xl bg-muted border border-border outline-none text-foreground" style={{ fontSize: "16px" }} />
                      <p className="text-xs text-muted-foreground">{manualFeeAmount > 0 ? `You pay £${manualFeeAmount.toFixed(0)} now and get £${(manualFeeAmount / 4).toFixed(2)} back per player who joins.` : "Leave blank for a free private match."}</p>
                    </>
                  )}
                </div>
              )}

              {isExternalCourt && (
                <div className="space-y-2">
                  <Label>Is the court booked?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setCourtBooked(true); setErrorMsg(null); }} className={pill(courtBooked === true)}>Yes, booked</button>
                    <button type="button" onClick={() => { setCourtBooked(false); setErrorMsg(null); }}
                      className={cn("h-12 rounded-full text-sm font-bold border px-3", courtBooked === false ? "bg-muted text-secondary border-secondary" : "bg-card border-border text-foreground")}>Not yet</button>
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {courtBooked === false
                      ? (liveSlot?.booking_url ? "You'll get the booking link right after posting. Players see \"court not booked yet\" until you confirm." : "Players see \"court not booked yet\" until you confirm on the match page.")
                      : "Players see whether the court is secured."}
                  </p>
                </div>
              )}

              {errorMsg && <p className="text-sm font-semibold text-destructive">{errorMsg}</p>}
              <button type="button" onClick={handleCreate} disabled={loading}
                className="w-full h-14 rounded-full bg-primary text-primary-foreground font-display font-black italic uppercase text-base tracking-wide disabled:opacity-60">
                {loading ? (requiresPayment ? "Processing payment…" : "Posting…") : `${requiresPayment ? "Pay & post" : "Post match"} · ${matchDate ? format(matchDate, "EEE") : ""} ${matchTime}`}
              </button>
              <p className="text-xs text-muted-foreground text-center">You'll be in Team A · {visibility === "public" ? "Anyone at your level can join" : "Invite only"}</p>
            </div>
          </div>
        )}

        {/* ════════════ DONE ════════════ */}
        {step === 4 && (
          <div className="pb-6 w-full max-w-full min-w-0 overflow-x-hidden">
            <div className="flex items-center justify-end px-4 pt-3 pb-2">
              <button type="button" onClick={finish} aria-label="Close" className="w-11 h-11 rounded-full bg-card border border-border flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-4 space-y-4">
              <div className="space-y-2.5">
                <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center"><Check className="w-7 h-7 text-primary-foreground" strokeWidth={3} /></div>
                <h2 className="font-display text-[28px] font-black italic uppercase leading-[0.95]">Match posted</h2>
                <p className="text-sm text-muted-foreground">{matchDate ? format(matchDate, "EEE d MMM") : ""} · {matchTime} · {fmtDur(durationMins)} · {venueName}{courtName ? `, ${courtName}` : ""}. You're in Team A. 3 spots open.</p>
              </div>

              {isExternalCourt && !courtBooked && (
                <div className="p-3.5 rounded-2xl bg-card border border-secondary space-y-3">
                  <div className="flex gap-2.5 text-sm leading-snug"><Clock className="w-5 h-5 text-secondary flex-shrink-0" /><div><span className="font-bold text-secondary">Court not booked yet.</span> {bookingUrl ? "Book it now so the slot doesn't go." : "Book it on the club's system, then confirm here."}</div></div>
                  {bookingUrl && (
                    <a href={bookingUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 h-[52px] rounded-full bg-secondary text-primary-foreground font-display font-black italic uppercase text-[15px] tracking-wide">
                      Book on {selectedClub?.external_provider === "padelmates" ? "Padelmates" : "Playtomic"} <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button type="button" onClick={markBooked} className="w-full h-11 rounded-full bg-muted border border-border text-sm font-bold">I've booked it</button>
                </div>
              )}

              <div className="space-y-2">
                <Label>Fill the court</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={finish} className="h-12 rounded-full bg-card border border-border text-sm font-bold flex items-center justify-center gap-2"><UserPlus className="w-4 h-4" /> Invite players</button>
                  <button type="button" onClick={async () => {
                    const url = `https://www.joinxplay.com/matches/${createdId}`;
                    try { if (navigator.share) await navigator.share({ title: "Join my padel match", text: `${venueName} · ${matchDate ? format(matchDate, "EEE d MMM") : ""} ${matchTime}`, url }); else { await navigator.clipboard.writeText(url); toast({ title: "Link copied" }); } } catch { /* cancelled */ }
                  }} className="h-12 rounded-full bg-card border border-border text-sm font-bold flex items-center justify-center gap-2"><Share2 className="w-4 h-4" /> Share link</button>
                </div>
              </div>

              <button type="button" onClick={finish} className="w-full h-[52px] rounded-full bg-primary text-primary-foreground font-display font-black italic uppercase text-[15px] tracking-wide">See the match</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CreateMatchModal;
