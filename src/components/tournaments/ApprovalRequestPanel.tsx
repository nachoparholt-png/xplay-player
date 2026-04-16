import { useState, useEffect } from "react";
import { Check, X, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ApprovalRequest {
  id: string;
  user_id: string;
  player_rating: number | null;
  status: string;
  created_at: string;
  display_name?: string;
}

interface Props {
  tournamentId: string;
  onApproved?: () => void;
}

const ApprovalRequestPanel = ({ tournamentId, onApproved }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("tournament_approval_requests")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("status", "pending");

      if (!data || data.length === 0) {
        setRequests([]);
        setLoading(false);
        return;
      }

      const userIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      const profileMap: Record<string, string> = {};
      profiles?.forEach((p) => {
        profileMap[p.user_id] = p.display_name || "Player";
      });

      setRequests(
        data.map((r) => ({
          ...r,
          display_name: profileMap[r.user_id] || "Player",
        }))
      );
      setLoading(false);
    };
    load();
  }, [tournamentId]);

  const handleAction = async (requestId: string, userId: string, action: "approved" | "rejected") => {
    if (!user) return;
    setActing(requestId);

    await supabase
      .from("tournament_approval_requests")
      .update({
        status: action,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (action === "approved") {
      await supabase
        .from("tournament_players")
        .insert({
          tournament_id: tournamentId,
          user_id: userId,
          partner_status: "solo",
        });

      await supabase.rpc("create_notification_for_user", {
        _user_id: userId,
        _type: "tournament",
        _title: "Approved! ✅",
        _body: "Your request to join the tournament has been approved.",
        _link: `/tournaments/${tournamentId}`,
      });
    } else {
      await supabase.rpc("create_notification_for_user", {
        _user_id: userId,
        _type: "tournament",
        _title: "Request declined",
        _body: "Your request to join the tournament was not approved.",
        _link: `/tournaments/${tournamentId}`,
      });
    }

    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    setActing(null);
    toast({ title: action === "approved" ? "Player approved ✅" : "Request rejected" });
    if (action === "approved") onApproved?.();
  };

  if (loading || requests.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-sm font-semibold text-yellow-400">
        <ShieldAlert className="w-4 h-4" />
        {requests.length} pending approval{requests.length > 1 ? "s" : ""}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {requests.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
              {r.display_name?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{r.display_name}</p>
              <p className="text-[10px] text-muted-foreground">
                Level: {r.player_rating ?? "N/A"}
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button
                size="icon"
                variant="outline"
                className="w-8 h-8 rounded-lg border-green-500/30 text-green-500 hover:bg-green-500/10"
                disabled={acting === r.id}
                onClick={() => handleAction(r.id, r.user_id, "approved")}
              >
                {acting === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="w-8 h-8 rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10"
                disabled={acting === r.id}
                onClick={() => handleAction(r.id, r.user_id, "rejected")}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default ApprovalRequestPanel;
