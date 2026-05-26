/**
 * PointsBalanceChip
 * ─────────────────
 * Compact pill showing the user's current XPLAY Points balance. Rendered
 * in the top bar across both mobile and desktop. Tapping navigates to the
 * Rewards page.
 *
 * Anchor: 100 pts = £1 of catalogue value (tooltip on hover).
 *
 * Reads the balance from `profiles.padel_park_points` via AuthContext —
 * no extra round-trip required since the profile is already cached.
 */

import { useNavigate } from "react-router-dom";
import { Zap, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LOYALTY_ENABLED } from "@/lib/featureFlags";

interface PointsBalanceChipProps {
  /** Compact mode hides the £ equivalent and tightens spacing for mobile. */
  compact?: boolean;
}

const PointsBalanceChip = ({ compact = false }: PointsBalanceChipProps) => {
  const navigate = useNavigate();
  const { profile } = useAuth();

  if (!LOYALTY_ENABLED) return null;

  // padel_park_points is the canonical balance column; treat null as 0
  const balance = (profile as { padel_park_points?: number } | null)?.padel_park_points ?? 0;
  const equivalentPounds = (balance / 100).toFixed(2);

  // Premium status — checked by reading the cached profile shape if present.
  // (Real-time premium status comes from the xplay_pro_subscriptions table;
  // a future revision can wire a useXplayPro() hook for this.)
  const isPro = Boolean((profile as { xplay_pro_active?: boolean } | null)?.xplay_pro_active);

  return (
    <button
      onClick={() => navigate("/rewards")}
      aria-label={`${balance} XPLAY Points — redeemable for goods worth £${equivalentPounds}`}
      title={`100 XPLAY Points = £1 of catalogue value\nYour balance: ~£${equivalentPounds}`}
      className={`
        inline-flex items-center gap-1.5 rounded-full
        ${compact ? "px-2 py-1" : "px-2.5 py-1.5"}
        bg-primary/10 border border-primary/20
        text-primary font-bold
        ${compact ? "text-[11px]" : "text-xs"}
        hover:bg-primary/15 active:scale-95 transition
      `}
    >
      {isPro ? (
        <Sparkles className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} fill-primary`} />
      ) : (
        <Zap className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} fill-primary`} />
      )}
      <span className="tabular-nums">{balance.toLocaleString()}</span>
      {!compact && (
        <span className="text-[9px] font-semibold opacity-70 uppercase tracking-wider">pts</span>
      )}
    </button>
  );
};

export default PointsBalanceChip;
