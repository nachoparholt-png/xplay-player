/**
 * useXplayPro
 * ───────────
 * Returns whether the current user has an active XPLAY Pro subscription, plus
 * the multiplier and court discount currently applied. Cached via React Query.
 *
 * Reads from the `xplay_pro_subscriptions` table directly (RLS guarantees the
 * user can only see their own row).
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface XplayProState {
  active: boolean;
  multiplier: number;        // default 1.0 when not active
  courtDiscountPct: number;  // default 0 when not active
  periodEnd: string | null;
}

const DEFAULT_STATE: XplayProState = {
  active: false,
  multiplier: 1.0,
  courtDiscountPct: 0,
  periodEnd: null,
};

export function useXplayPro(): XplayProState {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const { data } = useQuery({
    queryKey: ["xplay_pro", userId],
    enabled: Boolean(userId),
    staleTime: 60_000,                  // 60s cache — subscription doesn't change often
    queryFn: async (): Promise<XplayProState> => {
      if (!userId) return DEFAULT_STATE;

      const { data: row, error } = await supabase
        .from("xplay_pro_subscriptions")
        .select("multiplier, court_discount_pct, current_period_end, status")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !row) return DEFAULT_STATE;

      // Defensive: check period end if set
      const periodEnd = row.current_period_end as string | null;
      if (periodEnd && new Date(periodEnd) < new Date()) {
        return DEFAULT_STATE;
      }

      return {
        active: true,
        multiplier: Number(row.multiplier ?? 2.0),
        courtDiscountPct: Number(row.court_discount_pct ?? 10),
        periodEnd,
      };
    },
  });

  return data ?? DEFAULT_STATE;
}
