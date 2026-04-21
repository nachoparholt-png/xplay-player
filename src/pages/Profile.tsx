import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Settings, LogOut } from "lucide-react";
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

  return (
    <div className="px-6 py-6 space-y-6">
      {/* IDENTITY HERO - Row layout */}
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3 flex-1">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full bg-primary p-0.5 flex-shrink-0">
            <Avatar className="w-full h-full">
              <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="text-lg font-black bg-primary text-primary-foreground">
                {profile?.display_name?.[0]?.toUpperCase() || "P"}
              </AvatarFallback>
            </Avatar>
          </div>
          {/* Name & location */}
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-[22px] font-black italic uppercase text-foreground leading-tight">
              {profile?.display_name || "Player"}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {profile?.location || "No location"}
            </p>
          </div>
        </div>
        {/* Settings button */}
        <button
          onClick={() => navigate("/profile/settings")}
          className="p-2 active:scale-95 transition-transform ml-2"
        >
          <Settings className="w-5 h-5 text-foreground" />
        </button>
      </motion.section>

      {/* 2 INSIGHT CARDS */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 gap-2"
      >
        {/* Card 1: Level (primary bg) */}
        <div className="flex-1 p-3 rounded-[14px] bg-primary text-primary-foreground">
          <div className="font-display text-[22px] font-black italic leading-[0.95]">
            {profile?.padel_level ? profile.padel_level.toFixed(1) : "—"}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-70 mt-0.5">Level</div>
          <div className="text-[9px] opacity-60 mt-1">
            {profile?.padel_level ? `Cat ${levelToCategory(profile.padel_level)}` : "Unrated"}
          </div>
        </div>

        {/* Card 2: Win Rate (ghost card) */}
        <div className="flex-1 p-3 rounded-[14px] bg-card border border-border/[0.07]">
          <div className="font-display text-[22px] font-black italic leading-[0.95] text-foreground">
            {winRate}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground opacity-70 mt-0.5">Win Rate</div>
          <div className="text-[9px] text-muted-foreground opacity-60 mt-1">
            {profile?.total_matches ? `${profile.wins || 0} of ${profile.total_matches}` : "No matches"}
          </div>
        </div>
      </motion.section>

      {/* FORM CHART CARD */}
      {user && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-[18px] border border-border/[0.07] p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] font-black tracking-[0.14em] text-muted-foreground uppercase">
              Form · Last 90 Days
            </div>
            <div className="text-[11px] font-bold text-primary">
              ▲ Trending up
            </div>
          </div>
          <RatingEvolutionChart userId={user.id} />
        </motion.section>
      )}

      {/* 3 COLLAPSED RAILS */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-2"
      >
        {/* Rail 1: Rating & history */}
        <button
          onClick={() => navigate("/matches")}
          className="w-full p-[14px_16px] bg-card/30 rounded-[14px] flex items-center gap-3 border border-border/[0.05] active:scale-[0.98] transition-transform"
        >
          <div className="text-[16px]">📊</div>
          <div className="flex-1 text-left">
            <div className="text-[13px] font-bold text-foreground">Rating & History</div>
            <div className="text-[10px] text-muted-foreground mt-[2px]">
              {profile?.total_matches || 0} matches · {profile?.wins || 0} W · {(profile?.total_matches || 0) - (profile?.wins || 0)} L
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
        </button>

        {/* Rail 2: Payments & subscriptions */}
        <button
          onClick={() => navigate("/bookings")}
          className="w-full p-[14px_16px] bg-card/30 rounded-[14px] flex items-center gap-3 border border-border/[0.05] active:scale-[0.98] transition-transform"
        >
          <div className="text-[16px]">💳</div>
          <div className="flex-1 text-left">
            <div className="text-[13px] font-bold text-foreground">Payments & Subscriptions</div>
            <div className="text-[10px] text-muted-foreground mt-[2px]">
              {(profile?.padel_park_points ?? 0).toLocaleString()} XP · Bookings
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
        </button>

        {/* Rail 3: Notifications & privacy */}
        <button
          onClick={() => navigate("/profile/settings")}
          className="w-full p-[14px_16px] bg-card/30 rounded-[14px] flex items-center gap-3 border border-border/[0.05] active:scale-[0.98] transition-transform"
        >
          <div className="text-[16px]">🔔</div>
          <div className="flex-1 text-left">
            <div className="text-[13px] font-bold text-foreground">Notifications & Privacy</div>
            <div className="text-[10px] text-muted-foreground mt-[2px]">Match reminders on</div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
        </button>
      </motion.section>

      {/* Recent Matches */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-display font-black text-muted-foreground uppercase tracking-widest">Recent Matches</h3>
          <button className="text-[10px] font-bold text-primary uppercase tracking-widest">View All</button>
        </div>
        <div className="space-y-3">
          {matchesLoading ? (
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-card/30 rounded-[14px] p-4 space-y-2 animate-pulse"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <div className="h-3 w-32 bg-muted rounded" />
                    <div className="h-4 w-40 bg-muted rounded" />
                  </div>
                  <div className="h-5 w-16 bg-muted rounded" />
                </div>
              </div>
            ))
          ) : recentMatches.length === 0 ? (
            <div className="bg-card/30 rounded-[14px] p-6 text-center">
              <p className="text-sm text-muted-foreground font-medium">No matches played yet</p>
              <p className="text-xs text-muted-foreground mt-1">Join a match to see your history here</p>
            </div>
          ) : (
            recentMatches.map((match, i) => (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.05 }}
                className="bg-card/30 rounded-[14px] p-4 space-y-2 active:scale-[0.98] transition-transform"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-1 flex-1">
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
                        {match.date}
                      </span>
                    </div>
                    <h4 className="text-sm font-display font-bold tracking-tight">
                      vs {match.opponent}
                    </h4>
                    <p className="text-[10px] text-muted-foreground">{match.venue}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`font-display font-black text-sm ${
                        match.result === "win" ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {match.ratingChange}
                    </div>
                    <div className="text-[9px] text-muted-foreground font-bold">RATING</div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </motion.section>

      {/* Sign Out */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="pt-4 pb-4"
      >
        <button
          onClick={signOut}
          className="text-[11px] text-muted-foreground/60 font-semibold active:scale-95 transition-transform"
        >
          Sign out
        </button>
      </motion.section>
    </div>
  );
};

export default Profile;
