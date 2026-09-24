import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Send, Trash2, TrendingUp, ShieldAlert, Share2, LogOut, Check, Gift, Hourglass, Ban, MapPin, CalendarDays, Clock, BarChart3, ShieldCheck, Megaphone, Loader2, Mail } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Chip, Mono, SeatsBar, FormatChip, XpLine, HUE, tint } from "@/components/tournaments/PlayerAtoms";
import {
  type SeatCounts, type VenueClub,
  cancellationPolicyText, fetchClubs, fetchSeatCounts, formatDayTime, formatGBP, formatLabel as tournamentFormatLabel, formatShortDate,
  levelRange, publicTournamentUrl, refundDeadline, tournamentStart, venueProvider,
} from "@/lib/tournaments/playerView";
import AdminBadge from "@/components/tournaments/AdminBadge";
import TournamentStructurePreview from "@/components/tournaments/TournamentStructurePreview";
import TournamentFixtureView from "@/components/tournaments/TournamentFixtureView";
import type { BracketConfig } from "@/lib/tournaments/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import ApprovalRequestPanel from "@/components/tournaments/ApprovalRequestPanel";
import TournamentBetSheet from "@/components/betting/TournamentBetSheet";
import { STAKES_ENABLED } from "@/lib/featureFlags";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { launchTournament } from "@/lib/tournaments/launchTournament";
import InviteTournamentPlayerModal from "@/components/tournaments/InviteTournamentPlayerModal";
import JoinTournamentModal from "@/components/tournaments/JoinTournamentModal";
import PartnerConfirmBanner from "@/components/tournaments/PartnerConfirmBanner";
import type { Tournament, TournamentPlayer } from "@/lib/tournaments/types";

const TournamentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [skillLevelMin, setSkillLevelMin] = useState<number | null>(null);
  const [skillLevelMax, setSkillLevelMax] = useState<number | null>(null);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [playerProfiles, setPlayerProfiles] = useState<Record<string, { display_name: string | null; avatar_url: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [hasBetConfig, setHasBetConfig] = useState(false);
  const [betSheetOpen, setBetSheetOpen] = useState(false);
  const [oddsLocked, setOddsLocked] = useState(false);
  const [userTeamId, setUserTeamId] = useState<string | null>(null);
  const [userTeamName, setUserTeamName] = useState("Your Team");
  const [userPoints, setUserPoints] = useState(0);
  const [phaseOddsPreview, setPhaseOddsPreview] = useState<{ stage: string; multiplier: number; tier: string }[]>([]);
  const [viewMode, setViewMode] = useState<"structure" | "fixture">("structure");
  // Player-side extras (PL3/PL5)
  const [seats, setSeats] = useState<SeatCounts | null>(null);
  const [organiserClub, setOrganiserClub] = useState<VenueClub | null>(null);
  const [venueClub, setVenueClub] = useState<VenueClub | null>(null);
  const [myPayment, setMyPayment] = useState<{ amount_cents: number; succeeded_at: string | null; refunded_cents: number | null; status: string } | null>(null);
  const [latestBroadcast, setLatestBroadcast] = useState<{ subject: string | null; body: string | null; created_at: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  // Dry-run of the withdraw call: what this player would get back under the tournament's policy.
  const [withdrawPreview, setWithdrawPreview] = useState<{ loading: boolean; refundCents: number | null; message: string | null }>({ loading: false, refundCents: null, message: null });
  const [myGuestEntry, setMyGuestEntry] = useState<{ entry_type: string } | null>(null);
  const [myWaitlist, setMyWaitlist] = useState<{ position: number; offered_at: string | null; offer_expires_at: string | null } | null>(null);
  const [waitlistBusy, setWaitlistBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const isCreator = tournament?.created_by === user?.id;
  const isJoined = players.some(p => p.user_id === user?.id && p.status === "confirmed");
  const playingCount = players.filter(p => p.status === "confirmed" && p.role !== "organiser").length;
  // Seats: prefer the server RPC (counts unclaimed guest places too); fall back to the local count.
  const spotsLeft = seats ? seats.free : (tournament ? tournament.player_count - playingCount : 0);
  const seatsTaken = seats ? Math.max(0, seats.total - seats.free) : playingCount;
  const tx = tournament as (Tournament & {
    ticket_price_cents?: number | null; is_live?: boolean | null; venue_club_id?: string | null; venue_name?: string | null;
    venue_address?: string | null; registration_deadline?: string | null; cancellation_policy?: string | null;
    cancellation_policy_text?: string | null; waitlist_enabled?: boolean | null; slug?: string | null; description?: string | null;
  }) | null;
  const priceCents = tx?.ticket_price_cents ?? 0;
  const isPaidTournament = priceCents > 0;
  const guestComp = myGuestEntry?.entry_type === "comp";
  const guestPaidOffline = myGuestEntry?.entry_type === "paid_offline";
  const guestAwaiting = myGuestEntry?.entry_type === "awaiting_payment";
  const isRegistered = isJoined || guestComp || guestPaidOffline || myGuestEntry?.entry_type === "paid";

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const [{ data: t }, { data: tp }, { data: betConfig }] = await Promise.all([
        supabase.from("tournaments").select("*").eq("id", id).maybeSingle(),
        supabase.from("tournament_players").select("*").eq("tournament_id", id),
        supabase.from("tournament_bet_config").select("id, odds_locked").eq("tournament_id", id).maybeSingle(),
      ]);
      setHasBetConfig(!!betConfig);
      setOddsLocked(betConfig?.odds_locked ?? false);
      const tournamentData = t as unknown as Tournament & { admin_is_playing?: boolean; court_labels?: string[] };
      setTournament(tournamentData);

      // DB may return skill_level_min/max fields not in Tournament type
      const dbTournament = tournamentData as unknown as { skill_level_min?: number; skill_level_max?: number };
      if (dbTournament?.skill_level_min != null) {
        setSkillLevelMin(dbTournament.skill_level_min);
        setSkillLevelMax(dbTournament.skill_level_max || 0);
      }
      const playersList = (tp as unknown as TournamentPlayer[]) || [];
      setPlayers(playersList);

      // ── Player-side extras: seats, organiser + venue clubs, my payment / guest entry / waitlist ──
      {
        const sb = supabase as any;
        const tRow = tournamentData as unknown as { club_id?: string | null; venue_club_id?: string | null } | null;
        const [seatMap, clubMap, payRes, guestRes, waitRes] = await Promise.all([
          fetchSeatCounts([id]),
          fetchClubs([tRow?.club_id, tRow?.venue_club_id].filter(Boolean) as string[]),
          // refunded / partial_refund rows are kept so a cancelled or withdrawn player can see their refund
          user?.id ? sb.from("tournament_ticket_payments").select("amount_cents, succeeded_at, refunded_cents, status").eq("tournament_id", id).eq("user_id", user.id).in("status", ["succeeded", "partial_refund", "refunded"]).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
          user?.id ? sb.from("tournament_guest_entries").select("entry_type").eq("tournament_id", id).eq("claimed_user_id", user.id).limit(1).maybeSingle() : Promise.resolve({ data: null }),
          user?.id ? sb.from("tournament_waitlist").select("position, offered_at, offer_expires_at").eq("tournament_id", id).eq("user_id", user.id).is("resolved", null).limit(1).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        setSeats(seatMap[id] ?? null);
        setOrganiserClub(tRow?.club_id ? clubMap[tRow.club_id] ?? null : null);
        setVenueClub(tRow?.venue_club_id ? clubMap[tRow.venue_club_id] ?? null : null);
        setMyPayment(payRes.data ?? null);
        setMyGuestEntry(guestRes.data ?? null);
        setMyWaitlist(waitRes.data ?? null);

        // Latest organiser broadcast (RLS: seated players read kind='broadcast'); a read error just hides the card.
        const seated = !!user?.id && playersList.some(p => p.user_id === user.id && p.status === "confirmed");
        const guestIn = ["comp", "paid_offline", "paid"].includes((guestRes.data as { entry_type?: string } | null)?.entry_type ?? "");
        if (seated || guestIn) {
          const { data: msg } = await sb.from("tournament_messages").select("subject, body, created_at").eq("tournament_id", id).eq("kind", "broadcast").order("created_at", { ascending: false }).limit(1).maybeSingle();
          setLatestBroadcast(msg ?? null);
        } else setLatestBroadcast(null);
      }

      if (playersList.length > 0) {
        const userIds = playersList.map(p => p.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", userIds);
        const map: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
        profiles?.forEach(p => { map[p.user_id] = p; });
        setPlayerProfiles(map);
      }

      // Load user points & team
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("padel_park_points")
          .eq("user_id", user.id)
          .maybeSingle();
        setUserPoints(profile?.padel_park_points ?? 0);

        // Find user's team
        const { data: teams } = await supabase
          .from("tournament_teams")
          .select("id, player1_id, player2_id")
          .eq("tournament_id", id);

        if (teams) {
          const myTeam = teams.find((t) => t.player1_id === user.id || t.player2_id === user.id);
          if (myTeam) {
            setUserTeamId(myTeam.id);
            setUserTeamName("Your Team");
          }
        }

        // Load odds preview
        if (betConfig) {
          const { data: odds } = await supabase
            .from("tournament_bet_odds")
            .select("stage, odds_multiplier, tier_label, team_id")
            .eq("tournament_id", id);
          if (odds?.length) {
            // Get odds for user's team or first team
            const teamOdds = userTeamId
              ? odds.filter((o: any) => o.team_id === userTeamId)
              : odds.slice(0, 3);
            setPhaseOddsPreview(teamOdds.map((o: any) => ({
              stage: o.stage,
              multiplier: o.odds_multiplier,
              tier: o.tier_label,
            })));
          }
        }
      }

      setLoading(false);
    };
    load();
  }, [id, user?.id, reloadKey]);

  // Deep link from the Tournaments page ("Accept & pay" / "Accept"): open the join sheet once loaded.
  useEffect(() => {
    if (loading || !tournament || !user) return;
    if (searchParams.get("join") === "1") {
      if (!isJoined && !isCreator) setJoinOpen(true);
      searchParams.delete("join");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tournament?.id, user?.id]);

  const refreshSeats = async () => {
    if (!id) return;
    const m = await fetchSeatCounts([id]);
    setSeats(m[id] ?? null);
  };

  const handleJoinWaitlist = async () => {
    if (!user || !id) return;
    setWaitlistBusy(true);
    const sb = supabase as any;
    const { data: rows } = await sb.from("tournament_waitlist").select("position").eq("tournament_id", id).order("position", { ascending: false }).limit(1);
    const position = ((rows?.[0]?.position as number | undefined) ?? 0) + 1;
    const { error } = await sb.from("tournament_waitlist").insert({ tournament_id: id, user_id: user.id, position });
    setWaitlistBusy(false);
    if (error) {
      toast({ title: "Couldn't join the waitlist", description: error.message, variant: "destructive" });
      return;
    }
    setMyWaitlist({ position, offered_at: null, offer_expires_at: null });
    toast({ title: `You're #${position} on the waitlist`, description: "You'll have 12h to pay if a place frees up." });
    await refreshSeats();
  };

  /** Error body from tournament-refunds ({ error, message }) — FunctionsHttpError keeps it on context. */
  const fnErrorMessage = async (err: unknown) => {
    const ctx = (err as { context?: { json?: () => Promise<unknown> } })?.context;
    try { const b = (await ctx?.json?.()) as { message?: string; error?: string } | undefined; if (b?.message || b?.error) return b.message ?? b.error!; } catch { /* not JSON */ }
    return (err as Error)?.message ?? "Please try again.";
  };

  // Opening the confirm dialog asks the server what the refund would be (dry run) — nothing changes yet.
  const openWithdraw = async () => {
    setWithdrawOpen(true);
    if (!id || !myPayment) { setWithdrawPreview({ loading: false, refundCents: null, message: null }); return; }
    setWithdrawPreview({ loading: true, refundCents: null, message: null });
    const { data, error } = await supabase.functions.invoke("tournament-refunds", { body: { action: "withdraw", tournament_id: id, dry_run: true } });
    if (error) { setWithdrawPreview({ loading: false, refundCents: null, message: await fnErrorMessage(error) }); return; }
    const d = (data ?? {}) as { total_refund_cents?: number; refunded_cents?: number; plan?: { refund_cents?: number }[]; message?: string };
    const cents = d.total_refund_cents ?? (Array.isArray(d.plan) ? d.plan.reduce((a, x) => a + (Number(x?.refund_cents) || 0), 0) : d.refunded_cents ?? 0);
    setWithdrawPreview({ loading: false, refundCents: Number(cents) || 0, message: d.message ?? null });
  };

  const handleWithdraw = async () => {
    if (!user || !id) return;
    setWithdrawing(true);
    const { data, error } = await supabase.functions.invoke("tournament-refunds", { body: { action: "withdraw", tournament_id: id } });
    setWithdrawing(false);
    if (error) {
      toast({ title: "Couldn't withdraw", description: await fnErrorMessage(error), variant: "destructive" });
      return;
    }
    setWithdrawOpen(false);
    const res = (data ?? {}) as { refunded_cents?: number; message?: string };
    toast({ title: "You've withdrawn", description: res.message ?? ((res.refunded_cents ?? 0) > 0 ? `${formatGBP(res.refunded_cents!)} is on its way back to you.` : undefined) });
    setPlayers(prev => prev.map(p => (p.user_id === user.id ? { ...p, status: "cancelled" } : p)));
    await Promise.all([refreshSeats(), triggerRecalc()]);
    setReloadKey(k => k + 1);
  };

  const handleShare = async () => {
    if (!tournament) return;
    const url = publicTournamentUrl({ slug: tx?.slug, id: tournament.id });
    const start = tournamentStart(tournament);
    const text = `${tournament.name}${start ? ` · ${formatDayTime(start)}` : ""}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: tournament.name, text, url });
        return;
      }
    } catch { /* user cancelled or share unsupported — fall through to clipboard */ }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: url });
    } catch {
      toast({ title: "Share link", description: url });
    }
  };

  const triggerRecalc = async () => {
    if (!id) return;
    try {
      await supabase.functions.invoke("recalc-tournament-odds", {
        body: { tournamentId: id },
      });
      // Reload odds preview
      const { data: betConfig } = await supabase
        .from("tournament_bet_config")
        .select("id, odds_locked")
        .eq("tournament_id", id)
        .maybeSingle();
      setHasBetConfig(!!betConfig);
      setOddsLocked(betConfig?.odds_locked ?? false);

      if (betConfig) {
        const { data: odds } = await supabase
          .from("tournament_bet_odds")
          .select("stage, odds_multiplier, tier_label, team_id")
          .eq("tournament_id", id);
        if (odds?.length && userTeamId) {
          setPhaseOddsPreview(odds.filter((o: any) => o.team_id === userTeamId).map((o: any) => ({
            stage: o.stage,
            multiplier: o.odds_multiplier,
            tier: o.tier_label,
          })));
        }
      }
    } catch (e) {
      console.error("Recalc failed:", e);
    }
  };

  const handleJoinedViaModal = async (_partnerId?: string, _slotIndex?: number) => {
    if (!user || !id) return;
    const newPlayer: TournamentPlayer = {
      id: "",
      tournament_id: id,
      user_id: user.id,
      team_id: null,
      status: "confirmed",
      side_preference: null,
      joined_at: new Date().toISOString(),
      role: "player",
      partner_status: "solo",
      partner_user_id: null,
      slot_index: _slotIndex ?? null,
    };
    setPlayers((prev) => [...prev, newPlayer]);
    // If this join came from an invitation, mark it accepted (RLS: invited_user_id = me).
    await (supabase as any)
      .from("tournament_invitations")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("tournament_id", id)
      .eq("invited_user_id", user.id)
      .eq("status", "pending");
    await Promise.all([refreshSeats(), triggerRecalc()]);
  };

  const reloadPlayers = async () => {
    if (!id) return;
    const { data: tp } = await supabase.from("tournament_players").select("*").eq("tournament_id", id);
    const playersList = (tp as unknown as TournamentPlayer[]) || [];
    setPlayers(playersList);
  };

  const handleLaunch = async () => {
    if (!user || !id || !tournament) return;

    // Guard: tournament must have a real name
    const nameOk = tournament.name && tournament.name.trim() && tournament.name !== "Untitled Tournament";
    if (!nameOk) {
      toast({ title: "Add a tournament name", description: "Go back to the wizard to set a name before launching.", variant: "destructive" });
      return;
    }

    // Guard: at least 2 players must have joined
    if (playingCount < 2) {
      toast({ title: "Not enough players", description: `You need at least 2 players. Currently ${playingCount}/${tournament.player_count} have joined.`, variant: "destructive" });
      return;
    }

    setLaunching(true);
    // Bracket generation moved to the `tournament-publish-and-launch` edge function
    // so both the Club app's Publish and the Players app's Launch take the same
    // server-side path (validates auth, generates teams + matches atomically,
    // flips status to 'active', fans out notifications). Falls back to the
    // legacy client-side `launchTournament` if the edge fn is unreachable.
    let success = false;
    let errorMsg: string | undefined;
    try {
      const { data, error } = await supabase.functions.invoke("tournament-publish-and-launch", {
        body: { tournament_id: id },
      });
      if (error) {
        type ErrPayload = { error?: string; message?: string; failed_hard?: string[] };
        const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
        let payload: ErrPayload | null = null;
        try { payload = (await ctx?.json?.()) as ErrPayload; } catch { /* ignore */ }
        errorMsg = payload?.message ?? error.message;
        if (payload?.failed_hard?.length) errorMsg += ` (${payload.failed_hard.join(", ")})`;
      } else {
        success = !!(data as { success?: boolean } | null)?.success;
      }
    } catch (e) {
      // Network / unexpected error — fall back to the client-side path so a
      // brief edge-fn outage doesn't block organisers entirely.
      const result = await launchTournament(id, user.id);
      success  = result.success;
      errorMsg = result.error;
    }

    setLaunching(false);
    if (!success) {
      toast({ title: "Launch failed", description: errorMsg, variant: "destructive" });
    } else {
      toast({ title: "Tournament launched! 🏆" });
      navigate(`/tournaments/${id}/live`);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const { error } = await supabase.from("tournaments").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Tournament deleted" });
      navigate("/tournaments");
    }
  };

  const formatLabel = (stage: string) =>
    stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-muted-foreground">Tournament not found</p>
        <Button variant="ghost" onClick={() => navigate("/tournaments")} className="mt-4">Back</Button>
      </div>
    );
  }

  const confirmedPlayers = players.filter(p => p.status === "confirmed");

  return (
    <div className="min-h-screen pb-80">
      {/* Header with back button and status badges */}
      <div className="sticky top-0 z-10 bg-background border-b border-border/[0.07] px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate("/tournaments")}
          aria-label="Back to tournaments"
          className="w-8 h-8 rounded-[10px] bg-card flex items-center justify-center hover:bg-card/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            aria-label="Share tournament"
            className="w-8 h-8 rounded-[10px] bg-card flex items-center justify-center hover:bg-card/80 transition-colors text-foreground"
          >
            <Share2 className="w-4 h-4" />
          </button>
          {/* Bracket shortcut — always available once the tournament is published
              (Apple Sports-style header button, deep-links to the bracket tab) */}
          {tournament.status !== "draft" && (
            <button
              onClick={() => navigate(`/tournaments/${tournament.id}/live?tab=bracket`)}
              aria-label="Open bracket"
              className="w-8 h-8 rounded-[10px] bg-card flex items-center justify-center hover:bg-card/80 transition-colors text-primary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h5M3 18h5M8 6v4M8 18v-4M8 12h6" />
                <circle cx="18" cy="12" r="2.6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* ── My status card (PL5) — first thing on the page once you have a place ── */}
        {!isCreator && (isRegistered || myWaitlist || tournament.status === "cancelled") && (() => {
          const isCancelled = tournament.status === "cancelled";
          const tone = isCancelled ? HUE.red : myWaitlist && !isRegistered ? HUE.amber : guestComp ? HUE.lav : HUE.lime;
          const Icon = isCancelled ? Ban : myWaitlist && !isRegistered ? Hourglass : guestComp ? Gift : Check;
          const offerActive = !!myWaitlist?.offered_at && !!myWaitlist?.offer_expires_at && new Date(myWaitlist.offer_expires_at).getTime() > Date.now();
          let title = "You're registered";
          let body: React.ReactNode = null;
          if (isCancelled) {
            title = "Cancelled by the organiser";
            const reason = (tournament as { cancelled_reason?: string | null }).cancelled_reason?.trim();
            const refunded = myPayment ? (myPayment.refunded_cents || myPayment.amount_cents) : 0;
            body = <>{reason ? <>“{reason}”</> : null}{reason && refunded > 0 ? " · " : null}{refunded > 0 ? <>your <Mono>{formatGBP(refunded)}</Mono> refund is on its way</> : !reason ? "Nothing to pay." : null}</>;
          } else if (isRegistered) {
            if (guestComp) { title = "You have a free place"; body = <>Comp from {organiserClub?.club_name || tournament.club || "the organiser"} · nothing to pay</>; }
            else if (myPayment) body = <>Paid <Mono>{formatShortDate(myPayment.succeeded_at ? new Date(myPayment.succeeded_at) : null) || "in the app"}</Mono> · <Mono>{formatGBP(myPayment.amount_cents)}</Mono></>;
            else if (guestPaidOffline || isPaidTournament) body = "Paid the organiser directly · nothing to pay here";
            else body = "Free tournament · nothing to pay";
          } else if (myWaitlist) {
            if (offerActive) { title = "A place is free — it's yours"; body = <>Pay <Mono>{formatGBP(priceCents)}</Mono> before <Mono>{formatDayTime(new Date(myWaitlist.offer_expires_at as string))}</Mono> or it goes to the next person</>; }
            else { title = `Waitlist #${myWaitlist.position}`; body = "You'll have 12h to pay if a place frees up · we'll push + email you"; }
          }
          return (
            <div className="rounded-2xl p-3.5" style={{ background: tint(tone, 14), border: `1.5px solid ${tint(tone, 55)}` }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: tone }}>
                  <Icon className="w-5 h-5" style={{ color: "hsl(var(--primary-foreground))" }} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-extrabold text-foreground">{title}</p>
                  {body && <p className="text-[13px] font-semibold text-foreground mt-0.5">{body}</p>}
                </div>
                {offerActive && !isRegistered && (
                  <Button size="sm" className="rounded-xl font-bold" onClick={() => setJoinOpen(true)}>Pay {formatGBP(priceCents)}</Button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Latest organiser message (PL5) — pinned under the status card ── */}
        {!isCreator && isRegistered && tournament.status !== "cancelled" && latestBroadcast && (latestBroadcast.subject || latestBroadcast.body) && (
          <div className="rounded-2xl p-3.5 bg-card" style={{ border: `1px solid ${tint(HUE.sky, 40)}` }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Megaphone className="w-4 h-4 shrink-0" style={{ color: HUE.sky }} />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-foreground truncate">Message from the organiser</span>
              </div>
              <Mono className="text-[12px] shrink-0">{formatDistanceToNowStrict(new Date(latestBroadcast.created_at), { addSuffix: true })}</Mono>
            </div>
            {latestBroadcast.subject && <p className="text-[15px] font-extrabold text-foreground mt-2.5">{latestBroadcast.subject}</p>}
            {latestBroadcast.body && <p className="text-[14px] font-semibold text-foreground mt-1 whitespace-pre-line break-words">{latestBroadcast.body}</p>}
            <p className="text-[12px] font-semibold text-foreground/80 mt-2 inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Also sent to your email · reply there to reach the organiser</p>
          </div>
        )}

        {/* ── Live-day banner (PL5) — replaces the status card's job on the day ── */}
        {tournament.status === "active" && tx?.is_live && (
          <button onClick={() => navigate(`/tournaments/${tournament.id}/live`)} className="w-full text-left rounded-2xl px-4 py-3.5 flex items-center justify-between" style={{ background: HUE.lime, color: "hsl(var(--primary-foreground))" }}>
            <div>
              <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.1em]">
                <span className="w-[7px] h-[7px] rounded-full animate-pulse" style={{ background: "hsl(var(--primary-foreground))" }} />
                Live now
              </div>
              <div className="font-display font-black italic uppercase text-[22px] mt-1">Open live view</div>
            </div>
            <ArrowLeft className="w-5 h-5 rotate-180" />
          </button>
        )}

        {/* ── Hero (PL3) ── */}
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {tournament.status === "draft" ? <Chip k="unlisted" sm>Draft</Chip>
              : tournament.visibility === "public" ? <Chip k="public" sm />
              : (tournament.visibility as string) === "unlisted" ? <Chip k="unlisted" sm />
              : <Chip k="private" sm />}
            <FormatChip>{tournamentFormatLabel(tournament.format_type, tournament.tournament_type)}</FormatChip>
            {STAKES_ENABLED && hasBetConfig && <Chip k="xp" sm>Betting</Chip>}
          </div>
          <h1 className="font-display text-[34px] font-black italic uppercase text-foreground leading-[0.95] tracking-[-0.02em] mt-2.5">
            {tournament.name}
          </h1>
          {/* Organiser line */}
          <div className="flex items-center gap-2 mt-2.5 min-w-0">
            {organiserClub?.logo_url ? (
              <img src={organiserClub.logo_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
            ) : (
              <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[11px] font-extrabold text-foreground shrink-0" style={{ background: tint(HUE.sky, 22) }}>
                {(organiserClub?.club_name || tournament.club || "?")[0]?.toUpperCase()}
              </span>
            )}
            <span className="text-[13px] font-bold text-foreground truncate">{organiserClub?.club_name || tournament.club || "Organiser"}</span>
            <span className="text-[12px] font-medium text-foreground/90 shrink-0">· organiser</span>
          </div>
        </div>

        {/* Facts grid: date · time · level · places */}
        {(() => {
          const start = tournamentStart(tournament);
          const lvl = levelRange(skillLevelMin, skillLevelMax);
          const Fact = ({ icon, l, v }: { icon: React.ReactNode; l: string; v: React.ReactNode }) => (
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0" style={{ color: HUE.sky }}>{icon}</span>
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-foreground/90">{l}</div>
                <div className="mt-0.5"><Mono className="text-[14px] font-bold">{v}</Mono></div>
              </div>
            </div>
          );
          return (
            <div className="grid grid-cols-2 gap-3.5 p-3.5 rounded-2xl bg-card">
              <Fact icon={<CalendarDays className="w-4 h-4" />} l="Date" v={start ? start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "TBC"} />
              <Fact icon={<Clock className="w-4 h-4" />} l="Time" v={tournament.scheduled_time ? tournament.scheduled_time.slice(0, 5) : "TBC"} />
              <Fact icon={<BarChart3 className="w-4 h-4" />} l="Level" v={lvl ?? "All levels"} />
              <Fact icon={<Hourglass className="w-4 h-4" />} l="Duration" v={tournament.total_time_mins ? `~${Math.round(tournament.total_time_mins / 60 * 2) / 2}h` : "TBC"} />
            </div>
          );
        })()}

        {/* Venue card */}
        {(() => {
          const provider = venueProvider(venueClub);
          const name = tx?.venue_name || venueClub?.club_name || tournament.club;
          const addr = tx?.venue_address || venueClub?.location || venueClub?.city || null;
          if (!name && !addr) return null;
          return (
            <div className="rounded-2xl bg-card p-3.5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: HUE.sky }} />
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold text-foreground">{name || "Venue"}</p>
                  {addr && <p className="text-[12px] font-semibold text-foreground/90">{addr}</p>}
                </div>
              </div>
              {provider && <Chip k={provider.kind} sm>{provider.label}</Chip>}
            </div>
          );
        })()}

        {/* Seats card — "13 / 16 · 3 left" from the RPC */}
        {(() => {
          const total = seats?.total ?? tournament.player_count;
          const deadline = tx?.registration_deadline ? new Date(tx.registration_deadline) : null;
          return (
            <div className="rounded-2xl bg-card p-3.5">
              <div className="flex items-baseline justify-between">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-foreground/90">Places</div>
                <div className="flex items-center gap-2">
                  <Mono className="text-[18px] font-bold">{seatsTaken} / {total}</Mono>
                  {spotsLeft <= 0 ? <Chip k="full" sm /> : spotsLeft <= 3 ? <Chip k="left" sm>{spotsLeft} left</Chip> : <Mono className="text-[12px] font-bold">{spotsLeft} left</Mono>}
                </div>
              </div>
              <div className="mt-2.5"><SeatsBar taken={seatsTaken} total={total} /></div>
              {deadline && (
                <p className="text-[12px] font-medium text-foreground mt-2">Registration closes <Mono className="text-[12px]">{formatDayTime(deadline)}</Mono></p>
              )}
            </div>
          );
        })()}

        {/* Price + policy card (hidden once you're in — the status card says what you paid) */}
        {!isRegistered && !isCreator && (() => {
          const dl = refundDeadline(tournament as typeof tournament & { registration_deadline?: string | null; cancellation_policy?: string | null });
          const policy = cancellationPolicyText(tx?.cancellation_policy, tx?.cancellation_policy_text);
          return (
            <div className="rounded-2xl p-3.5" style={{ background: tint(HUE.lime, 6), border: `1px solid ${tint(HUE.lime, 40)}` }}>
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.1em]" style={{ color: HUE.lime }}>{isPaidTournament ? "Entry ticket" : "Entry"}</div>
                <Mono className="text-[22px] font-bold">{formatGBP(priceCents)}</Mono>
              </div>
              {isPaidTournament && dl && dl.getTime() > Date.now() && (
                <p className="text-[13px] font-bold text-foreground mt-1.5">Full refund until <Mono className="text-[13px]">{formatDayTime(dl)}</Mono></p>
              )}
              <div className="flex items-start gap-2 mt-2">
                <ShieldCheck className="w-[15px] h-[15px] mt-0.5 shrink-0" style={{ color: HUE.sky }} />
                <p className="text-[12px] font-semibold text-foreground">{policy}</p>
              </div>
            </div>
          );
        })()}

        {/* Points hint */}
        <XpLine text={isRegistered ? "XPLAY Points when you play" : "XPLAY Points for playing"} />

        {/* About */}
        {tx?.description && (
          <div className="rounded-2xl bg-card p-3.5">
            <h2 className="font-display font-extrabold text-[16px] text-foreground">About</h2>
            <p className="text-[14px] font-medium text-foreground mt-1.5 whitespace-pre-line">{tx.description}</p>
          </div>
        )}

        {/* Betting Card — gated behind STAKES_ENABLED (see src/lib/featureFlags.ts) */}
        {STAKES_ENABLED && (hasBetConfig || isJoined) && (
          <div className="rounded-[18px] bg-primary/[0.06] border border-primary/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black text-primary uppercase tracking-[0.14em]">● Live Odds</div>
              <div className="text-[10px] text-muted-foreground font-bold">{userPoints} XP</div>
            </div>

            {/* Odds grid - 3 columns */}
            {phaseOddsPreview.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {phaseOddsPreview.map(p => (
                  <div key={p.stage} className="rounded-[12px] bg-background/50 border border-border/[0.06] p-[10px_6px] text-center">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.1em]">{formatLabel(p.stage)}</p>
                    <p className="font-display text-[17px] font-black italic text-primary leading-none mt-0.5">×{p.multiplier.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{p.tier}</p>
                  </div>
                ))}
              </div>
            )}

            {!oddsLocked && (
              <p className="text-[11px] text-muted-foreground text-center">
                Multipliers update as players join
              </p>
            )}

            {/* Coordinator block */}
            {isCreator ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/30 text-[11px] text-muted-foreground">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                Coordinators cannot bet on their tournament.
              </div>
            ) : isJoined ? (
              <Button
                onClick={() => setBetSheetOpen(true)}
                className="w-full rounded-[12px] h-10 font-semibold gap-2 text-sm bg-primary text-primary-foreground"
              >
                <TrendingUp className="w-4 h-4" />
                Place Your Bets
              </Button>
            ) : !hasBetConfig ? (
              <p className="text-[10px] text-muted-foreground text-center">
                Join the tournament to place bets
              </p>
            ) : null}
          </div>
        )}

        {/* Format Section */}
        {(tournament.format_type || skillLevelMin != null) && (
          <div>
            <div className="text-[10px] font-black tracking-[0.14em] text-muted-foreground uppercase px-[20px] pb-1.5">Details</div>
            <div className="mx-4 p-3 rounded-[14px] bg-card border border-border/[0.07] space-y-2 text-[12px] text-foreground">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Format</span>
                <span className="font-semibold capitalize">{tournament.format_type.replace("_", " ")}</span>
              </div>
              {skillLevelMin != null && skillLevelMax != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Skill Level</span>
                  <span className="font-semibold">{skillLevelMin} – {skillLevelMax}</span>
                </div>
              )}
              {tournament.require_admin_approval && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Approval</span>
                  <span className="font-semibold text-amber-400">Required</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Approval requests panel */}
        {isCreator && tournament.status === "draft" && (
          <ApprovalRequestPanel tournamentId={tournament.id} onApproved={reloadPlayers} />
        )}

        {/* Partner confirm banner */}
        {tournament && user && !isCreator && (
          <PartnerConfirmBanner
            tournamentId={tournament.id}
            onResponded={reloadPlayers}
          />
        )}

        {/* Structure / Fixture toggle */}
        <div>
          <div className="flex gap-1 bg-muted/30 rounded-lg p-1 w-fit mb-3">
            <button
              onClick={() => setViewMode("structure")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "structure" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              Tournament Structure
            </button>
            <button
              onClick={() => setViewMode("fixture")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "fixture" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              📋 Fixture View
            </button>
          </div>
          {viewMode === "structure" && (
            <TournamentStructurePreview
              formatType={tournament.format_type}
              tournamentType={tournament.tournament_type as "pairs" | "individual"}
              playerCount={tournament.player_count}
              courtCount={tournament.court_count}
              bracketConfig={(tournament.bracket_config || {}) as BracketConfig}
              filledPlayers={confirmedPlayers.map(p => playerProfiles[p.user_id]?.display_name || "Player")}
              canvasState={undefined}
            />
          )}
          {viewMode === "fixture" && (
            <TournamentFixtureView
              formatType={tournament.format_type}
              tournamentType={tournament.tournament_type as "pairs" | "individual"}
              playerCount={tournament.player_count}
              courtCount={tournament.court_count}
              bracketConfig={(tournament.bracket_config || {}) as BracketConfig}
              filledPlayers={confirmedPlayers.map(p => playerProfiles[p.user_id]?.display_name || "Player")}
              canvasState={undefined}
            />
          )}
        </div>

        {/* Players */}
        <div>
          <h2 className="text-[14px] font-bold text-foreground mb-3">{tournament.tournament_type === "pairs" ? "Pairs" : "Players"} ({confirmedPlayers.length})</h2>
          <div className="space-y-1">
            {confirmedPlayers.map(p => {
              const prof = playerProfiles[p.user_id];
              return (
                <div key={p.id || p.user_id} className="flex items-center gap-3 p-2.5 rounded-[14px] bg-card/30">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                    {prof?.display_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <span className="text-sm font-medium truncate">{prof?.display_name || "Player"}</span>
                  {p.user_id === tournament.created_by && (
                    // Show the organiser crown for the creator regardless of whether
                    // they're also playing (role='organiser' or 'organiser_player').
                    <AdminBadge
                      role={(p.role === "organiser" || p.role === "organiser_player") ? "organiser" : "admin"}
                      size="sm"
                    />
                  )}
                  {p.role === "organiser" && (
                    // Not playing — won't appear in the bracket
                    <Badge variant="outline" className="text-[11px] ml-auto">Organiser only</Badge>
                  )}
                  {p.role === "organiser_player" && (
                    // Organising AND playing — counts toward the bracket
                    <Badge variant="outline" className="text-[11px] ml-auto">Organiser · playing</Badge>
                  )}
                  {p.user_id === tournament.created_by
                    && p.role !== "organiser"
                    && p.role !== "organiser_player" && (
                    <Badge variant="outline" className="text-[11px] ml-auto">Organiser</Badge>
                  )}
                  {p.partner_status === "pending" && (
                    <Badge variant="outline" className="text-[11px] ml-auto text-warning border-warning/40">⏳ Partner pending</Badge>
                  )}
                  {p.partner_status === "confirmed" && tournament.tournament_type === "pairs" && (
                    <Badge variant="outline" className="text-[11px] ml-auto text-primary border-primary/40">✓ Paired</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Invite modal */}
        {tournament && (
          <InviteTournamentPlayerModal
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            tournamentId={tournament.id}
            tournamentName={tournament.name}
            existingPlayerIds={players.map(p => p.user_id)}
          />
        )}

        {/* Join modal */}
        {tournament && (
          <JoinTournamentModal
            open={joinOpen}
            onOpenChange={setJoinOpen}
            tournamentId={tournament.id}
            tournamentType={tournament.tournament_type as "pairs" | "individual"}
            formatType={tournament.format_type}
            playerCount={tournament.player_count}
            courtCount={tournament.court_count}
            bracketConfig={(tournament.bracket_config || {}) as BracketConfig}
            filledPlayers={confirmedPlayers.map(p => playerProfiles[p.user_id]?.display_name || "Player")}
            existingPlayerIds={players.map(p => p.user_id)}
            takenSlots={players.filter(p => p.slot_index !== null).map(p => p.slot_index as number)}
            onJoined={handleJoinedViaModal}
            skillLevelMin={skillLevelMin}
            skillLevelMax={skillLevelMax}
            requireAdminApproval={tournament.require_admin_approval}
            ticketPriceCents={(tournament as typeof tournament & { ticket_price_cents?: number | null }).ticket_price_cents ?? 0}
          />
        )}

        {/* Bet Sheet — gated behind STAKES_ENABLED (see src/lib/featureFlags.ts) */}
        {STAKES_ENABLED && (
          <TournamentBetSheet
            open={betSheetOpen}
            onClose={() => setBetSheetOpen(false)}
            tournament={tournament ? {
              tournamentId: tournament.id,
              name: tournament.name,
              formatType: tournament.format_type,
              bracketConfig: tournament.bracket_config || {},
            } : null}
            onBetPlaced={() => {}}
            isCreatorBlocked={isCreator}
          />
        )}
      </div>

      {/* Sticky CTA Footer — sits ABOVE the AppLayout bottom nav (which is
          fixed bottom-0 z-50, ~98px tall + safe-area). The old version used a
          transparent gradient anchored at bottom-0, so (a) the nav covered the
          last button(s) and (b) the "Need at least 2 players" hint rendered
          semi-transparently on top of page content and was unreadable.
          Fix: solid blurred panel, z-40 (below nav/modals), and a bottom
          padding that reserves exactly the nav's height + safe-area. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/[0.08] px-4 pt-3"
        style={{ paddingBottom: "calc(var(--bottom-nav-clearance, 98px) + 8px)" }}
      >
        <div className="flex flex-col gap-2 max-w-4xl mx-auto">
          {tournament.status === "draft" && isCreator && (
            <>
              {playingCount < 2 && (
                <p className="text-[11px] text-center text-muted-foreground">
                  Need at least 2 players to launch · {playingCount}/{tournament.player_count} joined
                </p>
              )}
              <button
                onClick={handleLaunch}
                disabled={launching || playingCount < 2}
                className="w-full h-[54px] rounded-[16px] bg-primary text-primary-foreground font-display text-[14px] font-black italic uppercase tracking-[0.04em] flex items-center justify-between px-[18px] shadow-[0_6px_24px_hsl(var(--primary)/0.35)] hover:bg-primary/90 disabled:opacity-40 disabled:shadow-none transition-all"
              >
                <span>Launch tournament</span>
                <span>🏆</span>
              </button>
            </>
          )}

          {tournament.status === "active" && (() => {
            // is_live flips to true only when an organiser hits Go Live in the Club app.
            // While the tournament is just published/active but not yet live, we still
            // let players open the live screen — but the label makes it clear it's a
            // status view, not the start action.
            const isActuallyLive = (tournament as typeof tournament & { is_live?: boolean | null }).is_live === true;
            // When live, the lime banner at the top of the page is the way in — don't double up here.
            if (isActuallyLive) return null;
            return (
              <button
                onClick={() => navigate(`/tournaments/${tournament.id}/live`)}
                className="w-full h-[44px] rounded-[14px] border border-border bg-card text-foreground text-[13px] font-extrabold flex items-center justify-between px-[16px] hover:bg-card/80 transition-all"
              >
                <span>Fixtures &amp; bracket</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            );
          })()}

          {(tournament.status === "draft" || tournament.status === "active") && (
            <>
              {!isRegistered && !isCreator && spotsLeft > 0 && (
                <>
                  {isPaidTournament && (
                    <p className="text-[12px] font-semibold text-center text-foreground">
                      <Mono className="text-[12px] font-bold">{formatGBP(priceCents)}</Mono>
                      {(() => { const dl = refundDeadline(tournament as typeof tournament & { registration_deadline?: string | null; cancellation_policy?: string | null }); return dl && dl.getTime() > Date.now() ? <> · Full refund until <Mono className="text-[12px]">{formatDayTime(dl)}</Mono></> : null; })()}
                    </p>
                  )}
                  <button
                    onClick={() => setJoinOpen(true)}
                    className="w-full h-[54px] rounded-[16px] bg-primary text-primary-foreground font-display text-[15px] font-extrabold flex items-center justify-between px-[18px] shadow-[0_6px_24px_hsl(var(--primary)/0.35)] hover:bg-primary/90 transition-all"
                  >
                    <span>{guestAwaiting ? "Accept" : "Join"}{isPaidTournament ? <> &amp; pay <Mono className="text-[15px] font-bold">{formatGBP(priceCents)}</Mono></> : ""}</span>
                    <Mono className="text-[12px] font-bold">{spotsLeft} left</Mono>
                  </button>
                </>
              )}
              {!isRegistered && !isCreator && spotsLeft <= 0 && tournament.status === "active" && (
                myWaitlist ? (
                  <p className="text-[13px] font-bold text-center text-foreground">
                    You're <Mono>#{myWaitlist.position}</Mono> on the waitlist · you'll have <Mono>12h</Mono> to pay if a place frees up
                  </p>
                ) : tx?.waitlist_enabled ? (
                  <button
                    onClick={handleJoinWaitlist}
                    disabled={waitlistBusy}
                    className="w-full h-[54px] rounded-[16px] bg-primary text-primary-foreground font-display text-[15px] font-extrabold flex items-center justify-between px-[18px] shadow-[0_6px_24px_hsl(var(--primary)/0.35)] hover:bg-primary/90 disabled:opacity-50 transition-all"
                  >
                    <span>Join the waitlist</span>
                    <span className="text-[12px] font-bold">No charge now</span>
                  </button>
                ) : (
                  <p className="text-[13px] font-bold text-center text-foreground">This tournament is full</p>
                )
              )}
              {isJoined && !isCreator && (
                // Withdraw — quiet action with the cancellation policy in the confirm dialog
                <AlertDialog open={withdrawOpen} onOpenChange={o => { if (!withdrawing) setWithdrawOpen(o); }}>
                  <div className="flex items-start justify-between gap-3 pt-1">
                    <p className="text-[12px] font-semibold text-foreground">
                      {(() => { const dl = refundDeadline(tournament as typeof tournament & { registration_deadline?: string | null; cancellation_policy?: string | null }); return isPaidTournament && dl && dl.getTime() > Date.now() ? <>Full refund until <Mono className="text-[12px]">{formatDayTime(dl)}</Mono>. No refund after that.</> : cancellationPolicyText(tx?.cancellation_policy, tx?.cancellation_policy_text); })()}
                    </p>
                    <button onClick={openWithdraw} className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-foreground shrink-0 whitespace-nowrap">
                      <LogOut className="w-3.5 h-3.5" /> Withdraw
                    </button>
                  </div>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Withdraw from {tournament.name}?</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          {myPayment && (
                            <div className="rounded-xl px-3.5 py-3 text-foreground" style={{ background: tint(withdrawPreview.refundCents ? HUE.lime : HUE.amber, 14), border: `1px solid ${tint(withdrawPreview.refundCents ? HUE.lime : HUE.amber, 50)}` }}>
                              {withdrawPreview.loading ? (
                                <span className="inline-flex items-center gap-2 text-[14px] font-bold"><Loader2 className="w-4 h-4 animate-spin" />Checking your refund…</span>
                              ) : withdrawPreview.refundCents ? (
                                <p className="text-[15px] font-extrabold">You'll get <Mono>{formatGBP(withdrawPreview.refundCents)}</Mono> back</p>
                              ) : withdrawPreview.refundCents === 0 ? (
                                <p className="text-[15px] font-extrabold">{tx?.cancellation_policy === "custom" ? "No automatic refund — the organiser decides" : "No refund under this tournament's policy"}</p>
                              ) : (
                                <p className="text-[14px] font-bold">We couldn't check your refund right now.</p>
                              )}
                              {!withdrawPreview.loading && withdrawPreview.message && <p className="text-[13px] font-semibold mt-1">{withdrawPreview.message}</p>}
                            </div>
                          )}
                          <p className="text-[13px] text-foreground">{cancellationPolicyText(tx?.cancellation_policy, tx?.cancellation_policy_text)} You can rejoin later if places are still available.</p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl" disabled={withdrawing}>Stay in</AlertDialogCancel>
                      <AlertDialogAction onClick={e => { e.preventDefault(); handleWithdraw(); }} disabled={withdrawing || withdrawPreview.loading} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {withdrawing && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Withdraw
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {isCreator && (
                // Invite + Delete share one compact row so the creator's footer
                // stack stays short (Launch is the only full-height primary CTA).
                <div className="flex gap-2">
                  <button
                    onClick={() => setInviteOpen(true)}
                    className="flex-1 h-[48px] rounded-[14px] border border-primary/30 text-primary font-display text-[13px] font-black italic uppercase tracking-[0.04em] hover:bg-primary/10 transition-all flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Invite Players
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        aria-label="Delete tournament"
                        className="w-[48px] h-[48px] shrink-0 rounded-[14px] border border-destructive/30 text-destructive hover:bg-destructive/10 transition-all flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete tournament?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{tournament.name}" and all associated data. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </>
          )}

          {/* Standalone Delete — only for creators of finished/cancelled
              tournaments (draft/active creators get it inline next to Invite). */}
          {isCreator && tournament.status !== "draft" && tournament.status !== "active" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="w-full h-[48px] rounded-[14px] border border-destructive/30 text-destructive font-display text-[13px] font-black italic uppercase tracking-[0.04em] hover:bg-destructive/10 transition-all flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete tournament?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{tournament.name}" and all associated data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
};

export default TournamentDetail;
