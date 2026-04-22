import { useState, useEffect } from "react";
import CreateMatchModal from "@/components/CreateMatchModal";
import MatchJoinModal from "@/components/MatchJoinModal";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [myMatches, setMyMatches] = useState<any[]>([]);
  const [myMatchesLoading, setMyMatchesLoading] = useState(true);
  const [openMatches, setOpenMatches] = useState<any[]>([]);
  const [openMatchesLoading, setOpenMatchesLoading] = useState(true);
  const [globalRank, setGlobalRank] = useState<number | null>(null);
  const [fabExpanded, setFabExpanded] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // FAB scroll behaviour
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

  // Real global rank — count players with more XP than the current user
  useEffect(() => {
    if (!profile) return;
    const myPoints = profile.padel_park_points ?? 0;
    supabase
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .gt("padel_park_points", myPoints)
      .then(({ count }) => setGlobalRank(count != null ? count + 1 : null));
  }, [profile]);

  // Fetch MY matches (confirmed + active)
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

      setMyMatches(await enrichMatches(matchData || [], user.id));
      setMyMatchesLoading(false);
    };
    fetchMyMatches();
  }, [user]);

  // Fetch OPEN matches the user hasn't joined — "For you tonight"
  useEffect(() => {
    const fetchOpenMatches = async () => {
      setOpenMatchesLoading(true);

      const { data: matchData } = await supabase
        .from("matches")
        .select("*")
        .in("status", ["open", "almost_full"])
        .gte("match_date", new Date().toISOString().slice(0, 10))
        .order("match_date", { ascending: true })
        .order("match_time", { ascending: true })
        .limit(6);

      if (!matchData || matchData.length === 0) {
        setOpenMatches([]);
        setOpenMatchesLoading(false);
        return;
      }

      // Filter out matches user is already in
      const myMatchIds = new Set(
        user
          ? (
              await supabase
                .from("match_players")
                .select("match_id")
                .eq("user_id", user.id)
                .eq("status", "confirmed")
            ).data?.map((j) => j.match_id) ?? []
          : []
      );

      const filtered = matchData.filter((m) => !myMatchIds.has(m.id)).slice(0, 1);
      setOpenMatches(await enrichMatches(filtered, user?.id ?? null));
      setOpenMatchesLoading(false);
    };
    fetchOpenMatches();
  }, [user]);

  const firstName = profile?.display_name?.split(" ")[0] || "Player";
  const userPoints = profile?.padel_park_points ?? 0;
  const level = profile?.padel_level;

  return (
    <div className="px-5 py-6 space-y-6 pb-32">

      {/* ── Greeting row ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <div className="text-[11px] font-black tracking-[0.14em] text-muted-foreground uppercase">
            {format(new Date(), "EEEE · d MMMM")}
          </div>
          <div className="font-display text-[26px] font-black italic uppercase leading-tight mt-0.5">
            Hey {firstName}.
          </div>
        </div>
        <button
          onClick={() => navigate("/profile")}
          className="w-10 h-10 rounded-full border-2 border-primary flex-shrink-0 bg-muted hover:opacity-80 transition-opacity overflow-hidden"
        >
          {profile?.avatar_url && (
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          )}
        </button>
      </motion.div>

      {/* ── Next match hero card ── */}
      {myMatchesLoading ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="h-40 bg-muted rounded-2xl animate-pulse"
        />
      ) : myMatches.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-primary text-primary-foreground p-5 space-y-3"
        >
          {/* watermark */}
          <div className="absolute right-[-24px] bottom-[-28px] text-[120px] font-black opacity-[0.06] italic leading-none select-none">
            ▶
          </div>

          <div className="text-[10px] font-black tracking-[0.18em] uppercase opacity-70">
            ● NEXT UP · {myMatches[0].date}
          </div>

          <div className="font-display text-[26px] font-black italic uppercase leading-[0.9]">
            {myMatches[0].court ? `Court ${myMatches[0].court}` : myMatches[0].club} @ {myMatches[0].time}
          </div>

          <div className="text-sm font-semibold opacity-75">
            {myMatches[0].club} · {myMatches[0].maxPlayers - myMatches[0].spotsLeft}/{myMatches[0].maxPlayers} players
          </div>

          <div className="flex gap-3 pt-1">
            <button className="px-4 py-2 bg-primary-foreground text-primary rounded-full font-black text-xs tracking-wide hover:opacity-90 active:scale-95 transition-all">
              Check in
            </button>
            <span className="text-xs font-bold self-center opacity-60">Share invite ›</span>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-2 border-dashed border-border rounded-2xl p-8 text-center space-y-3"
        >
          <div className="font-display text-lg font-black italic uppercase text-muted-foreground">
            No upcoming matches
          </div>
          <button
            onClick={() => setShowCreateMatch(true)}
            className="text-primary text-sm font-bold hover:underline"
          >
            Post a match →
          </button>
        </motion.div>
      )}

      {/* ── Stat bar: XP · Level · Rank ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-baseline gap-5 border-b border-border/40 pb-5"
      >
        <div>
          <div className="font-display text-[26px] font-black italic text-primary leading-tight">
            {userPoints.toLocaleString()}
          </div>
          <div className="text-[9px] font-black tracking-[0.12em] text-muted-foreground uppercase mt-0.5">
            XP
          </div>
        </div>
        <div className="w-px h-8 bg-border/50 self-center" />
        <div>
          <div className="font-display text-[20px] font-black italic leading-tight">
            {level ? `Lvl ${level.toFixed(1)}` : "—"}
          </div>
          <div className="text-[9px] font-black tracking-[0.12em] text-muted-foreground uppercase mt-0.5">
            Level
          </div>
        </div>
        <div className="w-px h-8 bg-border/50 self-center" />
        <div>
          <div className="font-display text-[20px] font-black italic leading-tight">
            {globalRank != null ? `#${globalRank}` : "—"}
          </div>
          <div className="text-[9px] font-black tracking-[0.12em] text-muted-foreground uppercase mt-0.5">
            Rank
          </div>
        </div>
      </motion.div>

      {/* ── For you tonight ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-3"
      >
        <div className="text-[11px] font-black tracking-[0.14em] text-muted-foreground uppercase">
          For you tonight
        </div>

        {openMatchesLoading ? (
          <div className="h-28 bg-muted rounded-xl animate-pulse" />
        ) : openMatches.length > 0 ? (
          <button
            className="w-full text-left bg-muted/40 border border-border/30 rounded-xl p-4 space-y-3 hover:border-primary/30 transition-colors active:scale-[0.99]"
            onClick={() => setSelectedMatchId(openMatches[0].matchId)}
          >
            <div className="flex gap-2">
              <span className="px-2.5 py-1 bg-primary text-primary-foreground rounded-full text-[10px] font-black tracking-wide uppercase">
                {openMatches[0].format === "competitive" ? "Competitive" : "Social"}
              </span>
              <span className="px-2.5 py-1 bg-muted border border-border rounded-full text-[10px] font-semibold text-muted-foreground">
                {openMatches[0].spotsLeft} spot{openMatches[0].spotsLeft !== 1 ? "s" : ""} left
              </span>
            </div>

            <div className="font-display text-lg font-black italic uppercase leading-tight">
              {openMatches[0].club}
            </div>

            <div className="text-xs text-muted-foreground">
              {openMatches[0].time} · {openMatches[0].maxPlayers - openMatches[0].spotsLeft}/{openMatches[0].maxPlayers} players
            </div>

            {/* Fill progress */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-[3px] bg-border/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{
                    width: `${((openMatches[0].maxPlayers - openMatches[0].spotsLeft) / openMatches[0].maxPlayers) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[10px] font-black italic text-muted-foreground">
                {openMatches[0].maxPlayers - openMatches[0].spotsLeft}/{openMatches[0].maxPlayers}
              </span>
            </div>
          </button>
        ) : (
          <div className="text-center text-muted-foreground text-sm py-6">
            No open matches right now
          </div>
        )}
      </motion.div>

      {/* ── Quick actions ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex gap-6"
      >
        <button
          onClick={() => navigate("/clubs")}
          className="font-display text-[12px] font-black italic uppercase border-b-2 border-primary pb-0.5 hover:opacity-70 transition-opacity"
        >
          Book court
        </button>
        <button
          onClick={() => navigate("/matches")}
          className="font-display text-[12px] font-black italic uppercase border-b-2 border-primary pb-0.5 hover:opacity-70 transition-opacity"
        >
          Find match
        </button>
        <button
          onClick={() => navigate("/matches")}
          className="font-display text-[12px] font-black italic uppercase border-b-2 border-primary pb-0.5 hover:opacity-70 transition-opacity"
        >
          Invite friend
        </button>
      </motion.div>

      {/* ── FAB ── */}
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
      <MatchJoinModal
        matchId={selectedMatchId}
        open={!!selectedMatchId}
        onOpenChange={(o) => !o && setSelectedMatchId(null)}
      />
    </div>
  );
};

// ── Shared enrichment helper ────────────────────────────────────────────────

async function enrichMatches(matchData: any[], userId: string | null): Promise<any[]> {
  if (matchData.length === 0) return [];
  const ids = matchData.map((m) => m.id);

  const { data: playerData } = await supabase
    .from("match_players")
    .select("match_id, user_id, status, team")
    .in("match_id", ids)
    .eq("status", "confirmed");

  const userIds = [...new Set((playerData || []).map((p: any) => p.user_id))];
  const { data: profiles } = userIds.length > 0
    ? await supabase.from("profiles").select("user_id, display_name, avatar_url, padel_level").in("user_id", userIds)
    : { data: [] };

  const profileMap = new Map(
    (profiles || []).map((p: any) => [p.user_id, { name: p.display_name, avatar: p.avatar_url, rating: p.padel_level }])
  );

  return matchData.map((m) => {
    const matchPlayers = (playerData || []).filter((p: any) => p.match_id === m.id);
    const toPlayer = (p: any) => ({
      name: profileMap.get(p.user_id)?.name || "Player",
      avatar: profileMap.get(p.user_id)?.avatar || "",
      rating: profileMap.get(p.user_id)?.rating ?? null,
      isCreator: p.user_id === m.organizer_id,
    });
    return {
      id: m.id,
      matchId: m.id,
      club: m.club,
      court: m.court,
      date: format(new Date(m.match_date + "T00:00:00"), "EEEE d MMMM"),
      time: m.match_time.slice(0, 5),
      format: m.format,
      levelMin: m.level_min,
      levelMax: m.level_max,
      maxPlayers: m.max_players,
      spotsLeft: m.max_players - matchPlayers.length,
      status: m.status,
      teamA: matchPlayers.filter((p: any) => p.team === "A").map(toPlayer),
      teamB: matchPlayers.filter((p: any) => p.team === "B").map(toPlayer),
      totalPointsStaked: 0,
      teamAOdds: 0,
      teamBOdds: 0,
      isBettingOpen: m.format !== "social" && ["open", "almost_full", "full"].includes(m.status),
      isJoined: userId ? matchPlayers.some((p: any) => p.user_id === userId) : false,
      isEligible: true,
    };
  });
}

export default Dashboard;
