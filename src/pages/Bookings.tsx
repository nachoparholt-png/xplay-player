import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isTomorrow } from "date-fns";
import { formatInClubTz } from "@/utils/dateTimezone";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type BookingsTab = "upcoming" | "past" | "memberships";

// ── Local types for query results ──────────────────────────────────────────
// `court_bookings` and `membership_tiers` were added after the last
// `supabase gen types` run so they are not in the generated types.ts yet.
// These interfaces document the exact shape returned by each query so we
// don't need `as any` on individual property accesses throughout the file.

interface CourtBookingRow {
  id: string;
  status: string;
  court_slots: {
    starts_at: string | null;
    courts: {
      name: string;
      nickname: string | null;
      club_id: string;
      courts_club: { club_name: string; timezone: string | null } | null;
    } | null;
  } | null;
}

interface CoachingEnrollmentRow {
  id: string;
  status: string | null;
  coaching_sessions: {
    title: string;
    starts_at: string;
    clubs: { club_name: string; timezone: string | null } | null;
  } | null;
}

interface MembershipTierRow {
  name: string;
  price_cents: number;
  billing_period: string;
  court_discount: number;
  coaching_discount: number;
  advance_booking_days: number;
}

interface MembershipRow {
  id: string;
  role: string;
  tier_id: string | null;
  /** `expires_at` is in the generated club_memberships Row type */
  expires_at: string | null;
  clubs: { club_name: string } | null;
  membership_tiers: MembershipTierRow | null;
}

const Bookings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<BookingsTab>("upcoming");
  const [courtBookings, setCourtBookings] = useState<CourtBookingRow[]>([]);
  const [coachingEnrollments, setCoachingEnrollments] = useState<CoachingEnrollmentRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);

      // Court bookings
      // Note: `court_bookings` is not yet in the generated types — the `as any`
      // on .from() is the minimum cast needed until types are regenerated.
      const { data: bookings } = await (
        supabase
          .from("court_bookings")
          .select("id, status, court_slots(starts_at, courts(name, nickname, club_id, courts_club:clubs(club_name, timezone)))")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
      ) as { data: CourtBookingRow[] | null };
      setCourtBookings(bookings ?? []);

      // Coaching enrollments (`coaching_enrollments` IS in generated types)
      const { data: enrolls } = await supabase
        .from("coaching_enrollments")
        .select("id, status, coaching_sessions(title, starts_at, clubs(club_name, timezone))")
        .eq("player_id", user.id)
        .order("enrolled_at", { ascending: false });
      setCoachingEnrollments(enrolls ?? []);

      // Memberships with tier data (`club_memberships` IS in generated types)
      const { data: mems } = await supabase
        .from("club_memberships")
        .select("id, role, tier_id, expires_at, clubs(club_name), membership_tiers(name, court_discount, coaching_discount, advance_booking_days, billing_period, price_cents)")
        .eq("user_id", user.id)
        .eq("status", "active");
      setMemberships(mems ?? []);

      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleCancelBooking = async (bookingId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("release-court-slot", {
        body: { booking_id: bookingId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Booking cancelled");
      setCourtBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status: "cancelled" } : b));
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel");
    }
  };

  const handleCancelMembership = async (membershipId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("cancel-membership", {
        body: { membership_id: membershipId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Membership cancelled");
      setMemberships((prev) => prev.filter((m) => m.id !== membershipId));
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel");
    }
  };

  const now = new Date();
  const upcomingBookings = courtBookings.filter((b) => {
    const s = b.court_slots?.starts_at;
    return b.status === "confirmed" && s != null && new Date(s) >= now;
  });
  const pastBookings = courtBookings.filter((b) => {
    const s = b.court_slots?.starts_at;
    return b.status !== "confirmed" || s == null || new Date(s) < now;
  });

  const upcomingCoaching = coachingEnrollments.filter((e) => {
    const s = e.coaching_sessions?.starts_at;
    return e.status === "confirmed" && s != null && new Date(s) >= now;
  });
  const pastCoaching = coachingEnrollments.filter((e) => {
    const s = e.coaching_sessions?.starts_at;
    return e.status !== "confirmed" || s == null || new Date(s) < now;
  });

  // Group bookings by date
  const groupBookingsByDate = (items: (CourtBookingRow | CoachingEnrollmentRow)[], type: 'court' | 'coaching') => {
    const grouped: Record<string, (CourtBookingRow | CoachingEnrollmentRow)[]> = {};
    items.forEach((item) => {
      const dateStr = type === 'court'
        ? item.court_slots?.starts_at
        : item.coaching_sessions?.starts_at;
      if (!dateStr) return;
      const date = new Date(dateStr).toISOString().split('T')[0];
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(item);
    });
    return Object.entries(grouped).sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
  };

  const getDateLabel = (dateStr: string): { label: string; subtitle: string } => {
    const d = new Date(dateStr);
    if (isToday(d)) {
      return { label: "Today", subtitle: format(d, "d MMM") };
    }
    if (isTomorrow(d)) {
      return { label: "Tomorrow", subtitle: format(d, "d MMM") };
    }
    return { label: format(d, "EEE d"), subtitle: format(d, "MMM yyyy") };
  };

  const getItemType = (item: CourtBookingRow | CoachingEnrollmentRow): { badge: string; bgClass: string; textClass: string } => {
    if ('court_slots' in item) {
      return { badge: "CRT", bgClass: "bg-primary/15", textClass: "text-primary" };
    }
    return { badge: "COA", bgClass: "bg-purple-500/25", textClass: "text-purple-300" };
  };

  const tabs: { key: BookingsTab; label: string; count: number }[] = [
    { key: "upcoming", label: "Upcoming", count: upcomingBookings.length + upcomingCoaching.length },
    { key: "past", label: "Past", count: pastBookings.length + pastCoaching.length },
    { key: "memberships", label: "Plans", count: memberships.length },
  ];

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="px-4 pt-4 pb-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 active:scale-95 transition-transform">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="font-display text-[22px] font-black italic uppercase text-foreground">Schedule</h1>
      </div>

      {/* 3-Tab Selector */}
      <div className="flex gap-[6px] mx-4 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 p-[10px_8px] rounded-[14px] text-center cursor-pointer transition-colors",
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border/[0.07] text-foreground"
            )}
          >
            <div className="font-display text-[18px] font-black italic leading-[0.95]">
              {t.count}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] opacity-70">
              {t.label}
            </div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {tab === "upcoming" && (
            <div>
              {upcomingBookings.length === 0 && upcomingCoaching.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <p className="text-muted-foreground text-sm">No upcoming bookings</p>
                  <button
                    onClick={() => navigate("/matches?tab=clubs")}
                    className="bg-primary text-primary-foreground rounded-xl px-6 py-2.5 text-sm font-semibold active:scale-[0.98] transition-transform"
                  >
                    Browse Clubs
                  </button>
                </div>
              ) : (
                <>
                  {/* Group upcoming courts and coaching together */}
                  {groupBookingsByDate([...upcomingBookings, ...upcomingCoaching], 'court').map(([dateStr, items]) => {
                    const dateLabel = getDateLabel(dateStr);
                    return (
                      <div key={dateStr}>
                        {/* Day Header */}
                        <div className="flex items-baseline gap-[10px] px-[20px] py-[14px]">
                          <h3 className="font-display text-[18px] font-black italic uppercase text-foreground">
                            {dateLabel.label}
                          </h3>
                          <span className="text-[11px] text-muted-foreground/40 font-semibold">
                            {dateLabel.subtitle}
                          </span>
                          <div className="ml-auto text-[10px] text-primary font-bold">
                            ● {items.length} event{items.length !== 1 ? 's' : ''}
                          </div>
                        </div>

                        {/* Timeline items */}
                        {items.map((item) => {
                          const isCourtBooking = 'court_slots' in item;
                          const typeInfo = getItemType(item);
                          const title = isCourtBooking
                            ? (item as CourtBookingRow).court_slots?.courts?.nickname || (item as CourtBookingRow).court_slots?.courts?.name || "Court"
                            : (item as CoachingEnrollmentRow).coaching_sessions?.title || "Coaching";
                          const clubName = isCourtBooking
                            ? (item as CourtBookingRow).court_slots?.courts?.courts_club?.club_name || ""
                            : (item as CoachingEnrollmentRow).coaching_sessions?.clubs?.club_name || "";
                          const timeStr = isCourtBooking
                            ? formatInClubTz((item as CourtBookingRow).court_slots?.starts_at, "HH:mm", (item as CourtBookingRow).court_slots?.courts?.courts_club?.timezone)
                            : formatInClubTz((item as CoachingEnrollmentRow).coaching_sessions?.starts_at, "HH:mm", (item as CoachingEnrollmentRow).coaching_sessions?.clubs?.timezone);

                          return (
                            <div
                              key={item.id}
                              className="flex gap-[12px] px-[16px] py-[12px] border-b border-border/[0.05] group cursor-pointer hover:bg-muted/40 transition-colors"
                              onClick={() => {
                                if (isCourtBooking && (item as CourtBookingRow).status === "confirmed") {
                                  handleCancelBooking(item.id);
                                }
                              }}
                            >
                              {/* Type badge */}
                              <div className={cn(
                                "w-9 h-9 rounded-[12px] flex items-center justify-center font-display text-[10px] font-black italic uppercase tracking-[0.05em] shrink-0",
                                typeInfo.bgClass,
                                typeInfo.textClass
                              )}>
                                {typeInfo.badge}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-bold text-foreground truncate">
                                  {title}
                                </p>
                                <p className="text-[10px] text-muted-foreground/50 mt-[2px]">
                                  {clubName} · {timeStr}
                                </p>
                              </div>

                              {/* Chevron */}
                              <ChevronRight className="w-[18px] h-[18px] text-muted-foreground/30 self-center shrink-0" />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {tab === "past" && (
            <div>
              {pastBookings.length === 0 && pastCoaching.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No past bookings</p>
              ) : (
                <>
                  {groupBookingsByDate([...pastBookings, ...pastCoaching], 'court').map(([dateStr, items]) => {
                    const dateLabel = getDateLabel(dateStr);
                    return (
                      <div key={dateStr}>
                        {/* Day Header */}
                        <div className="flex items-baseline gap-[10px] px-[20px] py-[14px]">
                          <h3 className="font-display text-[18px] font-black italic uppercase text-foreground">
                            {dateLabel.label}
                          </h3>
                          <span className="text-[11px] text-muted-foreground/40 font-semibold">
                            {dateLabel.subtitle}
                          </span>
                          <div className="ml-auto text-[10px] text-primary font-bold">
                            ● {items.length} event{items.length !== 1 ? 's' : ''}
                          </div>
                        </div>

                        {/* Timeline items */}
                        {items.map((item) => {
                          const isCourtBooking = 'court_slots' in item;
                          const typeInfo = getItemType(item);
                          const title = isCourtBooking
                            ? (item as CourtBookingRow).court_slots?.courts?.nickname || (item as CourtBookingRow).court_slots?.courts?.name || "Court"
                            : (item as CoachingEnrollmentRow).coaching_sessions?.title || "Coaching";
                          const clubName = isCourtBooking
                            ? (item as CourtBookingRow).court_slots?.courts?.courts_club?.club_name || ""
                            : (item as CoachingEnrollmentRow).coaching_sessions?.clubs?.club_name || "";
                          const timeStr = isCourtBooking
                            ? formatInClubTz((item as CourtBookingRow).court_slots?.starts_at, "HH:mm", (item as CourtBookingRow).court_slots?.courts?.courts_club?.timezone)
                            : formatInClubTz((item as CoachingEnrollmentRow).coaching_sessions?.starts_at, "HH:mm", (item as CoachingEnrollmentRow).coaching_sessions?.clubs?.timezone);

                          return (
                            <div
                              key={item.id}
                              className="flex gap-[12px] px-[16px] py-[12px] border-b border-border/[0.05] opacity-60"
                            >
                              {/* Type badge */}
                              <div className={cn(
                                "w-9 h-9 rounded-[12px] flex items-center justify-center font-display text-[10px] font-black italic uppercase tracking-[0.05em] shrink-0",
                                typeInfo.bgClass,
                                typeInfo.textClass
                              )}>
                                {typeInfo.badge}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-bold text-foreground truncate">
                                  {title}
                                </p>
                                <p className="text-[10px] text-muted-foreground/50 mt-[2px]">
                                  {clubName} · {timeStr}
                                </p>
                              </div>

                              {/* Chevron */}
                              <ChevronRight className="w-[18px] h-[18px] text-muted-foreground/30 self-center shrink-0" />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {tab === "memberships" && (
            <div>
              {memberships.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No active memberships</p>
              ) : (
                memberships.map((m) => {
                  const tier = m.membership_tiers;
                  return (
                    <div
                      key={m.id}
                      className="flex gap-[12px] px-[16px] py-[12px] border-b border-border/[0.05] group cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => handleCancelMembership(m.id)}
                    >
                      {/* Type badge */}
                      <div className="w-9 h-9 rounded-[12px] flex items-center justify-center font-display text-[10px] font-black italic uppercase tracking-[0.05em] shrink-0 bg-amber-500/15 text-amber-400">
                        MBR
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-foreground">
                          {m.clubs?.club_name}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50 mt-[2px]">
                          {tier?.name || m.role}{tier?.price_cents ? ` · £${(tier.price_cents / 100).toFixed(2)}` : ""}
                        </p>
                      </div>

                      {/* Chevron */}
                      <ChevronRight className="w-[18px] h-[18px] text-muted-foreground/30 self-center shrink-0" />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default Bookings;
