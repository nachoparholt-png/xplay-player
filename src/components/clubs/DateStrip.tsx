import { useMemo } from "react";
import { addDays, format, isBefore, startOfDay, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

interface DateStripProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  maxDays: number;
}

const DateStrip = ({ selectedDate, onSelect, maxDays }: DateStripProps) => {
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(today, i));
  }, []);

  const maxDate = useMemo(() => addDays(new Date(), maxDays), [maxDays]);

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
      {days.map((day) => {
        const isSelected = format(day, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
        const isLocked = isBefore(maxDate, startOfDay(day));
        const todayFlag = isToday(day);

        return (
          <button
            key={day.toISOString()}
            onClick={() => !isLocked && onSelect(day)}
            disabled={isLocked}
            className={cn(
              "flex flex-col items-center justify-center rounded-2xl px-3 py-2 min-w-[52px] transition-all relative",
              isSelected
                ? "bg-primary text-primary-foreground"
                : isLocked
                  ? "bg-card border border-border/30 opacity-40 cursor-not-allowed"
                  : "bg-card border border-border/50 text-foreground hover:border-primary/40"
            )}
          >
            <span className={cn("text-[10px] font-semibold uppercase", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
              {format(day, "MMM")}
            </span>
            <span className={cn("text-lg font-bold leading-tight", isSelected ? "text-primary-foreground" : "text-foreground")}>
              {format(day, "d")}
            </span>
            {isLocked && (
              <Lock className="w-2.5 h-2.5 text-muted-foreground absolute top-1 right-1" />
            )}
            {todayFlag && !isSelected && (
              <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default DateStrip;
