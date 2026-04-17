import { useState, useEffect, useCallback } from "react";
import CreateMatchModal from "@/components/CreateMatchModal";
import MatchJoinModal from "@/components/MatchJoinModal";
import { Zap, Award, Search, Plus, ArrowRight, MapPin, Calendar, Users, Star, Clock, SlidersHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import StatCard from "@/components/StatCard";
import MatchCard from "@/components/MatchCard";

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const upcomingMatches = [
  {
    matchId: "demo-1",
    club: "Padel Park BCN",
    date: "Today",
    time: "19:00",
    format: "competitive",
    levelMin: 3.0,
    levelMax: 4.5,
    maxPlayers: 4,
    spotsLeft: 1,
    status: "open" as const,
    teamA: [
      { name: "Carlos", avatar: "", rating: 3.8 },
      { name: "Ana", avatar: "", rating: 4.1 },
    ],
    teamB: [
      { name: "Pablo", avatar: "", rating: 3.5 },
    ],
    totalPointsStaked: 500,
    teamAOdds: 0,
    teamBOdds: 0,
    isBettingOpen: true,
    isJoined: false,
    isEligible: true,
  },
  {
    matchId: "demo-2",
    club: "Olympic Stadium Courts",
    date: "Tomorrow",
    time: "10:00",
    format: "social",
    levelMin: 2.0,
    levelMax: 3.5,
    maxPlayers: 4,
    spotsLeft: 2,
    status: "open" as const,
    teamA: [
      { name: "Maria", avatar: "", rating: 2.8 },
    ],
    teamB: [
      { name: "Luis", avatar: "", rating: 3.1 },
    ],
    totalPointsStaked: 0,
    teamAOdds: 0,
    teamBOdds: 0,
    isBettingOpen: false,
    isJoined: false,
    isEligible: true,
  },
];

const suggestedMatches = [
  {
    matchId: "demo-3",
    club: "Valencia Padel Center",
    date: "Tomorrow",
    time: "18:00",
    format: "social",
    levelMin: 2.5,
    levelMax: 4.0,
    maxPlayers: 4,
    spotsLeft: 2,
    status: "open" as const,
    teamA: [{ name: "Jorge", avatar: "", rating: 3.2 }],
    teamB: [{ name: "Lucia", avatar: "", rating: 3.5 }],
    totalPointsStaked: 0,
    teamAOdds: 0,
    teamBOdds: 0,
    isBettingOpen: false,
    isJoined: false,
    isEligible: true,
  },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [myMatches, setMyMatches] = useState<any[]>([]);
  const [myMatchesLoading, setMyMatchesLoading] = useState(true);
  const [fabExpanded, setFabExpanded] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // FAB scroll behavior
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 10) setFabExpanded(true);
      else if (currentY > lastScrollY + 5) setFabExpanded(false);
      else if (currentY < lastScrollY - 5) setFabExpanded(true);
      setLastScrollY(currentY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  // Fetch user's matches from DB
  useEffect(() => {
    const fetchMyMatches = async () => {
      if (!user) return;
      setMyMatchesLoading(true);

      const { data: myJoins } = await supabase
        .from("match_players")
        .select("match_id")
        .eq("user_id", user.id)
        .eq("status", "confirmed");

      if (!myJoins || myJoins.length === 0) {
        setMyMatches([]);
        setMyMatchesLoading(false);
        return;
      }

      const matchIds = myJoins.map((j) => j.match_id);
      const { data: matchData } = await supabase
        .from("matches")
        .select("*")
        .in("id", matchIds)
        .in("status", ["open", "almost_full", "full", "awaiting_score", "pending_review", "review_requested"])
        .order("match_date", { ascending: true })
        .order("match_time", { ascending: true });

      if (matchData && matchData.length > 0) {
        const ids = matchData.map((m) => m.id);
        const { data: playerData } = await supabase
          .from("match_players")
          .select("match_id, user_id, status, team")
          .in("match_id", ids)
          .eq("status", "confirmed");

        const userIds = [...new Set((playerData || []).map((p) => p.user_id))];
        const { data: profiles } = userIds.length > 0
          ? await supabase.from("profiles").select("user_id, display_name, avatar_url, padel_level").in("user_id", userIds)
          : { data: [] };

        const profileMap = new Map((profiles || []).map((p) => [p.user_id, { name: p.display_name, avatar: p.avatar_url, rating: p.padel_level }]));

        const enriched = matchData.map((m) => {
          const matchPlayerList = (playerData || []).filter((p) => p.match_id === m.id);
          const teamAPlayers = matchPlayerList.filter((p) => p.team === "team_a").map((p) => ({
            name: profileMap.get(p.user_id)?.name || "Player",
            avatar: profileMap.get(p.user_id)?.avatar || "",
            rating: profileMap.get(p.user_id)?.rating ?? null,
            isCreator: p.user_id === m.organizer_id,
          }));
          const teamBPlayers = matchPlayerList.filter((p) => p.team === "team_b").map((p) => ({
            name: profileMap.get(p.user_id)?.name || "Player",
            avatar: profileMap.get(p.user_id)?.avatar || "",
            rating: profileMap.get(p.user_id)?.rating ?? null,
            isCreator: p.user_id === m.organizer_id,
          }));
          return {
            matchId: m.id,
            club: m.club,
            court: m.court,
            date: format(new Date(m.match_date + "T00:00:00"), "EEEE d MMMM"),
            time: m.match_time.slice(0, 5),
            format: m.format,
            levelMin: m.level_min,
            levelMax: m.level_max,
            maxPlayers: m.max_players,
            spotsLeft: m.max_players - matchPlayerList.length,
            status: m.status,
            teamA: teamAPlayers,
            teamB: teamBPlayers,
            totalPointsStaked: 0,
            teamAOdds: 0,
            teamBOdds: 0,
            isBettingOpen: m.format !== "social" && ["open", "almost_full", "full"].includes(m.status),
            isJoined: true,
            isEligible: true,
            id: m.id,
          };
        });
        setMyMatches(enriched);
      } else {
        setMyMatches([]);
      }
      setMyMatchesLoading(false);
    };

    fetchMyMatches();
  }, [user]);

  return (
    <div className="px-6 py-6 space-y-8">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <h1 className="font-display text-4xl font-black tracking-tight uppercase leading-none">
          Find Your <span className="text-primary italic">Arena</span>
        </h1>
        <p className="text-muted-foreground font-medium text-sm">
          Join {profile?.display_name ? `${profile.display_name}, ` : ""}2,400+ active players today
        </p>
      </motion.section>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex gap-3"
      >
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            className="w-full bg-surface-container-lowest border-none focus:ring-0 focus:border-b-2 focus:border-primary py-4 pl-12 pr-4 rounded-xl text-foreground placeholder:text-muted-foreground/50 font-medium transition-all"
            placeholder="Search clubs, levels, or players..."
            type="text"
            onClick={() => navigate("/matches")}
            readOnly
          />
        </div>
        <button
          onClick={() => navigate("/matches")}
          className="bg-surface-container text-primary w-14 h-14 rounded-xl flex items-center justify-center hover:bg-surface-container-high transition-colors active:scale-95"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </motion.div>

      {/* Stats Bento */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-3"
      >
        <StatCard
          label="Global Rank"
          value={profile?.total_matches ? `#${profile.total_matches}` : "—"}
          icon={Award}
          variant="primary"
        />
        <StatCard
          label="XP Balance"
          value={profile?.padel_park_points ?? 0}
          icon={Zap}
          variant="secondary"
        />
      </motion.section>

      {/* Upcoming Matches */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xs font-black tracking-[0.2em] text-muted-foreground uppercase">
            UPCOMING MATCHES
          </h2>
          <button
            onClick={() => navigate("/matches")}
            className="text-primary text-[10px] font-bold font-display uppercase hover:underline"
          >
            See All
          </button>
        </div>

        <div className="space-y-4">
          {upcomingMatches.map((match, i) => (
            <MatchCard key={match.matchId} {...match} />
          ))}
        </div>
      </motion.section>

      {/* My Matches */}
      {user && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-black tracking-[0.2em] text-muted-foreground uppercase">
              MY MATCHES
            </h2>
            <button
              onClick={() => navigate("/matches")}
              className="text-primary text-[10px] font-bold font-display uppercase hover:underline"
            >
              View All
            </button>
          </div>

          {myMatchesLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : myMatches.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-muted-foreground">You're not in any active matches</p>
              <button onClick={() => navigate("/matches")} className="text-primary text-sm font-semibold hover:underline">
                Find a match →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {myMatches.slice(0, 2).map((match) => (
                <MatchCard key={match.id} {...match} onClick={() => navigate(`/matches/${match.id}`)} />
              ))}
            </div>
          )}
        </motion.section>
      )}

      {/* Promotion Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface-container-high to-background p-5 border border-primary/20 h-32 flex flex-col justify-center"
      >
        <div className="absolute right-[-10%] top-[-20%] opacity-10">
          <Award className="w-32 h-32 text-primary" />
        </div>
        <p className="text-primary font-display font-black text-xs uppercase tracking-widest mb-1">Weekly Challenge</p>
        <h4 className="font-display text-xl font-black uppercase leading-tight max-w-[60%]">
          Win 3 Matches, Get 500 Points
        </h4>
      </motion.div>

      {/* Suggested For You */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xs font-black tracking-[0.2em] text-muted-foreground uppercase">
            SUGGESTED FOR YOU
          </h2>
          <button onClick={() => navigate("/matches")} className="text-primary text-[10px] font-bold font-display uppercase hover:underline">
            See More
          </button>
        </div>
        <div className="space-y-4">
          {suggestedMatches.map((match) => (
            <MatchCard key={match.matchId} {...match} />
          ))}
        </div>
      </motion.section>

      {/* FAB */}
      <motion.button
        onClick={() => setShowCreateMatch(true)}
        className="fixed bottom-24 right-6 z-40 flex items-center justify-center bg-primary text-primary-foreground shadow-lg font-black text-sm overflow-hidden h-14"
        style={{ minWidth: 56 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          width: fabExpanded ? 160 : 56,
          borderRadius: fabExpanded ? 16 : 28,
          paddingLeft: fabExpanded ? 16 : 0,
          paddingRight: fabExpanded ? 16 : 0,
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
              className="whitespace-nowrap overflow-hidden font-display uppercase tracking-wider"
            >
              Post Match
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <CreateMatchModal open={showCreateMatch} onOpenChange={setShowCreateMatch} />
      <MatchJoinModal matchId={selectedMatchId} open={!!selectedMatchId} onOpenChange={(o) => !o && setSelectedMatchId(null)} />
    </div>
  );
};

export default Dashboard;
