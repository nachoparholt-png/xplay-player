import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Plus, Users, Calendar, MapPin, Lock, Globe, Search,
  SlidersHorizontal, Clock, LayoutGrid, Swords, ChevronRight, TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tournament } from "@/lib/tournaments/types";
import TournamentBetSheet from "@/components/betting/TournamentBetSheet";

/* ── types ─────────────────────────────────────────── */
type Tab = "all" | "open" | "my_entries" | "completed";
type SkillFilter = "all" | "beginner" | "intermediate" | "advanced" | "pro";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "my_entries", label: "My Entries" },
  { key: "completed", label: "Completed" },
];

const SKILL_CHIPS: { key: SkillFilter; label: string }[] = [
  { key: "all", label: "All Levels" },
  { key: "beginner", label: "Beginner" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
  { key: "pro", label: "Pro" },
];

const TAB_EMPTY: Record<Tab, { icon: React.ReactNode; title: string; subtitle: string }> = {
  all: {
    icon: <Trophy className="w-10 h-10 text-muted-foreground/50" />,
    title: "No tournaments found",
    subtitle: "Check back soon or create one to get started.",
  },
  my_entries: {
    icon: <Trophy className="w-10 h-10 text-muted-foreground/50" />,
    title: "You haven't joined any tournaments",
    subtitle: "Browse open tournaments or create your own!",
  },
  open: {
    icon: <Users className="w-10 h-10 text-muted-foreground/50" />,
    title: "No open tournaments",
    subtitle: "Check back soon or create one to get started.",
  },
  completed: {
    icon: <Clock className="w-10 h-10 text-muted-foreground/50" />,
    title: "No completed tournaments yet",
    subtitle: "Finished tournaments will appear here.",
  },
};

const statusAccent = (s: string) => {
  switch (s) {
    case "active": return "bg-primary";
    case "completed": return "bg-muted-foreground";
    case "draft": return "bg-accent/60";
    case "cancelled": return "bg-destructive";
    default: return "bg-muted-foreground";
  }
};

const PAGE_SIZE = 20;

/* ── component ─────────────────────────────────────── */
const TournamentsList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});
  const [myTournamentIds, setMyTournamentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<Tab>("open");
  const [skillFilter, setSkillFilter] = useState<SkillFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [fabExpanded, setFabExpanded] = useState(true);
  const [activeBetTournament, setActiveBetTournament] = useState<Tournament | null>(null);
  const lastScrollY = useRef(0);

  // FAB scroll behaviour
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 10) setFabExpanded(true);
      else if (currentY > lastScrollY.current + 5) setFabExpanded(false);
      else if (currentY < lastScrollY.current - 5) setFabExpanded(true);
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const fetchPlayerCounts = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data: counts } = await supabase
      .from("tournament_players")
      .select("tournament_id")
      .eq("status", "confirmed")
      .in("tournament_id", ids);
    const map: Record<string, number> = {};
    (counts || []).forEach((row: any) => {
      map[row.tournament_id] = (map[row.tournament_id] || 0) + 1;
    });
    setPlayerCounts((prev) => ({ ...prev, ...map }));
  };

  // Initial fetch
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setPage(0);
      const [tourneysRes, playersRes] = await Promise.all([
        supabase.from("tournaments").select("*").order("created_at", { ascending: false }).range(0, PAGE_SIZE - 1),
        user
          ? supabase.from("tournament_players").select("tournament_id").eq("user_id", user.id).eq("status", "confirmed")
          : Promise.resolve({ data: [] }),
      ]);
      const tourneys = (tourneysRes.data || []) as Tournament[];
      setTournaments(tourneys);
      setHasMore(tourneys.length === PAGE_SIZE);
      setMyTournamentIds(new Set((playersRes.data || []).map((p) => p.tournament_id)));
      await fetchPlayerCounts(tourneys.map((t) => t.id));
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const nextPage = page + 1;
    const { data } = await supabase
      .from("tournaments")
      .select("*")
      .order("created_at", { ascending: false })
      .range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1);
    const more = (data || []) as Tournament[];
    setTournaments((prev) => [...prev, ...more]);
    setPage(nextPage);
    setHasMore(more.length === PAGE_SIZE);
    await fetchPlayerCounts(more.map((t) => t.id));
    setLoadingMore(false);
  };

  // Filter logic
  const filtered = useMemo(() => {
    let list = tournaments;

    if (tab === "my_entries") list = list.filter((t) => myTournamentIds.has(t.id));
    else if (tab === "open") list = list.filter((t) => t.status === "active");
    else if (tab === "completed") list = list.filter((t) => t.status === "completed" || t.status === "cancelled");

    if (skillFilter !== "all") {
      list = list.filter((t) => {
        const cat = t.skill_category_id?.toLowerCase() || "";
        return cat.includes(skillFilter);
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || (t.club && t.club.toLowerCase().includes(q))
      );
    }
    return list;
  }, [tournaments, tab, searchQuery, myTournamentIds, skillFilter]);

  // Featured tournament = first active one
  const featured = useMemo(
    () => tournaments.find((t) => t.status === "active"),
    [tournaments]
  );

  const regularList = useMemo(
    () => (featured ? filtered.filter((t) => t.id !== featured.id) : filtered),
    [filtered, featured]
  );

  const empty = TAB_EMPTY[tab];

  return (
    <div className="px-4 py-6 space-y-5 overflow-x-hidden">
      {/* Page Header */}
      <h1
        className="text-3xl tracking-tight uppercase text-foreground"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }}
      >
        Tournaments
      </h1>

      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="flex-1 bg-card h-12 rounded-full flex items-center px-4 border border-border/30">
          <Search className="w-4 h-4 text-muted-foreground mr-3" />
          <input
            className="bg-transparent border-none focus:outline-none text-foreground placeholder:text-muted-foreground font-medium w-full text-sm"
            placeholder="Find a tournament..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="bg-card h-12 w-12 rounded-full flex items-center justify-center active:scale-95 transition-transform border border-border/30">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === t.key
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Featured Hero Card */}
      {featured && tab !== "completed" && tab !== "my_entries" && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-2xl overflow-hidden border border-primary/20"
          style={{
            background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--primary) / 0.12) 100%)",
          }}
        >
          <div className="p-5 space-y-3">
            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-bold uppercase tracking-wider">
              Registration Open
            </Badge>
            <h2
              className="text-xl text-foreground uppercase leading-tight"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }}
            >
              {featured.name}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              {featured.scheduled_date && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  {featured.scheduled_date}
                </span>
              )}
              {featured.club && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground uppercase">
                  <MapPin className="w-3.5 h-3.5" />
                  {featured.club}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground font-medium">
                  {playerCounts[featured.id] || 0}/{featured.player_count} players
                </span>
              </div>
              <Button
                size="sm"
                className="rounded-full font-bold text-xs px-5"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/tournaments/${featured.id}`);
                }}
              >
                Enter Now
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Skill Level Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {SKILL_CHIPS.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setSkillFilter(chip.key)}
            className={`whitespace-nowrap text-xs font-bold px-3.5 py-1.5 rounded-full border transition-colors ${
              skillFilter === chip.key
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-card text-muted-foreground border-border/30 hover:text-foreground"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Section Label */}
      <div className="flex justify-between items-end">
        <h2 className="font-display font-black text-muted-foreground text-[11px] tracking-[0.2em] uppercase">
          {tab === "my_entries"
            ? "My Tournaments"
            : tab === "completed"
            ? "Past Tournaments"
            : "Upcoming Tournaments"}
        </h2>
        <span className="text-primary font-bold text-xs cursor-pointer flex items-center gap-0.5">
          View All <ChevronRight className="w-3 h-3" />
        </span>
      </div>

      {/* FAB */}
      <motion.button
        onClick={() => navigate("/tournaments/new")}
        className="fixed bottom-24 right-5 lg:bottom-8 lg:right-8 z-40 flex items-center justify-center bg-primary text-primary-foreground font-display font-black text-sm overflow-hidden h-14"
        style={{ minWidth: 56 }}
        whileTap={{ scale: 0.9 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          width: fabExpanded ? 160 : 56,
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
              className="whitespace-nowrap overflow-hidden"
            >
              Create
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Tournament List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : regularList.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16 space-y-3"
        >
          {empty.icon}
          <p className="text-muted-foreground font-medium">{empty.title}</p>
          <p className="text-sm text-muted-foreground/70">{empty.subtitle}</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {regularList.map((t, i) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              index={i}
              confirmedCount={playerCounts[t.id] || 0}
              isMember={myTournamentIds.has(t.id)}
              isCreator={t.created_by === user?.id}
              onNavigate={() => navigate(`/tournaments/${t.id}`)}
              onQuickRegister={() => navigate(`/tournaments/${t.id}`)}
              onBet={() => setActiveBetTournament(t)}
            />
          ))}
          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full py-3 rounded-xl border border-border/40 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load More"}
            </button>
          )}
        </div>
      )}

      <TournamentBetSheet
        open={!!activeBetTournament}
        onClose={() => setActiveBetTournament(null)}
        tournament={activeBetTournament ? {
          tournamentId: activeBetTournament.id,
          name: activeBetTournament.name,
          formatType: activeBetTournament.format_type,
          bracketConfig: activeBetTournament.bracket_config || {},
        } : null}
        onBetPlaced={() => {}}
        isCreatorBlocked={activeBetTournament?.created_by === user?.id}
      />
    </div>
  );
};

/* ── Tournament Card sub-component ─────────────────── */
interface TournamentCardProps {
  tournament: Tournament;
  index: number;
  confirmedCount: number;
  isMember: boolean;
  isCreator?: boolean;
  onNavigate: () => void;
  onQuickRegister: () => void;
  onBet?: () => void;
}

const TournamentCard = ({
  tournament: t,
  index,
  confirmedCount,
  isMember,
  isCreator,
  onNavigate,
  onQuickRegister,
  onBet,
}: TournamentCardProps) => {
  const spotsLeft = Math.max(0, t.player_count - confirmedCount);
  const isFull = spotsLeft === 0;
  const fillPct = t.player_count > 0 ? Math.min(100, (confirmedCount / t.player_count) * 100) : 0;
  const accent = statusAccent(t.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onNavigate}
      className="w-full text-left rounded-2xl border border-border/30 bg-card hover:bg-card/80 transition-colors overflow-hidden flex cursor-pointer"
    >
      {/* Left accent stripe */}
      <div className={`w-1 shrink-0 ${accent}`} />

      <div className="flex-1 p-4 space-y-2.5">
        {/* Row 1 — Name + spots */}
        <div className="flex items-start justify-between gap-2">
          <h3
            className="font-display font-bold text-foreground truncate flex-1 text-[15px]"
          >
            {t.name}
          </h3>
          <Badge
            variant="outline"
            className={`text-[10px] shrink-0 uppercase tracking-wide ${
              isFull
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : "bg-primary/10 text-primary border-primary/20"
            }`}
          >
            {isFull ? "Full" : `${spotsLeft} spots left`}
          </Badge>
        </div>

        {/* Row 2 — Date + Location */}
        <div className="flex items-center gap-3 flex-wrap">
          {t.scheduled_date && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {t.scheduled_date}
              {t.scheduled_time && ` · ${t.scheduled_time.slice(0, 5)}`}
            </span>
          )}
          {t.club && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground uppercase">
              <MapPin className="w-3 h-3" />
              {t.club}
            </span>
          )}
        </div>

        {/* Row 3 — Stats row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground font-medium">
              {confirmedCount}/{t.player_count}
            </span>
            <Progress value={fillPct} className="h-1 w-10 bg-muted" />
          </div>

          <span className="text-muted-foreground/30">·</span>

          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
            <LayoutGrid className="w-3 h-3" />
            <span className="capitalize">{t.format_type.replace("_", " ")}</span>
          </span>

          <span className="text-muted-foreground/30">·</span>

          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
            <Swords className="w-3 h-3" />
            <span className="capitalize">{t.tournament_type}</span>
          </span>

          {t.court_count > 0 && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-[11px] text-muted-foreground font-medium">
                {t.court_count} courts
              </span>
            </>
          )}
        </div>

        {/* Row 4 — Footer with visibility + CTA */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-2">
            {t.visibility === "private" ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Lock className="w-3 h-3" /> Private
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Globe className="w-3 h-3" /> Public
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {t.status === "active" && onBet && !isCreator && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full text-[11px] font-bold h-7 px-3 border-secondary/30 text-secondary hover:bg-secondary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onBet();
                }}
              >
                <TrendingUp className="w-3 h-3 mr-1" />
                Bet
              </Button>
            )}

            {t.status === "active" && !isMember && (
              <Button
                size="sm"
                variant={isFull ? "outline" : "default"}
                className="rounded-full text-[11px] font-bold h-7 px-4"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickRegister();
                }}
              >
                {isFull ? "Waitlist" : "Quick Register"}
              </Button>
            )}

            {isMember && (
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                Joined
              </Badge>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default TournamentsList;
