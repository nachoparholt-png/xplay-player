/**
 * InvitePlayerModal — player search for match invites.
 * 12 Jun UX round (Ignacio): "usual players" you've shared matches with rank
 * first (with played-together counts), plus quick side filters so you can
 * fill the exact position you're missing (left / right).
 */
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Search, Check, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type FriendProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  padel_level: number | null;
  preferred_side: string | null; // 'left' | 'right' | 'both'
  playedTogether?: number;
};

type SideFilter = "all" | "left" | "right";

interface InvitePlayerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  matchClub: string;
  matchDate: string;
  matchTime: string;
  team: string;
  slotIndex: number;
  existingPlayerIds: string[];
}

const sideBadge = (side: string | null) => {
  if (side === "left") return "L";
  if (side === "right") return "R";
  if (side === "both") return "L/R";
  return null;
};

const InvitePlayerModal = ({
  open, onOpenChange, matchId, matchClub, matchDate, matchTime, team, slotIndex, existingPlayerIds,
}: InvitePlayerModalProps) => {
  const { user, profile: myProfile } = useAuth();
  const { toast } = useToast();
  const [players, setPlayers] = useState<FriendProfile[]>([]);
  const [search, setSearch] = useState("");
  const [side, setSide] = useState<SideFilter>("all");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !user) return;
    const fetchPlayers = async () => {
      setLoading(true);
      const excludeIds = [...existingPlayerIds, user.id];

      // 1. who have I shared matches with? (usual players)
      const { data: myMatches } = await supabase
        .from("match_players")
        .select("match_id")
        .eq("user_id", user.id)
        .limit(150);
      const matchIds = (myMatches || []).map((m) => m.match_id);

      const counts = new Map<string, number>();
      if (matchIds.length > 0) {
        const { data: coPlayers } = await supabase
          .from("match_players")
          .select("user_id, match_id")
          .in("match_id", matchIds)
          .neq("user_id", user.id)
          .limit(1000);
        for (const cp of coPlayers || []) {
          counts.set(cp.user_id, (counts.get(cp.user_id) || 0) + 1);
        }
      }

      // 2. profiles (with preferred side for the position filter)
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, padel_level, preferred_side")
        .not("user_id", "in", `(${excludeIds.join(",")})`)
        .order("display_name", { ascending: true })
        .limit(100);

      setPlayers(
        (data || []).map((p) => ({ ...p, playedTogether: counts.get(p.user_id) || 0 }))
      );
      setLoading(false);
    };
    fetchPlayers();
    setSent(new Set());
    setSearch("");
    setSide("all");
  }, [open, user, existingPlayerIds]);

  /* filter + rank: usual players first (by shared matches), then alphabetical */
  const { usual, others } = useMemo(() => {
    const matchesFilters = (p: FriendProfile) => {
      if (search && !(p.display_name || "").toLowerCase().includes(search.toLowerCase())) return false;
      if (side !== "all" && !(p.preferred_side === side || p.preferred_side === "both")) return false;
      return true;
    };
    const filtered = players.filter(matchesFilters);
    const usual = filtered
      .filter((p) => (p.playedTogether ?? 0) > 0)
      .sort((a, b) => (b.playedTogether ?? 0) - (a.playedTogether ?? 0));
    const others = filtered.filter((p) => (p.playedTogether ?? 0) === 0);
    return { usual, others };
  }, [players, search, side]);

  const handleInvite = async (targetUserId: string) => {
    if (!user) return;
    setSending(targetUserId);

    const { data: existing } = await supabase
      .from("match_invitations")
      .select("id")
      .eq("match_id", matchId)
      .eq("invited_user_id", targetUserId)
      .eq("status", "pending");

    if (existing && existing.length > 0) {
      toast({ title: "Already invited", description: "This player already has a pending invite.", variant: "destructive" });
      setSending(null);
      return;
    }

    const { error: invErr } = await supabase.from("match_invitations").insert({
      match_id: matchId,
      invited_by: user.id,
      invited_user_id: targetUserId,
      team,
      slot_index: slotIndex,
    });

    if (invErr) {
      toast({ title: "Error", description: invErr.message, variant: "destructive" });
      setSending(null);
      return;
    }

    const playerProfile = players.find((p) => p.user_id === targetUserId);
    const inviterName = myProfile?.display_name || "A player";

    await supabase.rpc("create_notification_for_user", {
      _user_id: targetUserId,
      _type: "invite",
      _title: "Match Invitation",
      _body: `${inviterName} invited you to join a match at ${matchClub} on ${matchDate} at ${matchTime.slice(0, 5)}.`,
      _link: `/matches/${matchId}`,
    });

    setSent((prev) => new Set(prev).add(targetUserId));
    setSending(null);
    toast({ title: "Invite sent! 📨", description: `Invitation sent to ${playerProfile?.display_name || "player"}` });
  };

  const PlayerRow = ({ p }: { p: FriendProfile }) => (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors">
      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          p.display_name?.[0]?.toUpperCase() || "?"
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate">{p.display_name || "Player"}</p>
          {sideBadge(p.preferred_side) && (
            <span className="text-[8.5px] font-black font-mono text-muted-foreground border border-border rounded px-1 py-px shrink-0">
              {sideBadge(p.preferred_side)}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {p.padel_level != null ? `Level ${p.padel_level.toFixed(1)}` : ""}
          {(p.playedTogether ?? 0) > 0 && (
            <span className="text-primary font-semibold">
              {p.padel_level != null ? " · " : ""}Played together {p.playedTogether}×
            </span>
          )}
        </p>
      </div>
      {sent.has(p.user_id) ? (
        <div className="flex items-center gap-1 text-primary text-xs font-medium">
          <Check className="w-3.5 h-3.5" />
          Sent
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleInvite(p.user_id)}
          disabled={sending === p.user_id}
          className="h-8 rounded-lg text-xs font-semibold gap-1.5"
        >
          {sending === p.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          Invite
        </Button>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-5 pb-0">
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            Invite a Player
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {matchClub} • {matchDate} • {matchTime.slice(0, 5)} • {team === "A" ? "Team A" : "Team B"}
          </p>
        </DialogHeader>

        <div className="px-5 pt-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl h-9 text-sm"
            />
          </div>
          {/* quick side filter — fill the position you're missing */}
          <div className="flex gap-1.5">
            {([["all", "All"], ["left", "Left side"], ["right", "Right side"]] as [SideFilter, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setSide(v)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors",
                  side === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted border border-border/40 text-muted-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : usual.length === 0 && others.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No players found{side !== "all" ? ` for ${side} side` : ""}
            </p>
          ) : (
            <>
              {usual.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 pt-1 pb-0.5">
                    <Users className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-primary">
                      Your usual players
                    </span>
                  </div>
                  {usual.map((p) => <PlayerRow key={p.user_id} p={p} />)}
                </>
              )}
              {others.length > 0 && (
                <>
                  {usual.length > 0 && (
                    <div className="pt-2 pb-0.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                        Everyone else
                      </span>
                    </div>
                  )}
                  {others.map((p) => <PlayerRow key={p.user_id} p={p} />)}
                </>
              )}
            </>
          )}
        </div>

        <div className="p-5 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full h-10 rounded-xl text-muted-foreground">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvitePlayerModal;
