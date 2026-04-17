import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Clock, Calendar, AlertTriangle, TrendingUp, ShieldAlert, LogOut, ListPlus, Zap, Send, WifiOff } from "lucide-react";
import CancelRegistrationModal from "@/components/CancelRegistrationModal";
import { supabase } from "@/integrations/supabase/client";
import { parseISO, addHours, isBefore, format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import StatusChip from "@/components/StatusChip";
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

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-card border-border/50 p-0">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !match ? (
          <div className="p-6 text-center text-muted-foreground">Match not found</div>
        ) : (
          <>
            {/* Header */}
            <div className="p-5 pb-0">
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="font-display text-xl">{match.club}</DialogTitle>
                    {match.court && <p className="text-sm text-muted-foreground mt-0.5">{match.court}</p>}
                  </div>
                  <StatusChip status={toStatusUI(match.status)} />
                </div>
              </DialogHeader>

              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{match.match_date}</span>
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{match.match_time.slice(0, 5)}</span>
              </div>

              <div className="flex gap-2 mt-3">
                <span className="text-xs bg-muted px-2.5 py-1 rounded-full font-medium capitalize">{match.format}</span>
                <span className="text-xs bg-muted px-2.5 py-1 rounded-full font-medium">Level {match.level_min.toFixed(1)}–{match.level_max.toFixed(1)}</span>
              </div>

              {!isOnline && (
                <div className="flex items-center gap-2 mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-medium">
                  <WifiOff className="w-4 h-4 shrink-0" />
                  {pendingCount > 0
                    ? `You're offline · ${pendingCount} action${pendingCount !== 1 ? 's' : ''} queued — will retry on reconnect`
                    : "You're offline · joining will be queued and retried automatically"}
                </div>
              )}

              {!userLevelFits && (
                <div className="flex items-center gap-2 mt-3 p-2.5 rounded-xl bg-destructive/10 text-destructive text-xs font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Your level doesn't fit the required range
                </div>
              )}

              {cancellationWindowClosed && (
                <div className="flex items-start gap-2.5 mt-3 p-3 rounded-xl bg-gold/10 border border-gold/20">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-gold mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-gold">Cancellation window closed</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      The deadline to cancel was {cancellationDeadlineFormatted}. Only an admin can remove you from this match now.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Padel Court Visual */}
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3 text-center">
                {isAlreadyJoined ? "You're already in this match" : "Tap an empty spot to join"}
              </p>
              <div className="relative mx-auto" style={{ maxWidth: 320 }}>
                {/* Court background */}
                <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 overflow-hidden">
                  {/* Net line */}
                  <div className="relative">
                    {/* Team A side */}
                    <div className="p-4 pb-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium text-center mb-2">Team A</p>
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
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium text-center mb-2">Team B</p>
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
                </div>

                {/* Court lines overlay */}
                <div className="absolute inset-0 pointer-events-none rounded-2xl">
                  {/* Center line */}
                  <div className="absolute left-1/2 top-4 bottom-4 w-px bg-primary/15" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 space-y-2">

              {/* Claim open spot from waitlist */}
              {userWaitlistEntry && confirmedCount < (match.max_players ?? 4) && (
                <Button onClick={handleClaimSpot} disabled={joining}
                  className="w-full h-12 rounded-xl font-semibold gap-2 bg-primary text-primary-foreground">
                  <Zap className="w-4 h-4" />
                  {joining ? "Claiming..." : "Claim Your Spot! ⚡"}
                </Button>
              )}

              {/* Join waitlist when full */}
              {!isAlreadyJoined && !userWaitlistEntry && !userJoinRequest && match.status === "full" && (
                <Button onClick={handleJoinWaitlist} disabled={joining} variant="outline"
                  className="w-full h-11 rounded-xl font-semibold gap-2 border-primary/40 text-primary hover:bg-primary/10">
                  <ListPlus className="w-4 h-4" />
                  {joining ? "Joining..." : "Join Waitlist"}
                </Button>
              )}

              {/* Request to join outside skill range */}
              {!isAlreadyJoined && !userWaitlistEntry && !userJoinRequest && !userLevelFits &&
               match.status !== "full" && match.status !== "cancelled" && match.status !== "completed" && (
                <Button onClick={handleRequestToJoin} disabled={joining} variant="outline"
                  className="w-full h-11 rounded-xl font-semibold gap-2 border-amber-500/40 text-amber-500 hover:bg-amber-500/10">
                  <Send className="w-4 h-4" />
                  {joining ? "Sending..." : "Request to Join (Outside Range)"}
                </Button>
              )}

              {/* Pending approval status */}
              {userJoinRequest && userJoinRequest.status === "pending" && (
                <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm font-medium">
                  <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                  Waiting for players to approve your request…
                </div>
              )}

              {canCancel && (
                <Button variant="outline" onClick={() => setShowCancelModal(true)}
                  className="w-full h-11 rounded-xl font-semibold gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                  <LogOut className="w-4 h-4" />
                  Cancel My Spot
                </Button>
              )}
              <Button onClick={() => setShowBetModal(true)} variant="outline"
                className="w-full h-11 rounded-xl font-semibold gap-2 border-primary/30 text-primary hover:bg-primary/10">
                <TrendingUp className="w-4 h-4" />
                Bet Points
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full h-11 rounded-xl">
                Close
              </Button>
            </div>

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
        )}
      </DialogContent>
    </Dialog>
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
            ? "bg-primary/20 border-primary/40"
            : "bg-card border-border/50"
        }`}
      >
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
          {slot.display_name?.[0]?.toUpperCase() || "?"}
        </div>
        <span className="text-xs font-semibold truncate max-w-full">{slot.display_name || "Player"}</span>
        {slot.padel_level != null && (
          <span className="text-[10px] text-muted-foreground">Lvl {slot.padel_level.toFixed(1)}</span>
        )}
        {isCurrentUser && (
          <span className="text-[10px] text-primary font-semibold">You</span>
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
      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 border-dashed transition-all min-h-[100px] ${
        canJoin
          ? "border-primary/50 bg-primary/5 hover:bg-primary/10 hover:border-primary cursor-pointer"
          : "border-border/30 bg-muted/30 cursor-not-allowed opacity-50"
      }`}
    >
      <div className={`w-10 h-10 rounded-full border-2 border-dashed flex items-center justify-center ${
        canJoin ? "border-primary/50 text-primary" : "border-border/30 text-muted-foreground"
      }`}>
        <span className="text-lg">+</span>
      </div>
      <span className={`text-xs font-medium ${canJoin ? "text-primary" : "text-muted-foreground"}`}>
        {canJoin ? "Join here" : "Empty"}
      </span>
    </motion.button>
  );
};

export default MatchJoinModal;
