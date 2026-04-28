import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format, addDays, startOfDay, isSameDay } from "date-fns";
import { ClipboardPaste, ChevronRight, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { Stripe, PaymentSheetEventsEnum } from "@capacitor-community/stripe";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import ClubPicker from "@/components/ClubPicker";
import PlacesVenueInput from "@/components/PlacesVenueInput";
import { type PlaceResult } from "@/hooks/useGooglePlaces";
import { useMatchChat } from "@/hooks/useMatchChat";
import { parsePlaytomicClipboard, findBestClubMatch } from "@/lib/parsePlaytomic";

type ClubSelection = {
  id: string;
  club_name: string;
  location: string;
  city: string | null;
};

interface CreateMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (matchId: string) => void;
}

// Fallback time slots used only for "other" venue mode
const TIME_SLOTS = Array.from({ length: 36 }, (_, i) => {
  const hour = Math.floor(i / 2) + 6;
  const min = i % 2 === 0 ? "00" : "30";
  return `${hour.toString().padStart(2, "0")}:${min}`;
});

const CreateMatchModal = ({ open, onOpenChange, onCreated }: CreateMatchModalProps) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { getOrCreateMatchChat } = useMatchChat();
  const [loading, setLoading] = useState(false);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [errors, setErrors] = useState<{ club?: boolean; date?: boolean; time?: boolean; court?: boolean }>({});
  const [selectedClub, setSelectedClub] = useState<ClubSelection | null>(null);
  const [notes, setNotes] = useState("");

  // Venue mode
  const [venueMode, setVenueMode] = useState<"xplay" | "other">("xplay");
  const [customVenue, setCustomVenue] = useState<PlaceResult | null>(null);
  const [customCourt, setCustomCourt] = useState("");

  // XPLAY club courts (real DB courts)
  const [courts, setCourts] = useState<any[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const [selectedCourtObj, setSelectedCourtObj] = useState<any | null>(null);

  // XPLAY available slots for selected court + date
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Shared form state
  const [matchDate, setMatchDate] = useState<Date | undefined>();
  const [matchTime, setMatchTime] = useState("");
  const [matchFormat, setMatchFormat] = useState<"competitive" | "social">("competitive");
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  // Free-text court fallback (used when XPLAY club has no courts in DB, or "other" mode)
  const [courtFallback, setCourtFallback] = useState("");

  // Auto-calculated level range
  const playerLevel = profile?.padel_level ?? 3.0;
  const suggestedMax = Math.min(7.0, playerLevel + 1.0);
  const [levelMin, setLevelMin] = useState(Math.max(0.5, playerLevel - 1.0));
  const [showLevelEditor, setShowLevelEditor] = useState(false);

  // ─── Fetch courts when XPLAY club is selected ───────────────────────────────
  useEffect(() => {
    if (venueMode !== "xplay" || !selectedClub) {
      setCourts([]);
      setSelectedCourtObj(null);
      return;
    }
    setCourtsLoading(true);
    supabase
      .from("courts")
      .select("*")
      .eq("club_id", selectedClub.id)
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setCourts(data || []);
        setCourtsLoading(false);
      });
  }, [selectedClub, venueMode]);

  // ─── Fetch available slots when court + date both selected ──────────────────
  useEffect(() => {
    if (venueMode !== "xplay" || !selectedCourtObj || !matchDate) {
      setAvailableSlots([]);
      return;
    }
    setSlotsLoading(true);
    const dayStart = new Date(matchDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(matchDate);
    dayEnd.setHours(23, 59, 59, 999);

    supabase
      .from("court_slots")
      .select("*")
      .eq("court_id", selectedCourtObj.id)
      .eq("status", "available")
      .is("coaching_session_id", null)
      .gte("starts_at", dayStart.toISOString())
      .lte("starts_at", dayEnd.toISOString())
      .order("starts_at")
      .then(({ data }) => {
        setAvailableSlots(data || []);
        setSlotsLoading(false);
        // Clear selected time if it's no longer in available slots
        if (matchTime) {
          const stillAvailable = (data || []).some(
            (s) => format(new Date(s.starts_at), "HH:mm") === matchTime
          );
          if (!stillAvailable) setMatchTime("");
        }
      });
  }, [selectedCourtObj, matchDate, venueMode]);

  // ─── Reset state when modal opens/closes ────────────────────────────────────
  useEffect(() => {
    if (open) {
      const lvl = profile?.padel_level ?? 3.0;
      setLevelMin(Math.max(0.5, lvl - 1.0));
    }
    if (!open) {
      setSelectedClub(null);
      setSelectedCourtObj(null);
      setCourts([]);
      setAvailableSlots([]);
      setCourtFallback("");
      setCustomVenue(null);
      setCustomCourt("");
      setVenueMode("xplay");
      setMatchDate(undefined);
      setMatchTime("");
      setMatchFormat("competitive");
      setVisibility("public");
      setNotes("");
      setErrors({});
      setShowLevelEditor(false);
    }
  }, [open, profile?.padel_level]);

  // ─── Paste autofill from Playtomic ──────────────────────────────────────────
  const handlePasteAutofill = async () => {
    try {
      setPasteLoading(true);
      const clipText = await navigator.clipboard.readText();
      if (!clipText || clipText.trim().length < 10) {
        toast({ title: "Nothing to paste", description: "No match info found in your clipboard.", variant: "destructive" });
        return;
      }

      const parsed = parsePlaytomicClipboard(clipText);

      if (parsed.clubName) {
        const { data: clubs } = await supabase
          .from("clubs")
          .select("id, club_name, location, city")
          .eq("club_status", "active");

        if (clubs) {
          const match = findBestClubMatch(clubs, parsed.clubName);
          if (match) setSelectedClub(match);
        }
      }

      if (parsed.date) setMatchDate(parsed.date);
      if (parsed.time && TIME_SLOTS.includes(parsed.time)) setMatchTime(parsed.time);

      if (parsed.players.length > 0) {
        const levels = parsed.players.map((p) => p.level);
        const minLvl = Math.max(0.5, Math.min(...levels) - 0.5);
        setLevelMin(Math.max(0.5, Math.floor(minLvl * 2) / 2));
        setNotes(parsed.players.map((p) => `${p.name} (${p.level})`).join(", "));
      }

      toast({
        title: "Autofilled from clipboard!",
        description: `${parsed.clubName || "Match"} — ${parsed.players.length} player(s) detected.`,
      });
    } catch {
      toast({
        title: "Clipboard access denied",
        description: "Please allow clipboard access or paste the text manually.",
        variant: "destructive",
      });
    } finally {
      setPasteLoading(false);
    }
  };

  // ─── Create match (with optional Stripe payment for private matches) ─────────
  const handleCreate = async () => {
    if (!user) return;
    const newErrors: typeof errors = {};
    if (venueMode === "xplay" && !selectedClub) newErrors.club = true;
    if (venueMode === "other" && !customVenue?.name) newErrors.club = true;
    if (!matchDate) newErrors.date = true;
    if (!matchTime) newErrors.time = true;
    if (venueMode === "xplay" && courts.length > 0 && !selectedCourtObj) newErrors.court = true;
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    const clubName = venueMode === "xplay" ? selectedClub!.club_name : customVenue!.name;
    let courtValue: string | null = null;
    if (venueMode === "xplay") {
      courtValue = selectedCourtObj
        ? (selectedCourtObj.nickname || selectedCourtObj.name)
        : (courtFallback || null);
    } else {
      courtValue = customCourt || null;
    }

    setLoading(true);

    // ── Private match with a priced court slot → Stripe Payment Sheet ──────
    let paymentIntentData: {
      payment_intent_id: string;
      stripe_customer_id: string;
      total_cents: number;
      organiser_share_cents: number;
      per_spot_full_price_cents: number;
      organiser_discount_pct: number;
      spots_count: number;
      currency: string;
    } | null = null;

    if (requiresPayment && selectedSlot) {
      // Step 1: Create PaymentIntent server-side
      const { data: piData, error: piError } = await supabase.functions.invoke(
        "create-private-match-payment-intent",
        { body: { court_slot_id: selectedSlot.id, max_players: 4 } }
      );

      if (piError || piData?.error) {
        toast({
          title: "Payment setup failed",
          description: piData?.error ?? piError?.message ?? "Could not initialise payment.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Step 2: Create and present Stripe Payment Sheet
      try {
        await Stripe.createPaymentSheet({
          paymentIntentClientSecret: piData.clientSecret,
          merchantDisplayName: "XPLAY",
          style: "alwaysDark",
          withZipCode: false,
        });

        const { paymentResult } = await Stripe.presentPaymentSheet();

        if (paymentResult !== PaymentSheetEventsEnum.Completed) {
          // User cancelled or payment failed
          toast({
            title: paymentResult === PaymentSheetEventsEnum.Canceled ? "Payment cancelled" : "Payment failed",
            description: "Your match was not created. No charge was made.",
            variant: paymentResult === PaymentSheetEventsEnum.Canceled ? "default" : "destructive",
          });
          setLoading(false);
          return;
        }
      } catch (stripeErr: any) {
        toast({
          title: "Payment error",
          description: stripeErr?.message ?? "Payment could not be completed.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      paymentIntentData = {
        payment_intent_id: piData.payment_intent_id,
        stripe_customer_id: piData.stripe_customer_id,
        total_cents: piData.total_cents,
        organiser_share_cents: piData.organiser_share_cents,
        per_spot_full_price_cents: piData.per_spot_full_price_cents,
        organiser_discount_pct: piData.discount_pct,
        spots_count: piData.max_players,
        currency: piData.currency,
      };
    }

    // ── Insert match ──────────────────────────────────────────────────────────
    const { data, error } = await supabase.from("matches").insert({
      organizer_id: user.id,
      club: clubName,
      court: courtValue,
      match_date: format(matchDate!, "yyyy-MM-dd"),
      match_time: matchTime,
      format: matchFormat,
      level_min: levelMin,
      level_max: suggestedMax,
      max_players: 4,
      price_per_player: 0,
      visibility,
      notes: notes || null,
    }).select().single();

    if (error) {
      toast({ title: "Error creating match", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Auto-join organiser
    const { error: joinErr } = await supabase
      .from("match_players")
      .insert({ match_id: data.id, user_id: user.id, team: "A", status: "confirmed" });
    if (joinErr) console.error("Host auto-join failed:", joinErr.message);

    // Create match chat
    const chatTitle = `${clubName}${courtValue ? ` — ${courtValue}` : ""}`;
    await getOrCreateMatchChat(data.id, chatTitle);

    // Betting market (competitive matches only)
    if (matchFormat !== "social") {
      try {
        const { error: marketErr } = await supabase.functions.invoke("create-match-market", {
          body: { match_id: data.id },
        });
        if (marketErr) {
          console.error("create-match-market failed:", marketErr);
          toast({
            title: "Match created, but betting market setup failed",
            description: "You can still play — betting features may be unavailable for this match.",
            variant: "destructive",
          });
        }
      } catch (marketErr) {
        console.error("create-match-market exception:", marketErr);
      }
    }

    // ── Record escrow after successful payment ─────────────────────────────
    if (paymentIntentData) {
      const { error: escrowErr } = await supabase.functions.invoke("record-private-match-escrow", {
        body: {
          match_id: data.id,
          payment_intent_id: paymentIntentData.payment_intent_id,
          per_spot_full_price_cents: paymentIntentData.per_spot_full_price_cents,
          organiser_share_cents: paymentIntentData.organiser_share_cents,
          organiser_discount_pct: paymentIntentData.organiser_discount_pct,
          spots_count: paymentIntentData.spots_count,
          total_charged_cents: paymentIntentData.total_cents,
          stripe_customer_id: paymentIntentData.stripe_customer_id,
          currency: paymentIntentData.currency,
        },
      });
      if (escrowErr) {
        console.error("Failed to record escrow:", escrowErr);
        // Match is created + paid — escrow record failure is non-fatal for user
        // but we log it so it can be reconciled manually
      }
    }

    toast({
      title: requiresPayment ? "Match created — payment confirmed!" : "Match successfully created.",
      description: requiresPayment
        ? `You'll be refunded as players join. You've been added to Team A.`
        : "You have been added to Team A.",
    });
    onCreated?.(data.id);
    onOpenChange(false);
    setLoading(false);
  };

  // Derive the full slot object from the selected time
  const selectedSlot = useMemo(
    () => availableSlots.find((s) => format(new Date(s.starts_at), "HH:mm") === matchTime) ?? null,
    [availableSlots, matchTime]
  );

  // Whether a Stripe payment is required (private + XPLAY court slot with price)
  const requiresPayment =
    visibility === "private" &&
    venueMode === "xplay" &&
    selectedSlot !== null &&
    Number(selectedSlot.price ?? 0) > 0;

  // Whether we're in "smart slot" mode
  const useSmartSlots = venueMode === "xplay" && courts.length > 0;
  const nextSevenDays = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="fixed bottom-0 left-0 right-0 top-auto w-full max-w-none translate-x-0 translate-y-0 max-h-[90dvh] overflow-y-auto p-0 bg-card border-border/50 rounded-t-3xl rounded-b-none border-x-0 border-b-0">
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* Header */}
          <div className="px-5 pt-2 pb-6 space-y-2">
            <div className="text-[10px] font-black tracking-[0.18em] text-primary uppercase">
              NEW MATCH
            </div>
            <div className="font-display text-[36px] font-black italic uppercase leading-[0.92]">
              Who's in?
            </div>
            <div className="text-xs text-muted-foreground">
              We'll post it and invite players in your level range.
            </div>
          </div>

          <div className="space-y-5 px-4 pb-6">
            {/* Paste banner */}
            <button
              onClick={handlePasteAutofill}
              disabled={pasteLoading}
              className="w-full bg-gradient-to-br from-purple-600/20 to-purple-600/5 border border-purple-600/30 rounded-xl p-4 flex items-center gap-3 hover:from-purple-600/30 hover:to-purple-600/10 transition-colors"
            >
              <ClipboardPaste className="w-5 h-5 text-purple-400 flex-shrink-0" />
              <div className="text-left flex-1">
                <div className="text-sm font-semibold text-white">
                  {pasteLoading ? "Reading..." : "Paste from Playtomic"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Autofills club, date, time & levels
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>

            {/* ── Venue block ────────────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Venue
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {(["xplay", "other"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setVenueMode(mode);
                      setSelectedClub(null);
                      setSelectedCourtObj(null);
                      setCourts([]);
                      setAvailableSlots([]);
                      setCourtFallback("");
                      setCustomVenue(null);
                      setCustomCourt("");
                      setMatchTime("");
                      setErrors(prev => ({ ...prev, club: undefined, court: undefined, time: undefined }));
                      if (mode === "xplay") setClubPickerOpen(true);
                    }}
                    className={cn(
                      "h-10 rounded-xl text-sm font-medium transition-colors border",
                      venueMode === mode
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted border-border/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode === "xplay" ? "XPLAY Club" : "Other Venue"}
                  </button>
                ))}
              </div>

              {venueMode === "xplay" ? (
                <>
                  {/* Club selector */}
                  <button
                    type="button"
                    onClick={() => setClubPickerOpen(true)}
                    className={cn(
                      "w-full h-11 rounded-xl bg-muted border px-4 flex items-center justify-between text-left transition-colors",
                      errors.club
                        ? "border-destructive ring-1 ring-destructive/30"
                        : "border-border/30 hover:border-primary/40"
                    )}
                  >
                    {selectedClub ? (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black flex-shrink-0">
                          {selectedClub.club_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium block truncate">{selectedClub.club_name}</span>
                          <span className="text-[10px] text-muted-foreground">{selectedClub.location || selectedClub.city || "—"}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Select a club...</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                  {errors.club && <p className="text-[11px] text-destructive px-1">Please select a club</p>}

                  {/* Court picker — real courts from DB */}
                  {selectedClub && (
                    <div className="space-y-1.5 pt-1">
                      <label className={cn(
                        "text-xs uppercase tracking-wider font-medium",
                        errors.court ? "text-destructive" : "text-muted-foreground"
                      )}>
                        Court {courts.length > 0 ? "*" : "(optional)"}
                      </label>

                      {courtsLoading ? (
                        <div className="flex items-center gap-2 py-2 px-1">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs text-muted-foreground">Loading courts…</span>
                        </div>
                      ) : courts.length > 0 ? (
                        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                          {courts.map((c) => {
                            const isSelected = selectedCourtObj?.id === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCourtObj(isSelected ? null : c);
                                  setMatchTime("");
                                  setErrors(prev => ({ ...prev, court: undefined, time: undefined }));
                                }}
                                className={cn(
                                  "flex-shrink-0 flex flex-col items-start rounded-xl px-3 py-2.5 border transition-colors text-left min-w-[90px]",
                                  isSelected
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/30"
                                )}
                              >
                                <span className="text-xs font-bold leading-tight">
                                  {c.nickname || c.name}
                                </span>
                                {(c.court_type || c.surface) && (
                                  <span className={cn("text-[9px] mt-0.5", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                    {[c.court_type, c.surface].filter(Boolean).join(" · ")}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        /* Fallback free-text when club has no courts configured */
                        <Input
                          value={courtFallback}
                          onChange={(e) => setCourtFallback(e.target.value)}
                          placeholder="e.g. Court 1, Padel 3..."
                          className="h-11 rounded-xl bg-muted border-border/30"
                          style={{ fontSize: "16px" }}
                        />
                      )}
                      {errors.court && <p className="text-[11px] text-destructive px-1">Please select a court</p>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <PlacesVenueInput
                    value={customVenue}
                    onChange={(place) => {
                      setCustomVenue(place);
                      if (place) setErrors(prev => ({ ...prev, club: undefined }));
                    }}
                    hasError={errors.club}
                  />
                  {errors.club && <p className="text-[11px] text-destructive px-1">Please enter a venue</p>}

                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">
                      Court (optional)
                    </label>
                    <Input
                      value={customCourt}
                      onChange={(e) => setCustomCourt(e.target.value)}
                      placeholder="e.g. Court 3, Padel 2..."
                      className="h-11 rounded-xl bg-muted border-border/30"
                      style={{ fontSize: "16px" }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* ── Date picker ────────────────────────────────────────────────── */}
            <div className="space-y-2">
              <label className={cn("text-xs uppercase tracking-wider font-medium", errors.date ? "text-destructive" : "text-muted-foreground")}>
                When *
              </label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {nextSevenDays.map((day, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setMatchDate(day);
                      // Clear time when date changes in smart mode
                      if (useSmartSlots) setMatchTime("");
                      setErrors(prev => ({ ...prev, date: undefined }));
                    }}
                    className={cn(
                      "px-3 py-2 rounded-lg flex-shrink-0 text-xs font-semibold transition-colors border",
                      matchDate && isSameDay(matchDate, day)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted border-border/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="font-black">{format(day, "EEE")}</div>
                    <div className="text-[10px]">{format(day, "d")}</div>
                  </button>
                ))}
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <button className="px-3 py-2 rounded-lg flex-shrink-0 text-xs font-semibold bg-muted border border-border/30 hover:text-foreground transition-colors">
                      📅 More
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={matchDate}
                      onSelect={(date) => {
                        setMatchDate(date);
                        if (useSmartSlots) setMatchTime("");
                        setDatePickerOpen(false);
                        setErrors(prev => ({ ...prev, date: undefined }));
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="p-3"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {errors.date && <p className="text-[11px] text-destructive px-1">Please pick a date</p>}
            </div>

            {/* ── Time picker ─────────────────────────────────────────────────── */}
            <div className="space-y-2">
              <label className={cn("text-xs uppercase tracking-wider font-medium", errors.time ? "text-destructive" : "text-muted-foreground")}>
                {useSmartSlots ? "Available Slots *" : "Time *"}
              </label>

              {useSmartSlots ? (
                /* Smart slot picker — only real available slots */
                !selectedCourtObj || !matchDate ? (
                  <div className="bg-muted/30 border border-border/20 rounded-xl p-4 flex items-center gap-3">
                    <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {!selectedCourtObj ? "Select a court to see available slots." : "Select a date to see available slots."}
                    </p>
                  </div>
                ) : slotsLoading ? (
                  <div className="flex items-center gap-2 py-3 px-1">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-muted-foreground">Loading available slots…</span>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="bg-muted/30 border border-border/20 rounded-xl p-4 text-center space-y-1">
                    <p className="text-xs font-semibold text-foreground">No slots available</p>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedCourtObj.nickname || selectedCourtObj.name} has no open slots on this date. Try another day.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {availableSlots.map((slot) => {
                      const time = format(new Date(slot.starts_at), "HH:mm");
                      const endTime = new Date(slot.ends_at);
                      const startTime = new Date(slot.starts_at);
                      const durationMins = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
                      const price = slot.price
                        ? `£${Number(slot.price).toFixed(0)}`
                        : "Free";
                      const isSelected = matchTime === time;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => {
                            setMatchTime(time);
                            setErrors(prev => ({ ...prev, time: undefined }));
                          }}
                          className={cn(
                            "flex-shrink-0 flex flex-col items-center rounded-xl px-3 py-2.5 border transition-all min-w-[72px]",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                          )}
                        >
                          <span className="text-xs font-bold">{time}</span>
                          <span className={cn("text-[9px]", isSelected ? "text-primary-foreground/70" : "text-emerald-400/70")}>
                            {durationMins} min
                          </span>
                          <span className="text-[9px] font-semibold uppercase tracking-wide mt-0.5">
                            {price}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="w-3 h-3 mt-1 text-primary-foreground" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                /* Generic time grid — for "other" venue or XPLAY clubs without DB courts */
                <div className="bg-muted/40 border border-border/30 rounded-xl p-2 max-h-32 overflow-y-auto">
                  <div className="grid grid-cols-4 gap-2">
                    {TIME_SLOTS.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setMatchTime(t);
                          setErrors(prev => ({ ...prev, time: undefined }));
                        }}
                        className={cn(
                          "py-2 rounded-lg text-xs font-semibold transition-colors",
                          matchTime === t
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted border border-border/30 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {errors.time && <p className="text-[11px] text-destructive px-1">Please pick a time slot</p>}
            </div>

            {/* ── Format + Level + Visibility ─────────────────────────────────── */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Type & Level
              </label>
              <div className="bg-muted/40 rounded-xl p-3 flex gap-2 items-center">
                <button
                  onClick={() => setMatchFormat(matchFormat === "competitive" ? "social" : "competitive")}
                  className={cn(
                    "px-3 py-2 rounded-full text-xs font-semibold transition-colors",
                    matchFormat === "competitive"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted border border-border text-muted-foreground"
                  )}
                >
                  {matchFormat === "competitive" ? "Competitive" : "Social"}
                </button>

                <div className="flex-1 text-xs">
                  <div className="font-semibold text-foreground">
                    {levelMin.toFixed(1)} – {suggestedMax.toFixed(1)}
                  </div>
                  <div className="text-muted-foreground">matches you ({playerLevel.toFixed(1)})</div>
                </div>

                <button
                  onClick={() => setShowLevelEditor(!showLevelEditor)}
                  className="text-primary text-xs font-semibold hover:underline"
                >
                  Edit ›
                </button>
              </div>

              {showLevelEditor && (
                <div className="bg-muted/40 rounded-xl p-3 space-y-2 border border-border/30">
                  <div className="flex justify-between text-xs font-semibold mb-2">
                    <span>Min level: {levelMin.toFixed(1)}</span>
                    <span>Max: {suggestedMax.toFixed(1)}</span>
                  </div>
                  <Slider
                    value={[levelMin]}
                    onValueChange={([v]) => setLevelMin(v)}
                    min={0.5}
                    max={suggestedMax - 0.5}
                    step={0.5}
                  />
                </div>
              )}

              <div className="flex gap-2">
                {(["public", "private"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-semibold transition-colors border capitalize",
                      visibility === v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted border-border/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Private match escrow preview ─────────────────────────────── */}
            {visibility === "private" && venueMode === "xplay" && selectedSlot && (
              <div className={cn(
                "rounded-xl border p-3.5 space-y-2",
                requiresPayment
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-muted/40 border-border/30"
              )}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-xs font-semibold text-amber-300">
                    {requiresPayment ? "Private match — payment required" : "Private match"}
                  </span>
                </div>
                {requiresPayment && selectedSlot.price ? (
                  <>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <div className="flex justify-between">
                        <span>Court cost</span>
                        <span className="text-foreground font-medium">£{Number(selectedSlot.price).toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Full price per spot (÷4)</span>
                        <span className="text-foreground font-medium">£{(Number(selectedSlot.price) / 4).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="border-t border-amber-500/20 pt-2 text-[11px] text-amber-200/80 leading-relaxed">
                      You pay your share upfront and hold the remaining spots at full price.
                      You're refunded for each player who joins.
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No court fee set — match will be created without payment.
                  </p>
                )}
              </div>
            )}

            {/* ── CTA ─────────────────────────────────────────────────────────── */}
            <div className="space-y-2 pt-2">
              <Button
                onClick={handleCreate}
                disabled={loading}
                className="w-full h-[50px] rounded-[14px] font-display font-black italic uppercase text-[15px]"
              >
                {loading
                  ? (requiresPayment ? "Processing payment..." : "Creating...")
                  : requiresPayment
                    ? `Pay & Post · ${matchDate && matchTime ? `${format(matchDate, "EEE")} ${matchTime}` : "select time"}`
                    : `Post match${matchDate && matchTime ? ` · ${format(matchDate, "EEE")} ${matchTime}` : ""}`
                }
              </Button>
              <div className="text-[11px] text-muted-foreground text-center px-2">
                You'll be added to Team A · {visibility === "public" ? "Public" : "Private"} · level {levelMin.toFixed(1)}–{suggestedMax.toFixed(1)}
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="w-full text-muted-foreground text-xs font-semibold hover:text-foreground transition-colors py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ClubPicker
        open={clubPickerOpen}
        onOpenChange={setClubPickerOpen}
        onSelect={(club) => {
          setSelectedClub(club);
          setSelectedCourtObj(null);
          setAvailableSlots([]);
          setMatchTime("");
          setCourtFallback("");
          setErrors(prev => ({ ...prev, club: undefined, court: undefined, time: undefined }));
        }}
      />
    </>
  );
};

export default CreateMatchModal;
