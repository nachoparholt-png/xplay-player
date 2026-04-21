import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ShieldAlert, LogOut, WifiOff } from "lucide-react";
import CancelRegistrationModal from "@/components/CancelRegistrationModal";
import { supabase } from "@/integrations/supabase/client";
import { parseISO, addHours, isBefore, format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import BetModal from "@/components/BetModal";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";

type MatchData = {
  id: string;
  club: string;
  court: string | null;
  match_date: string;
  match_time: string;
  format: string;
  level_min: number;
  level_max: number;
  max_players: number;
  status: string;
  organizer_id: string;
};

type PlayerSlot = {
  id: string;
  user_id: string;
  display_name: string | null;
  padel_level: number | null;
  avatar_url: string | null;
} | null;

interface MatchJoinModalProps {
  matchId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MatchJoinModal = ({ matchId, open, onOpenChange }: MatchJoinModalProps) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isOnline, enqueue, pendingCount } = useOfflineQueue();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [slots, setSlots] = useState<PlayerSlot[]>([null, null, null, null]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showBetModal, setShowBetModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationHours, setCancellationHours] = useState<number>(24);
  const [cancellationEnabled, setCancellationEnabled] = useState(true);
  const [userWaitlistEntry, setUserWaitlistEntry] = useState<{ id: string } | null>(null);
  const [userJoinRequest, setUserJoinRequest] = useState<{ id: string; status: string } | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);

  const userLevelFits = profile?.padel_level != null && match
    ? profile.padel_level >= match.level_min && profile.padel_level <= match.level_max
    : true;

  const isAlreadyJoined = slots.some((s) => s && s.user_id === user?.id);

  const fetchData = async () => {
    if (!matchId) return;
    setLoading(true);

    const { data: matchData } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();

    const { data: playerData } = await supabase
      .from("match_players")
      .select("*")
      .eq("match_id", matchId)
      .eq("status", "confirmed")
      .order("joined_at", { ascending: true });

    if (playerData && playerData.length > 0) {
      const userIds = playerData.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, padel_level, avatar_url")
        .in("user_id", userIds);

      const maxSlots = matchData?.max_players || 4;
      const newSlots: PlayerSlot[] = Array(maxSlots).fill(null);

      playerData.forEach((p, i) => {
        const prof = profiles?.find((pr) => pr.user_id === p.user_id);
        if (i < maxSlots) {
          newSlots[i] = {
            id: p.id,
            user_id: p.user_id,
            display_name: prof?.display_name || "Player",
            padel_level: prof?.padel_level || null,
            avatar_url: prof?.avatar_url || null,
          };
        }
      });
      setSlots(newSlots);
    } else {
      setSlots(Array(matchData?.max_players || 4).fill(null));
    }

    setMatch(matchData);

    const { count } = await supabase
      .from("match_players")
      .select("id", { count: "exact", head: true })
      .eq("match_id", matchId)
      .eq("status", "confirmed");
    setConfirmedCount(count ?? 0);

    if (user) {
      const { data: wl } = await supabase
        .from("match_players")
        .select("id")
        .eq("match_id", matchId)
        .eq("user_id", user.id)
        .eq("status", "waitlist")
        .maybeSingle();
      setUserWaitlistEntry(wl);

      const { data: jr } = await supabase
        .from("match_join_requests")
        .select("id, status")
        .eq("match_id", matchId)
        .eq("user_id", user.id)
        .maybeSingle();
      setUserJoinRequest(jr);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (open && matchId) fetchData();
  }, [open, matchId]);

  // Fetch cancellation setting
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["cancellation_deadline_hours", "allow_player_cancellation"]);
      if (data) {
        data.forEach((row: any) => {
          if (row.key === "cancellation_deadline_hours") setCancellationHours(parseInt(row.value) || 24);
          if (row.key === "allow_player_cancellation") setCancellationEnabled(row.value === "true");
        });
      }
    };
    fetchSettings();
  }, []);

  // Check if cancellation window has passed for joined players
  const cancellationWindowClosed = (() => {
    if (!match || !isAlreadyJoined) return false;
    if (!cancellationEnabled) return true;
    if (["cancelled", "completed"].includes(match.status)) return false;
    try {
      const matchStart = parseISO(`${match.match_date}T${match.match_time}`);
      const deadline = addHours(matchStart, -cancellationHours);
      return !isBefore(new Date(), deadline);
    } catch {
      return false;
    }
  })();

  const canCancel = isAlreadyJoined && !cancellationWindowClosed;

  const cancellationDeadlineFormatted = (() => {
    if (!match) return null;
    try {
      const matchStart = parseISO(`${match.match_date}T${match.match_time}`);
      const deadline = addHours(matchStart, -cancellationHours);
      return format(deadline, "MMM d, HH:mm");
    } catch {
      return null;
    }
  })();

  const handleJoinSlot = async (_slotIndex: number) => {
    if (!user || !match || joining || isAlreadyJoined) return;
    if (!userLevelFits) {
      toast({ title: "Level mismatch", description: `This match requires level ${match.level_min.toFixed(1)}–${match.level_max.toFixed(1)}`, variant: "destructive" });
      return;
    }

    // Capture match snapshot so the queued fn closes over stable values
    const matchId  = match.id;
    const maxPlayers = match.max_players;
    const clubName = match.club;
    const filledNow = slots.filter(Boolean).length;

    const doJoin = async () => {
      const { error } = await supabase.from("match_players").insert({ match_id: matchId, user_id: user.id });
      if (error) throw new Error(error.message);

      const filledCount = filledNow + 1;
      if (filledCount >= maxPlayers) {
        await supabase.from("matches").update({ status: "full" }).eq("id", matchId);
      } else if (filledCount >= maxPlayers - 1) {
        await supabase.from("matches").update({ status: "almost_full" }).eq("id", matchId);
      }
    };

    // ── Offline path: queue the operation ──────────────────────────
    if (!isOnline) {
      enqueue({
        id: `join-match-${matchId}`,
        label: `Join match at ${clubName}`,
        fn: doJoin,
        onSuccess: () => {
          toast({ title: "You're in! 🎾", description: "Match added to My Matches" });
          navigate("/matches");
        },
        onError: (err) => {
          toast({ title: "Failed to join", description: err.message, variant: "destructive" });
        },
      });
      toast({ title: "Queued 🕐", description: "We'll join you as soon as your connection restores." });
      onOpenChange(false);
      return;
    }

    // ── Online path ─────────────────────────────────────────────────
    setJoining(true);
    try {
      await doJoin();

      // ── +30 XP: first match bonus (once only) ─────────────────────
      const alreadyGranted = (profile as any)?.first_match_bonus_granted === true;
      if (!alreadyGranted) {
        await supabase.rpc("increment_points", { p_user_id: user.id, p_amount: 30 });
        await supabase
          .from("profiles")
          .update({ first_match_bonus_granted: true })
          .eq("user_id", user.id);
      }
      // ───────────────────────────────────────────────────────────────

      toast({
        title: !alreadyGranted ? "You're in! +30 XP 🎾" : "You're in! 🎾",
        description: "Match added to My Matches",
      });
      onOpenChange(false);
      navigate("/matches");
    } catch (e: any) {
      // If the call itself fails with a network error, queue it for retry
      const isNetworkErr = !navigator.onLine || /fetch|network|failed to fetch/i.test(e.message ?? '');
      if (isNetworkErr) {
        enqueue({
          id: `join-match-${matchId}`,
          label: `Join match at ${clubName}`,
          fn: doJoin,
          onSuccess: () => {
            toast({ title: "You're in! 🎾", description: "Match added to My Matches" });
            navigate("/matches");
          },
          onError: (err) => {
            toast({ title: "Failed to join", description: err.message, variant: "destructive" });
          },
        });
        toast({ title: "Queued 🕐", description: "Connection dropped. We'll join you once you're back online." });
        onOpenChange(false);
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    }
    setJoining(false);
  };

  const handleJoinWaitlist = async () => {
    if (!user || !match || joining) return;
    setJoining(true);
    const { error } = await supabase.from("match_players").insert({
      match_id: match.id, user_id: user.id, status: "waitlist", team: null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "You're on the waitlist 🕐", description: "We'll notify you the moment a spot opens up." });
      fetchData();
    }
    setJoining(false);
  };

  const handleClaimSpot = async () => {
    if (!user || !match || joining || !userWaitlistEntry) return;
    setJoining(true);
    const teamACnt = slots.slice(0, 2).filter(Boolean).length;
    const teamBCnt = slots.slice(2).filter(Boolean).length;
    const team = teamACnt <= teamBCnt ? "team_a" : "team_b";
    const { error } = await supabase
      .from("match_players")
      .update({ status: "confirmed", team })
      .eq("id", userWaitlistEntry.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const newCount = confirmedCount + 1;
      if (newCount >= (match.max_players ?? 4)) {
        await supabase.from("matches").update({ status: "full" }).eq("id", match.id);
      } else if (newCount >= (match.max_players ?? 4) - 1) {
        await supabase.from("matches").update({ status: "almost_full" }).eq("id", match.id);
      }
      toast({ title: "Spot claimed! 🎾", description: "You're now confirmed in this match." });
      onOpenChange(false);
      navigate("/matches");
    }
    setJoining(false);
  };

  const handleRequestToJoin = async () => {
    if (!user || !match || joining) return;
    setJoining(true);
    const { error } = await supabase.from("match_join_requests").insert({
      match_id: match.id, user_id: user.id,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setJoining(false);
      return;
    }
    const confirmedIds = slots.filter(Boolean).map((s) => s!.user_id);
    await Promise.all(confirmedIds.map((pid) =>
      supabase.rpc("create_notification_for_user", {
        _user_id: pid,
        _type: "match_update",
        _title: "Join request 🙋",
        _body: `A player outside the skill range wants to join the match at ${match.club}. Open the match to approve or reject.`,
        _link: `/matches/${match.id}`,
      })
    ));
    toast({ title: "Request sent!", description: "All players in the match will be asked to approve." });
    fetchData();
    setJoining(false);
  };

  const toStatusUI = (s: string) => {
    const valid = ["open", "almost_full", "full", "cancelled", "completed"] as const;
    return valid.includes(s as typeof valid[number]) ? (s as typeof valid[number]) : "open";
  };

  // Calculate time until match
  const timeUntilMatch = (() => {
    if (!match) return null;
    try {
      const now = new Date();
      const matchStart = parseISO(`${match.match_date}T${match.match_time}`);
      const diffMs = matchStart.getTime() - now.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `in ${hours}h ${minutes}m`;
    } catch {
      return null;
    }
  })();

  const emptySlots = slots.filter((s) => !s).length;
  const ctaState = (() => {
    if (userWaitlistEntry && confirmedCount < (match?.max_players ?? 4)) {
      return { type: "claim", label: `Claim my spot · ${emptySlots > 0 ? "200 XP" : "waitlist"}` };
    }
    if (userJoinRequest?.status === "pending") {
      return { type: "pending", label: "Request pending…" };
    }
    if (!isAlreadyJoined && !userWaitlistEntry && !userJoinRequest && match?.status === "full") {
      return { type: "waitlist", label: "Join waitlist" };
    }
    if (!isAlreadyJoined && !userWaitlistEntry && !userJoinRequest && !userLevelFits) {
      return { type: "request", label: "Request to join" };
    }
    if (isAlreadyJoined) {
      return { type: "joined", label: "You're in this match" };
    }
    if (match?.status === "full" || match?.status === "cancelled" || match?.status === "completed") {
      return { type: "unavailable", label: "Match unavailable" };
    }
    return { type: "join", label: "Claim my spot · 200 XP" };
  })();

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => onOpenChange(false)}
          style={{ animation: "fadeIn 0.2s ease-out" }}
        />
      )}

      {/* Bottom Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-[28px] border-t border-border/[0.08]"
        style={{
          animation: "slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from {
              transform: translateY(100%);
            }
            to {
              transform: translateY(0);
            }
          }
        `}</style>

        {/* Grab Handle */}
        <div className="flex justify-center pt-3 pb-0">
          <div className="w-10 h-1 rounded-full bg-muted" />
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !match ? (
            <div className="p-6 text-center text-muted-foreground">Match not found</div>
          ) : (
            <>
              {/* HEADER: Club Initials + Name + Details */}
              <div className="px-5 pt-3">
                <div className="flex items-start gap-3 mb-4">
                  {/* Club Initials Block */}
                  <div className="flex-shrink-0">
                    <div className="w-[42px] h-[42px] rounded-xl bg-muted border border-primary/40 flex items-center justify-center">
                      <span className="font-display font-black italic uppercase text-primary text-xs">
                        {match.club.slice(0, 2)}
                      </span>
                    </div>
                  </div>

                  {/* Club Name & Details */}
                  <div className="flex-1">
                    <h2 className="font-display text-[15px] font-black italic uppercase text-foreground">
                      {match.club}
                    </h2>
                    <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground font-semibold uppercase tracking-[0.04em] mt-1">
                      {match.court && <span>{match.court}</span>}
                      <span>{match.format} • Level {match.level_min.toFixed(1)}–{match.level_max.toFixed(1)}</span>
                    </div>
                  </div>
                </div>

                {/* TIME + SPOTS CALLOUT */}
                <div className="flex items-start justify-between border-b border-border/[0.08] pb-3 mb-3">
                  {/* Time */}
                  <div>
                    <div className="font-display text-[32px] font-black italic text-foreground leading-[0.95]">
                      {match.match_time.slice(0, 5)}
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground mt-0.5">
                      {timeUntilMatch}
                    </div>
                  </div>

                  {/* Spots */}
                  <div className="text-right">
                    <div className="font-display text-[18px] font-black italic text-amber-400">
                      {emptySlots} spot{emptySlots !== 1 ? "s" : ""}
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground mt-0.5">
                      left · 200 XP
                    </div>
                  </div>
                </div>

                {/* ALERTS */}
                {!isOnline && (
                  <div className="flex items-center gap-2 mb-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-medium">
                    <WifiOff className="w-4 h-4 shrink-0" />
                    {pendingCount > 0
                      ? `Offline · ${pendingCount} action${pendingCount !== 1 ? "s" : ""} queued`
                      : "Offline · will retry on reconnect"}
                  </div>
                )}

                {!userLevelFits && (
                  <div className="flex items-center gap-2 mb-3 p-2.5 rounded-xl bg-destructive/10 text-destructive text-xs font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Your level doesn't fit the required range
                  </div>
                )}

                {cancellationWindowClosed && (
                  <div className="flex items-start gap-2.5 mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-500">Cancellation window closed</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Deadline was {cancellationDeadlineFormatted}. Only an admin can remove you now.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* COURT VISUAL */}
              <div className="px-5 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-center text-muted-foreground mb-2">
                  {isAlreadyJoined ? "You're already in" : "Tap an empty spot"}
                </p>

                <div className="relative mx-auto" style={{ maxWidth: 320 }}>
                  {/* Court background */}
                  <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 overflow-hidden">
                    {/* Team A side */}
                    <div className="p-4 pb-2">
                      <div className="grid grid-cols-2 gap-3">
                        {slots.slice(0, 2).map((slot, i) => (
                          <CourtSlot
                            key={i}
                            slot={slot}
                            index={i}
                            canJoin={!isAlreadyJoined && userLevelFits && !joining && match.status !== "full" && match.status !== "completed" && match.status !== "cancelled"}
                            isCurrentUser={slot?.user_id === user?.id}
                            onJoin={() => handleJoinSlot(i)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Net */}
                    <div className="flex items-center gap-2 px-4 py-1.5">
                      <div className="h-px flex-1 bg-primary/40" style={{ backgroundImage: "repeating-linear-gradient(90deg, hsl(var(--primary) / 0.4) 0px, hsl(var(--primary) / 0.4) 4px, transparent 4px, transparent 8px)" }} />
                      <span className="text-[10px] text-primary/60 font-bold uppercase tracking-widest">Net</span>
                      <div className="h-px flex-1 bg-primary/40" style={{ backgroundImage: "repeating-linear-gradient(90deg, hsl(var(--primary) / 0.4) 0px, hsl(var(--primary) / 0.4) 4px, transparent 4px, transparent 8px)" }} />
                    </div>

                    {/* Team B side */}
                    <div className="p-4 pt-2">
                      <div className="grid grid-cols-2 gap-3">
                        {slots.slice(2, 4).map((slot, i) => (
                          <CourtSlot
                            key={i + 2}
                            slot={slot}
                            index={i + 2}
                            canJoin={!isAlreadyJoined && userLevelFits && !joining && match.status !== "full" && match.status !== "completed" && match.status !== "cancelled"}
                            isCurrentUser={slot?.user_id === user?.id}
                            onJoin={() => handleJoinSlot(i + 2)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Court center line overlay */}
                  <div className="absolute inset-0 pointer-events-none rounded-2xl">
                    <div className="absolute left-1/2 top-4 bottom-4 w-px bg-primary/15" />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* FOOTER: Actions */}
        {!loading && match && (
          <div className="px-5 pb-5 pt-3 border-t border-border/[0.08] space-y-3">
            {/* PRIMARY CTA - One button that adapts */}
            <button
              onClick={() => {
                if (ctaState.type === "claim") handleClaimSpot();
                else if (ctaState.type === "waitlist") handleJoinWaitlist();
                else if (ctaState.type === "request") handleRequestToJoin();
                else if (ctaState.type === "join") {
                  const firstEmptySlot = slots.findIndex((s) => !s);
                  if (firstEmptySlot !== -1) handleJoinSlot(firstEmptySlot);
                }
              }}
              disabled={joining || ctaState.type === "pending" || ctaState.type === "unavailable" || ctaState.type === "joined" || isAlreadyJoined}
              className={`w-full h-[52px] rounded-[16px] font-display text-[14px] font-black italic uppercase tracking-[0.04em] transition-all ${
                ctaState.type === "joined" || ctaState.type === "unavailable" || isAlreadyJoined
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : ctaState.type === "pending"
                  ? "bg-amber-500/20 text-amber-500 cursor-wait"
                  : `bg-primary text-primary-foreground shadow-[0_6px_24px_hsl(var(--primary)/0.35)] hover:shadow-[0_8px_32px_hsl(var(--primary)/0.4)]`
              }`}
            >
              {joining && ctaState.type !== "pending" ? "Loading…" : ctaState.label}
            </button>

            {/* BET LINK - Secondary, quiet */}
            {true && (
              <div className="text-center text-[11px] text-muted-foreground font-semibold">
                Also betting?{" "}
                <button
                  onClick={() => setShowBetModal(true)}
                  className="text-primary font-bold hover:underline"
                >
                  Add a bet →
                </button>
              </div>
            )}

            {/* CANCEL SPOT - Secondary, only if joined and can cancel */}
            {canCancel && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="w-full px-4 py-2 rounded-[12px] text-sm font-semibold text-destructive border border-destructive/30 hover:bg-destructive/5 transition-colors"
              >
                <LogOut className="inline-block w-3.5 h-3.5 mr-1.5 align-text-bottom" />
                Cancel my spot
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <BetModal matchId={matchId} open={showBetModal} onOpenChange={setShowBetModal} />
      {match && (
        <CancelRegistrationModal
          open={showCancelModal}
          onOpenChange={setShowCancelModal}
          matchId={match.id}
          matchClub={match.club}
          matchDate={match.match_date}
          matchTime={match.match_time}
          onCancelled={() => {
            onOpenChange(false);
            navigate("/matches");
          }}
        />
      )}
    </>
  );
};

const CourtSlot = ({
  slot,
  index,
  canJoin,
  isCurrentUser,
  onJoin,
}: {
  slot: PlayerSlot;
  index: number;
  canJoin: boolean;
  isCurrentUser: boolean;
  onJoin: () => void;
}) => {
  if (slot) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: index * 0.1 }}
        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors ${
          isCurrentUser
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card/60 border-border/20"
        }`}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
          isCurrentUser
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-muted"
        }`}>
          {slot.display_name?.[0]?.toUpperCase() || "?"}
        </div>
        <span className="text-xs font-semibold truncate max-w-full">{slot.display_name || "Player"}</span>
        {slot.padel_level != null && (
          <span className="text-[10px] opacity-80">Lvl {slot.padel_level.toFixed(1)}</span>
        )}
        {isCurrentUser && (
          <span className="text-[10px] font-semibold">You</span>
        )}
      </motion.div>
    );
  }

  return (
    <motion.button
      whileHover={canJoin ? { scale: 1.05 } : {}}
      whileTap={canJoin ? { scale: 0.95 } : {}}
      onClick={canJoin ? onJoin : undefined}
      disabled={!canJoin}
      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 transition-all min-h-[100px] ${
        canJoin
          ? "border-2 border-primary bg-primary/10 hover:shadow-[0_0_18px_hsl(var(--primary)/0.3)] cursor-pointer"
          : "border-2 border-border/20 bg-muted/30 cursor-not-allowed opacity-50"
      }`}
    >
      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
        canJoin ? "border-primary text-primary" : "border-border/30 text-muted-foreground"
      }`}>
        <span className="text-lg font-bold">+</span>
      </div>
      <span className={`text-xs font-medium ${canJoin ? "text-primary" : "text-muted-foreground"}`}>
        {canJoin ? "Tap to join" : "Empty"}
      </span>
    </motion.button>
  );
};

export default MatchJoinModal;
