import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trophy, Target, TrendingUp, Calendar, Zap, Award, ChevronRight, Settings, LogOut, Timer, MapPin, Bolt, Crosshair, Gauge, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

import SkillBadge from "@/components/SkillBadge";
import PlayerRatingCard from "@/components/PlayerRatingCard";
import RatingEvolutionChart from "@/components/RatingEvolutionChart";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type RecentMatch = {
  id: string;
  opponent: string;
  result: "win" | "loss";
  ratingChange: string;
  newRating: string;
  date: string;
  venue: string;
};

const levelToCategory = (level: number | null): 1 | 2 | 3 | 4 | 5 => {
  if (!level) return 5;
  if (level >= 6) return 1;
  if (level >= 4.5) return 2;
  if (level >= 3) return 3;
  if (level >= 1.5) return 4;
  return 5;
};

const Profile = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeStakeCount, setActiveStakeCount] = useState(0);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("match_stakes").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("status", "active")
      .then(({ count }) => setActiveStakeCount(count || 0));
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const fetchRecentMatches = async () => {
      setMatchesLoading(true);
      try {
        // Single deep join: rating_history → matches → match_players → profiles
        const { data: history, error: historyError } = await supabase
          .from("rating_history")
          .select(`
            id,
            match_id,
            level_change,
            actual_result,
            new_level,
            created_at,
            matches (
              match_date,
              club,
              court,
              match_players (
                user_id,
                team,
                profiles (
                  display_name
                )
              )
            )
          `)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (historyError || !history?.length) {
          setMatchesLoading(false);
          return;
        }

        type MatchPlayerRow = {
          user_id: string;
          team: string | null;
          profiles: { display_name: string | null } | null;
        };
        type MatchRow = {
          match_date?: string | null;
          club?: string | null;
          court?: string | null;
          match_players?: MatchPlayerRow[];
        };

        // Build the final list from the single joined query
        const built: RecentMatch[] = history.map((h) => {
          const match = h.matches as MatchRow | null;
          const matchPlayers = match?.match_players || [];

          const myPlayer = matchPlayers.find((p) => p.user_id === user.id);
          const myTeam = myPlayer?.team;

          const opponents = matchPlayers
            .filter((p) => p.user_id !== user.id && myTeam && p.team !== myTeam)
            .map((p) => {
              const name = p.profiles?.display_name || "Unknown";
              const parts = name.trim().split(" ");
              if (parts.length >= 2) {
                return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
              }
              return name;
            });

          const opponentText =
            opponents.length > 0 ? opponents.join(" & ") : "Unknown opponents";

          const isWin = Number(h.actual_result) === 1;
          const change = Number(h.level_change ?? 0);
          const dateStr = match?.match_date
            ? new Date(match.match_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              })
            : new Date(h.created_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              });

          return {
            id: h.id,
            opponent: opponentText,
            result: isWin ? "win" : "loss",
            ratingChange: `${change >= 0 ? "+" : ""}${change.toFixed(2)}`,
            newRating: Number(h.new_level ?? 0).toFixed(1),
            date: dateStr,
            venue: match?.club || match?.court || "Unknown venue",
          };
        });

        setRecentMatches(built);
      } catch (e) {
        console.error("[Profile] Error fetching recent matches:", e);
      } finally {
        setMatchesLoading(false);
      }
    };

    fetchRecentMatches();
  }, [user]);

  const winRate =
    profile && profile.total_matches > 0
      ? `${Math.round((profile.wins / profile.total_matches) * 100)}%`
      : "0%";

  const reliabilityLabel =
    (profile?.reliability_score ?? 100) >= 90
      ? "HIGH"
      : (profile?.reliability_score ?? 100) >= 70
      ? "MED"
      : "LOW";

  return (
    <div className="px-6 py-6 space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <button
          onClick={() => navigate("/profile/settings")}
          className="p-2 active:scale-95 transition-transform"
        >
          <Settings className="w-6 h-6 text-primary" />
        </button>
        <h1 className="font-display font-bold tracking-tight text-lg uppercase text-foreground">Player Profile</h1>
        <button
          onClick={signOut}
          className="p-2 active:scale-95 transition-transform"
        >
          <LogOut className="w-6 h-6 text-primary" />
        </button>
      </header>

      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center pt-2"
      >
        <div className="relative">
          <div className="w-32 h-32 rounded-full p-1 bg-gradient-to-tr from-primary to-surface-container-low shadow-[0_0_30px_hsl(var(--primary)/0.15)]">
            <Avatar className="w-full h-full">
              <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="text-3xl font-black bg-surface-container">
                {profile?.display_name?.[0]?.toUpperCase() || "P"}
              </AvatarFallback>
            </Avatar>
          </div>
          {profile?.padel_level && (
            <div className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground font-black px-3 py-1 rounded-full text-lg shadow-xl">
              {profile.padel_level.toFixed(1)}
            </div>
          )}
        </div>

        <div className="mt-6 text-center space-y-1">
          <h2 className="text-3xl font-display font-extrabold tracking-tight uppercase italic">
            {profile?.display_name || "Player"}
          </h2>
          <p className="text-muted-foreground font-medium tracking-wide text-xs uppercase flex items-center justify-center gap-2">
            <MapPin className="w-3 h-3" />
            {[
              levelToCategory(profile?.padel_level ?? null) <= 2 ? "Advanced" : "Intermediate",
              "Player",
              profile?.location ? `• ${profile.location}` : "",
            ].join(" ")}
          </p>
        </div>
      </motion.section>

      {/* Stats Row */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-3"
      >
        <div className="bg-surface-container-low rounded-xl p-4 flex flex-col items-center justify-center">
          <span className="text-[10px] text-primary font-bold uppercase tracking-widest mb-1">Matches</span>
          <span className="text-2xl font-display font-black">{profile?.total_matches ?? 0}</span>
        </div>
        <div className="bg-surface-container-low rounded-xl p-4 flex flex-col items-center justify-center">
          <span className="text-[10px] text-primary font-bold uppercase tracking-widest mb-1">Win Rate</span>
          <span className="text-2xl font-display font-black text-primary">{winRate}</span>
        </div>
        <div className="bg-surface-container-low rounded-xl p-4 flex flex-col items-center justify-center border-l-2 border-primary/20">
          <span className="text-[10px] text-primary font-bold uppercase tracking-widest mb-1">Reliability</span>
          <span className="text-lg font-display font-black">{reliabilityLabel}</span>
        </div>
      </motion.section>

      {/* Rating & Level Card */}
      {profile?.padel_level && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-surface-container-high rounded-xl p-6 relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 blur-[60px] rounded-full" />
          <div className="flex items-end justify-between mb-6">
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">Padel Rating</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-display font-black">{profile.padel_level.toFixed(1)}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground font-bold uppercase block mb-1">Confidence</span>
              <span className="text-xl font-display font-black text-primary">
                {Math.min(100, Math.round((profile.reliability_score ?? 100) * 0.88 + 12))}%
              </span>
            </div>
          </div>
          <div className="w-full h-1.5 bg-surface-container-lowest rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent rounded-full shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
              style={{ width: `${Math.min(100, Math.round((profile.reliability_score ?? 100) * 0.88 + 12))}%` }}
            />
          </div>
        </motion.section>
      )}

      {/* XPLAY Points Balance */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.17 }}
      >
        <div className="bg-surface-container-high rounded-xl p-6 relative overflow-hidden">
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-primary/10 blur-[60px] rounded-full" />
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">XPLAY Points</h3>
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-5xl font-display font-black text-primary">
              {(profile?.padel_park_points ?? 0).toLocaleString()}
            </span>
            <span className="text-sm font-bold text-muted-foreground">PP</span>
          </div>
          <button
            onClick={() => navigate("/points-store")}
            className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-display font-bold uppercase tracking-wider active:scale-[0.98] transition-transform"
          >
            Get More Points
          </button>
        </div>
      </motion.section>

      {/* Skill Highlights */}
      {(profile?.dominant_hand || profile?.preferred_side) && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-sm font-display font-black text-muted-foreground uppercase tracking-widest mb-4 px-1">
            Tactical Assets
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {profile?.dominant_hand && (
              <div className="flex-shrink-0 flex items-center gap-2 bg-surface-container-low border border-primary/30 px-4 py-2 rounded-full">
                <Bolt className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider capitalize">{profile.dominant_hand} Hand</span>
              </div>
            )}
            {profile?.preferred_side && (
              <div className="flex-shrink-0 flex items-center gap-2 bg-surface-container-low border border-primary/30 px-4 py-2 rounded-full">
                <Crosshair className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider capitalize">{profile.preferred_side} Side</span>
              </div>
            )}
            <div className="flex-shrink-0 flex items-center gap-2 bg-surface-container-low border border-primary/30 px-4 py-2 rounded-full">
              <Gauge className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider">Cat {levelToCategory(profile?.padel_level ?? null)}</span>
            </div>
          </div>
        </motion.section>
      )}

      {/* Rating Evolution Chart */}
      {user && <RatingEvolutionChart userId={user.id} />}

      {/* Recent Matches */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-display font-black text-muted-foreground uppercase tracking-widest">Recent Matches</h3>
          <button className="text-[10px] font-bold text-primary uppercase tracking-widest">View All</button>
        </div>
        <div className="space-y-3">
          {matchesLoading ? (
            // Skeleton placeholders while loading
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-surface-container-high rounded-xl p-5 space-y-2 animate-pulse"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="h-3 w-24 bg-surface-container-low rounded" />
                    <div className="h-5 w-40 bg-surface-container-low rounded" />
                  </div>
                  <div className="h-6 w-12 bg-surface-container-low rounded" />
                </div>
              </div>
            ))
          ) : recentMatches.length === 0 ? (
            <div className="bg-surface-container-high rounded-xl p-6 text-center">
              <p className="text-sm text-muted-foreground font-medium">No matches played yet</p>
              <p className="text-xs text-muted-foreground mt-1">Join a match to see your history here</p>
            </div>
          ) : (
            recentMatches.map((match, i) => (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="bg-surface-container-high rounded-xl p-5 space-y-2 active:scale-[0.98] transition-transform"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded italic ${
                          match.result === "win"
                            ? "bg-primary/20 text-primary"
                            : "bg-destructive/20 text-destructive"
                        }`}
                      >
                        {match.result === "win" ? "WIN" : "LOSS"}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">
                        {match.date} • {match.venue}
                      </span>
                    </div>
                    <h4 className="text-lg font-display font-bold tracking-tight">
                      vs {match.opponent}
                    </h4>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-display font-black text-lg ${
                        match.result === "win" ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {match.ratingChange}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-bold">RATING</div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </motion.section>


      {/* Active Stakes */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <button
          onClick={() => navigate("/stakes")}
          className="w-full bg-surface-container-low border border-border/30 rounded-xl p-4 flex items-center gap-3 hover:border-primary/30 transition-colors active:scale-[0.98]"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Timer className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-display font-bold text-sm">{activeStakeCount} active stake{activeStakeCount !== 1 ? "s" : ""}</p>
            <p className="text-xs text-muted-foreground">{profile?.padel_park_points ?? 0} XP balance</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </motion.section>

      {/* My Bookings */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <button
          onClick={() => navigate("/bookings")}
          className="w-full bg-surface-container-low border border-border/30 rounded-xl p-4 flex items-center gap-3 hover:border-primary/30 transition-colors active:scale-[0.98]"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-display font-bold text-sm">My Bookings & Memberships</p>
            <p className="text-xs text-muted-foreground">Courts, coaching & club plans</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </motion.section>
    </div>
  );
};

export default Profile;
