import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Zap, LogOut, AlertTriangle, UserMinus, XCircle, MessageSquare, Globe, Lock, Share2, User, Users, Trophy, CheckCircle2, Plus, ExternalLink, UserPlus, Navigation, ChevronRight, ChevronDown, Check, X } from "lucide-react";
import { Browser } from "@capacitor/browser";
import { cn } from "@/lib/utils";
import { isOtherClub, isMembersOnly, providerLabel } from "@/components/clubs/clubTier";
import { distanceMiles, formatMiles } from "@/lib/distance";
import SlotActionModal from "@/components/SlotActionModal";
import InvitePlayerModal from "@/components/InvitePlayerModal";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

import BetModal from "@/components/BetModal";
import MatchBettingSection from "@/components/MatchBettingSection";
import { STAKES_ENABLED } from "@/lib/featureFlags";

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
  /** External-court matches: 'booked' | 'not_booked'; null = XPLAY-native court */
  court_booking_status?: string | null;
  external_booking_url?: string | null;
  duration_mins?: number | null;
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

const openExternal = async (url: string) => {
  try { await Browser.open({ url }); } catch { window.open(url, "_blank", "noopener"); }
};

const ActionPill = ({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled} className="h-9 px-3 rounded-full bg-surface-container text-[13px] font-bold inline-flex items-center gap-1.5 active:scale-[0.97] transition-transform disabled:opacity-60">
    {children}
  </button>
);

type ClubRow = { id: string; source: string | null; external_provider: string | null; latitude: number | null; longitude: number | null; website: string | null; google_place_id: string | null; booking_url?: string | null };

const AFTER_GAME_STATUSES = ["awaiting_score", "score_submitted", "pending_review", "review_requested", "confirmed", "completed", "draw", "closed_as_draw", "auto_closed"];

/** Shape returned by the get_my_join_status RPC. */
type MyJoinStatus = {
  status: "none" | "pending" | "approved" | "rejected";
  request_id?: string;
  level_fits?: boolean;
  players?: number;
  missing?: number;
  approved_to_join?: boolean;
};

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
  const [myJoin, setMyJoin] = useState<MyJoinStatus | null>(null);
  const [requesting, setRequesting] = useState(false);
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
  const [clubRow, setClubRow] = useState<ClubRow | null>(null);
  const [distanceMi, setDistanceMi] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [joinSheet, setJoinSheet] = useState<{ mode: "in" | "outside"; team?: "A" | "B" } | null>(null);

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

  const fetchMyJoinStatus = async () => {
    if (!id || !user) return;
    const { data } = await (supabase as any).rpc("get_my_join_status", { _match_id: id });
    setMyJoin((data as MyJoinStatus) ?? null);
  };

  useEffect(() => { fetchMatch(); fetchJoinRequests(); fetchMyJoinStatus(); }, [fetchMatch, user?.id]);

  // The club behind the match (matches store the club name only): tag, booking link, directions, distance
  useEffect(() => {
    if (!match?.club) { setClubRow(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any).from("clubs")
        .select("id, source, external_provider, latitude, longitude, website, google_place_id")
        .eq("club_name", match.club).limit(1).maybeSingle();
      if (cancelled) return;
      const row = (data as ClubRow | null) ?? null;
      if (row && isOtherClub(row.source) && !isMembersOnly(row.external_provider)) {
        // Where the court gets booked: the club feed's booking link
        const { data: slot } = await (supabase as any).from("external_court_slots").select("booking_url").eq("club_id", row.id).not("booking_url", "is", null).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
        row.booking_url = (slot as { booking_url: string | null } | null)?.booking_url ?? null;
      }
      if (cancelled) return;
      setClubRow(row);
      if (row?.latitude != null && row?.longitude != null && user) {
        const { data: p } = await supabase.from("profiles").select("last_lat, last_lng").eq("user_id", user.id).maybeSingle();
        const pp = p as unknown as { last_lat: number | null; last_lng: number | null } | null;
        if (!cancelled && pp?.last_lat != null && pp?.last_lng != null) setDistanceMi(distanceMiles(pp.last_lat, pp.last_lng, row.latitude, row.longitude));
      }
    })();
    return () => { cancelled = true; };
  }, [match?.club, user?.id]);

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
      } else if (error.message.includes("row-level security")) {
        toast({ title: "Can't join yet", description: "The spot was taken, or a player in the match still has to approve you.", variant: "destructive" });
        fetchMyJoinStatus();
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "You joined the match! 🎾" });
      // Auto-add to match chat
      addPlayerToMatchChat(match.id, user.id);
      // matches.status / spots_left are derived server-side (trg_update_match_spots)
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

  // Level gate: outside the range you ask first, every player in the match has to say yes,
  // and even then you still have to take the spot yourself (first approved player wins it).
  const needsApproval = !!user && !isOrganizer && !isJoined && !isWaitlisted && !userLevelFits;
  const approvedToJoin = needsApproval && !!myJoin?.approved_to_join;
  const requestPending = needsApproval && myJoin?.status === "pending" && !myJoin?.approved_to_join;
  const requestDeclined = needsApproval && myJoin?.status === "rejected";
  const approvalsHave = Math.max(0, (myJoin?.players ?? 0) - (myJoin?.missing ?? 0));

  const handleRequestToJoin = async () => {
    if (!user || !match || requesting) return;
    setRequesting(true);
    const { error } = await (supabase as any).rpc("request_to_join_match", { _match_id: match.id });
    if (error) {
      toast({ title: "Couldn't send request", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Request sent", description: "Every player in the match has to approve. We'll notify you." });
    }
    await fetchMyJoinStatus();
    setRequesting(false);
  };

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
    if (m?.score_winner === "draw") {
      // Show the real sets when a score was submitted (e.g. 6-3 / 4-6); plain "Draw" otherwise.
      const drawScore = latestSubmission ? [
        latestSubmission.team_a_set_1 !== null ? `${latestSubmission.team_a_set_1}-${latestSubmission.team_b_set_1}` : null,
        latestSubmission.team_a_set_2 !== null ? `${latestSubmission.team_a_set_2}-${latestSubmission.team_b_set_2}` : null,
        latestSubmission.team_a_set_3 !== null ? `${latestSubmission.team_a_set_3}-${latestSubmission.team_b_set_3}` : null,
      ].filter(Boolean).filter((x) => x !== "0-0").join(" / ") : "";
      return drawScore ? `Draw — ${drawScore}` : "Draw";
    }

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
      // matches.status / spots_left are derived server-side after the delete
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

    // ── Private match with escrow → edge function handles everything ────────
    if (match.visibility === "private" && escrow) {
      const { data, error } = await supabase.functions.invoke("private-match-cancel", {
        body: { match_id: match.id },
      });

      if (error || data?.error) {
        const msg = data?.error ?? error?.message ?? "Could not cancel match.";
        toast({ title: data?.blocked ? "Cancellation blocked" : "Cancellation failed", description: msg, variant: "destructive" });
        setCancellingMatch(false);
        return;
      }

      const currency = data.currency ?? "gbp";
      const symbol = currency === "eur" ? "€" : "£";
      const refundDesc = data.refund_cents > 0
        ? `${symbol}${(data.refund_cents / 100).toFixed(0)} refunded to your card.`
        : data.inside_window
          ? "No refund — cancelled inside the cancellation window."
          : "No escrow remaining to refund.";

      toast({ title: "Match cancelled", description: refundDesc });
      setCancellingMatch(false);
      navigate("/matches");
      return;
    }

    // ── Public / non-escrow match: direct DB path ───────────────────────────
    await supabase.from("matches").update({ status: "cancelled", cancelled_reason: "organiser_cancelled" }).eq("id", match.id);

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
            transaction_type: "stake_refund", // enum has no 'refunded' — insert silently failed before
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
          _body: `The match at ${match.club} on ${match.match_date} has been cancelled by the organizer.${stakes && stakes.some((s) => s.user_id === p.user_id) ? " Your XPLAY Points have been refunded." : ""}`,
          _link: `/matches/${match.id}`,
        })
      ));
    }

    await addSystemMessage(match.id, "Match cancelled by the organizer");
    toast({ title: "Match cancelled", description: "All players have been notified and any points refunded." });
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
    // Server-side: records the approval, checks every confirmed player has
    // approved, seats the player on the smaller team and notifies them.
    const { data, error } = await (supabase as any).rpc("approve_join_request", { _request_id: request.id });
    if (error) {
      toast({ title: "Could not approve", description: error.message, variant: "destructive" });
    } else if ((data as any)?.approved) {
      toast({ title: "Approved", description: `Everyone has said yes. ${request.display_name || "The player"} can now take a free spot.` });
    } else {
      toast({ title: "Approval recorded", description: `Waiting for ${(data as any)?.pending ?? "more"} more player(s).` });
    }
    fetchMatch(); fetchJoinRequests(); setProcessingRequest(null);
  };

  const handleRejectRequest = async (request: typeof joinRequests[0]) => {
    if (!user || !match) return;
    setProcessingRequest(request.id);
    // Server-side: closes the request and tells the player (one "no" ends it; they can ask again).
    const { error } = await (supabase as any).rpc("decline_join_request", { _request_id: request.id });
    if (error) toast({ title: "Couldn't decline", description: error.message, variant: "destructive" });
    else toast({ title: "Request declined" });
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
            aria-label="Back to matches"
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
                  You were enrolled. Any points or payments have been refunded.
                </p>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="w-full max-w-sm space-y-2">
            <Button
              onClick={() => navigate("/matches")}
              className="w-full h-12 rounded-2xl font-bold text-sm gap-2"
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

  const matchIdShort = match.id.slice(-3).toUpperCase();
  const seatsPerTeam = Math.max(1, Math.ceil((match.max_players ?? 4) / 2));
  const durationLabel = (() => { const d = match.duration_mins ?? 90; return d < 60 ? `${d} min` : `${Math.floor(d / 60)}h${d % 60 ? `${d % 60}` : ""}`; })();
  const dayLabel = format(new Date(match.match_date + "T00:00:00"), "EEE d MMM");
  const timeLabel = match.match_time.slice(0, 5);

  // Club kind → tag, colour, where the court gets booked
  const otherClub = isOtherClub(clubRow?.source);
  const membersOnly = otherClub && isMembersOnly(clubRow?.external_provider);
  const provider = providerLabel(clubRow?.external_provider);
  const tagLabel = membersOnly ? "Members only" : otherClub ? "Live courts" : "XPLAY club";
  const bookingUrl: string | null = match.external_booking_url || clubRow?.booking_url || (membersOnly ? clubRow?.website ?? null : null);
  const mapsUrl = clubRow?.latitude != null && clubRow?.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${clubRow.latitude},${clubRow.longitude}${clubRow.google_place_id ? `&destination_place_id=${clubRow.google_place_id}` : ""}`
    : null;
  const priceLine = [match.court, match.price_per_player != null && Number(match.price_per_player) > 0 ? `£${Number(match.price_per_player) % 1 ? Number(match.price_per_player).toFixed(2) : Number(match.price_per_player).toFixed(0)} pp` : null].filter(Boolean).join(" · ");

  const notBooked = isPreGame && otherClub && match.court_booking_status !== "booked";
  const courtBooked = match.court_booking_status === "booked";

  // One status line — never two contradictory messages
  const status: { text: string; tone: "amber" | "lime" | "muted" | "red"; icon: ReactNode } = (() => {
    if (isAfterGame) {
      const settled = ["confirmed", "completed", "draw", "closed_as_draw", "auto_closed"].includes(match.status);
      const r = settled ? getResultSummary() : null;
      if (r) return { text: r, tone: "lime", icon: <Trophy className="w-4 h-4" /> };
      return { text: `Played ${format(new Date(match.match_date + "T00:00:00"), "EEE d MMM")}`, tone: "muted", icon: <Clock className="w-4 h-4" /> };
    }
    if (match.status === "completed") return { text: "Played", tone: "muted", icon: <Clock className="w-4 h-4" /> };
    if (notBooked) return { text: "Court not booked yet", tone: "amber", icon: <AlertTriangle className="w-4 h-4" /> };
    if (spotsLeft > 0) return { text: `${spotsLeft} spot${spotsLeft > 1 ? "s" : ""} left`, tone: "amber", icon: <User className="w-4 h-4" /> };
    return { text: "Full · see you there", tone: "lime", icon: <CheckCircle2 className="w-4 h-4" /> };
  })();
  const toneClass = { amber: "bg-secondary/12 text-secondary", lime: "bg-primary/12 text-primary", muted: "bg-muted text-muted-foreground", red: "bg-destructive/10 text-destructive" }[status.tone];

  const goBack = () => { if (window.history.length > 1) navigate(-1); else navigate("/activity"); };

  const handleShare = async () => {
    try {
      await navigator.share({ title: `Match at ${match.club}`, url: window.location.href });
    } catch {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied!" });
    }
  };

  const openChat = async () => {
    setOpeningChat(true);
    const convId = await getOrCreateMatchChat(match.id, `${match.club}${match.court ? ` — ${match.court}` : ""}`);
    setOpeningChat(false);
    if (convId) navigate(`/messages/${convId}`);
  };

  const firstEmptySeat = (): { team: string; slotIndex: number } => {
    for (const team of ["A", "B"]) {
      const n = confirmedPlayers.filter((p) => p.team === team).length;
      if (n < seatsPerTeam) return { team, slotIndex: n };
    }
    return { team: "A", slotIndex: 0 };
  };
  const openInvite = (target?: { team: string; slotIndex: number }) => { setInviteTarget(target ?? firstEmptySeat()); setShowInviteModal(true); };

  const markBooked = async () => {
    const { error } = await supabase.from("matches").update({ court_booking_status: "booked" }).eq("id", match.id);
    if (error) toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
    else { toast({ title: "Court booked", description: "Players can see the court is secured." }); fetchMatch(); }
  };

  // The seat the join sheet offers: the smaller team, next to whoever is already there
  const autoTeam: "A" | "B" = confirmedPlayers.filter((p) => p.team === "A").length <= confirmedPlayers.filter((p) => p.team === "B").length ? "A" : "B";
  const joinTeam: "A" | "B" = joinSheet?.team ?? autoTeam;
  const joinPartner = confirmedPlayers.find((p) => p.team === joinTeam) ?? null;

  const renderSeat = (team: "A" | "B", index: number) => {
    const teamPlayers = confirmedPlayers.filter((p) => p.team === team);
    const player = teamPlayers[index];
    if (player) {
      const me = player.user_id === user?.id;
      return (
        <button key={`${team}${index}`} onClick={() => setViewPlayerId(player.user_id)} className="flex items-center gap-2.5 min-h-[44px] w-full text-left">
          <div className={cn("w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-muted text-sm font-bold", me && "ring-2 ring-primary")}>
            {player.profiles?.avatar_url ? (
              <img src={player.profiles.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-muted-foreground">{player.profiles?.display_name?.[0]?.toUpperCase() || "?"}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{me ? "You" : player.profiles?.display_name || "Player"}</div>
            <div className="font-mono text-xs text-muted-foreground">{player.profiles?.padel_level?.toFixed(1) ?? "—"}</div>
          </div>
        </button>
      );
    }
    const canInvite = isJoined || isOrganizer;
    const label = !isPreGame ? "Open" : canInvite ? "Invite" : needsApproval && !approvedToJoin ? (requestPending ? "Waiting" : "Ask to join") : "Join here";
    return (
      <button
        key={`${team}${index}`}
        disabled={!isPreGame || !user}
        onClick={() => {
          if (!isPreGame || !user) return;
          if (canInvite) openInvite({ team, slotIndex: index });
          else if (needsApproval && !approvedToJoin) { if (!requestPending) setJoinSheet({ mode: "outside" }); }
          else setJoinSheet({ mode: "in", team });
        }}
        className="flex items-center gap-2.5 min-h-[44px] w-full text-left"
      >
        <div className="w-10 h-10 rounded-full border border-dashed border-primary/60 text-primary flex items-center justify-center shrink-0"><Plus className="w-4 h-4" /></div>
        <span className="text-sm font-bold text-primary">{label}</span>
      </button>
    );
  };

  // The one main button, by state
  const primary: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; external?: boolean } | null = (() => {
    if (!user) return null;
    if (isAfterGame) {
      if (canSubmitScore) return { label: "Add score", icon: <Plus className="w-5 h-5" />, onClick: () => setShowScoreUpload(true) };
      if (canReviewScore) return { label: "Review score", icon: <CheckCircle2 className="w-5 h-5" />, onClick: () => setShowScoreReview(true) };
      return null;
    }
    if (!isPreGame) return null;
    if (isOrganizer) {
      if (notBooked && bookingUrl) return { label: membersOnly ? `Open the ${provider ?? "club"} app` : "Book the court", icon: null, onClick: () => openExternal(bookingUrl), external: true };
      if (spotsLeft > 0) return { label: "Invite players", icon: <UserPlus className="w-5 h-5" />, onClick: () => openInvite() };
      return { label: openingChat ? "Opening…" : "Open chat", icon: <MessageSquare className="w-5 h-5" />, onClick: openChat, disabled: openingChat };
    }
    if (isJoined) return { label: openingChat ? "Opening…" : "Open chat", icon: <MessageSquare className="w-5 h-5" />, onClick: openChat, disabled: openingChat };
    if (isWaitlisted) return null;
    if (needsApproval && !approvedToJoin) {
      return { label: requestPending ? "Request sent · waiting" : requestDeclined ? "Ask again" : "Ask to join", icon: <Users className="w-5 h-5" />, onClick: () => setJoinSheet({ mode: "outside" }), disabled: requestPending };
    }
    return { label: isFull ? "Join waitlist" : approvedToJoin ? "You're approved · join" : "Join match", icon: <Users className="w-5 h-5" />, onClick: () => setJoinSheet({ mode: "in" }), disabled: joining };
  })();

  return (
    <div className={cn(primary ? "pb-32" : "pb-24")}>
      {/* Back + share, no title */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={goBack} aria-label="Back" className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center"><ArrowLeft className="w-5 h-5" /></button>
        <button onClick={handleShare} aria-label="Share match" className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center"><Share2 className="w-5 h-5" /></button>
      </div>

      <div className="px-4 space-y-4">
        {/* Hero: when, then where */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <div className="font-mono text-sm text-muted-foreground">{dayLabel}</div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[44px] font-bold leading-none tracking-tight">{timeLabel}</span>
            <span className="font-mono text-base text-muted-foreground">{durationLabel}</span>
          </div>
          <button onClick={() => clubRow?.id && navigate(`/clubs/${clubRow.id}`, { state: { from: `/matches/${match.id}` } })} className="flex items-center gap-1 text-left mt-1.5 max-w-full">
            <span className="font-display text-lg font-bold leading-tight truncate">{match.club}</span>
            {clubRow?.id && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          </button>
          {clubRow && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", otherClub ? "border border-border text-muted-foreground" : "bg-primary/15 text-primary")}>{tagLabel}</span>
              {distanceMi != null && <span className="font-mono text-[11px] text-muted-foreground">{formatMiles(distanceMi)}</span>}
            </div>
          )}
          {priceLine && <div className="font-mono text-sm pt-0.5">{priceLine}</div>}
        </motion.div>

        {/* One status line */}
        <div className={cn("flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold", toneClass)}>
          {status.icon}<span className="truncate">{status.text}</span>
        </div>

        {match.notes && <p className="text-sm text-muted-foreground border-l-2 border-primary/30 pl-3">{match.notes}</p>}

        {/* Players: two teams, photo · name · level */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-2xl bg-card border border-border/60 p-3.5">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 items-center">
            <div className="space-y-2">{Array.from({ length: seatsPerTeam }, (_, i) => renderSeat("A", i))}</div>
            <span className="font-mono text-[10px] font-bold text-muted-foreground px-1">VS</span>
            <div className="space-y-2">{Array.from({ length: seatsPerTeam }, (_, i) => renderSeat("B", i))}</div>
          </div>
        </motion.div>

        {/* Score */}
        {isAfterGame && match.status === "awaiting_score" ? (
          <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">No score yet</span>
              <span className="font-mono text-sm text-muted-foreground">– : –</span>
            </div>
            <div className="flex items-center gap-1.5 text-[13px]"><Zap className="w-3.5 h-3.5 text-primary" /><span className="font-mono text-primary">+50</span><span className="text-muted-foreground">XPLAY Points when the score is confirmed</span></div>
            {isPlayerInMatch && <button onClick={handleMarkDraw} className="text-[13px] font-bold text-muted-foreground pt-1">It was a draw</button>}
          </div>
        ) : isAfterGame ? (
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
        ) : null}

        {/* Court: only when it matters */}
        {isPreGame && (notBooked ? (
          <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
            <div className="text-sm font-bold">Book the court</div>
            {isOrganizer ? (
              <>
                <p className="text-sm text-muted-foreground">{membersOnly ? `Book it in the ${provider ?? "club"} app, then confirm here.` : `Book it on ${provider ?? "the club's own system"}, then confirm here.`}</p>
                <button onClick={markBooked} className="w-full h-11 rounded-xl bg-surface-container text-sm font-bold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"><Check className="w-4 h-4" /> I've booked it</button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">The organiser still has to book the court{provider ? ` on ${provider}` : ""}.</p>
            )}
          </div>
        ) : courtBooked ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-1"><CheckCircle2 className="w-4 h-4 text-primary" /> Court booked</div>
        ) : !otherClub && clubRow ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-1"><CheckCircle2 className="w-4 h-4 text-primary" /> Reserved by XPLAY{match.price_per_player != null && Number(match.price_per_player) > 0 ? " · paid" : ""}</div>
        ) : null)}

        {/* Approval state for players outside the level range */}
        {isPreGame && needsApproval && (approvedToJoin || requestPending || requestDeclined) && (
          <div className="rounded-xl bg-secondary/10 px-3.5 py-2.5 text-[13px] text-secondary font-semibold">
            {approvedToJoin
              ? (isFull ? "You're approved. If a spot opens, the first approved player to join gets it." : "You're approved. Take a free spot now.")
              : requestPending
                ? `Waiting for approval · ${approvalsHave} of ${myJoin?.players ?? 0} players said yes`
                : "Your request was declined. You can ask again."}
          </div>
        )}

        {/* Small actions */}
        {!["cancelled"].includes(match.status) && (
          <div className="flex flex-wrap gap-2">
            {isPlayerInMatch && (
              <ActionPill onClick={openChat} disabled={openingChat}><MessageSquare className="w-3.5 h-3.5" /> Chat</ActionPill>
            )}
            {isPreGame && (isJoined || isOrganizer) && spotsLeft > 0 && (
              <ActionPill onClick={() => openInvite()}><UserPlus className="w-3.5 h-3.5" /> Invite</ActionPill>
            )}
            <ActionPill onClick={handleShare}><Share2 className="w-3.5 h-3.5" /> Share</ActionPill>
            {mapsUrl && <ActionPill onClick={() => openExternal(mapsUrl)}><Navigation className="w-3.5 h-3.5" /> Directions</ActionPill>}
          </div>
        )}

        {/* Join requests — every player in the match approves */}
        {isJoined && joinRequests.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-secondary">Wants to join</div>
            {joinRequests.map((req) => {
              const alreadyApproved = req.approvals.includes(user?.id ?? "");
              const isProcessing = processingRequest === req.id;
              return (
                <div key={req.id} className="rounded-2xl bg-card border border-border/60 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold">{req.display_name?.[0]?.toUpperCase() ?? "?"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{req.display_name ?? "Player"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{req.padel_level?.toFixed(1) ?? "—"} · match is {match.level_min.toFixed(1)}–{match.level_max.toFixed(1)}</div>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{req.approvals.length}/{confirmedPlayers.length}</span>
                  </div>
                  {alreadyApproved ? (
                    <p className="text-xs text-primary font-semibold">You said yes · waiting for the others</p>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveRequest(req)} disabled={isProcessing} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold">Approve</button>
                      <button onClick={() => handleRejectRequest(req)} disabled={isProcessing} className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground">Decline</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Waitlist */}
        {waitlistPlayers.length > 0 && (
          <div className="rounded-2xl bg-card border border-border/60 p-3.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Waiting list · {waitlistPlayers.length}</div>
            <div className="flex flex-wrap gap-2">
              {waitlistPlayers.map((p) => (
                <span key={p.id} className="text-sm font-semibold text-muted-foreground">{p.profiles?.display_name || "Player"}</span>
              ))}
            </div>
          </div>
        )}

        {/* Escrow summary — organiser of private match only */}
        {isPreGame && isOrganizer && match.visibility === "private" && escrow && (() => {
          const symbol = (escrow.currency ?? "gbp") === "eur" ? "€" : "£";
          const charged = escrow.total_charged_cents / 100;
          const refunded = escrow.total_refunded_cents / 100;
          const remaining = charged - refunded;
          return (
            <div className="rounded-2xl bg-card border border-border/60 p-3.5 space-y-1.5 text-sm">
              <div className="text-[10px] font-black uppercase tracking-wider text-secondary">Held for you</div>
              <div className="flex justify-between text-muted-foreground"><span>You paid</span><span className="font-mono text-foreground">{symbol}{charged.toFixed(0)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Refunded as players join</span><span className="font-mono text-primary">− {symbol}{refunded.toFixed(0)}</span></div>
              <div className="flex justify-between font-bold border-t border-border/40 pt-1.5"><span>Still held</span><span className="font-mono text-secondary">{symbol}{remaining.toFixed(0)}</span></div>
            </div>
          );
        })()}

        {/* Resolution timeline (after the match) */}
        {isAfterGame && timelineEvents.length > 0 && <MatchResultTimeline events={timelineEvents} />}

        {/* Betting — gated behind STAKES_ENABLED */}
        {STAKES_ENABLED && isPreGame && id && match?.format !== "social" && (
          <MatchBettingSection matchId={id} userTeam={currentPlayerEntry?.team === "A" ? "A" : currentPlayerEntry?.team === "B" ? "B" : null} matchStatus={match?.status} matchDateTime={`${match?.match_date}T${match?.match_time}`} />
        )}

        {/* Details, collapsed */}
        <div className="rounded-2xl bg-card border border-border/60">
          <button onClick={() => setDetailsOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
            <span className="text-sm"><span className="font-bold">Details</span> <span className="text-muted-foreground">{match.format === "social" ? "Social" : "Competitive"} · {match.level_min.toFixed(1)}–{match.level_max.toFixed(1)}</span></span>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", detailsOpen && "rotate-180")} />
          </button>
          {detailsOpen && (
            <div className="px-4 pb-4 space-y-3 text-sm">
              <div className="grid grid-cols-[110px_1fr] gap-y-2 gap-x-3">
                <span className="text-muted-foreground">Type</span><span>{match.format === "social" ? "Social · just play" : "Competitive · counts"}</span>
                <span className="text-muted-foreground">Level</span><span className="font-mono">{match.level_min.toFixed(1)}–{match.level_max.toFixed(1)}</span>
                <span className="text-muted-foreground">Who can join</span><span>{match.visibility === "public" ? "Anyone at my level" : "Only people I invite"}</span>
                <span className="text-muted-foreground">Organiser</span><span>{isOrganizer ? "You" : (players.find((p) => p.user_id === match.organizer_id)?.profiles?.display_name ?? "—")}</span>
                <span className="text-muted-foreground">When</span><span>{dayLabel} · {timeLabel} · {durationLabel} <span className="text-muted-foreground">(club time)</span></span>
              </div>

              {/* Organiser: who can join */}
              {isPreGame && isOrganizer && (
                !showVisibilityConfirm ? (
                  <button onClick={() => setShowVisibilityConfirm(true)} className="text-sm font-bold text-primary inline-flex items-center gap-1.5">
                    {match.visibility === "private" ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    {match.visibility === "private" ? "Open the match to anyone at this level" : "Make it invite only"}
                  </button>
                ) : (
                  <div className="rounded-xl bg-surface-container p-3 space-y-2">
                    <p className="text-sm">{match.visibility === "private" ? "Anyone at this level will be able to see and join." : "Only people you invite will see and join."}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setShowVisibilityConfirm(false)} disabled={togglingVisibility} className="flex-1 h-10 rounded-xl border border-border text-sm font-bold">Keep</button>
                      <button
                        onClick={async () => {
                          setTogglingVisibility(true);
                          const newVisibility = match.visibility === "public" ? "private" : "public";
                          const { error } = await supabase.from("matches").update({ visibility: newVisibility }).eq("id", match.id);
                          if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
                          else { setMatch({ ...match, visibility: newVisibility }); toast({ title: newVisibility === "public" ? "Open to anyone at this level" : "Invite only now" }); }
                          setTogglingVisibility(false); setShowVisibilityConfirm(false);
                        }}
                        disabled={togglingVisibility}
                        className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
                      >{togglingVisibility ? "Updating…" : "Change"}</button>
                    </div>
                  </div>
                )
              )}

              {/* Player: leave */}
              {isPreGame && !isOrganizer && (isJoined || isWaitlisted) && (
                isWaitlisted ? (
                  <button onClick={handleLeave} disabled={joining} className="text-sm font-bold text-muted-foreground inline-flex items-center gap-1.5"><LogOut className="w-4 h-4" /> Leave the waiting list</button>
                ) : canPlayerCancel ? (
                  <button onClick={() => setShowCancelModal(true)} className="text-sm font-bold text-destructive inline-flex items-center gap-1.5"><LogOut className="w-4 h-4" /> Cancel my spot</button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isInsidePrivateCancelWindow && match.visibility === "private"
                      ? `Inside the ${privateCancelWindowHours}h window for this private match — contact the club to cancel.`
                      : !cancellationEnabled ? "Player cancellation is off." : "The cancellation window has closed. Contact an admin to be removed."}
                  </p>
                )
              )}

              {/* Admin: remove a player */}
              {isAdmin && isPreGame && confirmedPlayers.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-border/40">
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pt-2">Admin · remove</div>
                  {confirmedPlayers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <span className="text-sm">{p.profiles?.display_name || "Player"}</span>
                      <button onClick={() => setShowRemovePlayer({ userId: p.user_id, name: p.profiles?.display_name || "Player" })} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive"><UserMinus className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Organiser: cancel — the only red on the screen */}
        {isPreGame && isOrganizer && (
          !showCancelMatchConfirm ? (
            <button onClick={() => setShowCancelMatchConfirm(true)} className="w-full text-center text-sm font-bold text-destructive py-2">Cancel match</button>
          ) : (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-destructive/30 bg-card p-4 space-y-3">
              <p className="text-sm font-bold">Cancel this match?</p>
              <p className="text-xs text-muted-foreground">Everyone in it is told. Any XPLAY Points come back. This can't be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowCancelMatchConfirm(false)} disabled={cancellingMatch} className="flex-1 h-10 rounded-xl border border-border text-sm font-bold">Keep it</button>
                <button onClick={handleCancelMatch} disabled={cancellingMatch} className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold">{cancellingMatch ? "Cancelling…" : "Cancel match"}</button>
              </div>
            </motion.div>
          )
        )}

        <div className="text-center font-mono text-[11px] text-muted-foreground pt-1">#XP-{matchIdShort}</div>
      </div>

      {/* The one main button, pinned above the tab bar */}
      {primary && (
        <div className="fixed left-0 right-0 px-4 z-40" style={{ bottom: "calc(var(--bottom-nav-clearance, 98px) + 10px)" }}>
          <button
            onClick={primary.onClick}
            disabled={primary.disabled}
            className="w-full h-14 rounded-full bg-primary text-primary-foreground font-display font-black italic uppercase tracking-wider text-sm inline-flex items-center justify-center gap-2 shadow-[0_0_30px_hsl(var(--primary)/0.3)] active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {primary.icon}{primary.label}{primary.external && <ExternalLink className="w-4 h-4" />}
          </button>
        </div>
      )}

      {/* Join sheet */}
      {joinSheet && isPreGame && (
        <div className="fixed inset-0 z-[70] flex items-end" role="dialog" aria-modal="true" aria-label="Join match">
          <button type="button" aria-label="Close" onClick={() => setJoinSheet(null)} className="absolute inset-0 bg-black/60" />
          <div className="relative w-full bg-background rounded-t-3xl border-t border-border/50 px-5 pt-4 space-y-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
            <div className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/30" />
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-[24px] font-black italic uppercase leading-none">Join match</h2>
                <p className="font-mono text-sm text-muted-foreground mt-1.5">{dayLabel} <span className="text-foreground font-bold">{timeLabel}</span> {durationLabel} · {match.club}</p>
              </div>
              <button type="button" onClick={() => setJoinSheet(null)} aria-label="Close" className="w-9 h-9 -mr-2 -mt-1 rounded-full flex items-center justify-center text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            {!isFull && (
              <div className="rounded-2xl bg-card border border-border/60 p-3.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Your seat</div>
                <div className="space-y-2">
                  {joinPartner && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-muted flex items-center justify-center text-sm font-bold">
                        {joinPartner.profiles?.avatar_url ? <img src={joinPartner.profiles.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-muted-foreground">{joinPartner.profiles?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                      </div>
                      <div><div className="text-sm font-bold">{joinPartner.profiles?.display_name || "Player"}</div><div className="font-mono text-xs text-muted-foreground">{joinPartner.profiles?.padel_level?.toFixed(1) ?? "—"}</div></div>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-muted ring-2 ring-primary flex items-center justify-center text-sm font-bold">
                      {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-muted-foreground">{profile?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                    </div>
                    <div><div className="text-sm font-bold">You</div><div className="font-mono text-xs text-muted-foreground">{profile?.padel_level?.toFixed(1) ?? "—"}</div></div>
                  </div>
                </div>
              </div>
            )}
            <div className={cn("flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold", joinSheet.mode === "outside" ? "bg-secondary/12 text-secondary" : "bg-primary/12 text-primary")}>
              {joinSheet.mode === "outside" ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>You're <span className="font-mono">{profile?.padel_level?.toFixed(1) ?? "—"}</span> · this match is <span className="font-mono">{match.level_min.toFixed(1)}–{match.level_max.toFixed(1)}</span></span>
            </div>
            {match.visibility === "private" && isInsidePrivateCancelWindow && joinSheet.mode === "in" && (
              <p className="text-xs text-secondary">Inside the {privateCancelWindowHours}h window: if you join now you can't cancel.</p>
            )}
            {joinSheet.mode === "outside" ? (
              <>
                <button onClick={async () => { await handleRequestToJoin(); setJoinSheet(null); }} disabled={requesting || requestPending} className="w-full h-14 rounded-full bg-primary text-primary-foreground font-display font-black italic uppercase tracking-wider text-sm disabled:opacity-60">{requesting ? "Sending…" : "Ask to join"}</button>
                <p className="text-center text-xs text-muted-foreground">The players in the match approve it.</p>
              </>
            ) : (
              <button onClick={async () => { const t = joinSheet.team; setJoinSheet(null); if (t && !isFull) await handleSlotJoin(t); else await handleJoin(); }} disabled={joining} className="w-full h-14 rounded-full bg-primary text-primary-foreground font-display font-black italic uppercase tracking-wider text-sm disabled:opacity-60">{joining ? "Joining…" : isFull ? "Join the waiting list" : "Join"}</button>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {STAKES_ENABLED && (
        <BetModal matchId={id || null} open={showBetModal} onOpenChange={setShowBetModal} />
      )}
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
