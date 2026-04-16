import { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { motion } from "framer-motion";
import { Plus, Upload, Search, Users, Clock as ClockIcon, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import MatchCard from "@/components/MatchCard";
import CreateMatchModal from "@/components/CreateMatchModal";
import MatchJoinModal from "@/components/MatchJoinModal";
import MatchBetSheet from "@/components/betting/MatchBetSheet";
import { format } from "date-fns";
import ClubsExplorer from "@/components/clubs/ClubsExplorer";

type MatchRow = {
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
  status: string;
  organizer_id: string;
};

type PlayerInfo = {
  user_id: string;
  name: string;
  avatar: string;
  rating: number | null;
  team: string | null;
  isCreator?: boolean;
};

type MarketInfo = {
  total_pot: number;
  team_a_multiplier: number;
  team_b_multiplier: number;
  phase: string;
};

type EnrichedMatch = MatchRow & {
  players: PlayerInfo[];
  playerCount: number;
  spotsLeft: number;
  userStake?: { points_staked: number; status: string; team: string } | null;
  stakingAvailable?: boolean;
  totalPointsStaked: number;
  userActionDone?: boolean;
  market?: MarketInfo | null;
};

type MatchStatusUI = "open" | "almost_full" | "full" | "cancelled" | "completed" | "awaiting_score" | "score_submitted" | "pending_review" | "review_requested" | "confirmed" | "draw" | "closed_as_draw" | "auto_closed" | "under_review";
const toStatus = (s: string): MatchStatusUI => {
  const valid: MatchStatusUI[] = ["open", "almost_full", "full", "cancelled", "completed", "awaiting_score", "score_submitted", "pending_review", "review_requested", "confirmed", "draw", "closed_as_draw", "auto_closed", "under_review"];
  return valid.includes(s as MatchStatusUI) ? (s as MatchStatusUI) : "open";
};

type Tab = "open" | "my_matches";
type TopTab = "matches" | "clubs";

const ACTIVE_STATUSES = ["open", "almost_full", "full", "awaiting_score", "score_submitted", "pending_review", "review_requested"] as const;

const TAB_EMPTY_STATES: Record<Tab, { icon: React.ReactNode; title: string; subtitle: string }> = {
  open: {
    icon: <Users className="w-10 h-10 text-muted-foreground/50" />,
    title: "No open matches available",
    subtitle: "No matches posted yet. Check back soon or create your own!",
  },
  my_matches: {
    icon: <Search className="w-10 h-10 text-muted-foreground/50" />,
    title: "You haven't joined any matches yet",
    subtitle: "Browse open matches and join one, or create your own match.",
  },
};

/* ── Match Carousel Component ── */

const MatchCarousel = ({
  matches,
  highlightMatchId,
  user,
  navigate,
  onBet,
}: {
  matches: EnrichedMatch[];
  highlightMatchId: string | null;
  user: { id: string } | null;
  navigate: (path: string) => void;
  onBet: (match: EnrichedMatch) => void;
}) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());
    api.on("select", () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  // Auto-scroll to highlighted match
  useEffect(() => {
    if (!api || !highlightMatchId) return;
    const idx = matches.findIndex((m) => m.id === highlightMatchId);
    if (idx >= 0) api.scrollTo(idx);
  }, [api, highlightMatchId, matches]);

  return (
    <div className="space-y-4">
      <Carousel
        setApi={setApi}
        opts={{ align: "start", loop: false }}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          {matches.map((match) => (
            <CarouselItem
              key={match.id}
              className="pl-4 basis-[85%] md:basis-[45%] flex"
            >
              <div className="flex-1 flex">
                <MatchCard
                  matchId={match.id}
                  club={match.club}
                  court={match.court}
                  date={match.match_date ? format(new Date(match.match_date + "T00:00:00"), "EEE d MMMM") : "TBD"}
                  time={match.match_time?.slice(0, 5) ?? ""}
                  format={match.format}
                  levelMin={match.level_min}
                  levelMax={match.level_max}
                  maxPlayers={match.max_players}
                  spotsLeft={match.spotsLeft}
                  status={toStatus(match.status)}
                  teamA={match.players.filter(p => p.team === "team_a").map(p => ({ name: p.name, avatar: p.avatar, rating: p.rating, isCreator: p.isCreator }))}
                  teamB={match.players.filter(p => p.team === "team_b").map(p => ({ name: p.name, avatar: p.avatar, rating: p.rating, isCreator: p.isCreator }))}
                  totalPointsStaked={match.totalPointsStaked}
                  teamAOdds={match.market?.team_a_multiplier ?? 0}
                  teamBOdds={match.market?.team_b_multiplier ?? 0}
                  isBettingOpen={match.stakingAvailable ?? false}
                  hasMarket={!!match.market}
                  userStake={match.userStake ? { points: match.userStake.points_staked, team: match.userStake.team } : null}
                  isJoined={match.players.some(p => p.user_id === user?.id)}
                  isEligible={true}
                  onClick={() => navigate(`/matches/${match.id}`)}
                  onJoin={() => navigate(`/matches/${match.id}`)}
                  onBet={() => onBet(match)}
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Dot Indicators */}
      {count > 1 && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              onClick={() => api?.scrollTo(i)}
              className={`rounded-full transition-all duration-300 ${
                i === current
                  ? "w-6 h-2 bg-primary"
                  : "w-2 h-2 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Matches = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [matches, setMatches] = useState<EnrichedMatch[]>([]);
  const [pendingMatches, setPendingMatches] = useState<EnrichedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("my_matches");
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [highlightMatchId, setHighlightMatchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fabExpanded, setFabExpanded] = useState(true);
  const [topTab, setTopTab] = useState<TopTab>("matches");
  const [activeBetMatch, setActiveBetMatch] = useState<EnrichedMatch | null>(null);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 10) {
        setFabExpanded(true);
      } else if (currentY > lastScrollY.current + 5) {
        setFabExpanded(false);
      } else if (currentY < lastScrollY.current - 5) {
        setFabExpanded(true);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const enrichMatches = useCallback(async (matchData: MatchRow[]): Promise<EnrichedMatch[]> => {
    if (!matchData.length || !user) return [];

    const ids = matchData.map((m) => m.id);

    // Single join on match_players → profiles eliminates the separate profiles fetch
    const [playersRes, stakesRes, marketsRes] = await Promise.all([
      supabase
        .from("match_players")
        .select("match_id, user_id, status, team, profiles(display_name, avatar_url, padel_level)")
        .in("match_id", ids)
        .eq("status", "confirmed"),
      supabase
        .from("match_stakes")
        .select("match_id, user_id, points_staked, status, team")
        .in("match_id", ids),
      supabase
        .from("match_bet_markets")
        .select("match_id, total_pot, team_a_multiplier, team_b_multiplier, phase")
        .in("match_id", ids),
    ]);

    const playerData = playersRes.data || [];
    const stakeData = stakesRes.data || [];
    const marketData = marketsRes.data || [];
    const marketMap = new Map(marketData.map((m) => [m.match_id, m]));

    return matchData.map((m) => {
      const matchPlayers = playerData.filter((p) => p.match_id === m.id);
      const playerCount = matchPlayers.length;
      const spotsLeft = m.max_players - playerCount;
      const matchStakes = stakeData.filter((s) => s.match_id === m.id);
      const userStake = matchStakes.find((s) => s.user_id === user.id) || null;
      const matchMarket = marketMap.get(m.id) as MarketInfo | undefined;
      const stakingAvailable = m.format !== "social" && (matchMarket != null || matchStakes.length > 0 || ["open", "almost_full", "full"].includes(m.status));
      const totalPointsStaked = matchMarket?.total_pot ?? matchStakes
        .filter((s) => s.status === "active")
        .reduce((sum, s) => sum + s.points_staked, 0);

      return {
        ...m,
        players: matchPlayers.map((p) => {
          const prof = p.profiles as { display_name: string | null; avatar_url: string | null; padel_level: number | null } | null;
          return {
            user_id: p.user_id,
            name: prof?.display_name || "Player",
            avatar: prof?.avatar_url || "",
            rating: prof?.padel_level ?? null,
            team: p.team,
            isCreator: p.user_id === m.organizer_id,
          };
        }),
        playerCount,
        spotsLeft,
        userStake: userStake ? { points_staked: userStake.points_staked, status: userStake.status, team: userStake.team } : null,
        stakingAvailable,
        totalPointsStaked,
        market: matchMarket ?? null,
      };
    });
  }, [user]);

  const fetchMatches = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      if (tab === "my_matches") {
        const [joinsRes, orgRes] = await Promise.all([
          supabase.from("match_players").select("match_id").eq("user_id", user.id).in("status", ["confirmed", "waitlist"]),
          supabase.from("matches").select("id").eq("organizer_id", user.id),
        ]);

        const matchIds = [...new Set([
          ...(joinsRes.data || []).map((j) => j.match_id),
          ...(orgRes.data || []).map((m) => m.id),
        ])];

        if (matchIds.length === 0) {
          setMatches([]);
          setLoading(false);
          return;
        }

        const { data: matchData } = await supabase
          .from("matches")
          .select("*")
          .in("id", matchIds)
          .in("status", ACTIVE_STATUSES)
          .order("match_date", { ascending: true })
          .order("match_time", { ascending: true });

        const enriched = await enrichMatches(matchData || []);
        setMatches(enriched);

      } else {
        const { data: matchData } = await supabase
          .from("matches")
          .select("*")
          .in("status", ["open", "almost_full"])
          .order("match_date", { ascending: true })
          .order("match_time", { ascending: true });

        let enriched = await enrichMatches(matchData || []);
        enriched = enriched.filter((m) => m.spotsLeft > 0);
        setMatches(enriched);
      }
    } catch (err) {
      console.error("Error fetching matches:", err);
      setMatches([]);
    }

    setLoading(false);
  }, [tab, user, enrichMatches]);

  const fetchPendingMatches = useCallback(async () => {
    if (!user) return;
    const { data: myJoins } = await supabase
      .from("match_players")
      .select("match_id")
      .eq("user_id", user.id)
      .eq("status", "confirmed");

    if (!myJoins || myJoins.length === 0) {
      setPendingMatches([]);
      return;
    }

    const matchIds = myJoins.map((j) => j.match_id);
    const { data: pendingData } = await supabase
      .from("matches")
      .select("*")
      .in("id", matchIds)
      .in("status", ["awaiting_score", "pending_review", "review_requested"])
      .order("match_date", { ascending: false });

    if (!pendingData || pendingData.length === 0) {
      setPendingMatches([]);
      return;
    }

    const pendingIds = pendingData.map((m) => m.id);

    const [submissionsRes, reviewsRes] = await Promise.all([
      supabase
        .from("score_submissions")
        .select("match_id")
        .eq("submitted_by", user.id)
        .in("match_id", pendingIds),
      supabase
        .from("score_reviews")
        .select("submission_id")
        .eq("reviewed_by", user.id),
    ]);

    const submittedMatchIds = new Set((submissionsRes.data || []).map((s) => s.match_id));

    const reviewedSubmissionIds = (reviewsRes.data || []).map((r) => r.submission_id);
    let reviewedMatchIds = new Set<string>();
    if (reviewedSubmissionIds.length > 0) {
      const { data: reviewedSubs } = await supabase
        .from("score_submissions")
        .select("match_id")
        .in("id", reviewedSubmissionIds)
        .in("match_id", pendingIds);
      reviewedMatchIds = new Set((reviewedSubs || []).map((s) => s.match_id));
    }

    const enriched = await enrichMatches(pendingData);
    const withActionStatus = enriched.map((m) => {
      const hasSubmitted = submittedMatchIds.has(m.id);
      const hasReviewed = reviewedMatchIds.has(m.id);
      const userActionDone =
        (m.status === "awaiting_score" && hasSubmitted) ||
        (m.status === "score_submitted" && hasSubmitted) ||
        (m.status === "pending_review" && hasReviewed) ||
        (m.status === "review_requested" && hasReviewed);
      return { ...m, userActionDone };
    });

    setPendingMatches(withActionStatus);
  }, [user, enrichMatches]);

  useEffect(() => {
    fetchMatches();
    fetchPendingMatches();
  }, [fetchMatches, fetchPendingMatches]);

  const tabs: { key: Tab; label: string; icon?: React.ReactNode }[] = [
    { key: "my_matches", label: "My Matches" },
    { key: "open", label: "Open" },
  ];

  const emptyState = TAB_EMPTY_STATES[tab];
  const pendingIds = new Set(pendingMatches.map((m) => m.id));
  let displayedMatches = matches.filter((m) => !pendingIds.has(m.id));

  // Filter by search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    displayedMatches = displayedMatches.filter(
      (m) =>
        (m.club ?? "").toLowerCase().includes(q) ||
        m.players.some((p) => p.name.toLowerCase().includes(q))
    );
  }

  return (
    <div className="px-6 py-6 space-y-6 overflow-x-hidden">

      {/* Top-level toggle: Matches | Clubs */}
      <div className="flex gap-1 bg-surface-container-low rounded-xl p-1">
        <button
          onClick={() => setTopTab("matches")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
            topTab === "matches" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Matches
        </button>
        <button
          onClick={() => setTopTab("clubs")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
            topTab === "clubs" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Clubs
        </button>
      </div>

      {topTab === "clubs" ? (
        <ClubsExplorer />
      ) : (
      <>
      <div className="flex gap-1 bg-card rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              tab === t.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Section Label */}
      <div className="flex justify-between items-end">
        <h2 className="font-display font-black text-muted-foreground text-[12px] tracking-[0.2em] uppercase">
          {tab === "my_matches" ? "MY MATCHES" : "UPCOMING MATCHES"}
        </h2>
        <span className="text-primary font-bold text-xs cursor-pointer">View All</span>
      </div>

      {/* FAB */}
      <motion.button
        onClick={() => setShowCreateMatch(true)}
        className="fixed bottom-24 right-5 lg:bottom-8 lg:right-8 z-40 flex items-center justify-center bg-primary text-primary-foreground font-display font-black text-sm overflow-hidden h-14"
        style={{ minWidth: 56 }}
        whileTap={{ scale: 0.9 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          width: fabExpanded ? 180 : 56,
          borderRadius: 9999,
          paddingLeft: fabExpanded ? 20 : 0,
          paddingRight: fabExpanded ? 20 : 0,
        }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
      >
        <Plus className="w-6 h-6 flex-shrink-0" />
        <AnimatePresence>
          {fabExpanded && (
            <motion.span
              key="label"
              initial={{ width: 0, opacity: 0, marginLeft: 0 }}
              animate={{ width: "auto", opacity: 1, marginLeft: 8 }}
              exit={{ width: 0, opacity: 0, marginLeft: 0 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden uppercase tracking-widest text-xs"
            >
              Post Match
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Match Cards — Vertical Stack */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-card border border-border/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-3 w-6 rounded" />
                <Skeleton className="h-10 w-10 rounded-full" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-32 rounded" />
                <Skeleton className="h-8 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : displayedMatches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16 space-y-4"
        >
          <div className="flex justify-center">{emptyState.icon}</div>
          <div>
            <p className="font-display font-bold text-foreground">{emptyState.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{emptyState.subtitle}</p>
          </div>
          <button
            onClick={() => setShowCreateMatch(true)}
            className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-display font-black text-xs uppercase tracking-widest mt-2 active:scale-95 transition-transform"
          >
            Create a match
          </button>
        </motion.div>
      ) : (
        <MatchCarousel
          matches={displayedMatches}
          highlightMatchId={highlightMatchId}
          user={user}
          navigate={navigate}
          onBet={(match) => setActiveBetMatch(match)}
        />
      )}

      {/* Pending Actions */}
      {pendingMatches.length > 0 && (() => {
        const actionNeeded = pendingMatches.filter((m) => !m.userActionDone);
        const waitingValidation = pendingMatches.filter((m) => m.userActionDone);
        const allPending = [...actionNeeded, ...waitingValidation];

        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Upload className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-display font-bold text-sm">Action Required</p>
                <p className="text-[11px] text-muted-foreground">
                  {actionNeeded.length > 0
                    ? `${actionNeeded.length} match${actionNeeded.length > 1 ? "es" : ""} need${actionNeeded.length === 1 ? "s" : ""} your input`
                    : "All actions submitted — waiting for review"}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {allPending.map((match, i) => {
                const isDone = match.userActionDone;
                const actionLabel = isDone
                  ? "Under Review"
                  : match.status === "awaiting_score"
                  ? "Upload Score"
                  : match.status === "review_requested"
                  ? "Review Needed"
                  : "Submit Review";

                return (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <button
                      onClick={() => navigate(`/matches/${match.id}`)}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                        isDone
                          ? "border-border/50 bg-card hover:bg-surface-container-high"
                          : "border-primary/30 bg-card hover:bg-primary/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold truncate ${isDone ? "text-muted-foreground" : "text-foreground"}`}>
                            {match.club}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {match.match_date ? format(new Date(match.match_date + "T00:00:00"), "EEEE d MMM") : "TBD"} • {match.match_time?.slice(0, 5) ?? ""}
                          </p>
                        </div>
                        {isDone ? (
                          <ClockIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        ) : (
                          <Upload className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        )}
                      </div>
                      <div className="mt-3">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          isDone
                            ? "bg-muted text-muted-foreground"
                            : "bg-primary/20 text-primary"
                        }`}>
                          {actionLabel}
                        </span>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        );
      })()}

      <CreateMatchModal
        open={showCreateMatch}
        onOpenChange={(open) => {
          setShowCreateMatch(open);
          if (!open) {
            fetchMatches();
            fetchPendingMatches();
          }
        }}
        onCreated={(matchId) => {
          setHighlightMatchId(matchId);
          setTimeout(() => setHighlightMatchId(null), 3500);
        }}
      />
      <MatchJoinModal
        matchId={selectedMatchId}
        open={!!selectedMatchId}
        onOpenChange={(o) => { if (!o) { setSelectedMatchId(null); fetchMatches(); } }}
      />
      <MatchBetSheet
        open={!!activeBetMatch}
        onClose={() => setActiveBetMatch(null)}
        match={activeBetMatch ? {
          matchId: activeBetMatch.id,
          club: activeBetMatch.club,
          date: activeBetMatch.match_date ? format(new Date(activeBetMatch.match_date + "T00:00:00"), "EEE d MMMM") : "TBD",
          time: activeBetMatch.match_time?.slice(0, 5) ?? "",
          teamALabel: activeBetMatch.players.filter(p => p.team === "team_a").map(p => p.name.split(" ")[0]).join(" & ") || "Team A",
          teamBLabel: activeBetMatch.players.filter(p => p.team === "team_b").map(p => p.name.split(" ")[0]).join(" & ") || "Team B",
          teamAOdds: activeBetMatch.market?.team_a_multiplier ?? 1.8,
          teamBOdds: activeBetMatch.market?.team_b_multiplier ?? 1.8,
        } : null}
        onBetPlaced={() => fetchMatches()}
      />
      </>
      )}
    </div>
  );
};

export default Matches;