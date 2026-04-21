import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format, addDays, startOfDay, isSameDay } from "date-fns";
import { ClipboardPaste, ChevronRight } from "lucide-react";
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
  const [errors, setErrors] = useState<{ club?: boolean; date?: boolean; time?: boolean }>({});
  const [selectedClub, setSelectedClub] = useState<ClubSelection | null>(null);
  const [notes, setNotes] = useState("");

  // Venue mode
  const [venueMode, setVenueMode] = useState<"xplay" | "other">("xplay");
  const [customVenue, setCustomVenue] = useState<PlaceResult | null>(null);
  const [customCourt, setCustomCourt] = useState("");

  const [court, setCourt] = useState("");
  const [matchDate, setMatchDate] = useState<Date | undefined>();
  const [matchTime, setMatchTime] = useState("");
  const [matchFormat, setMatchFormat] = useState<"competitive" | "social">("competitive");
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  // Auto-calculated level range
  const playerLevel = profile?.padel_level ?? 3.0;
  const suggestedMax = Math.min(7.0, playerLevel + 1.0);
  const [levelMin, setLevelMin] = useState(Math.max(0.5, playerLevel - 1.0));
  const [showLevelEditor, setShowLevelEditor] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      const lvl = profile?.padel_level ?? 3.0;
      setLevelMin(Math.max(0.5, lvl - 1.0));
    }
    if (!open) {
      setSelectedClub(null);
      setCourt("");
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

  const handleCreate = async () => {
    if (!user) return;
    const newErrors: { club?: boolean; date?: boolean; time?: boolean } = {};
    if (venueMode === "xplay" && !selectedClub) newErrors.club = true;
    if (venueMode === "other" && !customVenue?.name) newErrors.club = true;
    if (!matchDate) newErrors.date = true;
    if (!matchTime) newErrors.time = true;
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    const clubName = venueMode === "xplay" ? selectedClub!.club_name : customVenue!.name;
    const courtValue = venueMode === "xplay" ? (court || null) : (customCourt || null);

    setLoading(true);

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
    } else {
      await supabase.from("match_players").insert({ match_id: data.id, user_id: user.id, team: "team_a" });
      const chatTitle = `${clubName}${courtValue ? ` — ${courtValue}` : ""}`;
      await getOrCreateMatchChat(data.id, chatTitle);

      // Create betting market for competitive matches
      if (matchFormat !== "social") {
        try {
          const { error: marketErr } = await supabase.functions.invoke("create-match-market", {
            body: { match_id: data.id },
          });
          if (marketErr) {
            console.error("create-match-market failed:", marketErr);
            toast({ title: "Match created, but betting market setup failed", description: "You can still play — betting features may be unavailable for this match.", variant: "destructive" });
          }
        } catch (marketErr) {
          console.error("create-match-market exception:", marketErr);
        }
      }

      toast({
        title: "Match successfully created.",
        description: "You have been added to Team A.",
      });
      onCreated?.(data.id);
      onOpenChange(false);
    }
    setLoading(false);
  };

  // Generate next 7 days
  const nextSevenDays = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-0 bg-card border-border/50 rounded-t-3xl">
          {/* Custom handle bar */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* Editorial header */}
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

            {/* Venue block */}
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
                      setCourt("");
                      setCustomVenue(null);
                      setCustomCourt("");
                      setErrors(prev => ({ ...prev, club: undefined }));
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
                      "w-full h-11 rounded-xl bg-muted border px-4 flex items-center justify-between text-left transition-colors",
                      errors.club
                        ? "border-destructive ring-1 ring-destructive/30 hover:border-destructive"
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
                </>
              )}

              {/* Court field */}
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">
                  Court (optional)
                </label>
                {venueMode === "xplay" ? (
                  <Input
                    value={court}
                    onChange={(e) => setCourt(e.target.value)}
                    placeholder="e.g. Court 1, Padel 3..."
                    className="h-11 rounded-xl bg-muted border-border/30"
                    style={{ fontSize: "16px" }}
                  />
                ) : (
                  <Input
                    value={customCourt}
                    onChange={(e) => setCustomCourt(e.target.value)}
                    placeholder="e.g. Court 3, Padel 2..."
                    className="h-11 rounded-xl bg-muted border-border/30"
                    style={{ fontSize: "16px" }}
                  />
                )}
              </div>
            </div>

            {/* Date picker: horizontal chips + popover calendar */}
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

            {/* Time picker: scrollable grid */}
            <div className="space-y-2">
              <label className={cn("text-xs uppercase tracking-wider font-medium", errors.time ? "text-destructive" : "text-muted-foreground")}>
                Time *
              </label>
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
              {errors.time && <p className="text-[11px] text-destructive px-1">Please pick a time</p>}
            </div>

            {/* Format + Level + Visibility row */}
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

              {/* Visibility toggle */}
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

            {/* CTA Button */}
            <div className="space-y-2 pt-2">
              <Button
                onClick={handleCreate}
                disabled={loading}
                className="w-full h-[50px] rounded-[14px] font-display font-black italic uppercase text-[15px]"
              >
                {loading ? "Creating..." : `Post match${matchDate && matchTime ? ` · ${format(matchDate, "EEE")} ${matchTime}` : ""}`}
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
          setCourt("");
          setErrors(prev => ({ ...prev, club: undefined }));
        }}
      />
    </>
  );
};

export default CreateMatchModal;
