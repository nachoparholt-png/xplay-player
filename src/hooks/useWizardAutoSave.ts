import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { WizardState } from "@/lib/tournaments/types";

const DEBOUNCE_MS = 1500;
const DRAFT_STORAGE_KEY = "xplay_wizard_draft";

interface DraftMeta {
  state: WizardState;
  lastStep: number;
  savedAt: string;
}

export function useWizardAutoSave(
  state: WizardState,
  step: number,
  setSaving: (v: boolean) => void
) {
  const { user } = useAuth();
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist draft to localStorage for crash recovery
  const persistLocal = useCallback((s: WizardState, currentStep: number) => {
    const meta: DraftMeta = {
      state: s,
      lastStep: currentStep,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(meta));
  }, []);

  // Auto-save to DB (only if tournament already created)
  const saveToDb = useCallback(async () => {
    const s = stateRef.current;
    if (!s.tournamentId || !user) return;

    setSaving(true);
    const { error } = await supabase
      .from("tournaments")
      .update({
        tournament_type: s.tournamentType,
        player_count: s.playerCount,
        court_count: s.courtCount,
        total_time_mins: s.totalTimeMins,
        visibility: s.visibility,
        match_config: s.matchConfig,
        format_type: s.formatType,
        bracket_config: s.bracketConfig,
        canvas_state: s.canvasState,
        name: s.name || "Untitled Tournament",
        rating_exempt: s.ratingExempt,
      })
      .eq("id", s.tournamentId);

    setSaving(false);
    if (!error) {
      setLastSavedAt(new Date().toLocaleTimeString());
    }
  }, [user, setSaving]);

  // Debounced auto-save on state changes
  useEffect(() => {
    // Always persist locally immediately
    persistLocal(state, step);

    // Debounce DB save
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveToDb();
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, step, persistLocal, saveToDb]);

  return { lastSavedAt };
}

/** Restore draft from localStorage if available */
export function restoreWizardDraft(): DraftMeta | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const meta: DraftMeta = JSON.parse(raw);
    // Only restore if saved within last 24 hours
    const age = Date.now() - new Date(meta.savedAt).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
    return meta;
  } catch {
    return null;
  }
}

export function clearWizardDraft() {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
}
