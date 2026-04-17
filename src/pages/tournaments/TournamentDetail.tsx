import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Trophy, Users, MapPin, Calendar, Clock, Lock, Globe, Send, Play, Rocket, Trash2, TrendingUp, Coins, ShieldAlert } from "lucide-react";
import AdminBadge from "@/components/tournaments/AdminBadge";
import TournamentStructurePreview from "@/components/tournaments/TournamentStructurePreview";
import TournamentFixtureView from "@/components/tournaments/TournamentFixtureView";
import type { BracketConfig } from "@/lib/tournaments/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import ApprovalRequestPanel from "@/components/tournaments/ApprovalRequestPanel";
import TournamentBetSheet from "@/components/betting/TournamentBetSheet";
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
    const result = await launchTournament(id, user.id);
    setLaunching(false);
    if (!result.success) {
      toast({ title: "Launch failed", description: result.error, variant: "destructive" });
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
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tournaments")} className="rounded-xl">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold truncate flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary shrink-0" />
            {tournament.name}
          </h1>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            {tournament.visibility === "private" ? (
              <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Private</span>
            ) : (
              <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Public</span>
            )}
            <span>•</span>
            <Badge variant="outline" className="text-[10px]">{tournament.status}</Badge>
            {hasBetConfig && (
              <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30 gap-1">
                <TrendingUp className="w-2.5 h-2.5" />
                Betting
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-3">
        {tournament.club && (
          <div className="p-3 rounded-xl bg-muted/50 space-y-1">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">{tournament.club}</p>
          </div>
        )}
        {tournament.scheduled_date && (
          <div className="p-3 rounded-xl bg-muted/50 space-y-1">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">{tournament.scheduled_date}</p>
          </div>
        )}
        <div className="p-3 rounded-xl bg-muted/50 space-y-1">
          <Users className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">{playingCount}/{tournament.player_count}</p>
        </div>
        <div className="p-3 rounded-xl bg-muted/50 space-y-1">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium capitalize">{tournament.format_type.replace("_", " ")}</p>
        </div>
      </div>

      {/* Betting Card */}
      {(hasBetConfig || isJoined) && (
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Tournament Betting</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Coins className="w-3 h-3" />
                  <span>{userPoints} XPLAY</span>
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] ${oddsLocked
                ? "border-green-500 text-green-700 bg-green-500/10"
                : "border-amber-500 text-amber-700 bg-amber-500/10"
              }`}
            >
              {oddsLocked ? "Final Odds" : "Preliminary"}
            </Badge>
          </div>

          {/* Phase odds preview */}
          {phaseOddsPreview.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {phaseOddsPreview.map(p => (
                <div key={p.stage} className="rounded-xl bg-card/60 border border-border/30 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">{formatLabel(p.stage)}</p>
                  <p className="text-sm font-bold font-mono text-primary">×{p.multiplier.toFixed(2)}</p>
                  <Badge variant="secondary" className="text-[8px] mt-0.5">{p.tier}</Badge>
                </div>
              ))}
            </div>
          )}

          {!oddsLocked && (
            <p className="text-[11px] text-muted-foreground text-center">
              Multipliers update as players join • {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
            </p>
          )}

          {/* Coordinator block */}
          {isCreator ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/30">
              <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                Tournament coordinators cannot place bets on their own tournament.
              </span>
            </div>
          ) : isJoined ? (
            <Button
              onClick={() => setBetSheetOpen(true)}
              className="w-full rounded-xl h-11 font-semibold gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              Place Your Bets
            </Button>
          ) : !hasBetConfig ? (
            <p className="text-xs text-muted-foreground text-center">
              Join the tournament to place bets
            </p>
          ) : null}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {tournament.status === "draft" && isCreator && (
          <>
            {playingCount < 2 && (
              <p className="text-xs text-center text-muted-foreground pb-1">
                Need at least 2 players to launch ({playingCount}/{tournament.player_count} joined)
              </p>
            )}
            <Button
              onClick={handleLaunch}
              disabled={launching}
              className="w-full rounded-xl h-12 font-semibold gap-2 glow-primary text-base"
            >
              <Rocket className="w-4.5 h-4.5" />
              {launching ? "Launching..." : "Start Tournament 🏆"}
            </Button>
          </>
        )}

        {tournament.status === "active" && (
          <Button
            onClick={() => navigate(`/tournaments/${tournament.id}/live`)}
            className="w-full rounded-xl h-12 font-semibold gap-2 glow-primary"
          >
            <Play className="w-4 h-4" />
            Go Live
          </Button>
        )}

        {(tournament.status === "draft" || tournament.status === "active") && (
          <>
            {!isJoined && !isCreator && spotsLeft > 0 && (
              <Button onClick={() => setJoinOpen(true)} className="w-full rounded-xl h-11 font-semibold">
                {`Join Tournament (${spotsLeft} spots left)`}
              </Button>
            )}
            {isJoined && !isCreator && (
              <Button variant="outline" onClick={handleLeave} className="w-full rounded-xl h-11 font-semibold text-destructive">
                Leave Tournament
              </Button>
            )}
            {isCreator && (
              <Button
                variant="outline"
                onClick={() => setInviteOpen(true)}
                className="w-full rounded-xl h-11 font-semibold gap-2"
              >
                <Send className="w-4 h-4" />
                Invite Players
              </Button>
            )}
          </>
        )}
        {isCreator && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full rounded-xl h-11 font-semibold gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
                Delete Tournament
              </Button>
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

      {/* Skill level range */}
      {skillLevelMin != null && skillLevelMax != null && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Skill level:</span>
          <Badge variant="outline" className="text-xs">{skillLevelMin} – {skillLevelMax}</Badge>
          {tournament.require_admin_approval && (
            <span className="text-[10px] text-muted-foreground">(approval required)</span>
          )}
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
        <h2 className="font-semibold text-sm mb-3">Players ({confirmedPlayers.length})</h2>
        <div className="space-y-2">
          {confirmedPlayers.map(p => {
            const prof = playerProfiles[p.user_id];
            return (
              <div key={p.id || p.user_id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                  {prof?.display_name?.[0]?.toUpperCase() || "?"}
                </div>
                <span className="text-sm font-medium truncate">{prof?.display_name || "Player"}</span>
                {p.user_id === tournament.created_by && (
                  <AdminBadge role={p.role === "organiser" ? "organiser" : "admin"} size="sm" />
                )}
                {p.role === "organiser" && (
                  <Badge variant="outline" className="text-[9px] ml-auto">Organiser only</Badge>
                )}
                {p.user_id === tournament.created_by && p.role !== "organiser" && (
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
        />
      )}

      {/* Bet Sheet — uses TournamentBetSheet instead of BetPlacementSheet */}
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
    </div>
  );
};

export default TournamentDetail;
