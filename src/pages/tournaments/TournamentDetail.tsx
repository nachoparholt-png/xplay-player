import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Trophy, Users, MapPin, Calendar, Clock, Lock, Globe, Send, Play, Rocket, Trash2, TrendingUp, Coins, ShieldAlert } from "lucide-react";
import AdminBadge from "@/components/tournaments/AdminBadge";
import TournamentStructurePreview from "@/components/tournaments/TournamentStructurePreview";
import TournamentFixtureView from "@/components/tournaments/TournamentFixtureView";
import type { BracketConfig } from "@/lib/tournaments/types";
import { formatPrice } from "@/lib/shopify";
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

  const isCreator = tournament?.created_by === user?.id;
  const isJoined = players.some(p => p.user_id === user?.id && p.status === "confirmed");
  const playingCount = players.filter(p => p.status === "confirmed" && p.role !== "organiser").length;
  const spotsLeft = tournament ? tournament.player_count - playingCount : 0;

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
  }, [id, user?.id]);

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
    await triggerRecalc();
  };

  const reloadPlayers = async () => {
    if (!id) return;
    const { data: tp } = await supabase.from("tournament_players").select("*").eq("tournament_id", id);
    const playersList = (tp as unknown as TournamentPlayer[]) || [];
    setPlayers(playersList);
  };

  const handleLeave = async () => {
    if (!user || !id) return;
    const { error } = await supabase
      .from("tournament_players")
      .delete()
      .eq("tournament_id", id)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Left tournament" });
      setPlayers(prev => prev.filter(p => p.user_id !== user.id));
      await triggerRecalc();
    }
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
          className="w-8 h-8 rounded-[10px] bg-card flex items-center justify-center hover:bg-card/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2">
          {tournament.visibility === "draft" && tournament.status === "draft" && (
            <Badge className="bg-primary/15 text-primary text-[9px] font-black uppercase tracking-[0.14em]">Draft</Badge>
          )}
          {tournament.visibility === "public" && (
            <Badge className="bg-purple-500/20 text-purple-300 text-[9px] font-black uppercase tracking-[0.14em]">Public</Badge>
          )}
          {tournament.visibility === "private" && tournament.status !== "draft" && (
            <Badge className="bg-amber-400/15 text-amber-400 text-[9px] font-black uppercase tracking-[0.14em]">Private</Badge>
          )}
          {STAKES_ENABLED && hasBetConfig && (
            <Badge className="bg-primary/15 text-primary text-[9px] font-black uppercase tracking-[0.14em]">Betting</Badge>
          )}
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

      <div className="px-4 py-5 space-y-6">
        {/* Title Hero */}
        <div>
          <div className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em] mb-2">
            🏆 {tournament.tournament_type === "pairs" ? "Round robin" : "Individual"} · {tournament.player_count} {tournament.tournament_type === "pairs" ? "pairs" : "players"}
          </div>
          <h1 className="font-display text-[30px] font-black italic uppercase text-foreground leading-[0.9] tracking-[-0.02em]">
            {tournament.name}
          </h1>
          <div className="text-[11px] text-muted-foreground/55 mt-2 flex items-center gap-3">
            {tournament.club && <span>{tournament.club}</span>}
            {tournament.scheduled_date && (
              <span>
                {new Date(tournament.scheduled_date + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: "short", day: "numeric", month: "short",
                })}
              </span>
            )}
          </div>
        </div>

        {/* Ticket price banner — only when the organiser set ticket_price_cents > 0.
            Surfaces the £/€ amount so players can't get to the join CTA
            without knowing they'll be charged. */}
        {(() => {
          const priceCents = (tournament as typeof tournament & { ticket_price_cents?: number | null }).ticket_price_cents ?? 0;
          const discountPct = (tournament as typeof tournament & { member_discount_pct?: number | null }).member_discount_pct ?? 0;
          if (priceCents <= 0) return null;
          const currencyCode = "GBP"; // TODO: thread club.currency through here once exposed
          const gross = priceCents / 100;
          const discounted = discountPct > 0 ? gross * (1 - discountPct / 100) : null;
          return (
            <div className="rounded-[14px] bg-primary/[0.06] border border-primary/30 p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  Entry ticket
                </div>
                <div className="font-display text-[26px] font-black italic text-foreground leading-none mt-1">
                  {formatPrice(discounted ?? gross, currencyCode)}
                </div>
                {discounted != null && (
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="line-through">{formatPrice(gross, currencyCode)}</span>
                    <span className="font-bold text-primary/80 uppercase tracking-[0.12em]">
                      {Math.round(discountPct)}% members
                    </span>
                  </div>
                )}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 text-right max-w-[140px]">
                {discounted != null
                  ? "Member rate applied at checkout if eligible"
                  : "Charged when you join"}
              </div>
            </div>
          );
        })()}

        {/* 2 Dominant Numbers */}
        <div className="flex gap-3">
          {/* Pairs Joined Card */}
          <div className="flex-1 p-3 rounded-[14px] bg-card border border-border/[0.07]">
            <div className="leading-none">
              <div className="font-display text-[24px] font-black italic text-foreground leading-[0.95]">
                {playingCount}
                <span className="text-[14px] text-muted-foreground/40 font-normal not-italic ml-0.5">/{tournament.player_count}</span>
              </div>
            </div>
            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.1em] mt-1.5">
              {tournament.tournament_type === "pairs" ? "Pairs" : "Players"} Joined
            </div>
          </div>

          {/* XP Pool or Spots Left */}
          {tournament.prize_pool && tournament.prize_pool > 0 ? (
            <div className="flex-1 p-3 rounded-[14px] bg-amber-400/10 border border-amber-400/20">
              <div className="leading-none">
                <div className="font-display text-[24px] font-black italic text-amber-400 leading-[0.95]">
                  {tournament.prize_pool}
                </div>
              </div>
              <div className="text-[9px] font-bold text-amber-400/70 uppercase tracking-[0.1em] mt-1.5">
                XP Prize Pool
              </div>
            </div>
          ) : (
            <div className="flex-1 p-3 rounded-[14px] bg-card border border-border/[0.07]">
              <div className="leading-none">
                <div className="font-display text-[24px] font-black italic text-foreground leading-[0.95]">
                  {spotsLeft}
                </div>
              </div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.1em] mt-1.5">
                Spots Left
              </div>
            </div>
          )}
        </div>

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
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-[0.1em]">{formatLabel(p.stage)}</p>
                    <p className="font-display text-[17px] font-black italic text-primary leading-none mt-0.5">×{p.multiplier.toFixed(2)}</p>
                    <p className="text-[8px] text-muted-foreground mt-1">{p.tier}</p>
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
                    <Badge variant="outline" className="text-[9px] ml-auto">Organiser only</Badge>
                  )}
                  {p.role === "organiser_player" && (
                    // Organising AND playing — counts toward the bracket
                    <Badge variant="outline" className="text-[9px] ml-auto">Organiser · playing</Badge>
                  )}
                  {p.user_id === tournament.created_by
                    && p.role !== "organiser"
                    && p.role !== "organiser_player" && (
                    <Badge variant="outline" className="text-[9px] ml-auto">Organiser</Badge>
                  )}
                  {p.partner_status === "pending" && (
                    <Badge variant="outline" className="text-[9px] ml-auto text-warning border-warning/40">⏳ Partner pending</Badge>
                  )}
                  {p.partner_status === "confirmed" && tournament.tournament_type === "pairs" && (
                    <Badge variant="outline" className="text-[9px] ml-auto text-primary border-primary/40">✓ Paired</Badge>
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
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 106px)" }}
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
            return (
              <button
                onClick={() => navigate(`/tournaments/${tournament.id}/live`)}
                className="w-full h-[54px] rounded-[16px] bg-primary text-primary-foreground font-display text-[14px] font-black italic uppercase tracking-[0.04em] flex items-center justify-between px-[18px] shadow-[0_6px_24px_hsl(var(--primary)/0.35)] hover:bg-primary/90 transition-all"
              >
                <span>{isActuallyLive ? "Open live screen" : "View status"}</span>
                {isActuallyLive ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary-foreground/90 animate-pulse" />
                    Live
                  </span>
                ) : (
                  <ArrowLeft className="w-5 h-5 rotate-180" />
                )}
              </button>
            );
          })()}

          {(tournament.status === "draft" || tournament.status === "active") && (
            <>
              {!isJoined && !isCreator && spotsLeft > 0 && (
                <button
                  onClick={() => setJoinOpen(true)}
                  className="w-full h-[54px] rounded-[16px] bg-primary text-primary-foreground font-display text-[14px] font-black italic uppercase tracking-[0.04em] flex items-center justify-between px-[18px] shadow-[0_6px_24px_hsl(var(--primary)/0.35)] hover:bg-primary/90 transition-all"
                >
                  <span>Join tournament</span>
                  <span>{spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left</span>
                </button>
              )}
              {isJoined && !isCreator && (
                <button
                  onClick={handleLeave}
                  className="w-full h-[54px] rounded-[16px] border border-destructive/30 text-destructive font-display text-[14px] font-black italic uppercase tracking-[0.04em] hover:bg-destructive/10 transition-all"
                >
                  Leave Tournament
                </button>
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
