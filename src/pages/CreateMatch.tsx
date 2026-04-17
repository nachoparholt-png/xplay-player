import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Clock, MapPin, Building2, ChevronRight, ClipboardPaste, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ClubPicker from "@/components/ClubPicker";
import PlacesVenueInput from "@/components/PlacesVenueInput";
import { type PlaceResult } from "@/hooks/useGooglePlaces";
import { useMatchChat } from "@/hooks/useMatchChat";
import { useClubCourtsForPlayer, usePlayerCourtAvailability } from "@/hooks/usePlayerCourtAvailability";

const DEFAULT_OPEN = "06:00";
const DEFAULT_CLOSE = "23:00";

const generateTimeSlots = (openTime = DEFAULT_OPEN, closeTime = DEFAULT_CLOSE): string[] => {
  const [openH, openM] = openTime.split(":").map(Number);
  const [closeH, closeM] = closeTime.split(":").map(Number);
  const endMinutes = closeH * 60 + (closeM || 0);
  const slots: string[] = [];
  // Round opening up to nearest 30-min boundary
  let totalMins = openH * 60 + (openM > 0 && openM <= 30 ? 30 : openM > 30 ? 60 : 0);
  while (totalMins <= endMinutes) {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    slots.push(`${h.toString().padStart(2, "0")}:${m === 0 ? "00" : "30"}`);
    totalMins += 30;
  }
  return slots;
};

type ClubSelection = {
  id: string;
  club_name: string;
  location: string;
  city: string | null;
  opening_time?: string;
  closing_time?: string;
  timezone?: string;
};

import { parsePlaytomicClipboard, findBestClubMatch } from "@/lib/parsePlaytomic";

const CreateMatch = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { getOrCreateMatchChat } = useMatchChat();
  const [loading, setLoading] = useState(false);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState<ClubSelection | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [errors, setErrors] = useState<{ club?: boolean; date?: boolean; time?: boolean }>({});

  // Venue mode: 'xplay' = registered XPLAY club, 'other' = free-text via Google Places
  const [venueMode, setVenueMode] = useState<"xplay" | "other">("xplay");
  const [customVenue, setCustomVenue] = useState<PlaceResult | null>(null);
  const [customCourt, setCustomCourt] = useState("");

  const [court, setCourt] = useState("");
  const [matchDate, setMatchDate] = useState<Date | undefined>();
  const [matchTime, setMatchTime] = useState("");
  const [matchFormat, setMatchFormat] = useState<"competitive" | "social">("competitive");

  // XPLAY court slot picker state
  const [selectedCourtId, setSelectedCourtId] = useState("");
  const [selectedSlotDate, setSelectedSlotDate] = useState(""); // YYYY-MM-DD
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);

  // Duration is always locked to the court's configured slot_duration_minutes — never free choice
  const selectedCourtObj = clubCourts.find(c => c.id === selectedCourtId);
  const slotDuration = selectedCourtObj?.slot_duration_minutes ?? 90;

  const { data: clubCourts = [], isLoading: courtsLoading } = useClubCourtsForPlayer(
    venueMode === "xplay" ? (selectedClub?.id ?? null) : null
  );
  const { data: availableWindows = [], isLoading: windowsLoading, isFetching: windowsFetching } = usePlayerCourtAvailability(
    venueMode === "xplay" ? (selectedClub?.id ?? null) : null,
    selectedCourtId || null,
    selectedSlotDate || null,
    slotDuration
  );
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [notes, setNotes] = useState("");

  const playerLevel = profile?.padel_level ?? 3.0;
  const suggestedMax = Math.min(7.0, playerLevel + 1.0);
  const [levelMin, setLevelMin] = useState(Math.max(0.5, playerLevel - 1.0));

  useEffect(() => {
    const lvl = profile?.padel_level ?? 3.0;
    setLevelMin(Math.max(0.5, lvl - 1.0));
  }, [profile?.padel_level]);

  const timeSlots = generateTimeSlots(
    selectedClub?.opening_time ?? DEFAULT_OPEN,
    selectedClub?.closing_time ?? DEFAULT_CLOSE
  );

  const handlePasteAutofill = async () => {
    try {
      setPasteLoading(true);
      const clipText = await navigator.clipboard.readText();
      if (!clipText || clipText.trim().length < 10) {
        toast({ title: "Nothing to paste", description: "No match info found in your clipboard.", variant: "destructive" });
        return;
      }

      const parsed = parsePlaytomicClipboard(clipText);

      // Try to match club by name
      if (parsed.clubName) {
        const { data: clubs } = await supabase
          .from("clubs")
          .select("id, club_name, location, city, opening_time, closing_time, timezone")
          .eq("club_status", "active")
          .returns<ClubSelection[]>();

        if (clubs) {
          const match = findBestClubMatch(clubs, parsed.clubName);
          if (match) setSelectedClub(match as ClubSelection);
        }
      }

      if (parsed.date) setMatchDate(parsed.date);
      if (parsed.time && timeSlots.includes(parsed.time)) setMatchTime(parsed.time);

      // Set level range from player levels
      if (parsed.players.length > 0) {
        const levels = parsed.players.map((p) => p.level);
        const minLvl = Math.max(0.5, Math.min(...levels) - 0.5);
        setLevelMin(Math.max(0.5, Math.floor(minLvl * 2) / 2));
      }

      // Add player info as notes
      if (parsed.players.length > 0) {
        setNotes(parsed.players.map((p) => `${p.name} (${p.level})`).join(", "));
      }

      toast({
        title: "Autofilled from clipboard!",
        description: `${parsed.clubName || "Match"} — ${parsed.players.length} player(s) detected.`,
      });
    } catch (err) {
      toast({
        title: "Clipboard access denied",
        description: "Please allow clipboard access or paste the text manually.",
        variant: "destructive",
      });
    } finally {
      setPasteLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    const newErrors: { club?: boolean; date?: boolean; time?: boolean } = {};
    if (venueMode === "xplay" && !selectedClub) newErrors.club = true;
    if (venueMode === "other" && !customVenue?.name) newErrors.club = true;
    if (!matchDate && !selectedSlotDate) newErrors.date = true;
    if (!matchTime) newErrors.time = true;
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    const clubName  = venueMode === "xplay" ? selectedClub!.club_name : customVenue!.name;
    const courtValue = venueMode === "xplay" ? (court || null) : (customCourt || null);
    const matchDateStr = selectedSlotDate || format(matchDate!, "yyyy-MM-dd");

    setLoading(true);
    const { data, error } = await supabase.from("matches").insert({
      organizer_id: user.id,
      club: clubName,
      court: courtValue,
      match_date: matchDateStr,
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
    } else {
      await supabase.from("match_players").insert({ match_id: data.id, user_id: user.id, team: "team_a" });

      // Block the court slot to prevent double-booking
      if (selectedCourtId && selectedSlot && selectedSlotDate) {
        await supabase.from("court_slots").insert({
          court_id:   selectedCourtId,
          slot_date:  selectedSlotDate,
          start_time: selectedSlot.start + ":00",
          end_time:   selectedSlot.end   + ":00",
          status:     "booked",
          match_id:   data.id,
          booked_by:  user.id,
        });
      }

      // Create betting market for competitive matches (non-blocking — failure must not block navigation)
      if (matchFormat !== "social") {
        supabase.functions
          .invoke("create-match-market", { body: { match_id: data.id } })
          .catch((err) => console.error("create-match-market failed silently:", err));
      }
      const chatTitle = `${clubName}${courtValue ? ` — ${courtValue}` : ""}`;
      await getOrCreateMatchChat(data.id, chatTitle);
      toast({
        title: "Match successfully created.",
        description: "You have been added to Team A.",
      });
      navigate("/matches");
    }
    setLoading(false);
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/matches")} className="p-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h1 className="text-2xl font-display font-bold flex-1">Create Match</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePasteAutofill}
          disabled={pasteLoading}
          className="rounded-xl gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          {pasteLoading ? "Reading..." : "Paste"}
        </Button>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {/* Venue Mode Toggle */}
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">
            Venue
          </label>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {(["xplay", "other"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setVenueMode(mode);
                  setSelectedClub(null);
                  setCourt("");
                  setCustomVenue(null);
                  setCustomCourt("");
                  setSelectedCourtId("");
                  setSelectedSlotDate("");
                  setSelectedSlot(null);
                  setMatchDate(undefined);
                  setMatchTime("");
                  setErrors(prev => ({ ...prev, club: undefined }));
                  // Auto-open club picker immediately on XPLAY Club tap
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
              <button
                type="button"
                onClick={() => setClubPickerOpen(true)}
                className={cn(
                  "w-full h-12 rounded-xl bg-muted border px-4 flex items-center justify-between text-left transition-colors",
                  errors.club
                    ? "border-destructive ring-1 ring-destructive/30 hover:border-destructive"
                    : "border-border/50 hover:border-primary/40"
                )}
              >
                {selectedClub ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium block truncate">{selectedClub.club_name}</span>
                      <span className="text-[10px] text-muted-foreground">{selectedClub.location || selectedClub.city || ""}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Select a club...</span>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
              {errors.club && <p className="text-[11px] text-destructive mt-1 px-1">Please select a club</p>}
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
              {errors.club && <p className="text-[11px] text-destructive mt-1 px-1">Please enter a venue</p>}
            </>
          )}
        </div>

        <ClubPicker
          open={clubPickerOpen}
          onOpenChange={setClubPickerOpen}
          onSelect={(club) => {
            setSelectedClub(club);
            setCourt("");
            setMatchTime("");
            setSelectedCourtId("");
            setSelectedSlotDate("");
            setSelectedSlot(null);
            setErrors(prev => ({ ...prev, club: undefined, time: undefined }));
          }}
        />

        {/* ── XPLAY mode: real court + availability picker ── */}
        {venueMode === "xplay" && selectedClub ? (
          <div className="space-y-4 rounded-2xl border border-border/40 bg-muted/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Court &amp; Time</p>

            {/* Court selector */}
            {courtsLoading ? (
              <div className="h-12 rounded-xl bg-muted flex items-center px-4 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading courts…</span>
              </div>
            ) : clubCourts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courts configured for this club yet.</p>
            ) : (
              <Select
                value={selectedCourtId}
                onValueChange={v => {
                  setSelectedCourtId(v);
                  setSelectedSlot(null); // reset — new court may have different slot_duration_minutes
                  const c = clubCourts.find(x => x.id === v);
                  setCourt(c?.nickname ?? c?.name ?? "");
                }}
              >
                <SelectTrigger className="h-12 rounded-xl bg-muted border-border/50">
                  <SelectValue placeholder="Select a court…" />
                </SelectTrigger>
                <SelectContent>
                  {clubCourts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span>{c.nickname ?? c.name}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {c.indoor ? "Indoor" : "Outdoor"}{c.surface ? ` · ${c.surface}` : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Date picker */}
            <div>
              <label className={cn("text-xs uppercase tracking-wider font-medium mb-1.5 flex items-center gap-1.5", errors.date ? "text-destructive" : "text-muted-foreground")}>
                <Calendar className="w-3.5 h-3.5" /> Date *
              </label>
              <Input
                type="date"
                value={selectedSlotDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => {
                  setSelectedSlotDate(e.target.value);
                  setSelectedSlot(null);
                  if (e.target.value) {
                    setMatchDate(new Date(e.target.value + 'T12:00:00'));
                    setErrors(prev => ({ ...prev, date: undefined }));
                  }
                }}
                className={cn("h-12 rounded-xl bg-muted", errors.date ? "border-destructive" : "border-border/50")}
                style={{ fontSize: "16px" }}
              />
              {errors.date && <p className="text-[11px] text-destructive mt-1">Please pick a date</p>}
            </div>

            {/* Slot duration — locked to court's configured value, not player's choice */}
            {selectedCourtId && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted border border-border/40">
                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Slot duration: <strong className="text-foreground">
                    {slotDuration < 60
                      ? `${slotDuration} min`
                      : `${Math.floor(slotDuration / 60)}h${slotDuration % 60 ? ` ${slotDuration % 60}min` : ''}`}
                  </strong>
                  <span className="ml-1 opacity-60">· set by the club</span>
                </span>
              </div>
            )}

            {/* Available time slots */}
            {selectedCourtId && selectedSlotDate && (
              <div>
                <label className="text-xs uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" /> Available Slots
                  {(windowsLoading || windowsFetching) && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                </label>

                {!windowsLoading && availableWindows.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-xs text-destructive">No available slots on this date. All times are booked or blocked.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableWindows.map(w => {
                      const isSelected = selectedSlot?.start === w.start;
                      return (
                        <button
                          key={w.start}
                          type="button"
                          onClick={() => {
                            setSelectedSlot(w);
                            setMatchTime(w.start);
                            setErrors(prev => ({ ...prev, time: undefined }));
                          }}
                          className={cn(
                            "px-3 py-2 rounded-xl text-xs font-semibold border transition-all",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          )}
                        >
                          {w.start}
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.time && <p className="text-[11px] text-destructive mt-2">Please pick a time slot</p>}

                {/* Selected slot confirmation */}
                {selectedSlot && (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 mt-2">
                    <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                    <p className="text-xs text-primary font-medium">
                      {court} · {selectedSlot.start} – {selectedSlot.end}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : venueMode === "other" ? (
          <>
            {/* Other venue: free-text court */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Court (optional)</label>
              <Input
                value={customCourt}
                onChange={(e) => setCustomCourt(e.target.value)}
                placeholder="e.g. Court 3, Indoor, Padel 2..."
                className="h-12 rounded-xl bg-muted border-border/50"
                style={{ fontSize: "16px" }}
              />
            </div>

            {/* Date & Time pickers for other venue */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={cn("text-xs uppercase tracking-wider font-medium mb-1.5 flex items-center gap-1.5", errors.date ? "text-destructive" : "text-muted-foreground")}>
                  <Calendar className="w-3.5 h-3.5" /> Date *
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-12 rounded-xl justify-start text-left font-normal bg-muted",
                        !matchDate && "text-muted-foreground",
                        errors.date ? "border-destructive ring-1 ring-destructive/30" : "border-border/50"
                      )}
                    >
                      {matchDate ? format(matchDate, "MMM d, yyyy") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={matchDate}
                      onSelect={(d) => { setMatchDate(d); setErrors(prev => ({ ...prev, date: undefined })); }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                {errors.date && <p className="text-[11px] text-destructive mt-1">Please pick a date</p>}
              </div>
              <div>
                <label className={cn("text-xs uppercase tracking-wider font-medium mb-1.5 flex items-center gap-1.5", errors.time ? "text-destructive" : "text-muted-foreground")}>
                  <Clock className="w-3.5 h-3.5" /> Time *
                </label>
                <Select value={matchTime} onValueChange={(t) => { setMatchTime(t); setErrors(prev => ({ ...prev, time: undefined })); }}>
                  <SelectTrigger className={cn("h-12 rounded-xl bg-muted", errors.time ? "border-destructive ring-1 ring-destructive/30" : "border-border/50")}>
                    <SelectValue placeholder="Pick time" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {timeSlots.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.time && <p className="text-[11px] text-destructive mt-1">Please pick a time</p>}
              </div>
            </div>
          </>
        ) : null}

        {/* Match Format */}
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Match Type *</label>
          <div className="grid grid-cols-2 gap-2">
            {(["competitive", "social"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setMatchFormat(f)}
                className={cn(
                  "rounded-xl text-sm font-medium transition-colors border py-2.5 px-3",
                  matchFormat === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted border-border/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{f === "social" ? "Friendly" : "Competitive"}</span>
                <br />
                <span className="text-[10px] font-normal opacity-70">
                  {f === "competitive" ? "Affects rating & stakes" : "No rating changes"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Level Range */}
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1 block">
            Allowed Level Range
          </label>
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-semibold text-foreground">
              {levelMin.toFixed(1)} – {suggestedMax.toFixed(1)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Based on your level ({playerLevel.toFixed(1)})
            </span>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground mb-1 block">Adjust minimum level</span>
            <Slider
              value={[levelMin]}
              onValueChange={([v]) => setLevelMin(v)}
              min={0.5}
              max={suggestedMax - 0.5}
              step={0.5}
              className="py-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>0.5</span>
              <span>{(suggestedMax - 0.5).toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Visibility */}
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Visibility</label>
          <div className="grid grid-cols-2 gap-2">
            {(["public", "private"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={cn(
                  "h-11 rounded-xl text-sm font-medium capitalize transition-colors border",
                  visibility === v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted border-border/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-12 rounded-xl font-semibold"
        >
          {loading ? "Creating..." : "Create Match"}
        </Button>
      </motion.div>
    </div>
  );
};

export default CreateMatch;
