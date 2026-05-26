/**
 * useDailyCheckIn
 * ───────────────
 * Awards `daily_check_in` XPLAY Points the first time the app opens for a given
 * user on a given calendar day. Idempotent client-side via localStorage; safe
 * even if the user opens the app twice in a day on the same device because the
 * SQL `daily_cap` rule (5 pts/day) is the canonical guard.
 *
 * Fires only when LOYALTY_ENABLED.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { LOYALTY_ENABLED } from "@/lib/featureFlags";

const STORAGE_PREFIX = "xplay_last_checkin_";

function todayISO(): string {
  // YYYY-MM-DD in user's local TZ (same calendar the points_rules daily_cap uses)
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function useDailyCheckIn(): void {
  const { session } = useAuth();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!LOYALTY_ENABLED) return;
    if (!session?.user?.id) return;
    if (firedRef.current) return;

    const userId = session.user.id;
    const key = `${STORAGE_PREFIX}${userId}`;
    const lastCheckIn = localStorage.getItem(key);
    const today = todayISO();
    if (lastCheckIn === today) return;

    firedRef.current = true;

    supabase
      .rpc("award_points", { _user_id: userId, _action_type: "daily_check_in" })
      .then(({ error }) => {
        if (error) {
          // Don't show user error — non-critical. Log for debugging.
          console.warn("daily check-in award failed:", error.message);
          firedRef.current = false;
          return;
        }
        localStorage.setItem(key, today);
      });
  }, [session?.user?.id]);
}
