import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Clock, Building2, MapPin, ChevronRight, ClipboardPaste } from "lucide-react";
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-card border-border/50">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="font-display text-xl">Create Match</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePasteAutofill}
                disabled={pasteLoading}
                className="rounded-xl gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10 mr-6"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                {pasteLoading ? "Reading..." : "Paste"}
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
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
                      "w-full h-11 rounded-xl bg-muted border px-4 flex items-center justify-between text-left transition-colors",
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
                          <span className="text-[10px] text-muted-foreground">{selectedClub.location || selectedClub.city || "—"}</span>
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

            {/* Court field */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Court (optional)</label>
              {venueMode === "xplay" ? (
                <Input
                  value={court}
                  onChange={(e) => setCourt(e.target.value)}
                  placeholder="e.g. Court 1, Padel 3, Indoor..."
                  className="h-11 rounded-xl bg-muted border-border/50"
                  style={{ fontSize: "16px" }}
                />
              ) : (
                <Input
                  value={customCourt}
                  onChange={(e) => setCustomCourt(e.target.value)}
                  placeholder="e.g. Court 3, Indoor, Padel 2..."
                  className="h-11 rounded-xl bg-muted border-border/50"
                  style={{ fontSize: "16px" }}
                />
              )}
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={cn("text-xs uppercase tracking-wider font-medium mb-1.5 flex items-center gap-1.5", errors.date ? "text-destructive" : "text-muted-foreground")}>
                  <CalendarIcon className="w-3.5 h-3.5" /> Date *
                </label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-11 rounded-xl justify-start text-left font-normal bg-muted",
                        !matchDate && "text-muted-foreground",
                        errors.date ? "border-destructive ring-1 ring-destructive/30" : "border-border/50"
                      )}
                    >
                      {matchDate ? format(matchDate, "MMM d, yyyy") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={matchDate}
                      onSelect={(date) => { setMatchDate(date); setDatePickerOpen(false); setErrors(prev => ({ ...prev, date: undefined })); }}
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
                  <SelectTrigger className={cn("h-11 rounded-xl bg-muted", errors.time ? "border-destructive ring-1 ring-destructive/30" : "border-border/50")}>
                    <SelectValue placeholder="Pick time" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_SLOTS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.time && <p className="text-[11px] text-destructive mt-1">Please pick a time</p>}
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
                      "h-11 rounded-xl text-sm font-medium capitalize transition-colors border flex items-center justify-center gap-1.5",
                      visibility === v
                        ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/30"
                        : "bg-muted border-border/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {visibility === v && <span className="text-xs">✓</span>}
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {visibility === "public" ? "Anyone can discover and join this match" : "Invite-only — hidden from browse"}
              </p>
            </div>

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

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 h-11 rounded-xl font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 h-11 rounded-xl font-semibold"
              >
                {loading ? "Creating..." : "Create Match"}
              </Button>
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
