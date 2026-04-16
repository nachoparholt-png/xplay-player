import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Users, Info, Globe, Lock, ShieldCheck, ShieldOff, Crown, ChevronDown, MapPin, CalendarDays, Clock, Building2, ChevronRight, AlertTriangle } from "lucide-react";
import type { WizardState, SkillCategory } from "@/lib/tournaments/types";
import { supabase } from "@/integrations/supabase/client";
import SkillCategoryBadge from "@/components/tournaments/SkillCategoryBadge";
import ClubPicker from "@/components/ClubPicker";

const TIME_SLOTS = Array.from({ length: 36 }, (_, i) => {
  const hour = Math.floor(i / 2) + 6;
  const min = i % 2 === 0 ? "00" : "30";
  return `${hour.toString().padStart(2, "0")}:${min}`;
});

// All supported player counts up to 48
const PLAYER_OPTIONS = [4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48];

interface Props {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
}

const Step1Setup = ({ state, update }: Props) => {
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [restricted, setRestricted] = useState(state.skillLevelMin !== null);
  const [courtNamesOpen, setCourtNamesOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(!!(state.scheduledDate || state.scheduledTime || state.clubName));
  const [clubPickerOpen, setClubPickerOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("tournament_categories")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        if (data) {
          setCategories(
            data.map((c: any) => ({
              id: c.id,
              label: c.label,
              min_rating: c.min_rating,
              max_rating: c.max_rating,
              color: c.color,
              sort_order: c.sort_order,
            }))
          );
        }
      });
  }, []);

  const teamCount =
    state.tournamentType === "pairs"
      ? Math.floor(state.playerCount / 2)
      : state.playerCount;

  // Surface a tip when the tournament is large enough to warrant multiple groups
  const isLargeTournament = teamCount >= 16;

  const handleRestrictToggle = (isRestricted: boolean) => {
    setRestricted(isRestricted);
    if (!isRestricted) {
      update({ skillLevelMin: null, skillLevelMax: null });
    } else if (state.skillLevelMin === null) {
      update({ skillLevelMin: 0.5, skillLevelMax: 7.0 });
    }
  };

  // Categories that overlap with the selected range
  const overlappingCategories = categories.filter((cat) => {
    if (state.skillLevelMin === null || state.skillLevelMax === null) return false;
    return cat.min_rating <= state.skillLevelMax && cat.max_rating >= state.skillLevelMin;
  });

  // Sync courtLabels length with courtCount
  const handleCourtCountChange = (newCount: number) => {
    const labels = [...state.courtLabels];
    while (labels.length < newCount) labels.push(String(labels.length + 1));
    while (labels.length > newCount) labels.pop();
    update({ courtCount: newCount, courtLabels: labels });
  };

  const updateCourtLabel = (index: number, value: string) => {
    const labels = [...state.courtLabels];
    labels[index] = value;
    update({ courtLabels: labels });
  };

  // Compute estimated finish time
  const finishTime = (() => {
    if (!state.scheduledTime || !state.totalTimeMins) return null;
    const [h, m] = state.scheduledTime.split(":").map(Number);
    const totalMin = h * 60 + m + state.totalTimeMins;
    const fh = Math.floor(totalMin / 60) % 24;
    const fm = totalMin % 60;
    return `${String(fh).padStart(2, "0")}:${String(fm).padStart(2, "0")}`;
  })();

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Who's playing?</p>

      {/* Individual vs Pairs */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Format</Label>
        <div className="grid grid-cols-2 gap-3">
          {(["pairs", "individual"] as const).map((t) => (
            <button
              key={t}
              onClick={() => update({ tournamentType: t })}
              className={`p-4 rounded-xl border text-center transition-colors ${
                state.tournamentType === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/50 bg-card text-foreground"
              }`}
            >
              <Users className="w-5 h-5 mx-auto mb-1.5" />
              <span className="text-sm font-semibold capitalize">{t === "pairs" ? "Pairs (2v2)" : "Individual"}</span>
            </button>
          ))}
        </div>
        {state.tournamentType === "individual" && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>In individual mode teams are randomized each round.</span>
          </div>
        )}
      </div>

      {/* Player count */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Players</Label>
        <Select value={String(state.playerCount)} onValueChange={(v) => update({ playerCount: parseInt(v) })}>
          <SelectTrigger className="rounded-xl h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAYER_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} players
                {/* Show team count for pairs alongside large options */}
                {state.tournamentType === "pairs" && n >= 16 && (
                  <span className="text-muted-foreground ml-1">
                    ({Math.floor(n / 2)} teams)
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          = {teamCount} {state.tournamentType === "pairs" ? "teams" : "players"}
        </p>

        {/* Large tournament tip */}
        {isLargeTournament && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/25 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Large tournament — use the Visual Builder to split into{" "}
              <span className="font-semibold">multiple groups</span> for a realistic schedule.
            </span>
          </div>
        )}
      </div>

      {/* Admin playing toggle */}
      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-card">
        <div className="flex items-center gap-3">
          <Crown className="w-4.5 h-4.5 text-[hsl(45,93%,47%)] shrink-0" />
          <div>
            <p className="text-xs font-medium">I am playing</p>
            <p className="text-[10px] text-muted-foreground">
              {state.adminIsPlaying ? "You're included in the bracket" : "Organising only – not in bracket"}
            </p>
          </div>
        </div>
        <Switch
          checked={state.adminIsPlaying}
          onCheckedChange={(checked) => update({ adminIsPlaying: checked })}
        />
      </div>

      {/* Skill level range */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Skill Level</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleRestrictToggle(false)}
            className={`p-3 rounded-xl border text-left transition-colors ${
              !restricted
                ? "border-primary bg-primary/10"
                : "border-border/50 bg-card hover:bg-card/80"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <ShieldOff className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Open</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">All levels welcome</p>
          </button>
          <button
            onClick={() => handleRestrictToggle(true)}
            className={`p-3 rounded-xl border text-left transition-colors ${
              restricted
                ? "border-primary bg-primary/10"
                : "border-border/50 bg-card hover:bg-card/80"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Restrict</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">By skill range</p>
          </button>
        </div>

        {restricted && state.skillLevelMin !== null && state.skillLevelMax !== null && (
          <div className="space-y-3">
            <div className="text-center">
              <span className="text-lg font-bold text-primary">
                {state.skillLevelMin} – {state.skillLevelMax}
              </span>
            </div>
            <Slider
              value={[state.skillLevelMin, state.skillLevelMax]}
              onValueChange={([min, max]) => update({ skillLevelMin: min, skillLevelMax: max })}
              min={0.5}
              max={7.0}
              step={0.5}
              className="w-full"
            />
            {overlappingCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {overlappingCategories.map((cat) => (
                  <SkillCategoryBadge key={cat.id} label={cat.label} color={cat.color} size="sm" />
                ))}
              </div>
            )}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card">
              <div>
                <p className="text-xs font-medium">Admin approval for out-of-range</p>
                <p className="text-[10px] text-muted-foreground">Players outside the range need your OK</p>
              </div>
              <Switch
                checked={state.requireAdminApprovalForOutOfRange}
                onCheckedChange={(checked) => update({ requireAdminApprovalForOutOfRange: checked })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Court count — max raised to 12 for large tournaments */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Courts</Label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleCourtCountChange(Math.max(1, state.courtCount - 1))}
            className="w-10 h-10 rounded-xl border border-border/50 bg-card text-lg font-bold flex items-center justify-center"
          >
            −
          </button>
          <span className="text-lg font-bold w-8 text-center">{state.courtCount}</span>
          <button
            onClick={() => handleCourtCountChange(Math.min(12, state.courtCount + 1))}
            className="w-10 h-10 rounded-xl border border-border/50 bg-card text-lg font-bold flex items-center justify-center"
          >
            +
          </button>
        </div>

        {/* Named courts collapsible */}
        <Collapsible open={courtNamesOpen} onOpenChange={setCourtNamesOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", courtNamesOpen && "rotate-180")} />
            Name your courts (optional)
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2">
            {state.courtLabels.map((label, i) => (
              <Input
                key={i}
                value={label}
                onChange={(e) => updateCourtLabel(i, e.target.value)}
                placeholder={`Court ${i + 1}`}
                className="rounded-xl h-9 text-sm"
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Total time — hours extended to 8 for large tournaments */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Total time budget (optional)</Label>
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={state.totalTimeMins ? String(Math.floor(state.totalTimeMins / 60)) : "none"}
            onValueChange={(v) => {
              if (v === "none") return update({ totalTimeMins: null });
              const hrs = parseInt(v);
              const mins = state.totalTimeMins ? state.totalTimeMins % 60 : 0;
              update({ totalTimeMins: hrs * 60 + mins });
            }}
          >
            <SelectTrigger className="rounded-xl h-11">
              <SelectValue placeholder="Hours" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No limit</SelectItem>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h}h
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.totalTimeMins !== null && (
            <Select
              value={String(state.totalTimeMins % 60)}
              onValueChange={(v) => {
                const hrs = Math.floor((state.totalTimeMins ?? 0) / 60);
                update({ totalTimeMins: hrs * 60 + parseInt(v) });
              }}
            >
              <SelectTrigger className="rounded-xl h-11">
                <SelectValue placeholder="Minutes" />
              </SelectTrigger>
              <SelectContent>
                {[0, 15, 30, 45].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m}m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Visibility */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Visibility</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update({ visibility: "public" })}
            className={`p-3 rounded-xl border text-left transition-colors ${
              state.visibility === "public"
                ? "border-primary bg-primary/10"
                : "border-border/50 bg-card hover:bg-card/80"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Public</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Visible to everyone in the app — anyone can join
            </p>
          </button>
          <button
            type="button"
            onClick={() => update({ visibility: "private" })}
            className={`p-3 rounded-xl border text-left transition-colors ${
              state.visibility === "private"
                ? "border-primary bg-primary/10"
                : "border-border/50 bg-card hover:bg-card/80"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Private</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Only visible by invitation — hidden from browse
            </p>
          </button>
        </div>
      </div>

      {/* Event details collapsible */}
      <Collapsible open={eventOpen} onOpenChange={setEventOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors">
          <ChevronDown className={cn("w-4 h-4 transition-transform", eventOpen && "rotate-180")} />
          Event details (optional)
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-3">
          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full rounded-xl h-11 justify-start text-left font-normal",
                    !state.scheduledDate && "text-muted-foreground"
                  )}
                >
                  {state.scheduledDate
                    ? format(new Date(state.scheduledDate), "PPP")
                    : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={state.scheduledDate ? new Date(state.scheduledDate) : undefined}
                  onSelect={(date) =>
                    update({ scheduledDate: date ? format(date, "yyyy-MM-dd") : null })
                  }
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Start time
            </Label>
            <Select value={state.scheduledTime || ""} onValueChange={(v) => update({ scheduledTime: v || null })}>
              <SelectTrigger className="rounded-xl h-11">
                <SelectValue placeholder="Pick time" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {TIME_SLOTS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {finishTime && (
            <p className="text-xs text-muted-foreground">
              Finishes at approx. <span className="font-semibold text-foreground">{finishTime}</span>
            </p>
          )}

          {/* Club */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Club / Venue
            </Label>
            <button
              type="button"
              onClick={() => setClubPickerOpen(true)}
              className="w-full h-11 rounded-xl bg-muted border border-border/50 px-4 flex items-center justify-between text-left hover:border-primary/40 transition-colors"
            >
              {state.clubName ? (
                <div className="flex items-center gap-3 min-w-0">
                  <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{state.clubName}</span>
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">Select a club...</span>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          </div>

          <ClubPicker
            open={clubPickerOpen}
            onOpenChange={setClubPickerOpen}
            onSelect={(club) => update({ clubName: club.club_name })}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default Step1Setup;