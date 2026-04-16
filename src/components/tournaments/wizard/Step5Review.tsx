import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Clock, Users, Trophy, Grid3X3, UserPlus, BarChart3, ShieldCheck,
  Pencil, Check, CalendarDays, Crown, Layers
} from "lucide-react";
import type { WizardState, TournamentFormat, SkillCategory } from "@/lib/tournaments/types";
import { estimateMatchMinutes, calculateTotalMatches, estimateTotalMinutes } from "@/lib/tournaments/timeEstimates";
import { computeFeasibility } from "@/lib/tournaments/feasibilityEngine";
import InviteTournamentPlayerModal from "@/components/tournaments/InviteTournamentPlayerModal";
import TournamentStructurePreview from "@/components/tournaments/TournamentStructurePreview";
import SkillCategoryBadge from "@/components/tournaments/SkillCategoryBadge";
import { supabase } from "@/integrations/supabase/client";

/** Sub-component that loads categories and shows skill range in review */
const SkillLevelReviewRow = ({ state }: { state: WizardState }) => {
  const [categories, setCategories] = useState<SkillCategory[]>([]);

  useEffect(() => {
    if (state.skillLevelMin === null) return;
    supabase
      .from("tournament_categories")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        if (data) {
          setCategories(
            data.map((c: any) => ({
              id: c.id, label: c.label, min_rating: c.min_rating,
              max_rating: c.max_rating, color: c.color, sort_order: c.sort_order,
            }))
          );
        }
      });
  }, [state.skillLevelMin]);

  const overlapping = categories.filter(
    (cat) =>
      state.skillLevelMin !== null &&
      state.skillLevelMax !== null &&
      cat.min_rating <= state.skillLevelMax &&
      cat.max_rating >= state.skillLevelMin
  );

  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card">
      <ShieldCheck className="w-4.5 h-4.5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">Skill level</p>
        {state.skillLevelMin !== null && state.skillLevelMax !== null ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {state.skillLevelMin} – {state.skillLevelMax}
              {state.requireAdminApprovalForOutOfRange ? " · Approval required" : ""}
            </p>
            {overlapping.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {overlapping.map((cat) => (
                  <SkillCategoryBadge key={cat.id} label={cat.label} color={cat.color} size="sm" />
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm font-medium">Open to all levels</p>
        )}
      </div>
    </div>
  );
};

interface Props {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  onJumpToStep: (step: number) => void;
  onCreate: () => void;
  saving: boolean;
}

const FORMAT_LABELS: Record<string, string> = {
  groups: "Groups",
  americano: "Americano",
  king_of_court: "King of the Court",
};

type EditingSection = "players" | "match" | "format" | "time" | null;

const Step5Review = ({ state, update, onJumpToStep, onCreate, saving }: Props) => {
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<EditingSection>(null);

  const teamCount = state.tournamentType === "pairs"
    ? Math.floor(state.playerCount / 2)
    : state.playerCount;

  const matchMins = estimateMatchMinutes(state.matchConfig);
  const { totalMatches, matchesPerTeam, knockoutMatches } = calculateTotalMatches(teamCount, state.formatType, state.bracketConfig);
  const totalMins = estimateTotalMinutes(matchMins, totalMatches, state.courtCount, 2, knockoutMatches);
  const feasibility = computeFeasibility(state);

  const scoringLabel =
    state.matchConfig.scoring_type === "points"
      ? `Points to ${state.matchConfig.points_target ?? 21}`
      : `${state.matchConfig.games_per_set ?? 4} games${(state.matchConfig.sets_per_match ?? 1) > 1 ? " (best of 3)" : ""}, ${state.matchConfig.deuce_mode ?? "normal"} deuce`;

  const fitColors: Record<string, string> = {
    green: "bg-accent/15 text-accent border-accent/30",
    yellow: "bg-[hsl(45,93%,47%)]/15 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30",
    red: "bg-destructive/15 text-destructive border-destructive/30",
    none: "bg-muted text-muted-foreground border-border/50",
  };

  const fitLabel: Record<string, string> = {
    green: "Fits ✓",
    yellow: "Tight",
    red: "Over budget",
    none: "No budget",
  };

  const toggleEdit = (section: EditingSection) => {
    setEditing(editing === section ? null : section);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Review your tournament</p>

      {/* Name */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Tournament Name</Label>
        <Input
          placeholder="e.g. Sunday Showdown"
          value={state.name}
          onChange={(e) => update({ name: e.target.value })}
          className="rounded-xl h-12 text-base font-semibold"
        />
      </div>

      {/* Summary sections with inline editing */}
      <div className="space-y-2">
        {/* Players & Courts */}
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="flex items-center gap-3 p-3.5">
            <Users className="w-4.5 h-4.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Players & courts</p>
              <p className="text-sm font-medium truncate">
                {state.playerCount} players · {state.courtCount} courts · {state.tournamentType}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => toggleEdit("players")} className="h-7 px-2 text-xs gap-1">
              {editing === "players" ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
              {editing === "players" ? "Done" : "Edit"}
            </Button>
          </div>
          {editing === "players" && (
            <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-border/30">
              <div className="flex items-center gap-3">
                <Label className="text-xs w-16">Players</Label>
                <div className="flex items-center gap-2">
                  <button onClick={() => update({ playerCount: Math.max(4, state.playerCount - 2) })} className="w-8 h-8 rounded-lg border border-border/50 bg-card text-sm font-bold flex items-center justify-center">−</button>
                  <span className="text-sm font-bold w-6 text-center">{state.playerCount}</span>
                  <button onClick={() => update({ playerCount: Math.min(24, state.playerCount + 2) })} className="w-8 h-8 rounded-lg border border-border/50 bg-card text-sm font-bold flex items-center justify-center">+</button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs w-16">Courts</Label>
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    const n = Math.max(1, state.courtCount - 1);
                    const labels = state.courtLabels.slice(0, n);
                    update({ courtCount: n, courtLabels: labels });
                  }} className="w-8 h-8 rounded-lg border border-border/50 bg-card text-sm font-bold flex items-center justify-center">−</button>
                  <span className="text-sm font-bold w-6 text-center">{state.courtCount}</span>
                  <button onClick={() => {
                    const n = Math.min(10, state.courtCount + 1);
                    const labels = [...state.courtLabels, String(n)];
                    update({ courtCount: n, courtLabels: labels });
                  }} className="w-8 h-8 rounded-lg border border-border/50 bg-card text-sm font-bold flex items-center justify-center">+</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Match type */}
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="flex items-center gap-3 p-3.5">
            <Trophy className="w-4.5 h-4.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Match type</p>
              <p className="text-sm font-medium truncate">{scoringLabel}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => toggleEdit("match")} className="h-7 px-2 text-xs gap-1">
              {editing === "match" ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
              {editing === "match" ? "Done" : "Edit"}
            </Button>
          </div>
          {editing === "match" && (
            <div className="px-3.5 pb-3.5 pt-1 border-t border-border/30">
              {state.matchConfig.scoring_type === "points" && (
                <div className="flex flex-wrap gap-1.5">
                  {[16, 21, 24, 32].map((pt) => (
                    <button
                      key={pt}
                      onClick={() => update({ matchConfig: { ...state.matchConfig, points_target: pt } })}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                        state.matchConfig.points_target === pt
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 bg-card"
                      )}
                    >
                      {pt} pts
                    </button>
                  ))}
                </div>
              )}
              {state.matchConfig.scoring_type === "games" && (
                <div className="flex flex-wrap gap-1.5">
                  {[4, 6].map((g) => (
                    <button
                      key={g}
                      onClick={() => update({ matchConfig: { ...state.matchConfig, games_per_set: g } })}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                        state.matchConfig.games_per_set === g
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 bg-card"
                      )}
                    >
                      {g} games
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Format */}
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="flex items-center gap-3 p-3.5">
            {state.savedCanvasSummary ? (
              <Layers className="w-4.5 h-4.5 text-primary shrink-0" />
            ) : (
              <Grid3X3 className="w-4.5 h-4.5 text-primary shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">
                {state.savedCanvasSummary ? "Custom layout" : "Format"}
              </p>
              {state.savedCanvasSummary ? (
                <p className="text-sm font-medium truncate">{state.savedCanvasSummary}</p>
              ) : (
                <p className="text-sm font-medium truncate">
                  {FORMAT_LABELS[state.formatType]} · {totalMatches} matches · {matchesPerTeam} per team
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => toggleEdit("format")} className="h-7 px-2 text-xs gap-1">
              {editing === "format" ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
              {editing === "format" ? "Done" : "Edit"}
            </Button>
          </div>
          {editing === "format" && (
            <div className="px-3.5 pb-3.5 pt-1 border-t border-border/30 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(["groups", "americano", "king_of_court"] as TournamentFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => update({ formatType: f, savedCanvasSummary: null })}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                      state.formatType === f && !state.savedCanvasSummary
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 bg-card"
                    )}
                  >
                    {FORMAT_LABELS[f]}
                  </button>
                ))}
              </div>
              {state.savedCanvasSummary && (
                <p className="text-[11px] text-muted-foreground">
                  Selecting a format above will clear your custom layout. Go back to Step 3 to keep your builder changes.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Estimated time + feasibility */}
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="flex items-center gap-3 p-3.5">
            <Clock className="w-4.5 h-4.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Estimated time</p>
              <p className="text-sm font-medium">~{totalMins} minutes total</p>
            </div>
            <Badge variant="outline" className={cn("text-[10px]", fitColors[feasibility.fit])}>
              {fitLabel[feasibility.fit]}
            </Badge>
            {feasibility.fit === "red" && (
              <Button variant="ghost" size="sm" onClick={() => onJumpToStep(3)} className="h-7 px-2 text-xs text-destructive">
                Fix
              </Button>
            )}
          </div>
        </div>

        {/* Event details */}
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="flex items-center gap-3 p-3.5">
            <CalendarDays className="w-4.5 h-4.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Event details</p>
              <p className="text-sm font-medium truncate">
                {[
                  state.scheduledDate ? format(new Date(state.scheduledDate), "d MMM yyyy") : null,
                  state.scheduledTime,
                  state.clubName || null,
                ].filter(Boolean).join(" · ") || "Not set"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => toggleEdit("time")} className="h-7 px-2 text-xs gap-1">
              {editing === "time" ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
              {editing === "time" ? "Done" : "Edit"}
            </Button>
          </div>
          {editing === "time" && (
            <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-border/30">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full rounded-xl h-9 justify-start text-left text-sm font-normal", !state.scheduledDate && "text-muted-foreground")}>
                      {state.scheduledDate ? format(new Date(state.scheduledDate), "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={state.scheduledDate ? new Date(state.scheduledDate) : undefined}
                      onSelect={(date) => update({ scheduledDate: date ? format(date, "yyyy-MM-dd") : null })}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Input
                  type="time"
                  value={state.scheduledTime || ""}
                  onChange={(e) => update({ scheduledTime: e.target.value || null })}
                  className="rounded-xl h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Club / Venue</Label>
                <Input
                  value={state.clubName}
                  onChange={(e) => update({ clubName: e.target.value })}
                  placeholder="e.g. Padel City London"
                  className="rounded-xl h-9"
                />
              </div>
            </div>
          )}
        </div>

        {/* Admin role */}
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card">
          <Crown className="w-4.5 h-4.5 text-[hsl(45,93%,47%)] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Your role</p>
            <p className="text-sm font-medium">{state.adminIsPlaying ? "Playing & organising" : "Organising only"}</p>
          </div>
          <Switch
            checked={state.adminIsPlaying}
            onCheckedChange={(checked) => update({ adminIsPlaying: checked })}
          />
        </div>

        {/* Skill level */}
        <SkillLevelReviewRow state={state} />
      </div>

      {/* Structure preview */}
      <TournamentStructurePreview
        formatType={state.formatType}
        tournamentType={state.tournamentType}
        playerCount={state.playerCount}
        courtCount={state.courtCount}
        bracketConfig={state.bracketConfig}
        canvasState={state.canvasState}
      />

      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-card">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-4.5 h-4.5 text-primary shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Player ratings</p>
            <p className="text-sm font-medium">Count towards ELO</p>
          </div>
        </div>
        <Switch
          checked={!state.ratingExempt}
          onCheckedChange={(checked) => update({ ratingExempt: !checked })}
        />
      </div>

      {/* Invite section */}
      {state.tournamentId && (
        <Button
          variant="outline"
          onClick={() => setShowInvite(true)}
          className="w-full rounded-xl h-11 gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Invite Players
        </Button>
      )}

      {/* Launch button */}
      <Button
        onClick={onCreate}
        disabled={saving || !state.name.trim()}
        className="w-full rounded-xl h-12 font-semibold text-base"
      >
        {saving ? "Creating..." : "Create Tournament"}
      </Button>

      <InviteTournamentPlayerModal
        open={showInvite}
        onOpenChange={setShowInvite}
        tournamentId={state.tournamentId ?? ""}
        tournamentName={state.name || "Untitled Tournament"}
        existingPlayerIds={[]}
      />
    </div>
  );
};

export default Step5Review;
