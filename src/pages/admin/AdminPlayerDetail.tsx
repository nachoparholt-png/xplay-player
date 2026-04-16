import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AdjustPointsModal from "@/components/admin/AdjustPointsModal";
import { format } from "date-fns";

type PlayerProfile = {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location: string | null;
  preferred_club: string | null;
  padel_level: number | null;
  padel_park_points: number;
  
  total_matches: number;
  wins: number;
  losses: number;
  reliability_score: number;
  matches_attended: number;
  matches_cancelled: number;
  dominant_hand: string | null;
  preferred_side: string | null;
  bio: string | null;
  phone: string | null;
  account_status: string;
  created_at: string;
  last_active_at: string | null;
};

type Transaction = {
  id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reason: string | null;
  created_at: string;
  admin_user_id: string | null;
};

type AdminNote = {
  id: string;
  note: string;
  created_at: string;
  admin_user_id: string;
};

type Stake = {
  id: string;
  team: string;
  points_staked: number;
  payout_multiplier: number;
  potential_winnings: number;
  status: string;
  created_at: string;
  match_id: string;
};

const AdminPlayerDetail = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [stakes, setStakes] = useState<Stake[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdjustPoints, setShowAdjustPoints] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [tab, setTab] = useState<"overview" | "points" | "matches" | "stakes" | "notes">("overview");

  const fetchAll = async () => {
    if (!userId) return;
    setLoading(true);

    const [{ data: profileData }, { data: txData }, { data: noteData }, { data: stakeData }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("points_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("admin_notes").select("*").eq("target_user_id", userId).order("created_at", { ascending: false }),
      supabase.from("match_stakes").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);

    setProfile(profileData);
    setTransactions(txData || []);
    setNotes(noteData || []);
    setStakes(stakeData || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [userId]);

  const handleStatusChange = async (newStatus: string) => {
    if (!userId || !user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ account_status: newStatus })
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("admin_notes").insert({
        target_user_id: userId,
        admin_user_id: user.id,
        note: `Account status changed to: ${newStatus}`,
      });
      toast({ title: "Status updated" });
      fetchAll();
    }
  };

  const handleAddNote = async () => {
    if (!userId || !user || !newNote.trim()) return;
    setAddingNote(true);
    await supabase.from("admin_notes").insert({
      target_user_id: userId,
      admin_user_id: user.id,
      note: newNote.trim(),
    });
    setNewNote("");
    setAddingNote(false);
    fetchAll();
  };

  const handleLevelChange = async (newLevel: string) => {
    if (!userId) return;
    const lvl = parseFloat(newLevel);
    if (isNaN(lvl)) return;
    const { error } = await supabase
      .from("profiles")
      .update({ padel_level: lvl })
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Level updated" });
      fetchAll();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-muted-foreground">Player not found</p>
        <Button variant="outline" onClick={() => navigate("/admin/players")} className="mt-4">Back</Button>
      </div>
    );
  }

  const winRate = profile.total_matches > 0 ? Math.round((profile.wins / profile.total_matches) * 100) : 0;
  const totalPointsEarned = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalPointsSpent = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const _activeStakes = stakes.filter((s) => s.status === "active");

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "points", label: "Points" },
    { key: "stakes", label: "Stakes" },
    { key: "notes", label: "Notes" },
  ] as const;

  const statusColors: Record<string, string> = {
    active: "bg-win/10 text-win",
    inactive: "bg-muted text-muted-foreground",
    suspended: "bg-gold/10 text-gold",
    blocked: "bg-destructive/10 text-destructive",
    pending_verification: "bg-primary/10 text-primary",
  };

  return (
    <div className="px-4 lg:px-8 py-6 lg:pt-8 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/admin/players")} className="p-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h1 className="text-2xl font-display font-bold">Player Detail</h1>
      </div>

      {/* Profile Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-5">
        <div className="flex items-start gap-4">
          <Avatar className="w-16 h-16">
            <AvatarImage src={profile.avatar_url || ""} />
            <AvatarFallback className="text-xl font-bold bg-muted">
              {profile.display_name?.[0]?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl font-bold">{profile.display_name || "No name"}</h2>
            <p className="text-sm text-muted-foreground">{profile.location || "No location"}</p>
            {profile.phone && <p className="text-sm text-muted-foreground">{profile.phone}</p>}
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColors[profile.account_status] || ""}`}>
                {profile.account_status.replace("_", " ")}
              </span>
              {profile.padel_level != null && (
                <span className="text-xs bg-muted px-2.5 py-1 rounded-full font-medium">Level {profile.padel_level.toFixed(1)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="text-center">
            <p className="text-lg font-bold text-primary">{profile.padel_park_points}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Points</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{profile.total_matches}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Matches</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{winRate}%</p>
            <p className="text-[10px] text-muted-foreground uppercase">Win Rate</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{profile.reliability_score.toFixed(0)}%</p>
            <p className="text-[10px] text-muted-foreground uppercase">Reliability</p>
          </div>
        </div>
      </motion.div>

      {/* Admin Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowAdjustPoints(true)} className="rounded-xl gap-2 h-9 text-sm">
          <Zap className="w-3.5 h-3.5" /> Adjust Points
        </Button>
        <Select value={profile.account_status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[160px] rounded-xl h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="pending_verification">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={profile.padel_level?.toFixed(1) || ""}
          onValueChange={handleLevelChange}
        >
          <SelectTrigger className="w-[120px] rounded-xl h-9 text-sm">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 14 }, (_, i) => ((i + 1) * 0.5).toFixed(1)).map((l) => (
              <SelectItem key={l} value={l}>Level {l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {tabs.map((t) => (
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

      {/* Tab Content */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="card-elevated p-4 space-y-3">
            <h3 className="font-display font-bold text-sm">Profile Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground text-xs block">Dominant Hand</span><span className="font-medium capitalize">{profile.dominant_hand || "—"}</span></div>
              <div><span className="text-muted-foreground text-xs block">Preferred Side</span><span className="font-medium capitalize">{profile.preferred_side || "—"}</span></div>
              <div><span className="text-muted-foreground text-xs block">Preferred Club</span><span className="font-medium">{profile.preferred_club || "—"}</span></div>
              <div><span className="text-muted-foreground text-xs block">Joined</span><span className="font-medium">{format(new Date(profile.created_at), "MMM d, yyyy")}</span></div>
              <div><span className="text-muted-foreground text-xs block">Wins / Losses</span><span className="font-medium">{profile.wins} / {profile.losses}</span></div>
              <div><span className="text-muted-foreground text-xs block">Cancellations</span><span className="font-medium">{profile.matches_cancelled}</span></div>
            </div>
            {profile.bio && <p className="text-sm text-muted-foreground italic border-l-2 border-border pl-3">{profile.bio}</p>}
          </div>

          <div className="card-elevated p-4 space-y-3">
            <h3 className="font-display font-bold text-sm">Points Summary</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-lg font-bold text-primary">{profile.padel_park_points}</p><p className="text-[10px] text-muted-foreground uppercase">Current</p></div>
              <div><p className="text-lg font-bold text-win">{totalPointsEarned}</p><p className="text-[10px] text-muted-foreground uppercase">Earned</p></div>
              <div><p className="text-lg font-bold text-destructive">{totalPointsSpent}</p><p className="text-[10px] text-muted-foreground uppercase">Spent</p></div>
            </div>
          </div>
        </div>
      )}

      {tab === "points" && (
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No transactions yet</p>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="card-elevated p-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  tx.amount > 0 ? "bg-win/10 text-win" : "bg-destructive/10 text-destructive"
                }`}>
                  {tx.amount > 0 ? "+" : "-"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize">{tx.transaction_type.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground truncate">{tx.reason || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${tx.amount > 0 ? "text-win" : "text-destructive"}`}>
                    {tx.amount > 0 ? "+" : ""}{tx.amount}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{tx.balance_before} → {tx.balance_after}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {format(new Date(tx.created_at), "MMM d HH:mm")}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "stakes" && (
        <div className="space-y-2">
          {stakes.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No stakes yet</p>
          ) : (
            stakes.map((s) => (
              <div key={s.id} className="card-elevated p-3 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">Team {s.team} • {s.points_staked} XP</p>
                  <p className="text-xs text-muted-foreground">×{Number(s.payout_multiplier).toFixed(2)} → {s.potential_winnings} XP</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                  s.status === "active" ? "bg-primary/10 text-primary" :
                  s.status === "won" ? "bg-win/10 text-win" :
                  s.status === "lost" ? "bg-destructive/10 text-destructive" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {s.status}
                </span>
                <span className="text-[10px] text-muted-foreground">{format(new Date(s.created_at), "MMM d")}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Textarea
              placeholder="Add admin note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="rounded-xl resize-none flex-1"
              rows={2}
            />
            <Button
              onClick={handleAddNote}
              disabled={addingNote || !newNote.trim()}
              className="rounded-xl self-end"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {notes.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No admin notes yet</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="card-elevated p-3">
                <p className="text-sm">{n.note}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(n.created_at), "MMM d, yyyy HH:mm")}</p>
              </div>
            ))
          )}
        </div>
      )}

      <AdjustPointsModal
        open={showAdjustPoints}
        onOpenChange={setShowAdjustPoints}
        player={profile ? { user_id: profile.user_id, display_name: profile.display_name, padel_park_points: profile.padel_park_points } : null}
        onSuccess={fetchAll}
      />
    </div>
  );
};

export default AdminPlayerDetail;
