import { useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

interface CourtListAccordionProps {
  courts: any[];
  slots: any[];
  selectedTime: string | null;
  bookingSlot: string | null;
  onBook: (slotId: string) => void;
}

const CourtListAccordion = ({ courts, slots, selectedTime, bookingSlot, onBook }: CourtListAccordionProps) => {
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  if (!selectedTime) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">Select a time slot above to see court availability</p>
      </div>
    );
  }

  const courtData = courts.map((court) => {
    const slot = slots.find(
      (s) =>
        s.court_id === court.id &&
        new Date(s.starts_at).toTimeString().slice(0, 5) === selectedTime
    );
    const isAvailable = slot?.status === "available" && !slot.coaching_session_id;
    return { court, slot, isAvailable };
  });

  const filtered = showAvailableOnly ? courtData.filter((c) => c.isAvailable) : courtData;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-display font-bold text-foreground">Book a court</h3>
          <p className="text-[11px] text-muted-foreground">Create a private match where you can invite your friends</p>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer flex-shrink-0 mt-0.5">
          Available
          <Switch checked={showAvailableOnly} onCheckedChange={setShowAvailableOnly} className="scale-75" />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground text-xs py-4">No courts available at this time</p>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {filtered.map(({ court, slot, isAvailable }) => {
            const displayName = court.nickname || court.name;
            const durationLabel = court.slot_duration_minutes ? `${court.slot_duration_minutes} min` : null;

            return (
              <AccordionItem
                key={court.id}
                value={court.id}
                className={cn(
                  "bg-card rounded-2xl border border-border/50 overflow-hidden",
                  !isAvailable && "opacity-50"
                )}
              >
                <AccordionTrigger
                  className={cn(
                    "px-4 py-3 hover:no-underline",
                    !isAvailable && "cursor-default"
                  )}
                  disabled={!isAvailable}
                >
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm">
                      🏟️
                    </div>
                    <div>
                      <span className={cn("font-display font-bold text-sm", !isAvailable && "line-through text-muted-foreground")}>
                        {displayName}
                      </span>
                      <div className="flex gap-1.5 mt-0.5">
                        {court.court_type && (
                          <span className="text-[9px] uppercase bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded-md font-semibold">
                            {court.court_type}
                          </span>
                        )}
                        {court.surface && (
                          <span className="text-[9px] uppercase bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded-md font-semibold">
                            {court.surface}
                          </span>
                        )}
                        {durationLabel && (
                          <span className="text-[9px] uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-semibold">
                            {durationLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                {isAvailable && (
                  <AccordionContent className="px-4 pb-4 pt-0">
                    <div className="flex items-center justify-between pt-2 border-t border-border/30">
                      <div>
                        <span className="text-lg font-bold text-primary">
                          £{((slot?.price_cents || 0) / 100).toFixed(0)}
                        </span>
                        <span className="text-[11px] text-muted-foreground ml-1">/ session</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          slot && onBook(slot.id);
                        }}
                        disabled={bookingSlot === slot?.id}
                        className="rounded-xl font-display font-bold uppercase text-xs tracking-wider"
                      >
                        {bookingSlot === slot?.id ? "Booking..." : "Book Now"}
                      </Button>
                    </div>
                  </AccordionContent>
                )}
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
};

export default CourtListAccordion;
