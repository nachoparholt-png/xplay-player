import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { ArrowLeft, Trophy, Play, Clock, Calendar, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { computePace, formatMins, type PaceInfo } from "@/lib/tournaments/paceEngine";
import GroupTable from "@/components/tournaments/GroupTable";
import BracketView from "@/components/tournaments/BracketView";
import TournamentMatchCard from "@/components/tournaments/TournamentMatchCard";
import ScoreEntry from "@/components/tournaments/ScoreEntry";
import AdminAdjustPanel from "@/components/tournaments/AdminAdjustPanel";
import { notifyTournamentCompleted } from "@/lib/tournaments/tournamentNotifications";
import type { MatchResult, MatchConfig, BracketConfig } from "@/lib/tournaments/types";
import { populateKnockoutSlots } from "@/lib/tournaments/knockoutPopulator";
import WithdrawalPanel, { WalkoverButton } from "@/components/tournaments/WithdrawalPanel";
import BetBanner from "@/components/tournaments/BetBanner";
import TournamentBetSheet from "@/components/betting/TournamentBetSheet";
import MyBetsTab from "@/components/tournaments/MyBetsTab";
import PhaseWinModal from "@/components/tournaments/PhaseWinModal";
import { Zap } from "lucide-react";

interface TournamentRow {
  id: string;
  name: string;
  status: string;
  format_type: string;
  tournament_type: string;
  player_count: number;
  court_count: number;
  total_time_mins: number | null;
  match_config: any;
  bracket_config: any;
  created_by: string;
  started_at: string | null;
  rating_exempt: boolean;
}

interface MatchRow {
  id: string;
  round_type: string;
  round_number: number;
  match_number: number;
  team_a_id: string | null;
  team_b_id: string | null;
  court_number: number | null;
  court_label: string | null;
  status: string;
  result: any;
  match_config: any;
  estimated_mins: number | null;
  started_at: string | null;
  completed_at: string | null;
}

interface TeamRow {
  id: string;
  team_name: string;
  player1_id: string;
  player2_id: string | null;
  group_id: string | null;
}

const paceColors: Record<string, string> = {
  green: "text-accent",
  yellow: "text-[hsl(var(--gold))]",
  red: "text-destructive",
  blue: "text-primary",
};

const TournamentLive = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Score entry modal state
  const [scoreMatch, setScoreMatch] = useState<MatchRow | null>(null);

  // Betting UI state
  const [betSheetOpen, setBetSheetOpen] = useState(false);
  const [phaseWinBet, setPhaseWinBet] = useState<any>(null);
  const [phaseWinNextPhase, setPhaseWinNextPhase] = useState<any>(null);

  // Load initial data
  const reloadData = async () => {
    if (!id) return;
    const [tRes, mRes, teamsRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).maybeSingle(),
      supabase.from("tournament_matches").select("*").eq("tournament_id", id).order("match_number"),
      supabase.from("tournament_teams").select("*").eq("tournament_id", id),
    ]);
    setTournament(tRes.data as TournamentRow | null);
    setMatches((mRes.data as MatchRow[] | null) || []);
    setTeams((teamsRes.data as TeamRow[]) || []);

    const allTeams = (teamsRes.data as TeamRow[]) || [];
    const playerIds = allTeams.flatMap((t) => [t.player1_id, t.player2_id].filter(Boolean));
    if (playerIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", playerIds);
      const map: Record<string, string> = {};
      profs?.forEach((p) => { map[p.user_id] = p.display_name || "Player"; });
      setProfiles(map);
    }
  };

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      await reloadData();
      setLoading(false);
    };
    load();
  }, [id]);

  // Realtime subscription
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`tournament-live-${id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "tournament_matches",
        filter: `tournament_id=eq.${id}`,
      }, (payload) => {
        const updated = payload.new as MatchRow;
        setMatches((prev) => {
          const idx = prev.findIndex((m) => m.id === updated.id);
          let next: MatchRow[];
          if (idx >= 0) {
            next = [...prev];
            next[idx] = updated;
          } else {
            next = [...prev, updated];
          }

          // Check if all matches are now completed → fire tournament completed notification
          const allCompleted = next.length > 0 && next.every((m) => m.status === "completed" || m.status === "cancelled");
          if (allCompleted && updated.status === "completed" && tournament) {
            const playerIds = teams.flatMap((t) => [t.player1_id, t.player2_id].filter(Boolean) as string[]);
            notifyTournamentCompleted(tournament.id, tournament.name, playerIds);
            supabase.from("tournaments").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", tournament.id);
          }

          // Auto-populate knockout slots when a round completes
          if (updated.status === "completed" && tournament) {
            populateKnockoutSlots(tournament.id, (tournament.bracket_config || {}) as BracketConfig);
          }

          return next;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Realtime listener for bet wins (PhaseWinModal)
  useEffect(() => {
    if (!id || !user) return;
    const betChannel = supabase
      .channel(`bet-wins-${id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "tournament_bets",
        filter: `tournament_id=eq.${id}`,
      }, async (payload) => {
        const updated = payload.new as { user_id: string; status: string; stage: string; team_id: string; stake_pts: number; id: string };
        if (updated.user_id !== user.id || updated.status !== "won") return;

        // Look up next phase odds
        const { data: allOdds } = await supabase
          .from("tournament_bet_odds")
          .select("*")
          .eq("tournament_id", id)
          .eq("team_id", updated.team_id);

        const { data: windows } = await supabase
          .from("tournament_bet_windows")
          .select("stage, status")
          .eq("tournament_id", id)
          .eq("status", "open");

        const openStages = (windows || []).map((w) => w.stage);
        const nextOdds = (allOdds || []).find((o) => o.stage !== updated.stage && openStages.includes(o.stage));

        setPhaseWinBet(updated);
        setPhaseWinNextPhase(nextOdds ? {
          stage: nextOdds.stage,
          odds_multiplier: nextOdds.odds_multiplier,
          true_probability: nextOdds.true_probability,
          tier_label: nextOdds.tier_label,
        } : null);
      })
      .subscribe();

    return () => { supabase.removeChannel(betChannel); };
  }, [id, user]);

  const teamNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach((t) => {
      const p1 = profiles[t.player1_id] || "Player";
      const p2 = t.player2_id ? profiles[t.player2_id] || "Player" : null;
      map[t.id] = t.team_name || (p2 ? `${p1} & ${p2}` : p1);
    });
    return map;
  }, [teams, profiles]);

  const getTeamName = (teamId: string | null): string => {
    if (!teamId) return "TBD";
    return teamNameMap[teamId] || teamId;
  };

  // Check if current user is a player in a specific match
  const isPlayerInMatch = (match: MatchRow): boolean => {
    if (!user) return false;
    const matchTeamIds = [match.team_a_id, match.team_b_id].filter(Boolean);
    return teams.some(
      (t) =>
        matchTeamIds.includes(t.id) &&
        (t.player1_id === user.id || t.player2_id === user.id)
    );
  };

  const isCreator = tournament?.created_by === user?.id;

  // Find current user's team for betting
  const userTeam = useMemo(() => {
    if (!user) return null;
    return teams.find((t) => t.player1_id === user.id || t.player2_id === user.id) || null;
  }, [teams, user]);

  // Can this user submit score for a match?
  const canScore = (match: MatchRow): boolean => {
    if (match.status === "completed") return isCreator; // creator can edit completed scores
    return isCreator || isPlayerInMatch(match);
  };

  const handleMatchClick = (match: MatchRow) => {
    if (canScore(match)) {
      setScoreMatch(match);
    }
  };

  const completedCount = matches.filter((m) => m.status === "completed").length;
  const inProgressMatches = matches.filter((m) => m.status === "in_progress");
  const pendingMatches = matches.filter((m) => m.status === "pending");
  const upNext = pendingMatches.slice(0, tournament?.court_count || 2);

  const pace: PaceInfo = useMemo(() => {
    if (!tournament) return computePace(null, 0, 0, 0);
    const estTotal = tournament.total_time_mins || 
      matches.reduce((sum, m) => sum + (m.estimated_mins || 0), 0);
    return computePace(tournament.started_at, completedCount, matches.length, estTotal);
  }, [tournament, matches, completedCount]);

  // Estimated start times per match based on per-court timeline
  const estimatedTimeMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!tournament?.started_at) return map;
    const startMs = new Date(tournament.started_at).getTime();

    // Group matches by court, ordered by match_number
    const courtMatches = new Map<number, MatchRow[]>();
    matches.forEach((m) => {
      const court = m.court_number ?? 0;
      if (!courtMatches.has(court)) courtMatches.set(court, []);
      courtMatches.get(court)!.push(m);
    });

    courtMatches.forEach((cms) => {
      cms.sort((a, b) => a.match_number - b.match_number);
      let offsetMins = 0;
      cms.forEach((m) => {
        const estStart = new Date(startMs + offsetMins * 60000);
        const hh = estStart.getHours().toString().padStart(2, "0");
        const mm = estStart.getMinutes().toString().padStart(2, "0");
        map.set(m.id, `~${hh}:${mm}`);
        offsetMins += m.estimated_mins || 15;
      });
    });

    return map;
  }, [tournament?.started_at, matches]);

  // Sorted matches for carousel: in_progress first, then pending, then completed
  const carouselMatches = useMemo(() => {
    const statusOrder: Record<string, number> = { in_progress: 0, pending: 1, completed: 2 };
    return [...matches].sort((a, b) => {
      const oa = statusOrder[a.status] ?? 1;
      const ob = statusOrder[b.status] ?? 1;
      if (oa !== ob) return oa - ob;
      return a.match_number - b.match_number;
    });
  }, [matches]);

  // Carousel scroll state
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeCardIdx, setActiveCardIdx] = useState(0);

  // Auto-scroll to first active/pending match on mount
  useEffect(() => {
    if (!carouselRef.current || carouselMatches.length === 0) return;
    const firstActiveIdx = carouselMatches.findIndex((m) => m.status === "in_progress" || m.status === "pending");
    const targetIdx = firstActiveIdx >= 0 ? firstActiveIdx : 0;
    const card = carouselRef.current.children[targetIdx] as HTMLElement;
    if (card) {
      card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      setActiveCardIdx(targetIdx);
    }
  }, [carouselMatches.length]);

  // Track scroll position for dot indicators
  const handleCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el || el.children.length === 0) return;
    const scrollLeft = el.scrollLeft;
    const cardWidth = (el.children[0] as HTMLElement).offsetWidth;
    const gap = 12; // gap-3 = 0.75rem = 12px
    const idx = Math.round(scrollLeft / (cardWidth + gap));
    setActiveCardIdx(Math.min(idx, carouselMatches.length - 1));
  }, [carouselMatches.length]);

  // Group standings
  const groupStandings = useMemo(() => {
    const groupTeams = teams.filter((t) => t.group_id);
    const groupIds = [...new Set(groupTeams.map((t) => t.group_id!))].sort();

    return groupIds.map((gId) => {
      const gTeams = groupTeams.filter((t) => t.group_id === gId);
      const standings = gTeams.map((t) => {
        const teamMatches = matches.filter(
          (m) => m.round_type === "group" && (m.team_a_id === t.id || m.team_b_id === t.id)
        );
        let won = 0, lost = 0, drawn = 0, pf = 0, pa = 0;
        teamMatches.forEach((m) => {
          if (m.status !== "completed" || !m.result) return;
          const r = m.result as MatchResult;
          const isA = m.team_a_id === t.id;
          const myScore = isA ? r.team_a_score : r.team_b_score;
          const oppScore = isA ? r.team_b_score : r.team_a_score;
          pf += myScore || 0;
          pa += oppScore || 0;
          if ((myScore || 0) > (oppScore || 0)) won++;
          else if ((myScore || 0) < (oppScore || 0)) lost++;
          else drawn++;
        });
        return {
          teamId: t.id,
          teamName: getTeamName(t.id),
          played: won + lost + drawn,
          won,
          lost,
          drawn,
          pointsFor: pf,
          pointsAgainst: pa,
          totalPoints: won * 3 + drawn,
        };
      });
      return { groupId: gId, standings };
    });
  }, [teams, matches, teamNameMap]);

  // Bracket rounds for knockout view
  const bracketRounds = useMemo(() => {
    const knockoutTypes = ["quarter", "semi", "final", "bronze"];
    const rounds: { label: string; matches: any[] }[] = [];

    const labelMap: Record<string, string> = {
      quarter: "Quarter-Finals",
      semi: "Semi-Finals",
      final: "Final",
      bronze: "3rd Place",
    };

    knockoutTypes.forEach((rt) => {
      const roundMatches = matches.filter((m) => m.round_type === rt);
      if (roundMatches.length > 0) {
        rounds.push({
          label: labelMap[rt] || rt,
          matches: roundMatches.map((m) => ({
            id: m.id,
            roundType: m.round_type,
            matchNumber: m.match_number,
            teamAName: getTeamName(m.team_a_id),
            teamBName: getTeamName(m.team_b_id),
            teamAScore: m.result?.team_a_score,
            teamBScore: m.result?.team_b_score,
            status: m.status,
            winnerId: m.result?.winner_team_id,
            courtNumber: m.court_number,
            courtLabel: m.court_label,
            scheduledAt: null,
            startedAt: m.started_at,
            isUserMatch: isPlayerInMatch(m),
            sets: m.result?.sets?.map((s: any) => ({ teamA: s.team_a, teamB: s.team_b })),
          })),
        });
      }
    });

    return rounds;
  }, [matches, teamNameMap]);

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
        <Button variant="ghost" onClick={() => navigate("/tournaments")}>Back</Button>
      </div>
    );
  }

  const progressPct = matches.length > 0 ? (completedCount / matches.length) * 100 : 0;

  return (
    <div className="px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/tournaments/${id}`)} className="rounded-xl">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-display font-bold truncate flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary shrink-0" />
            {tournament.name}
          </h1>
          <Badge variant="outline" className="text-[10px] mt-0.5">LIVE</Badge>
        </div>
        {/* Admin controls */}
        <div className="flex items-center gap-1.5">
          {tournament && (
            <WithdrawalPanel
              tournamentId={tournament.id}
              tournamentName={tournament.name}
              teams={teams}
              profiles={profiles}
              isCreator={isCreator}
              currentUserId={user?.id}
              onWithdrawalComplete={reloadData}
            />
          )}
          {isCreator && tournament && (
            <AdminAdjustPanel
              tournamentId={tournament.id}
              currentMatchConfig={tournament.match_config as MatchConfig}
              pendingMatchIds={pendingMatches.map((m) => m.id)}
              onConfigUpdated={(newConfig) => {
                setTournament((prev) => prev ? { ...prev, match_config: newConfig } : prev);
              }}
            />
          )}
        </div>
      </div>

      {/* Pace header */}
      <div className="card-elevated p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{formatMins(pace.elapsedMins)} elapsed</span>
          </div>
          <span className={`text-sm font-bold ${paceColors[pace.status]}`}>
            {pace.status === "blue"
              ? "Complete!"
              : pace.deltaMins > 0
                ? `+${formatMins(pace.deltaMins)} over`
                : "On pace"}
          </span>
        </div>
        <Progress value={progressPct} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{completedCount}/{matches.length} matches</span>
          <span>Est. finish: {formatMins(pace.projectedFinishMins)}</span>
        </div>
      </div>

      {/* Your Next Match callout (for non-creator players) */}
      {!isCreator && user && (() => {
        const myNextMatch = [...inProgressMatches, ...pendingMatches].find((m) => isPlayerInMatch(m));
        if (!myNextMatch) return null;
        return (
          <div className="card-elevated p-4 border-primary/30 border space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Your Next Match</span>
              <Badge variant="outline" className={`text-[9px] ml-auto ${myNextMatch.status === "in_progress" ? "status-open" : ""}`}>
                {myNextMatch.status === "in_progress" ? "NOW" : `#${myNextMatch.match_number}`}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {getTeamName(myNextMatch.team_a_id)} vs {getTeamName(myNextMatch.team_b_id)}
              {myNextMatch.court_label ? ` · ${myNextMatch.court_label}` : myNextMatch.court_number ? ` · Court ${myNextMatch.court_number}` : ""}
            </p>
            {canScore(myNextMatch) && (
              <Button size="sm" className="mt-2 rounded-xl w-full" onClick={() => handleMatchClick(myNextMatch)}>
                {myNextMatch.status === "in_progress" ? "Submit Score" : "View Match"}
              </Button>
            )}
          </div>
        );
      })()}

      {/* Now Playing */}
      {inProgressMatches.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            Now Playing
          </h2>
          <div className="grid gap-2">
            {inProgressMatches.map((m) => (
              <TournamentMatchCard
                key={m.id}
                matchNumber={m.match_number}
                roundType={m.round_type}
                roundNumber={m.round_number}
                teamAName={getTeamName(m.team_a_id)}
                teamBName={getTeamName(m.team_b_id)}
                courtNumber={m.court_number}
                courtLabel={m.court_label}
                status={m.status}
                estimatedMins={m.estimated_mins}
                isUserMatch={isPlayerInMatch(m)}
                onClick={() => handleMatchClick(m)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Up Next */}
      {upNext.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Up Next</h2>
          <div className="grid gap-2">
            {upNext.map((m) => (
              <TournamentMatchCard
                key={m.id}
                matchNumber={m.match_number}
                roundType={m.round_type}
                roundNumber={m.round_number}
                teamAName={getTeamName(m.team_a_id)}
                teamBName={getTeamName(m.team_b_id)}
                courtNumber={m.court_number}
                courtLabel={m.court_label}
                status={m.status}
                estimatedMins={m.estimated_mins}
                isUserMatch={isPlayerInMatch(m)}
                onClick={() => handleMatchClick(m)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Match Schedule Carousel */}
      {carouselMatches.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Match Schedule
          </h2>
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2"
          >
            {carouselMatches.map((m) => (
              <div key={m.id} className="snap-center shrink-0 w-[80vw] sm:w-[48%]">
                <TournamentMatchCard
                  matchNumber={m.match_number}
                  roundType={m.round_type}
                  roundNumber={m.round_number}
                  teamAName={getTeamName(m.team_a_id)}
                  teamBName={getTeamName(m.team_b_id)}
                  courtNumber={m.court_number}
                  courtLabel={m.court_label}
                  status={m.status}
                  estimatedMins={m.estimated_mins}
                  estimatedTime={estimatedTimeMap.get(m.id) || null}
                  teamAScore={m.result?.team_a_score}
                  teamBScore={m.result?.team_b_score}
                  isUserMatch={isPlayerInMatch(m)}
                  canEdit={isCreator && m.status === "completed"}
                  isWalkover={!!m.result?.walkover}
                  onClick={() => handleMatchClick(m)}
                />
              </div>
            ))}
          </div>
          {/* Dot indicators */}
          {carouselMatches.length > 1 && (
            <div className="flex justify-center gap-1.5">
              {carouselMatches.map((_, i) => (
                <button
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === activeCardIdx ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                  onClick={() => {
                    const card = carouselRef.current?.children[i] as HTMLElement;
                    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Standings Tabs */}
      <Tabs defaultValue="groups" className="w-full">
        <TabsList className="w-full">
          {groupStandings.length > 0 && <TabsTrigger value="groups" className="flex-1">Groups</TabsTrigger>}
          {bracketRounds.length > 0 && <TabsTrigger value="bracket" className="flex-1">Bracket</TabsTrigger>}
          <TabsTrigger value="all" className="flex-1">All Matches</TabsTrigger>
          {user && <TabsTrigger value="bets" className="flex-1">My Bets</TabsTrigger>}
        </TabsList>

        {groupStandings.length > 0 && (
          <TabsContent value="groups" className="space-y-4 mt-4">
            {groupStandings.map((g) => (
              <GroupTable
                key={g.groupId}
                groupId={g.groupId}
                standings={g.standings}
                advanceCount={tournament.bracket_config?.advance_count || 2}
              />
            ))}
          </TabsContent>
        )}

        {bracketRounds.length > 0 && (
          <TabsContent value="bracket" className="mt-4">
            <BracketView rounds={bracketRounds} />
          </TabsContent>
        )}

        <TabsContent value="all" className="mt-4">
          <div className="space-y-2">
            {matches.map((m) => (
              <TournamentMatchCard
                key={m.id}
                matchNumber={m.match_number}
                roundType={m.round_type}
                roundNumber={m.round_number}
                teamAName={getTeamName(m.team_a_id)}
                teamBName={getTeamName(m.team_b_id)}
                courtNumber={m.court_number}
                courtLabel={m.court_label}
                status={m.status}
                estimatedMins={m.estimated_mins}
                teamAScore={m.result?.team_a_score}
                teamBScore={m.result?.team_b_score}
                isUserMatch={isPlayerInMatch(m)}
                canEdit={isCreator && m.status === "completed"}
                isWalkover={!!m.result?.walkover}
                actionSlot={
                  isCreator && (m.status === "pending" || m.status === "in_progress") && m.team_a_id && m.team_b_id ? (
                    <WalkoverButton
                      matchId={m.id}
                      teamAId={m.team_a_id}
                      teamBId={m.team_b_id}
                      teamAName={getTeamName(m.team_a_id)}
                      teamBName={getTeamName(m.team_b_id)}
                      onComplete={reloadData}
                    />
                  ) : undefined
                }
                onClick={() => handleMatchClick(m)}
              />
            ))}
            {matches.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No matches generated yet
              </p>
            )}
          </div>
        </TabsContent>

        {user && (
          <TabsContent value="bets" className="mt-4">
            <MyBetsTab
              tournamentId={id!}
              userId={user.id}
              teamNames={teamNameMap}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Score Entry Modal */}
      {scoreMatch && tournament && (
        <ScoreEntry
          open={!!scoreMatch}
          onOpenChange={(open) => { if (!open) setScoreMatch(null); }}
          matchId={scoreMatch.id}
          matchNumber={scoreMatch.match_number}
          teamAName={getTeamName(scoreMatch.team_a_id)}
          teamBName={getTeamName(scoreMatch.team_b_id)}
          teamAId={scoreMatch.team_a_id || undefined}
          teamBId={scoreMatch.team_b_id || undefined}
          matchConfig={(scoreMatch.match_config || tournament.match_config) as MatchConfig}
          startedAt={scoreMatch.started_at}
          tournamentId={tournament.id}
          tournamentName={tournament.name}
          teams={teams}
          ratingExempt={tournament.rating_exempt}
          isEditMode={scoreMatch.status === "completed"}
          existingResult={scoreMatch.status === "completed" ? scoreMatch.result : undefined}
        />
      )}

      {/* Betting Banner & Sheet — hide bet CTA for coordinator */}
      {tournament && user && !isCreator && (
        <BetBanner
          tournamentId={tournament.id}
          userId={user.id}
          onPlaceBet={() => setBetSheetOpen(true)}
        />
      )}
      {isCreator && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4 lg:bottom-4">
          <div className="max-w-lg mx-auto bg-card/95 backdrop-blur-lg border border-border/30 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
            <ShieldAlert className="w-5 h-5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Coordinators cannot bet on their own tournament</span>
          </div>
        </div>
      )}
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

      {/* Phase Win Modal */}
      {phaseWinBet && userTeam && (
        <PhaseWinModal
          open={!!phaseWinBet}
          onOpenChange={(open) => { if (!open) setPhaseWinBet(null); }}
          bet={{
            id: phaseWinBet.id,
            stage: phaseWinBet.stage,
            stake_pts: phaseWinBet.stake_pts,
            actual_payout_pts: phaseWinBet.actual_payout_pts || 0,
            pool_bonus_pts: phaseWinBet.pool_bonus_pts || 0,
            odds_multiplier: phaseWinBet.odds_multiplier,
          }}
          nextPhase={phaseWinNextPhase}
          tournamentId={id!}
          teamId={userTeam.id}
          teamName={getTeamName(userTeam.id)}
        />
      )}
    </div>
  );
};

export default TournamentLive;
