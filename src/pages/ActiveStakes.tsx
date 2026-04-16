import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Zap, Calendar, Clock, CheckCircle, XCircle, Timer, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import EditStakeModal from "@/components/EditStakeModal";

type StakeWithMatch = {
  id: string;
  team: string;
  points_staked: number;
  payout_multiplier: number;
  potential_winnings: number;
  status: string;
  created_at: string;
  match_id: string;
  match: {
    id: string;
    club: string;
    match_date: string;
    match_time: string;
    status: string;
  } | null;
};

type Tab = "active" | "settled";

const statusConfig: Record<string, { label: string; icon: typeof Timer; className: string }> = {
  active: { label: "Active", icon: Timer, className: "text-primary bg-primary/10" },
  won: { label: "Won", icon: CheckCircle, className: "text-win bg-win/10" },
  lost: { label: "Lost", icon: XCircle, className: "text-loss bg-loss/10" },
  settled: { label: "Settled", icon: CheckCircle, className: "text-muted-foreground bg-muted" },
};

const ActiveStakes = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [stakes, setStakes] = useState<StakeWithMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");
  const [editStake, setEditStake] = useState<StakeWithMatch | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchStakes = async () => {
    if (!user) return;
    setLoading(true);

    const { data: stakeData } = await supabase
      .from("match_stakes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (stakeData && stakeData.length > 0) {
      const matchIds = [...new Set(stakeData.map((s) => s.match_id))];
      const { data: matchData } = await supabase
        .from("matches")
        .select("id, club, match_date, match_time, status")
        .in("id", matchIds);

      const enriched: StakeWithMatch[] = stakeData.map((s) => ({
        ...s,
        match: matchData?.find((m) => m.id === s.match_id) || null,
      }));
      setStakes(enriched);
    } else {
      setStakes([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;

    fetchStakes();

    const channel = supabase
      .channel("active-stakes-realtime")
      // Re-fetch when any of the user's stakes change (status: active → won/lost, multiplier update)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_stakes", filter: `user_id=eq.${user.id}` },
        () => fetchStakes()
      )
      // Re-fetch when a match updates (status change, odds adjustment)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches" },
        () => fetchStakes()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const filtered = stakes.filter((s) =>
    tab === "active" ? s.status === "active" : s.status !== "active"
  );

  const totalStaked = stakes.filter((s) => s.status === "active").reduce((sum, s) => sum + s.points_staked, 0);

  const handleStakeClick = (stake: StakeWithMatch) => {
    if (stake.status !== "active") return;
    setEditStake(stake);
    setEditOpen(true);
  };

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h1 className="text-2xl font-display font-bold">My Stakes</h1>
      </div>

      {/* Balance overview */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card-elevated p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Balance</span>
          </div>
          <p className="text-2xl font-display font-bold text-primary">{profile?.padel_park_points ?? 0}</p>
          <p className="text-xs text-muted-foreground">Padel Park Points</p>
        </div>
        <div className="card-elevated p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Staked</span>
          </div>
          <p className="text-2xl font-display font-bold">{totalStaked}</p>
          <p className="text-xs text-muted-foreground">Points at risk</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {([{ key: "active", label: "Active" }, { key: "settled", label: "History" }] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            {tab === "active" ? "No active stakes" : "No settled stakes yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((stake, i) => {
            const config = statusConfig[stake.status] || statusConfig.active;
            const Icon = config.icon;
            const isActive = stake.status === "active";
            return (
              <motion.div
                key={stake.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => handleStakeClick(stake)}
                className={`card-elevated p-4 space-y-3 ${isActive ? "cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display font-bold">{stake.match?.club || "Unknown Match"}</p>
                    {stake.match && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(stake.match.match_date + "T00:00:00"), "MMM d")}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{stake.match.match_time.slice(0, 5)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Pencil className="w-3 h-3" />
                        Edit
                      </span>
                    )}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 ${config.className}`}>
                      <Icon className="w-3 h-3" />
                      {config.label}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Team</p>
                    <p className="text-sm font-bold">Team {stake.team}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Staked</p>
                    <p className="text-sm font-bold text-primary">{stake.points_staked} XP</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">To Win</p>
                    <p className="text-sm font-bold text-primary">{stake.potential_winnings} XP</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
                  <span>Multiplier: ×{Number(stake.payout_multiplier).toFixed(2)}</span>
                  <span>{format(new Date(stake.created_at), "MMM d, HH:mm")}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <EditStakeModal
        stake={editStake ? {
          id: editStake.id,
          match_id: editStake.match_id,
          team: editStake.team,
          points_staked: editStake.points_staked,
          payout_multiplier: editStake.payout_multiplier,
          potential_winnings: editStake.potential_winnings,
          match: editStake.match ? {
            club: editStake.match.club,
            match_date: editStake.match.match_date,
            match_time: editStake.match.match_time,
          } : null,
        } : null}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={fetchStakes}
      />
    </div>
  );
};

export default ActiveStakes;
