import { useMemo, useState } from "react";
import { format, getDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

interface PricingWindow {
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  color: string;
  priority: number;
}

const PRICING_COLORS: Record<string, string> = {
  amber: "bg-amber-500/20 text-amber-400",
  red: "bg-destructive/20 text-destructive",
  green: "bg-emerald-500/20 text-emerald-400",
  blue: "bg-blue-500/20 text-blue-400",
  purple: "bg-purple-500/20 text-purple-400",
  default: "bg-muted/30 text-muted-foreground",
};

interface TimeSlotGridProps {
  slots: any[];
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
  pricingWindows?: PricingWindow[];
  selectedDate?: Date;
}

const TimeSlotGrid = ({ slots, selectedTime, onSelectTime, pricingWindows = [], selectedDate }: TimeSlotGridProps) => {
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  const getPricingWindow = (time: string): PricingWindow | null => {
    if (!pricingWindows.length || !selectedDate) return null;
    const dayOfWeek = getDay(selectedDate);
    for (const pw of pricingWindows) {
      if (pw.days_of_week.includes(dayOfWeek) && time >= pw.start_time && time < pw.end_time) {
        return pw;
      }
    }
    return null;
  };

  const timeGroups = useMemo(() => {
    const groups: Record<string, {
      time: string;
      availableCount: number;
      totalCount: number;
      coachingOnly: boolean;
      minPriceCents: number | null;
    }> = {};

    slots.forEach((slot) => {
      const t = format(new Date(slot.starts_at), "HH:mm");
      if (!groups[t]) groups[t] = { time: t, availableCount: 0, totalCount: 0, coachingOnly: true, minPriceCents: null };
      groups[t].totalCount++;

      if (slot.status === "available" && !slot.coaching_session_id) {
        groups[t].availableCount++;
        groups[t].coachingOnly = false;
        if (slot.price_cents != null) {
          if (groups[t].minPriceCents === null || slot.price_cents < groups[t].minPriceCents) {
            groups[t].minPriceCents = slot.price_cents;
          }
        }
      } else if (!slot.coaching_session_id) {
        groups[t].coachingOnly = false;
      }
    });

    return Object.values(groups).sort((a, b) => a.time.localeCompare(b.time));
  }, [slots]);

  const filtered = showAvailableOnly
    ? timeGroups.filter((g) => g.availableCount > 0)
    : timeGroups;

  if (timeGroups.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">No time slots for this date</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-black text-sm text-foreground uppercase tracking-wide">Available Slots</h3>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
          Available only
          <Switch checked={showAvailableOnly} onCheckedChange={setShowAvailableOnly} className="scale-75" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered.map((group) => {
          const isSelected = selectedTime === group.time;
          const isAvailable = group.availableCount > 0;
          const isCoachingOnly = group.coachingOnly && !isAvailable;
          const isFullyBooked = !isAvailable && !isCoachingOnly;
          const pw = isAvailable ? getPricingWindow(group.time) : null;

          return (
            <button
              key={group.time}
              onClick={() => isAvailable && onSelectTime(group.time)}
              disabled={!isAvailable}
              className={cn(
                "rounded-2xl py-5 px-3 text-center transition-all border-2",
                isAvailable
                  ? isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30"
                    : "bg-primary/90 text-primary-foreground border-primary/60 hover:border-primary active:scale-[0.97]"
                  : isCoachingOnly
                    ? "bg-card border-border/50 cursor-not-allowed"
                    : "bg-card border-border/30 cursor-not-allowed opacity-60"
              )}
            >
              <p className={cn(
                "font-display font-black text-2xl",
                !isAvailable && isFullyBooked && "line-through"
              )}>
                {group.time}
              </p>
              <p className={cn(
                "text-[11px] font-semibold uppercase tracking-wider mt-1",
                isAvailable ? "text-primary-foreground/80" : "text-muted-foreground"
              )}>
                {isCoachingOnly
                  ? "Coaching Only"
                  : isFullyBooked
                    ? "Fully Booked"
                    : `${group.minPriceCents != null ? `£${(group.minPriceCents / 100).toFixed(2)} · ` : ""}${group.availableCount} Court${group.availableCount !== 1 ? "s" : ""}`
                }
              </p>
              {pw && (
                <span className={cn(
                  "inline-block text-[8px] font-bold uppercase tracking-wider mt-1.5 px-2 py-0.5 rounded-full",
                  PRICING_COLORS[pw.color] || PRICING_COLORS.default
                )}>
                  {pw.name}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TimeSlotGrid;
