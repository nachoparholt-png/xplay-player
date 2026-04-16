import { Crown, Check, TrendingUp, TrendingDown } from "lucide-react";

interface MembershipCardProps {
  id: string;
  name: string;
  tierTag?: string;
  priceCents: number;
  billingPeriod: string;
  courtDiscount: number;
  coachingDiscount: number;
  advanceBookingDays: number;
  benefits: any[];
  isCurrentPlan: boolean;
  currentMembershipPriceCents?: number; // price of currently active plan, for upgrade/downgrade detection
  onSelect?: () => void;
  loading?: boolean;
  hideAction?: boolean;
  currencySymbol?: string;
}

const getTierColor = (tag: string) => {
  const t = tag.toLowerCase();
  if (t === "gold") return { accent: "hsl(var(--gold))", bg: "hsl(var(--gold) / 0.12)", border: "hsl(var(--gold) / 0.5)" };
  if (t === "platinum") return { accent: "hsl(var(--silver))", bg: "hsl(var(--silver) / 0.08)", border: "hsl(var(--silver) / 0.5)" };
  if (t === "silver") return { accent: "hsl(var(--silver))", bg: "hsl(var(--silver) / 0.08)", border: "hsl(var(--silver) / 0.5)" };
  if (t === "bronze") return { accent: "hsl(var(--bronze))", bg: "hsl(var(--bronze) / 0.12)", border: "hsl(var(--bronze) / 0.5)" };
  if (t === "staff") return { accent: "hsl(var(--accent))", bg: "hsl(var(--accent) / 0.1)", border: "hsl(var(--accent) / 0.5)" };
  return { accent: "hsl(var(--primary))", bg: "hsl(var(--primary) / 0.06)", border: "hsl(var(--primary) / 0.4)" };
};

const MembershipCard = ({
  name, tierTag, priceCents, billingPeriod, courtDiscount, coachingDiscount,
  advanceBookingDays, benefits, isCurrentPlan, currentMembershipPriceCents, onSelect, loading, hideAction, currencySymbol = '£'
}: MembershipCardProps) => {
  const tier = getTierColor(tierTag || "default");

  const hasCurrent = currentMembershipPriceCents !== undefined && !isCurrentPlan;
  const isUpgrade = hasCurrent && priceCents > currentMembershipPriceCents!;
  const isDowngrade = hasCurrent && priceCents < currentMembershipPriceCents!;

  const actionLabel = isCurrentPlan
    ? "Current Plan"
    : loading
    ? "..."
    : isUpgrade
    ? "Upgrade"
    : isDowngrade
    ? "Downgrade"
    : hasCurrent
    ? "Switch Plan"
    : "Get This Plan";

  return (
    <div
      className={`rounded-2xl border p-5 space-y-4 transition-all ${isCurrentPlan ? "ring-1" : ""}`}
      style={{
        backgroundColor: tier.bg,
        borderColor: isCurrentPlan ? tier.accent : tier.border,
        ...(isCurrentPlan ? { ringColor: tier.accent } : {}),
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4" style={{ color: tier.accent }} />
            <h3 className="font-display font-bold text-foreground">{name}</h3>
          </div>
          <p className="text-2xl font-display font-black mt-1" style={{ color: tier.accent }}>
            {currencySymbol}{(priceCents / 100).toFixed(2)}
            <span className="text-xs text-muted-foreground font-medium">/{billingPeriod === "annual" ? "year" : "month"}</span>
          </p>
        </div>
        {isCurrentPlan && (
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
            style={{ backgroundColor: `color-mix(in srgb, ${tier.accent} 20%, transparent)`, color: tier.accent }}
          >
            Current
          </span>
        )}
      </div>

      <div className="space-y-2">
        {courtDiscount > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="w-3 h-3" style={{ color: tier.accent }} />
            {courtDiscount}% off court bookings
          </div>
        )}
        {coachingDiscount > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="w-3 h-3" style={{ color: tier.accent }} />
            {coachingDiscount}% off coaching
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="w-3 h-3" style={{ color: tier.accent }} />
          Book {advanceBookingDays} days in advance
        </div>
        {(benefits || []).map((b: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="w-3 h-3" style={{ color: tier.accent }} />
            {typeof b === "string" ? b : b.label || b.text}
          </div>
        ))}
      </div>

      {!hideAction && (
        <button
          onClick={onSelect}
          disabled={isCurrentPlan || loading}
          className="w-full py-2.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider transition-all disabled:opacity-50 active:scale-[0.98] disabled:bg-muted disabled:text-muted-foreground flex items-center justify-center gap-1.5"
          style={!isCurrentPlan && !loading ? { backgroundColor: tier.accent, color: "hsl(var(--primary-foreground))" } : undefined}
        >
          {isUpgrade && <TrendingUp className="w-3 h-3" />}
          {isDowngrade && <TrendingDown className="w-3 h-3" />}
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default MembershipCard;
