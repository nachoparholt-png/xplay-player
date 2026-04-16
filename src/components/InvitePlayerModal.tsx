import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Search, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type FriendProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  padel_level: number | null;
};

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

const InvitePlayerModal = ({
  open, onOpenChange, matchId, matchClub, matchDate, matchTime, team, slotIndex, existingPlayerIds,
}: InvitePlayerModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [players, setPlayers] = useState<FriendProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !user) return;
    const fetchPlayers = async () => {
      setLoading(true);
      // Fetch all profiles except current user and existing match players
      const excludeIds = [...existingPlayerIds, user.id];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, padel_level")
        .not("user_id", "in", `(${excludeIds.join(",")})`)
        .order("display_name", { ascending: true })
        .limit(50);

      setPlayers(data || []);
      setLoading(false);
    };
    fetchPlayers();
    setSent(new Set());
    setSearch("");
  }, [open, user, existingPlayerIds]);

  const filtered = players.filter(p =>
    !search || (p.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleInvite = async (targetUserId: string) => {
    if (!user) return;
    setSending(targetUserId);

    // Check if already invited
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

    // Create invitation
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

    // Send notification
    const playerProfile = players.find(p => p.user_id === targetUserId);
    const inviterName = "A player";

    await supabase.rpc("create_notification_for_user", {
      _user_id: targetUserId,
      _type: "invite",
      _title: "Match Invitation",
      _body: `${inviterName} invited you to join a match at ${matchClub} on ${matchDate} at ${matchTime.slice(0, 5)}.`,
      _link: `/matches/${matchId}`,
    });

    setSent(prev => new Set(prev).add(targetUserId));
    setSending(null);
    toast({ title: "Invite sent! 📨", description: `Invitation sent to ${playerProfile?.display_name || "player"}` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-5 pb-0">
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            Invite a Player
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {matchClub} • {matchDate} • {matchTime.slice(0, 5)} • {team === "team_a" ? "Team A" : "Team B"}
          </p>
        </DialogHeader>

        <div className="px-5 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 rounded-xl h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No players found</p>
          ) : (
            filtered.map(p => (
              <div key={p.user_id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
                  {p.display_name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.display_name || "Player"}</p>
                  {p.padel_level != null && (
                    <p className="text-[10px] text-muted-foreground">Level {p.padel_level.toFixed(1)}</p>
                  )}
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
                    {sending === p.user_id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    Invite
                  </Button>
                )}
              </div>
            ))
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
