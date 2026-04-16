import { useState, useEffect, useMemo } from "react";
import { format, getDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getBookingWindow } from "@/lib/clubs/bookingWindow";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Zap, Lock } from "lucide-react";
import DateStrip from "./DateStrip";
import BookingSlotModal, { BookingSlot } from "./BookingSlotModal";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

interface PricingWindow {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  price_cents: number;
  color: string;
  priority: number;
}

interface CourtAvailabilityGridProps {
  clubId: string;
  courts: any[];
  membershipDiscount?: number;
  memberTierName?: string | null;
  currencySymbol?: string;
}

const PRICING_COLORS: Record<string, string> = {
  amber: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  red: "bg-destructive/20 text-destructive border-destructive/40",
  green: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  blue: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  purple: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  default: "bg-muted/30 text-muted-foreground border-border/40",
};

const CourtAvailabilityGrid = ({ clubId, courts, membershipDiscount = 0, memberTierName, currencySymbol = '£' }: CourtAvailabilityGridProps) => {
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [slots, setSlots] = useState<any[]>([]);
  const [pricingWindows, setPricingWindows] = useState<PricingWindow[]>([]);
  const [maxDays, setMaxDays] = useState(3);
  const [loading, setLoading] = useState(true);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSlot, setModalSlot] = useState<BookingSlot | null>(null);
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);
  const [bookingNetworkError, setBookingNetworkError] = useState(false);

  useEffect(() => {
    if (!user) return;
    getBookingWindow(clubId, user.id).then(setMaxDays);
  }, [clubId, user]);

  // Fetch pricing windows once
  useEffect(() => {
    const fetchPricingWindows = async () => {
      const { data } = await supabase
        .from("court_pricing_windows")
        .select("*")
        .eq("club_id", clubId)
        .eq("active", true)
        .order("priority", { ascending: false });
      setPricingWindows(data || []);
    };
    fetchPricingWindows();
  }, [clubId]);

  useEffect(() => {
    const fetchSlots = async () => {
      setLoading(true);
      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(selectedDate);
      dayEnd.setHours(23, 59, 59, 999);

      const courtIds = courts.map((c) => c.id);
      if (courtIds.length === 0) { setSlots([]); setLoading(false); return; }

      const { data } = await supabase
        .from("court_slots")
        .select("*")
        .in("court_id", courtIds)
        .gte("starts_at", dayStart.toISOString())
        .lte("starts_at", dayEnd.toISOString())
        .order("starts_at");

      setSlots(data || []);
      setLoading(false);
    };
    fetchSlots();

    const channel = supabase
      .channel(`court-slots-${clubId}-${format(selectedDate, "yyyy-MM-dd")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "court_slots" }, () => fetchSlots())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate, courts, clubId]);

  // Helper: find pricing window for a given slot
  const getPricingWindow = useMemo(() => {
    return (slot: any): PricingWindow | null => {
      const slotTime = format(new Date(slot.starts_at), "HH:mm");
      const dayOfWeek = getDay(new Date(slot.starts_at)); // 0=Sun
      for (const pw of pricingWindows) {
        if (
          pw.days_of_week.includes(dayOfWeek) &&
          slotTime >= pw.start_time &&
          slotTime < pw.end_time
        ) {
          return pw;
        }
      }
      return null;
    };
  }, [pricingWindows]);

  const handleSlotClick = (slot: any, court: any) => {
    const startTime = new Date(slot.starts_at);
    const endTime = new Date(slot.ends_at);
    const durationMins = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    const pw = getPricingWindow(slot);

    setPendingSlotId(slot.id);
    setModalSlot({
      courtName: court.nickname || court.name,
      courtType: [court.court_type, court.surface].filter(Boolean).join(" · "),
      date: format(selectedDate, "EEE d MMM"),
      time: format(startTime, "HH:mm"),
      duration: `${durationMins} min`,
      priceCents: slot.price_cents || 0,
      memberDiscountPct: membershipDiscount,
      pricingWindowName: pw?.name || null,
      currencySymbol,
      memberTierName,
    });
    setModalOpen(true);
  };

  const handleConfirmBooking = async (matchType: "private" | "public") => {
    if (!user || !pendingSlotId) return;

    // Guard: detect offline before even trying
    if (!isOnline) {
      toast.error("You're offline — please reconnect and try again.");
      return;
    }

    setBookingNetworkError(false);
    setBookingSlot(pendingSlotId);
    let networkErr = false;
    try {
      const { data, error } = await supabase.functions.invoke("create-booking-checkout", {
        body: { court_slot_id: pendingSlotId, club_id: clubId, match_type: matchType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.free) {
        toast.success("Court booked successfully!");
        setModalOpen(false);
      } else if (data?.url) {
        window.open(data.url, "_blank");
        setModalOpen(false);
      }
    } catch (e: any) {
      networkErr = !navigator.onLine || /fetch|network|failed to fetch/i.test(e.message ?? '');
      if (networkErr) {
        setBookingNetworkError(true);
        toast.error("Connection lost. Tap Retry once you're back online.");
      } else {
        toast.error(e.message || "Failed to create booking");
      }
    } finally {
      setBookingSlot(null);
      // Keep pendingSlotId alive so the user can retry from the still-open modal
      if (!networkErr) setPendingSlotId(null);
    }
  };

  const allTimes = [...new Set(slots.map((s) => format(new Date(s.starts_at), "HH:mm")))].sort();

  return (
    <div className="space-y-4">
      <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} maxDays={maxDays} />

      <div className="flex items-center justify-between bg-card border border-border/50 rounded-2xl px-4 py-3">
        <p className="text-[11px] text-muted-foreground">
          You can book <span className="font-semibold text-foreground">{maxDays} days</span> ahead · <span className="text-primary font-semibold">Upgrade to see more →</span>
        </p>
        <Zap className="w-4 h-4 text-primary flex-shrink-0" />
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : courts.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">No courts available</p>
      ) : (
        <div className="space-y-6 divide-y divide-border/30">
          {courts.map((court) => {
            const courtSlots = slots.filter((s) => s.court_id === court.id);
            const now = new Date();
            const hasLive = courtSlots.some(
              (s) => new Date(s.starts_at) <= now && new Date(s.ends_at) > now && s.status === "booked"
            );

            return (
              <div key={court.id} className="space-y-3 pt-5 first:pt-0">
                <div className="flex items-center justify-between">
                  <p className="font-display font-bold text-xs text-muted-foreground uppercase tracking-widest">
                    {court.nickname || court.name}
                    {court.court_type && <span> · {court.court_type}</span>}
                    {court.surface && <span> · {court.surface}</span>}
                  </p>
                  {hasLive && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      Live
                    </span>
                  )}
                </div>

                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
                  {allTimes.map((time) => {
                    const slot = courtSlots.find((s) => format(new Date(s.starts_at), "HH:mm") === time);

                    if (!slot) {
                      return (
                        <button
                          key={time}
                          disabled
                          className="flex-shrink-0 flex flex-col items-center rounded-xl px-3 py-2 bg-muted/20 border border-border/20 opacity-40 min-w-[60px]"
                        >
                          <span className="text-xs font-bold text-muted-foreground">{time}</span>
                          <span className="text-[9px] text-muted-foreground">—</span>
                        </button>
                      );
                    }

                    const isAvailable = slot.status === "available" && !slot.coaching_session_id;
                    const isCoaching = !!slot.coaching_session_id;
                    const isBooked = slot.status === "booked";
                    const isElite = slot.notes?.toLowerCase().includes("elite");
                    const isBooking = bookingSlot === slot.id;

                    const startTime = new Date(slot.starts_at);
                    const endTime = new Date(slot.ends_at);
                    const durationMins = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

                    const pw = isAvailable ? getPricingWindow(slot) : null;

                    let label = "";
                    let chipClass = "";

                    if (isAvailable) {
                      label = slot.price_cents ? `${currencySymbol}${(slot.price_cents / 100).toFixed(0)}` : "Free";
                      chipClass = "bg-primary text-primary-foreground border-primary/60 hover:bg-primary/80 active:scale-[0.96] cursor-pointer";
                    } else if (isCoaching) {
                      label = "Clinic";
                      chipClass = "bg-card text-muted-foreground border-border/50 cursor-not-allowed";
                    } else if (isElite) {
                      label = "Elite";
                      chipClass = "bg-secondary/10 text-secondary border-secondary/40 cursor-not-allowed";
                    } else if (isBooked) {
                      label = "Taken";
                      chipClass = "bg-destructive/10 text-destructive border-destructive/40 cursor-not-allowed";
                    } else {
                      label = "—";
                      chipClass = "bg-muted/20 text-muted-foreground border-border/20 cursor-not-allowed opacity-40";
                    }

                    return (
                      <button
                        key={time}
                        disabled={!isAvailable || isBooking}
                        onClick={() => isAvailable && handleSlotClick(slot, court)}
                        className={cn(
                          "flex-shrink-0 flex flex-col items-center rounded-xl px-3 py-2 border transition-all min-w-[68px]",
                          chipClass
                        )}
                      >
                        <span className="text-xs font-bold">{time}</span>
                        <span className="text-[8px] text-inherit opacity-70">{durationMins} min</span>
                        <span className="text-[9px] font-semibold uppercase tracking-wide">
                          {isBooking ? "..." : label}
                        </span>
                        {pw && (
                          <span className={cn(
                            "text-[7px] font-bold uppercase tracking-wider mt-0.5 px-1.5 py-0.5 rounded-full border",
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
          })}
        </div>
      )}

      {/* Upsell card */}
      <div className="bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Unlock Peak Hours</p>
        </div>
        <p className="text-xs text-muted-foreground">Get early access to court bookings and 15% discount on clinic sessions with XPLAY Pro.</p>
        <button className="text-[11px] font-display font-bold uppercase tracking-wider text-primary hover:underline">
          Upgrade Now →
        </button>
      </div>

      <BookingSlotModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setPendingSlotId(null);
            setBookingNetworkError(false);
          }
        }}
        slot={modalSlot}
        onConfirm={handleConfirmBooking}
        loading={!!bookingSlot}
        networkError={bookingNetworkError}
        isOnline={isOnline}
      />
    </div>
  );
};

export default CourtAvailabilityGrid;
