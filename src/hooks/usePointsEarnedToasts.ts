/**
 * usePointsEarnedToasts
 * ─────────────────────
 * Subscribes (via Supabase realtime) to points_transactions inserts for the
 * current user and shows a celebratory toast whenever points are awarded.
 *
 * Filters out spend/negative transactions — only "you earned X" toasts.
 *
 * Anchor reminder: 100 pts = £1 of catalogue value.
 */

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LOYALTY_ENABLED } from "@/lib/featureFlags";

// Friendly labels for each transaction type
const FRIENDLY_LABEL: Record<string, string> = {
  play_match:          "Match played",
  win_match_bonus:     "Match won 🏆",
  complete_profile:    "Profile complete 🎉",
  daily_check_in:      "Daily check-in",
  weekly_streak:       "Streak bonus 🔥",
  referral_complete:   "Referral landed 🤝",
  tournament_play:     "Tournament check-in",
};

export function usePointsEarnedToasts(): void {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!LOYALTY_ENABLED) return;
    if (!session?.user?.id) return;

    const userId = session.user.id;
    const channel = supabase
      .channel(`points-earned-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "points_transactions",
          // points_transactions.user_id is TEXT, so filter by string match
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            amount?: number;
            reason?: string;
            transaction_type?: string;
          };
          const amt = Number(row.amount ?? 0);
          if (amt <= 0) return; // skip spends/refunds

          const reason = row.reason ?? row.transaction_type ?? "";
          const label = FRIENDLY_LABEL[reason] ?? "Points earned";

          toast.success(`+${amt.toLocaleString()} XPLAY Points`, {
            description: label,
            duration: 4000,
          });

          // Invalidate any cached profile so the balance chip refreshes
          queryClient.invalidateQueries({ queryKey: ["profile"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, queryClient]);
}
