import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Calendar, DollarSign, LogOut, AlertTriangle, UserMinus, XCircle, MessageSquare, Zap, Globe, Lock, Share2, MapPin, User, ShieldCheck, Coins } from "lucide-react";
import SlotActionModal from "@/components/SlotActionModal";
import InvitePlayerModal from "@/components/InvitePlayerModal";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import StatusChip from "@/components/StatusChip";
import type { Enums } from "@/integrations/supabase/types";

import BetModal from "@/components/BetModal";
import MatchBettingSection from "@/components/MatchBettingSection";

import AfterGameCard from "@/components/aftergame/AfterGameCard";
import ScoreUploadModal from "@/components/aftergame/ScoreUploadModal";
import ScoreReviewModal from "@/components/aftergame/ScoreReviewModal";
import MatchResultTimeline from "@/components/aftergame/MatchResultTimeline";
import RemovePlayerModal from "@/components/admin/RemovePlayerModal";
import CancelRegistrationModal from "@/components/CancelRegistrationModal";
import PlayerProfileModal from "@/components/PlayerProfileModal";
import { useAdmin } from "@/contexts/AdminContext";
import { useMatchChat } from "@/hooks/useMatchChat";
import { format, parseISO, addHours, isBefore } from "date-fns";

type Match = {
  id: string;
  club: string;
  court: string | null;
  match_date: string;
  match_time: string;
  format: string;
  level_min: number;
  level_max: number;
  max_players: number;
  price_per_player: number | null;
  visibility: string;
  notes: string | null;
  status: string;
  organizer_id: string;
  deadline_at: string | null;
  score_deadline_at: string | null;
  score_winner: string | null;
  cancelled_reason: string | null;
};

type EscrowLedger = {
  id: string;
  total_charged_cents: number;
  total_refunded_cents: number;
  per_spot_full_price_cents: number;
  organiser_share_cents: number;
  spots_count: number;
  currency: string;
  status: string;
} | null;

type MatchPlayer = {
  id: string;
  user_id: string;
  status: string;
  team: string | null;
  joined_at: string;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
    padel_level: number | null;
  } | null;
};

type Submission = {
  id: string;
  match_id: string;
  submitted_by: string;
  submitter_name: string | null;
  team_a_set_1: number | null;
  team_b_set_1: number | null;
  team_a_set_2: number | null;
  team_b_set_2: number | null;
  team_a_set_3: number | null;
  team_b_set_3: number | null;
  result_type: string;
  comment: string | null;
  status: string;
  submitted_at: string;
};

type TimelineEvent = {
  id: string;
  type: "submission" | "review_validated" | "review_requested" | "auto_closed" | "draw_confirmed";
  actor_name: string | null;
  note: string | null;
  created_at: string;
  score_summary?: string;
};

const levelToCategory = (level: number | null): 1 | 2 | 3 | 4 | 5 => {
  if (!level) return 5;
  if (level >= 6) return 1;
  if (level >= 4.5) return 2;
  if (level >= 3) return 3;
  if (level >= 1.5) return 4;
  return 5;
};

const AFTER_GAME_STATUSES = ["awaiting_score", "score_submitted", "pending_review", "review_requested", "confirmed", "completed", "draw", "closed_as_draw", "auto_closed"];

const MatchDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<MatchPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showBetModal, setShowBetModal] = useState(false);
  const [showScoreUpload, setShowScoreUpload] = useState(false);
  const [showScoreReview, setShowScoreReview] = useState(false);
  const [latestSubmission, setLatestSubmission] = useState<Submission | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [cancellationHours, setCancellationHours] = useState<number>(24);
  const [cancellationEnabled, setCancellationEnabled] = useState(true);
  const [showRemovePlayer, setShowRemovePlayer] = useState<{ userId: string; name: string } | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCancelMatchConfirm, setShowCancelMatchConfirm] = useState(false);
  const [cancellingMatch, setCancellingMatch] = useState(false);
  const [showVisibilityConfirm, setShowVisibilityConfirm] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const { isAdmin } = useAdmin();
  const { getOrCreateMatchChat, addPlayerToMatchChat, removePlayerFromMatchChat, addSystemMessage } = useMatchChat();
  const [openingChat, setOpeningChat] = useState(false);
  const [slotAction, setSlotAction] = useState<{ team: string; slotIndex: number } | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [joinRequests, setJoinRequests] = useState<{
    id: string; user_id: string; status: string; created_at: string;
    display_name: string | null; padel_level: number | null; approvals: string[];
  }[]>([]);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [inviteTarget, setInviteTarget] = useState<{ team: string; slotIndex: number }>({ team: "A", slotIndex: 0 });
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null);
  const [escrow, setEscrow] = useState<EscrowLedger>(null);
  // Private cancel window in hours — loaded from club config when available, fallback 12h
  const [privateCancelWindowHours, setPrivateCancelWindowHours] = useState<number>(12);

  const fetchMatch = useCallback(async () => {
    if (!id) return;

    const [{ data: matchData }, { data: playerData }] = await Promise.all([
      supabase.from("matches").select("*").eq("id", id).maybeSingle(),
      supabase.from("match_players").select("*").eq("match_id", id),
    ]);

    // Fetch profiles for players
    if (playerData && playerData.length > 0) {
      const userIds = playerData.map((p) => p.user_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, padel_level")
        .in("user_id", userIds);

      const enriched = playerData.map((p) => ({
        ...p,
        profiles: profilesData?.find((pr) => pr.user_id === p.user_id) || null,
      }));
      setPlayers(enriched as MatchPlayer[]);
    } else {
      setPlayers([]);
    }

    setMatch(matchData as Match);

    // Fetch escrow ledger for private matches
    if (matchData?.visibility === "private") {
      const { data: escrowData } = await supabase
        .from("match_escrow_ledger")
        .select("id, total_charged_cents, total_refunded_cents, per_spot_full_price_cents, organiser_share_cents, spots_count, currency, status")
        .eq("match_id", id)
        .eq("status", "active")
        .maybeSingle();
      setEscrow((escrowData as EscrowLedger) ?? null);
    } else {
      setEscrow(null);
    }

    // Fetch score submissions and reviews for after-game flow
    if (matchData && AFTER_GAME_STATUSES.includes(matchData.status)) {
      await fetchAfterGameData(id, playerData || []);
    }

    setLoading(false);
  }, [id]);

  const fetchAfterGameData = async (matchId: string, playerData: any[]) => {
    const { data: submissions } = await supabase
      .from("score_submissions")
      .select("*")
      .eq("match_id", matchId)
      .order("submitted_at", { ascending: false });

    const allUserIds = new Set<string>();
    (submissions || []).forEach((s: any) => allUserIds.add(s.submitted_by));

    // Get reviews
    const submissionIds = (submissions || []).map((s: any) => s.id);
    let reviews: any[] = [];
    if (submissionIds.length > 0) {
      const { data: reviewData } = await supabase
        .from("score_reviews")
        .select("*")
        .in("submission_id", submissionIds)
        .order("created_at", { ascending: false });
      reviews = reviewData || [];
      reviews.forEach((r: any) => allUserIds.add(r.reviewed_by));
    }

    // Fetch names
    const nameMap = new Map<string, string>();
    if (allUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", Array.from(allUserIds));
      (profiles || []).forEach((p) => nameMap.set(p.user_id, p.display_name || "Player"));
    }

    // Latest pending submission
    const pending = (submissions || []).find((s: any) => s.status === "pending");
    if (pending) {
      setLatestSubmission({
        ...pending,
        submitter_name: nameMap.get(pending.submitted_by) || "Player",
      } as Submission);
    } else {
      setLatestSubmission(null);
    }

    // Build timeline
    const events: TimelineEvent[] = [];
    (submissions || []).forEach((s: any) => {
      const scoreParts = [
        s.team_a_set_1 !== null ? `${s.team_a_set_1}-${s.team_b_set_1}` : null,
        s.team_a_set_2 !== null ? `${s.team_a_set_2}-${s.team_b_set_2}` : null,
        s.team_a_set_3 !== null ? `${s.team_a_set_3}-${s.team_b_set_3}` : null,
      ].filter(Boolean).join(" / ");

      events.push({
        id: s.id,
        type: "submission",
        actor_name: nameMap.get(s.submitted_by) || null,
        note: s.comment,
        created_at: s.submitted_at,
        score_summary: scoreParts || (s.result_type === "draw" ? "Draw" : undefined),
      });
    });

    reviews.forEach((r: any) => {
      events.push({
        id: r.id,
        type: r.action === "validated" ? "review_validated" : "review_requested",
        actor_name: nameMap.get(r.reviewed_by) || null,
        note: r.review_note,
        created_at: r.created_at,
      });
    });

    events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    setTimelineEvents(events);
  };

  const fetchJoinRequests = async () => {
    if (!id) return;
    const { data: requests } = await supabase
      .from("match_join_requests").select("id, user_id, status, created_at")
      .eq("match_id", id).eq("status", "pending");
    if (!requests || requests.length === 0) { setJoinRequests([]); return; }
    const userIds = requests.map((r) => r.user_id);
    const [{ data: profiles }, { data: approvals }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, padel_level").in("user_id", userIds),
      supabase.from("match_join_approvals").select("request_id, approver_id").in("request_id", requests.map((r) => r.id)),
    ]);
    setJoinRequests(requests.map((r) => ({
      ...r,
      display_name: profiles?.find((p) => p.user_id === r.user_id)?.display_name ?? null,
      padel_level: profiles?.find((p) => p.user_id === r.user_id)?.padel_level ?? null,
      approvals: (approvals || []).filter((a) => a.request_id === r.id).map((a) => a.approver_id),
    })));
  };

  useEffect(() => { fetchMatch(); fetchJoinRequests(); }, [fetchMatch]);

  // Fetch cancellation settings
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

  // Realtime: refresh when match_players change
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`match-players-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'match_players',
        filter: `match_id=eq.${id}`,
      }, () => { fetchMatch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchMatch]);

  // Handle switching team
  const handleSwitchTeam = async (targetTeam: "A" | "B") => {
    if (!user || !match) return;
    const targetCount = confirmedPlayers.filter(p => p.team === targetTeam).length;
    if (targetCount >= 2) {
      toast({ title: "Team full", description: "No space on that team.", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("match_players")
      .update({ team: targetTeam })
      .eq("match_id", match.id)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Switched to ${targetTeam === "A" ? "Team A" : "Team B"} 🔄` });
      fetchMatch();
    }
    setSlotAction(null);
  };

  // Handle joining a specific slot on the court
  const handleSlotJoin = async (team: string) => {
    if (!user || !match) return;
    setJoining(true);

    const { error } = await supabase.from("match_players").insert({
      match_id: match.id,
      user_id: user.id,
      status: "confirmed",
      team,
    });

    if (error) {
      if (error.message.includes("duplicate") || error.message.includes("unique")) {
        toast({ title: "Slot taken", description: "This spot was just filled. Try another!", variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "You joined the match! 🎾" });
      // Auto-add to match chat
      addPlayerToMatchChat(match.id, user.id);
      const newCount = confirmedPlayers.length + 1;
      if (newCount >= match.max_players) {
        await supabase.from("matches").update({ status: "full" }).eq("id", match.id);
      } else if (newCount >= match.max_players - 1) {
        await supabase.from("matches").update({ status: "almost_full" }).eq("id", match.id);
      }
      // Recalculate betting odds
      if (match.format !== "social") {
        await supabase.functions.invoke("update-match-factor", { body: { match_id: match.id } });
      }
      fetchMatch();
    }
    setSlotAction(null);
    setJoining(false);
  };

  const confirmedPlayers = players.filter((p) => p.status === "confirmed");
  const waitlistPlayers = players.filter((p) => p.status === "waitlist");
  const isJoined = players.some((p) => p.user_id === user?.id && p.status === "confirmed");
  const isWaitlisted = players.some((p) => p.user_id === user?.id && p.status === "waitlist");
  const isOrganizer = match?.organizer_id === user?.id;
  const isFull = confirmedPlayers.length >= (match?.max_players ?? 4);
  const spotsLeft = (match?.max_players ?? 4) - confirmedPlayers.length;
  const isPlayerInMatch = players.some((p) => p.user_id === user?.id && p.status === "confirmed");
  const isAfterGame = match ? AFTER_GAME_STATUSES.includes(match.status) : false;

  // Calculate if player can still cancel
  const canPlayerCancel = (() => {
    if (!match || !isJoined || !cancellationEnabled) return false;
    if (isAfterGame || ["cancelled", "completed"].includes(match.status)) return false;
    try {
      const matchStart = parseISO(`${match.match_date}T${match.match_time}`);
      // Private matches: non-organisers are hard-blocked inside privateCancelWindowHours
      if (match.visibility === "private" && !isOrganizer) {
        const privateDeadline = addHours(matchStart, -privateCancelWindowHours);
        if (!isBefore(new Date(), privateDeadline)) return false;
      }
      const deadline = addHours(matchStart, -cancellationHours);
      return isBefore(new Date(), deadline);
    } catch {
      return false;
    }
  })();

  // Whether we're inside the private cancellation window (for UI warnings)
  const isInsidePrivateCancelWindow = (() => {
    if (!match || match.visibility !== "private") return false;
    try {
      const matchStart = parseISO(`${match.match_date}T${match.match_time}`);
      const privateDeadline = addHours(matchStart, -privateCancelWindowHours);
      return !isBefore(new Date(), privateDeadline);
    } catch {
      return false;
    }
  })();

  const userLevelFits = profile?.padel_level != null && match
    ? profile.padel_level >= match.level_min && profile.padel_level <= match.level_max
    : true;

  // Determine user's team and the submitter's team
  const currentPlayerEntry = players.find((p) => p.user_id === user?.id);
  const submitterEntry = latestSubmission ? players.find((p) => p.user_id === latestSubmission.submitted_by) : null;
  const userTeam = currentPlayerEntry?.team;
  const submitterTeam = submitterEntry?.team;

  // Can submit: any player when awaiting_score, or the non-reviewing team when review_requested
  const canSubmitScore = isPlayerInMatch && (
    match?.status === "awaiting_score" ||
    (match?.status === "review_requested" && submitterTeam && userTeam === submitterTeam)
  );

  // Can review: opposing team when pending_review
  const canReviewScore = isPlayerInMatch && latestSubmission != null && (
    match?.status === "pending_review" && userTeam !== submitterTeam
  );

  const teamAPlayers = confirmedPlayers.filter((p) => p.team === "A").map((p) => ({
    user_id: p.user_id,
    display_name: p.profiles?.display_name || null,
    team: p.team,
  }));
  const teamBPlayers = confirmedPlayers.filter((p) => p.team === "B").map((p) => ({
    user_id: p.user_id,
    display_name: p.profiles?.display_name || null,
    team: p.team,
  }));
  const allTeamPlayers = [...teamAPlayers, ...teamBPlayers];

  // Result summary for resolved matches
  const getResultSummary = () => {
    const m = match as any;
    // Prefer score_winner on the match (set by our new edge functions / cron)
    if (m?.score_winner && m.score_winner !== "draw") {
      const score = latestSubmission ? [
        latestSubmission.team_a_set_1 !== null ? `${latestSubmission.team_a_set_1}-${latestSubmission.team_b_set_1}` : null,
        latestSubmission.team_a_set_2 !== null ? `${latestSubmission.team_a_set_2}-${latestSubmission.team_b_set_2}` : null,
        latestSubmission.team_a_set_3 !== null ? `${latestSubmission.team_a_set_3}-${latestSubmission.team_b_set_3}` : null,
      ].filter(Boolean).join(" / ") : "";
      return `Team ${m.score_winner} wins${score ? ` — ${score}` : ""}`;
    }
    if (m?.score_winner === "draw") return "Draw — 0-0";

    if (!latestSubmission) return null;
    const s = latestSubmission;
    const score = [
      s.team_a_set_1 !== null ? `${s.team_a_set_1}-${s.team_b_set_1}` : null,
      s.team_a_set_2 !== null ? `${s.team_a_set_2}-${s.team_b_set_2}` : null,
      s.team_a_set_3 !== null ? `${s.team_a_set_3}-${s.team_b_set_3}` : null,
    ].filter(Boolean).join(" / ");

    if (s.result_type === "team_a_win") return `Team A wins — ${score}`;
    if (s.result_type === "team_b_win") return `Team B wins — ${score}`;
    return `Draw — ${score || "No score"}`;
  };

  const lastReviewNote = timelineEvents.filter((e) => e.type === "review_requested").pop()?.note || null;

  const handleJoin = async () => {
    if (!user || !match) return;
    setJoining(true);

    // ── Private match: use edge function to trigger escrow partial refund ──
    if (match.visibility === "private" && escrow) {
      const { data, error } = await supabase.functions.invoke("process-private-match-player-join", {
        body: { match_id: match.id },
      });
      if (error || data?.error) {
        toast({ title: "Could not join match", description: data?.error ?? error?.message, variant: "destructive" });
        setJoining(false);
        return;
      }
      toast({
        title: "Joined private match!",
        description: escrow.per_spot_full_price_cents > 0
          ? `The organiser has been refunded £${(escrow.per_spot_full_price_cents / 100).toFixed(0)} for your spot.`
          : "You've been added to the match.",
      });
      addPlayerToMatchChat(match.id, user.id);
      fetchMatch();
      setJoining(false);
      return;
    }

    // ── Public / free private match: direct insert ─────────────────────────
    const status = isFull ? "waitlist" : "confirmed";

    // Auto-assign team
    const teamACnt = confirmedPlayers.filter((p) => p.team === "A").length;
    const teamBCnt = confirmedPlayers.filter((p) => p.team === "B").length;
    const team = teamACnt <= teamBCnt ? "A" : "B";

    const { error } = await supabase.from("match_players").insert({
      match_id: match.id,
      user_id: user.id,
      status,
      team: status === "confirmed" ? team : null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: status === "waitlist" ? "Added to waitlist" : "Joined match!" });
      if (status === "confirmed") {
        addPlayerToMatchChat(match.id, user.id);
      }
      const newCount = confirmedPlayers.length + (status === "confirmed" ? 1 : 0);
      if (newCount >= match.max_players) {
        await supabase.from("matches").update({ status: "full" }).eq("id", match.id);
      } else if (newCount >= match.max_players - 1) {
        await supabase.from("matches").update({ status: "almost_full" }).eq("id", match.id);
      }
      if (status === "confirmed" && match.format !== "social") {
        await supabase.functions.invoke("update-match-factor", { body: { match_id: match.id } });
      }
      fetchMatch();
    }
    setJoining(false);
  };

  const handleLeave = async () => {
    if (!user || !match) return;
    // Waitlisted players can always leave; confirmed players need to be within cancellation window
    if (!isWaitlisted && !canPlayerCancel) {
      toast({ title: "Can't cancel", description: "Cancellation window has closed. Contact an admin.", variant: "destructive" });
      return;
    }
    setJoining(true);
    const { error } = await supabase
      .from("match_players")
      .delete()
      .eq("match_id", match.id)
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Left match" });
      removePlayerFromMatchChat(match.id, user.id, "left");
      // Notify first waitlisted player — they must claim the spot themselves
      if (waitlistPlayers.length > 0) {
        const next = waitlistPlayers[0];
        await supabase.rpc("create_notification_for_user", {
          _user_id: next.user_id,
          _type: "match_update",
          _title: "⚡ A spot just opened!",
          _body: `A place is available in the match at ${match.club}. Open the app to claim it — first come, first served!`,
          _link: `/matches/${match.id}`,
        });
      }
      await supabase.from("matches").update({ status: "open" }).eq("id", match.id);
      // Recalculate betting odds
      if (match.format !== "social") {
        await supabase.functions.invoke("update-match-factor", { body: { match_id: match.id } });
      }
      fetchMatch();
    }
    setJoining(false);
  };

  const handleCancelMatch = async () => {
    if (!user || !match || cancellingMatch) return;
    setCancellingMatch(true);

    // Update match status to cancelled
    await supabase.from("matches").update({ status: "cancelled" }).eq("id", match.id);

    // Refund all active stakes
    const { data: stakes } = await supabase
      .from("match_stakes")
      .select("id, user_id, points_staked")
      .eq("match_id", match.id)
      .eq("status", "active");

    if (stakes && stakes.length > 0) {
      for (const stake of stakes) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("padel_park_points")
          .eq("user_id", stake.user_id)
          .maybeSingle();

        if (prof) {
          const newBalance = prof.padel_park_points + stake.points_staked;
          await supabase.from("profiles").update({ padel_park_points: newBalance }).eq("user_id", stake.user_id);
          await supabase.from("points_transactions").insert({
            user_id: stake.user_id,
            transaction_type: "refunded",
            amount: stake.points_staked,
            balance_before: prof.padel_park_points,
            balance_after: newBalance,
            related_match_id: match.id,
            related_stake_id: stake.id,
            reason: "Match cancelled by organizer",
          });
        }
        await supabase.from("match_stakes").update({
          status: "settled",
          settled_at: new Date().toISOString(),
        }).eq("id", stake.id);
      }
    }

    // Notify all players
    const allPlayers = players.filter((p) => p.user_id !== user.id && p.status === "confirmed");
    if (allPlayers.length > 0) {
      await Promise.all(allPlayers.map((p) =>
        supabase.rpc("create_notification_for_user", {
          _user_id: p.user_id,
          _type: "warning",
          _title: "Match cancelled",
          _body: `The match at ${match.club} on ${match.match_date} has been cancelled by the organizer.${stakes && stakes.some((s) => s.user_id === p.user_id) ? " Your staked points have been refunded." : ""}`,
          _link: `/matches/${match.id}`,
        })
      ));
    }

    // System message in match chat
    await addSystemMessage(match.id, "Match cancelled by the organizer");

    toast({ title: "Match cancelled", description: "All players have been notified and stakes refunded." });
    setCancellingMatch(false);
    navigate("/matches");
  };

  const handleDeadlineExpired = async () => {
    if (!match) return;
    toast({ title: "Deadline passed", description: "Match will be auto-closed as a draw." });
    fetchMatch();
  };

  const handleMarkDraw = async () => {
    if (!user || !match) return;
    const { error } = await supabase.from("score_submissions").insert({
      match_id: match.id,
      submitted_by: user.id,
      result_type: "draw",
      comment: "Marked as draw by player",
      status: "pending",
    });

    if (!error) {
      await supabase.from("matches").update({ status: "pending_review" }).eq("id", match.id);
      toast({ title: "Draw submitted", description: "Waiting for opponent confirmation." });
      fetchMatch();
    }
  };

  const handleApproveRequest = async (request: typeof joinRequests[0]) => {
    if (!user || !match) return;
    setProcessingRequest(request.id);
    await supabase.from("match_join_approvals").insert({ request_id: request.id, approver_id: user.id });
    const newApprovals = [...request.approvals, user.id];
    const allApproved = confirmedPlayers.every((p) => newApprovals.includes(p.user_id));
    if (allApproved) {
      const teamACnt = confirmedPlayers.filter((p) => p.team === "A").length;
      const teamBCnt = confirmedPlayers.filter((p) => p.team === "B").length;
      const team = teamACnt <= teamBCnt ? "A" : "B";
      await supabase.from("match_players").insert({ match_id: match.id, user_id: request.user_id, status: "confirmed", team });
      await supabase.from("match_join_requests").update({ status: "approved" }).eq("id", request.id);
      await supabase.rpc("create_notification_for_user", {
        _user_id: request.user_id, _type: "match_update", _title: "Request approved! 🎾",
        _body: `All players approved your request. You're now in the match at ${match.club}!`,
        _link: `/matches/${match.id}`,
      });
      toast({ title: "Request approved", description: `${request.display_name || "Player"} has been added.` });
    } else {
      toast({ title: "Approval recorded", description: `Waiting for ${confirmedPlayers.length - newApprovals.length} more player(s).` });
    }
    fetchMatch(); fetchJoinRequests(); setProcessingRequest(null);
  };

  const handleRejectRequest = async (request: typeof joinRequests[0]) => {
    if (!user || !match) return;
    setProcessingRequest(request.id);
    await supabase.from("match_join_requests").update({ status: "rejected" }).eq("id", request.id);
    await supabase.rpc("create_notification_for_user", {
      _user_id: request.user_id, _type: "match_update", _title: "Request declined",
      _body: `Your request to join the match at ${match.club} was declined.`,
      _link: `/matches/${match.id}`,
    });
    toast({ title: "Request declined" });
    fetchJoinRequests(); setProcessingRequest(null);
  };

  if (loading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-muted-foreground">Match not found.</p>
        <Button variant="outline" onClick={() => navigate("/matches")} className="mt-4">Back to Matches</Button>
      </div>
    );
  }

  // ── Cancelled tombstone ────────────────────────────────────────────────────
  if (match.status === "cancelled") {
    const wasAutoCancel = match.cancelled_reason === "auto_cancelled_unfilled";
    const wasPlayer = players.some((p) => p.user_id === user?.id);
    const matchDateStr = match.match_date
      ? format(new Date(match.match_date + "T00:00:00"), "EEEE d MMMM")
      : "TBD";

    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center px-4 py-4">
          <button
            onClick={() => navigate("/matches")}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col items-center justify-center px-6 pb-16 text-center space-y-6"
        >
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="w-10 h-10 text-destructive/70" />
          </div>

          {/* Heading */}
          <div className="space-y-1.5">
            <h2 className="font-display text-2xl font-black italic uppercase text-foreground leading-tight">
              Match Cancelled
            </h2>
            <p className="text-sm text-muted-foreground">
              {wasAutoCancel
                ? "This match didn't reach the minimum number of players and was automatically cancelled."
                : "This match was cancelled by the organiser."}
            </p>
          </div>

          {/* Match details tombstone card */}
          <div className="w-full max-w-sm rounded-2xl border border-border/40 bg-card p-4 space-y-3 text-left">
            <div className="flex items-center gap-2 text-muted-foreground/60">
              <div className="w-1 h-full self-stretch rounded-full bg-destructive/30" />
              <div className="flex-1 space-y-1">
                <p className="text-[13px] font-bold text-foreground/70 line-through">{match.club}</p>
                <p className="text-[11px] text-muted-foreground">
                  {matchDateStr} · {match.match_time?.slice(0, 5) ?? ""}
                </p>
                <p className="text-[11px] text-muted-foreground capitalize">
                  {match.format} · Level {match.level_min.toFixed(1)}–{match.level_max.toFixed(1)}
                </p>
              </div>
            </div>

            {wasAutoCancel && (
              <div className="flex items-start gap-2 pt-1 border-t border-border/30">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-400/90">
                  No charges applied — any payments have been fully refunded.
                </p>
              </div>
            )}

            {wasPlayer && !wasAutoCancel && (
              <div className="flex items-start gap-2 pt-1 border-t border-border/30">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-400/90">
                  You were enrolled. Any stakes or payments have been refunded.
                </p>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="w-full max-w-sm space-y-2">
            <Button
              onClick={() => navigate("/matches")}
              className="w-full h-13 rounded-2xl font-bold text-sm gap-2"
            >
              Find Another Match
            </Button>
            <button
              onClick={() => navigate("/matches")}
              className="w-full text-center text-xs text-muted-foreground py-2 hover:text-foreground transition-colors"
            >
              Back to all matches
            </button>
          </div>
        </motion.div>
      </div>
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  const isPreGame = !isAfterGame && !["cancelled", "completed"].includes(match.status);

  const teamALevel = confirmedPlayers
    .filter(p => p.team === "A" && p.profiles?.padel_level)
    .reduce((sum, p) => sum + (p.profiles?.padel_level || 0), 0);
  const teamBLevel = confirmedPlayers
    .filter(p => p.team === "B" && p.profiles?.padel_level)
    .reduce((sum, p) => sum + (p.profiles?.padel_level || 0), 0);
  const totalLevel = teamALevel + teamBLevel || 1;

  const matchIdShort = match.id.slice(-3).toUpperCase();

  const handleShare = async () => {
    try {
      await navigator.share({ title: `Match at ${match.club}`, url: window.location.href });
    } catch {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied!" });
    }
  };

  const renderPlayerSlot = (team: "A" | "B", index: number) => {
    const teamPlayers = confirmedPlayers.filter(p => p.team === team);
    const player = teamPlayers[index];

    if (player) {
      return (
        <button
          onClick={() => setViewPlayerId(player.user_id)}
          className="flex items-center gap-3 py-2.5 w-full text-left hover:bg-muted/30 rounded-lg transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
            {player.profiles?.display_name?.[0]?.toUpperCase() || "?"}
          </div>
          <span className="text-sm font-medium flex-1 truncate">{player.profiles?.display_name || "Player"}</span>
          <span className="text-xs font-semibold text-primary">
            {player.profiles?.padel_level?.toFixed(1) || "N/A"}
          </span>
        </button>
      );
    }

    return (
      <button
        onClick={() => isPreGame && user && setSlotAction({ team, slotIndex: index })}
        className="flex items-center gap-3 py-2.5 w-full text-left group"
        disabled={!isPreGame || !user}
      >
        <div className="w-9 h-9 rounded-full bg-muted/50 border border-dashed border-muted-foreground/30 flex items-center justify-center group-hover:border-primary/50 transition-colors">
          <User className="w-4 h-4 text-muted-foreground/50" />
        </div>
        <span className="text-sm italic text-muted-foreground/60 flex-1">Waiting...</span>
        <span className="text-xs text-muted-foreground/40">N/A</span>
      </button>
    );
  };

  return (
    <div className="pb-24">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-4">
        <button onClick={() => navigate("/matches")} className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-bold text-lg">Match Detail</h1>
        <button onClick={handleShare} className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-muted transition-colors">
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 space-y-4">
        {/* Status + ID row */}
        <div className="flex items-center justify-between">
          <StatusChip status={match.status} />
          <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full">
            Match ID: #XP-{matchIdShort}
          </span>
        </div>

        {/* After-game card */}
        {isAfterGame && (
          <AfterGameCard
            status={match.status}
            deadlineAt={(match as any).score_deadline_at ?? match.deadline_at}
            isPlayerInMatch={isPlayerInMatch}
            canSubmitScore={canSubmitScore}
            canReviewScore={canReviewScore}
            lastSubmitterName={latestSubmission?.submitter_name || null}
            lastReviewNote={lastReviewNote}
            resultSummary={getResultSummary()}
            onUploadScore={() => setShowScoreUpload(true)}
            onReviewScore={() => setShowScoreReview(true)}
            onMarkDraw={handleMarkDraw}
            onDeadlineExpired={handleDeadlineExpired}
          />
        )}

        {/* Club hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="font-display text-2xl font-bold">{match.club}</h2>
          {match.court && <p className="text-sm text-muted-foreground mt-0.5">{match.court}</p>}
        </motion.div>

        {/* Info pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <div className="flex items-center gap-1.5 bg-surface-container px-3 py-2 rounded-xl text-sm whitespace-nowrap">
            <Calendar className="w-4 h-4 text-primary" />
            <span>{format(new Date(match.match_date + "T00:00:00"), "EEE d MMM")} · {match.match_time.slice(0, 5)} <span className="text-xs text-muted-foreground">(club time)</span></span>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-container px-3 py-2 rounded-xl text-sm whitespace-nowrap">
            <Clock className="w-4 h-4 text-primary" />
            <span>90 min</span>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-container px-3 py-2 rounded-xl text-sm whitespace-nowrap">
            <MapPin className="w-4 h-4 text-primary" />
            <span>{match.club.split(" ").slice(-1)[0]}</span>
          </div>
          {match.price_per_player != null && match.price_per_player > 0 && (
            <div className="flex items-center gap-1.5 bg-surface-container px-3 py-2 rounded-xl text-sm whitespace-nowrap">
              <DollarSign className="w-4 h-4 text-primary" />
              <span>€{Number(match.price_per_player).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium capitalize">{match.format}</span>
          <span className="text-xs bg-muted px-2.5 py-1 rounded-full font-medium">Level {match.level_min.toFixed(1)} – {match.level_max.toFixed(1)}</span>
          <span className="flex items-center gap-1 text-xs bg-muted px-2.5 py-1 rounded-full font-medium capitalize">
            {match.visibility === "public" ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            {match.visibility}
          </span>
        </div>

        {match.notes && (
          <p className="text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-3">{match.notes}</p>
        )}

        {/* Spots indicator */}
        {isPreGame && (
          <div className={`text-center text-sm font-semibold py-2 rounded-xl ${
            spotsLeft === 0 ? "bg-destructive/10 text-destructive" : spotsLeft === 1 ? "bg-yellow-500/10 text-yellow-500" : "bg-primary/10 text-primary"
          }`}>
            {spotsLeft === 0 ? "Match is full" : `${spotsLeft} spot${spotsLeft > 1 ? "s" : ""} left`}
          </div>
        )}

        {/* Team VS Panel */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-border/50 overflow-hidden bg-card"
        >
          {/* VS Header */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center bg-surface-container">
            <span className="text-xs font-bold uppercase tracking-widest text-center py-3 text-primary">Team A</span>
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-3">VS</span>
            <span className="text-xs font-bold uppercase tracking-widest text-center py-3 text-primary">Team B</span>
          </div>

          {/* Player rows */}
          <div className="grid grid-cols-2 divide-x divide-border/30">
            <div className="px-3 py-1 space-y-0.5">
              {renderPlayerSlot("A", 0)}
              <div className="border-t border-border/20" />
              {renderPlayerSlot("A", 1)}
            </div>
            <div className="px-3 py-1 space-y-0.5">
              {renderPlayerSlot("B", 0)}
              <div className="border-t border-border/20" />
              {renderPlayerSlot("B", 1)}
            </div>
          </div>

          {/* Skill delta bar */}
          <div className="px-4 py-3 bg-surface-container/50 border-t border-border/30">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              <span>Team A Lvl: {teamALevel.toFixed(1)}</span>
              <span className="text-primary/70">Skill Delta</span>
              <span>Team B Lvl: {teamBLevel.toFixed(1)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-500"
                style={{ width: `${(teamALevel / totalLevel) * 100}%` }}
              />
            </div>
          </div>
        </motion.div>

        {/* Admin: remove player buttons */}
        {isAdmin && isPreGame && confirmedPlayers.length > 0 && (
          <div className="rounded-xl border border-border/50 p-3 space-y-2 bg-card">
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Manage Players</p>
            {confirmedPlayers.map(p => (
              <div key={p.id} className="flex items-center justify-between">
                <span className="text-sm">{p.profiles?.display_name || "Player"}</span>
                <button
                  onClick={() => setShowRemovePlayer({ userId: p.user_id, name: p.profiles?.display_name || "Player" })}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Waitlist */}
        {waitlistPlayers.length > 0 && (
          <div>
            <h3 className="font-display font-bold mb-3 text-muted-foreground">Waitlist ({waitlistPlayers.length})</h3>
            <div className="space-y-2">
              {waitlistPlayers.map((p) => (
                <div key={p.id} className="rounded-xl border border-border/50 bg-card p-3 flex items-center gap-3 opacity-60">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                    {p.profiles?.display_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <p className="font-semibold text-sm">{p.profiles?.display_name || "Player"}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resolution Timeline */}
        {isAfterGame && timelineEvents.length > 0 && (
          <MatchResultTimeline events={timelineEvents} />
        )}

        {/* Inline Betting Section */}
        {isPreGame && id && match?.format === "social" && (
          <div className="rounded-xl border border-border/50 bg-card p-4 opacity-50">
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">
                Betting is not available for friendly matches
              </p>
            </div>
          </div>
        )}
        {isPreGame && id && match?.format !== "social" && (
          <MatchBettingSection
            matchId={id}
            userTeam={currentPlayerEntry?.team === "A" ? "A" : currentPlayerEntry?.team === "B" ? "B" : null}
            matchStatus={match?.status}
            matchDateTime={`${match?.match_date}T${match?.match_time}`}
          />
        )}

        {/* Chat with Players */}
        {isPlayerInMatch && !["cancelled"].includes(match.status) && (
          <Button
            variant="outline"
            onClick={async () => {
              setOpeningChat(true);
              const convId = await getOrCreateMatchChat(match.id, `${match.club}${match.court ? ` — ${match.court}` : ""}`);
              setOpeningChat(false);
              if (convId) navigate(`/messages/${convId}`);
            }}
            disabled={openingChat}
            className="w-full h-12 rounded-xl font-semibold gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            {openingChat ? "Opening..." : "Chat with Players"}
          </Button>
        )}

        {/* Join request approvals — visible to confirmed players */}
        {isJoined && joinRequests.length > 0 && (
          <div>
            <h3 className="font-display font-bold mb-3 text-amber-500">Join Requests ({joinRequests.length})</h3>
            <div className="space-y-3">
              {joinRequests.map((req) => {
                const alreadyApproved = req.approvals.includes(user?.id ?? "");
                const isProcessing = processingRequest === req.id;
                return (
                  <div key={req.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-sm font-bold text-amber-600">
                        {req.display_name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{req.display_name ?? "Player"}</p>
                        <p className="text-xs text-muted-foreground">
                          Level {req.padel_level?.toFixed(1) ?? "N/A"} · outside {match.level_min.toFixed(1)}–{match.level_max.toFixed(1)} range
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {req.approvals.length}/{confirmedPlayers.length} approved
                      </span>
                    </div>
                    {alreadyApproved ? (
                      <p className="text-xs text-primary font-medium">✓ You approved — waiting for others</p>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleApproveRequest(req)} disabled={isProcessing}
                          className="flex-1 h-9 rounded-lg text-xs font-semibold">
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleRejectRequest(req)} disabled={isProcessing}
                          className="flex-1 h-9 rounded-lg text-xs font-semibold border-destructive/30 text-destructive hover:bg-destructive/10">
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Escrow summary — organiser of private match only */}
        {isPreGame && isOrganizer && match.visibility === "private" && escrow && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Escrow Summary</span>
            </div>
            <div className="space-y-1.5 text-[12px]">
              {(() => {
                const symbol = (escrow.currency ?? "gbp") === "eur" ? "€" : "£";
                const charged = escrow.total_charged_cents / 100;
                const refunded = escrow.total_refunded_cents / 100;
                const remaining = charged - refunded;
                const perSpot = escrow.per_spot_full_price_cents / 100;
                const spotsJoined = escrow.per_spot_full_price_cents > 0
                  ? Math.round(escrow.total_refunded_cents / escrow.per_spot_full_price_cents)
                  : 0;
                const spotsRemaining = (escrow.spots_count - 1) - spotsJoined;
                return (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>You paid upfront</span>
                      <span className="text-foreground font-medium">{symbol}{charged.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Refunded so far ({spotsJoined} {spotsJoined === 1 ? "player" : "players"} joined)</span>
                      <span className="text-emerald-400 font-medium">− {symbol}{refunded.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t border-amber-500/20 pt-1.5 mt-1">
                      <span className="text-foreground">Still held in escrow</span>
                      <span className="text-amber-300">{symbol}{remaining.toFixed(0)}</span>
                    </div>
                    {spotsRemaining > 0 && perSpot > 0 && (
                      <p className="text-[11px] text-muted-foreground pt-0.5">
                        {symbol}{perSpot.toFixed(0)} returned for each of the {spotsRemaining} remaining {spotsRemaining === 1 ? "spot" : "spots"}.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Pre-game action buttons (non-FAB ones) */}
        {isPreGame && (
          <div className="space-y-2">
            {!isOrganizer && !userLevelFits && !isJoined && !isWaitlisted && (
              <p className="text-xs text-destructive text-center">Your level doesn't fit the required range ({match.level_min.toFixed(1)} – {match.level_max.toFixed(1)})</p>
            )}
            {!isOrganizer && (isJoined || isWaitlisted) && (
              <>
                {isWaitlisted ? (
                  <Button variant="outline" onClick={handleLeave} disabled={joining} className="w-full h-12 rounded-xl font-semibold gap-2">
                    <LogOut className="w-4 h-4" />
                    Leave Waitlist
                  </Button>
                ) : canPlayerCancel ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowCancelModal(true)}
                    className="w-full h-12 rounded-xl font-semibold gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="w-4 h-4" />
                    Cancel My Spot
                  </Button>
                ) : isJoined ? (
                  <div className="rounded-xl border border-border/50 bg-card p-3.5 text-center space-y-1.5">
                    <p className="text-sm font-medium text-muted-foreground flex items-center justify-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      {isInsidePrivateCancelWindow && match.visibility === "private"
                        ? "Cancellation not allowed"
                        : "Cancellation window closed"
                      }
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isInsidePrivateCancelWindow && match.visibility === "private"
                        ? `You're inside the ${privateCancelWindowHours}h cancellation window for this private match. Contact the club to cancel.`
                        : !cancellationEnabled
                          ? "Player cancellation is currently disabled."
                          : "Contact an admin if you need to be removed."
                      }
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}

        {/* Organizer: Visibility toggle */}
        {isPreGame && isOrganizer && (
          <div className="space-y-2">
            {!showVisibilityConfirm ? (
              <Button
                variant="outline"
                onClick={() => setShowVisibilityConfirm(true)}
                className="w-full h-12 rounded-xl font-semibold gap-2"
              >
                {match.visibility === "private" ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {match.visibility === "private" ? "Make Match Public" : "Make Match Private"}
              </Button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border/50 bg-card p-4 space-y-3"
              >
                <div className="flex items-start gap-2.5">
                  {match.visibility === "private" ? (
                    <Globe className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  ) : (
                    <Lock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">
                      {match.visibility === "private" ? "Make this match public?" : "Make this match private?"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {match.visibility === "private"
                        ? "Players will be able to see and join your match."
                        : "Only players you invite will be able to see and join your match."}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowVisibilityConfirm(false)} className="flex-1 h-10 rounded-xl font-semibold" disabled={togglingVisibility}>
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      setTogglingVisibility(true);
                      const newVisibility = match.visibility === "public" ? "private" : "public";
                      const { error } = await supabase.from("matches").update({ visibility: newVisibility }).eq("id", match.id);
                      if (error) {
                        toast({ title: "Error", description: error.message, variant: "destructive" });
                      } else {
                        setMatch({ ...match, visibility: newVisibility });
                        toast({ title: `Match set to ${newVisibility}` });
                      }
                      setTogglingVisibility(false);
                      setShowVisibilityConfirm(false);
                    }}
                    disabled={togglingVisibility}
                    className="flex-1 h-10 rounded-xl font-semibold"
                  >
                    {togglingVisibility ? "Updating..." : "Confirm"}
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Organizer: Cancel Match */}
        {isPreGame && isOrganizer && (
          <div className="mb-4">
            {!showCancelMatchConfirm ? (
              <Button
                variant="outline"
                onClick={() => setShowCancelMatchConfirm(true)}
                className="w-full h-12 rounded-xl font-semibold gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <XCircle className="w-4 h-4" />
                Cancel Match
              </Button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-destructive/20 bg-card p-4 space-y-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Cancel this match?</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      All players will be removed and notified. Any staked points will be refunded. This cannot be undone.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowCancelMatchConfirm(false)} className="flex-1 h-10 rounded-xl font-semibold" disabled={cancellingMatch}>
                    Keep Match
                  </Button>
                  <Button variant="destructive" onClick={handleCancelMatch} disabled={cancellingMatch} className="flex-1 h-10 rounded-xl font-semibold">
                    {cancellingMatch ? "Cancelling..." : "Confirm Cancel"}
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Join Match FAB */}
      {isPreGame && !isJoined && !isWaitlisted && !isOrganizer && userLevelFits && user && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40 space-y-2">
          {/* Private match joining warning */}
          {match.visibility === "private" && isInsidePrivateCancelWindow && (
            <div className="rounded-xl bg-amber-500/15 border border-amber-500/30 px-3 py-2 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200 leading-relaxed">
                You're inside the {privateCancelWindowHours}h window — if you join now you <strong>cannot cancel</strong>. Contact the club if you need to leave.
              </p>
            </div>
          )}
          <Button
            onClick={handleJoin}
            disabled={joining}
            className="w-full h-14 rounded-2xl font-bold text-base gap-2 shadow-[0_0_30px_hsl(var(--primary)/0.3)]"
            size="lg"
          >
            <MessageSquare className="w-5 h-5" />
            {isFull ? "Join Waitlist" : "Join Match"}
          </Button>
        </div>
      )}

      {/* Modals */}
      <BetModal matchId={id || null} open={showBetModal} onOpenChange={setShowBetModal} />
      <ScoreUploadModal
        matchId={id || ""}
        open={showScoreUpload}
        onOpenChange={setShowScoreUpload}
        players={allTeamPlayers}
        onSubmitted={fetchMatch}
      />
      <ScoreReviewModal
        matchId={id || ""}
        submission={latestSubmission}
        open={showScoreReview}
        onOpenChange={setShowScoreReview}
        players={allTeamPlayers}
        onReviewed={fetchMatch}
      />
      {showRemovePlayer && match && (
        <RemovePlayerModal
          open={!!showRemovePlayer}
          onOpenChange={(open) => !open && setShowRemovePlayer(null)}
          matchId={match.id}
          playerId={showRemovePlayer.userId}
          playerName={showRemovePlayer.name}
          onRemoved={fetchMatch}
        />
      )}
      {match && (
        <CancelRegistrationModal
          open={showCancelModal}
          onOpenChange={setShowCancelModal}
          matchId={match.id}
          matchClub={match.club}
          matchDate={match.match_date}
          matchTime={match.match_time}
          onCancelled={fetchMatch}
        />
      )}
      <SlotActionModal
        open={!!slotAction}
        onOpenChange={(o) => { if (!o) setSlotAction(null); }}
        team={slotAction?.team || "A"}
        onJoin={() => { if (slotAction) handleSlotJoin(slotAction.team); }}
        onInvite={() => {
          if (slotAction) {
            setInviteTarget({ team: slotAction.team, slotIndex: slotAction.slotIndex });
            setSlotAction(null);
            setShowInviteModal(true);
          }
        }}
        onSwitchTeam={isJoined && slotAction ? () => handleSwitchTeam(slotAction.team as "A" | "B") : undefined}
        isJoined={isJoined}
        isFull={isFull}
        isInOtherTeam={isJoined && slotAction ? currentPlayerEntry?.team !== slotAction.team : false}
      />
      {match && (
        <InvitePlayerModal
          open={showInviteModal}
          onOpenChange={setShowInviteModal}
          matchId={match.id}
          matchClub={match.club}
          matchDate={match.match_date}
          matchTime={match.match_time}
          team={inviteTarget.team}
          slotIndex={inviteTarget.slotIndex}
          existingPlayerIds={confirmedPlayers.map(p => p.user_id)}
        />
      )}
      <PlayerProfileModal
        open={!!viewPlayerId}
        onOpenChange={(open) => !open && setViewPlayerId(null)}
        playerId={viewPlayerId}
        allowDirectMessage
      />
    </div>
  );
};

export default MatchDetail;
