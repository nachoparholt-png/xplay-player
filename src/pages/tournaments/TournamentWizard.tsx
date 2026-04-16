import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { WizardState, MatchConfig, BracketConfig, CanvasState } from "@/lib/tournaments/types";
import { DEFAULT_WIZARD_STATE } from "@/lib/tournaments/types";
import { useWizardAutoSave, restoreWizardDraft, clearWizardDraft } from "@/hooks/useWizardAutoSave";
import Step1Setup from "@/components/tournaments/wizard/Step1Setup";
import Step2MatchType from "@/components/tournaments/wizard/Step2MatchType";
import Step3Format from "@/components/tournaments/wizard/Step3Format";
import Step4Suggestions from "@/components/tournaments/wizard/Step4Suggestions";
import Step5Review from "@/components/tournaments/wizard/Step5Review";

const STEP_LABELS = ["Setup", "Scoring", "Format", "Suggestions", "Review"];

const TournamentWizard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({ ...DEFAULT_WIZARD_STATE });
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Draft restore on mount
  useEffect(() => {
    const draft = restoreWizardDraft();
    if (draft && !draftRestored) {
      setState(draft.state);
      setStep(draft.lastStep);
      setDraftRestored(true);
      toast({ title: "Draft restored 📝", description: "Continuing where you left off." });
    }
  }, []);

  const update = (partial: Partial<WizardState>) => setState((s) => ({ ...s, ...partial }));

  // Auto-save hook
  const { lastSavedAt } = useWizardAutoSave(state, step, setSaving);

  const saveDraft = async (): Promise<string | null> => {
    if (!user) return null;
    setSaving(true);

    if (state.tournamentId) {
      const { error } = await supabase
        .from("tournaments")
        .update({
          tournament_type: state.tournamentType,
          player_count: state.playerCount,
          court_count: state.courtCount,
          total_time_mins: state.totalTimeMins,
          visibility: state.visibility,
          match_config: state.matchConfig as MatchConfig,
          format_type: state.formatType,
          bracket_config: state.bracketConfig as BracketConfig,
          canvas_state: state.canvasState as CanvasState,
          name: state.name || "Untitled Tournament",
           rating_exempt: state.ratingExempt,
           skill_level_min: state.skillLevelMin,
           skill_level_max: state.skillLevelMax,
           skill_category_id: null,
          require_admin_approval: state.requireAdminApprovalForOutOfRange,
          admin_is_playing: state.adminIsPlaying,
          court_labels: state.courtLabels,
          scheduled_date: state.scheduledDate,
          scheduled_time: state.scheduledTime,
          club: state.clubName || null,
        })
        .eq("id", state.tournamentId);
      setSaving(false);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return null;
      }
      return state.tournamentId;
    }

    const { data, error } = await supabase
      .from("tournaments")
      .insert({
        created_by: user.id,
        name: state.name || "Untitled Tournament",
        status: "draft",
        visibility: state.visibility,
        format_type: state.formatType,
        tournament_type: state.tournamentType,
        player_count: state.playerCount,
        court_count: state.courtCount,
        total_time_mins: state.totalTimeMins,
        match_config: state.matchConfig as MatchConfig,
        bracket_config: state.bracketConfig as BracketConfig,
        canvas_state: state.canvasState as CanvasState,
         rating_exempt: state.ratingExempt,
         skill_level_min: state.skillLevelMin,
         skill_level_max: state.skillLevelMax,
         skill_category_id: null,
        require_admin_approval: state.requireAdminApprovalForOutOfRange,
        admin_is_playing: state.adminIsPlaying,
        court_labels: state.courtLabels,
        scheduled_date: state.scheduledDate,
        scheduled_time: state.scheduledTime,
        club: state.clubName || null,
      })
      .select("id")
      .single();

    setSaving(false);
    if (error || !data) {
      toast({ title: "Save failed", description: error?.message, variant: "destructive" });
      return null;
    }

    const id = data.id as string;
    update({ tournamentId: id });

    // Auto-join creator with appropriate role
    await supabase.from("tournament_players").insert({
      tournament_id: id,
      user_id: user.id,
      role: state.adminIsPlaying ? "admin" : "organiser",
    });

    return id;
  };

  const handleNext = async () => {
    if (step === 0) {
      const id = await saveDraft();
      if (!id) return;
    }
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
    else navigate("/tournaments");
  };

  const handleCreate = async () => {
    const id = state.tournamentId || (await saveDraft());
    if (!id) return;
    setSaving(true);
    await supabase
      .from("tournaments")
      .update({
        name: state.name || "Untitled Tournament",
        match_config: state.matchConfig as MatchConfig,
        format_type: state.formatType,
        bracket_config: state.bracketConfig as BracketConfig,
        canvas_state: state.canvasState as CanvasState,
         rating_exempt: state.ratingExempt,
         skill_level_min: state.skillLevelMin,
         skill_level_max: state.skillLevelMax,
         skill_category_id: null,
        require_admin_approval: state.requireAdminApprovalForOutOfRange,
        admin_is_playing: state.adminIsPlaying,
        court_labels: state.courtLabels,
        scheduled_date: state.scheduledDate,
        scheduled_time: state.scheduledTime,
        club: state.clubName || null,
      })
      .eq("id", id);
    setSaving(false);
    clearWizardDraft();
    toast({ title: "Tournament created! 🎉" });
    navigate(`/tournaments/${id}`);
  };

  const progress = ((step + 1) / 5) * 100;

  return (
    <div className="px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-xl">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-display font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          {STEP_LABELS[step]}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {lastSavedAt && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Check className="w-3 h-3 text-green-500" />
              Saved {lastSavedAt}
            </span>
          )}
          <span className="text-xs text-muted-foreground font-medium">
            {step + 1} / 5
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="h-1.5" />

      {/* Step content */}
      {step === 0 && <Step1Setup state={state} update={update} />}
      {step === 1 && <Step2MatchType state={state} update={update} />}
      {step === 2 && <Step3Format state={state} update={update} />}
      {step === 3 && (
        <Step4Suggestions
          state={state}
          update={update}
          onSelect={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <Step5Review
          state={state}
          update={update}
          onJumpToStep={setStep}
          onCreate={handleCreate}
          saving={saving}
        />
      )}

      {/* Nav buttons (steps 0-3) */}
      {step < 4 && (
        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <Button variant="outline" onClick={handleBack} className="rounded-xl flex-1">
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={saving}
            className="rounded-xl flex-1 h-12 font-semibold"
          >
            {saving ? "Saving..." : step === 3 ? "Skip to Review" : "Next"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default TournamentWizard;
