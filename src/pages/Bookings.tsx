import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Clock, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { formatInClubTz } from "@/utils/dateTimezone";
import { toast } from "sonner";

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

  const tabs: { key: BookingsTab; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
    { key: "memberships", label: "Memberships" },
  ];

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 active:scale-95 transition-transform">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="font-display font-bold text-lg text-foreground">My Bookings</h1>
      </div>

      <div className="flex gap-1 bg-card rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
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
            <div className="space-y-3">
              {upcomingBookings.length === 0 && upcomingCoaching.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No upcoming bookings</p>
              ) : (
                <>
                  {upcomingBookings.map((b) => (
                    <div key={b.id} className="bg-card rounded-2xl border border-border/50 p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-display font-bold text-sm text-foreground">
                            {b.court_slots?.courts?.nickname || b.court_slots?.courts?.name || "Court"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {b.court_slots?.courts?.courts_club?.club_name || ""}
                          </p>
                        </div>
                        <span className="text-[9px] font-bold uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full">Court</span>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatInClubTz(b.court_slots?.starts_at, "EEE d MMM, HH:mm", b.court_slots?.courts?.courts_club?.timezone)}
                      </p>
                      <button
                        onClick={() => handleCancelBooking(b.id)}
                        className="text-xs text-destructive font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                  {upcomingCoaching.map((e) => (
                    <div key={e.id} className="bg-card rounded-2xl border border-border/50 p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-display font-bold text-sm text-foreground">{e.coaching_sessions?.title}</p>
                          <p className="text-[10px] text-muted-foreground">{e.coaching_sessions?.clubs?.club_name}</p>
                        </div>
                        <span className="text-[9px] font-bold uppercase bg-accent/20 text-accent px-2 py-0.5 rounded-full">Coaching</span>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatInClubTz(e.coaching_sessions?.starts_at, "EEE d MMM, HH:mm", e.coaching_sessions?.clubs?.timezone)}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "past" && (
            <div className="space-y-3">
              {pastBookings.length === 0 && pastCoaching.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No past bookings</p>
              ) : (
                <>
                  {pastBookings.map((b) => (
                    <div key={b.id} className="bg-card rounded-2xl border border-border/50 p-4 opacity-60">
                      <p className="font-display font-bold text-sm text-foreground">{b.court_slots?.courts?.nickname || b.court_slots?.courts?.name || "Court"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatInClubTz(b.court_slots?.starts_at, "EEE d MMM, HH:mm", b.court_slots?.courts?.courts_club?.timezone)} · {b.status}
                      </p>
                    </div>
                  ))}
                  {pastCoaching.map((e) => (
                    <div key={e.id} className="bg-card rounded-2xl border border-border/50 p-4 opacity-60">
                      <p className="font-display font-bold text-sm text-foreground">{e.coaching_sessions?.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatInClubTz(e.coaching_sessions?.starts_at, "EEE d MMM, HH:mm", e.coaching_sessions?.clubs?.timezone)} · {e.status}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "memberships" && (
            <div className="space-y-3">
              {memberships.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No active memberships</p>
              ) : (
                memberships.map((m) => {
                  const tier = m.membership_tiers;
                  return (
                    <div key={m.id} className="bg-card rounded-2xl border border-primary/30 p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-display font-bold text-sm text-foreground">{m.clubs?.club_name}</p>
                          <p className="text-xs text-primary font-semibold">{tier?.name || m.role}</p>
                        </div>
                        <span className="text-[9px] font-bold uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full">Active</span>
                      </div>
                      {tier && (
                        <div className="space-y-1 text-[11px] text-muted-foreground">
                          {tier.price_cents > 0 && (
                            <p>£{(tier.price_cents / 100).toFixed(2)}/{tier.billing_period === "annual" ? "year" : "month"}</p>
                          )}
                          {tier.court_discount > 0 && <p>✓ {tier.court_discount}% off courts</p>}
                          {tier.coaching_discount > 0 && <p>✓ {tier.coaching_discount}% off coaching</p>}
                          {tier.advance_booking_days > 0 && <p>✓ Book {tier.advance_booking_days} days ahead</p>}
                        </div>
                      )}
                      {m.expires_at && (
                        <p className="text-xs text-muted-foreground">
                          Renews: {format(new Date(m.expires_at), "d MMM yyyy")}
                        </p>
                      )}
                      <button
                        onClick={() => handleCancelMembership(m.id)}
                        className="text-xs text-destructive font-bold"
                      >
                        Cancel Membership
                      </button>
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
