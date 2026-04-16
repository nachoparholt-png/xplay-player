import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, UserCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface PartnerConfirmBannerProps {
  tournamentId: string;
  onResponded: () => void;
}

interface PendingRequest {
  playerId: string;
  inviterUserId: string;
  inviterName: string;
}

const PartnerConfirmBanner = ({ tournamentId, onResponded }: PartnerConfirmBannerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    if (!user) return;
    const check = async () => {
      // Find tournament_players rows where current user is the partner
      const { data: rows } = await supabase
        .from("tournament_players")
        .select("id, user_id, partner_user_id, partner_status")
        .eq("tournament_id", tournamentId)
        .eq("partner_user_id", user.id)
        .eq("partner_status", "pending");

      if (!rows || rows.length === 0) {
        setPending(null);
        return;
      }

      const row = rows[0];
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", row.user_id)
        .single();

      setPending({
        playerId: row.id,
        inviterUserId: row.user_id,
        inviterName: profile?.display_name || "A player",
      });
    };
    check();
  }, [user, tournamentId]);

  if (!pending) return null;

  const handleRespond = async (accept: boolean) => {
    if (!user) return;
    setResponding(true);

    // Update partner_status on the inviter's row
    const { error: updateErr } = await supabase
      .from("tournament_players")
      .update({ partner_status: accept ? "confirmed" : "declined" })
      .eq("id", pending.playerId);

    if (updateErr) {
      toast({ title: "Error", description: updateErr.message, variant: "destructive" });
      setResponding(false);
      return;
    }

    if (accept) {
      // Insert partner as a tournament_player too
      await supabase.from("tournament_players").insert({
        tournament_id: tournamentId,
        user_id: user.id,
        partner_user_id: pending.inviterUserId,
        partner_status: "confirmed",
      });

      // Notify the inviter
      await supabase.rpc("create_notification_for_user", {
        _user_id: pending.inviterUserId,
        _type: "tournament",
        _title: "Partner Confirmed! ✅",
        _body: `Your partner accepted the tournament invitation.`,
        _link: `/tournaments/${tournamentId}`,
      });

      toast({ title: "Accepted! 🎉", description: "You're now paired up." });
    } else {
      // Notify the inviter of decline
      await supabase.rpc("create_notification_for_user", {
        _user_id: pending.inviterUserId,
        _type: "tournament",
        _title: "Partner Declined ❌",
        _body: `Your partner declined. Please invite someone else.`,
        _link: `/tournaments/${tournamentId}`,
      });

      toast({ title: "Declined", description: "You've declined the partner request." });
    }

    setPending(null);
    setResponding(false);
    onResponded();
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2.5">
      <div className="flex items-center gap-2.5">
        <UserCircle className="w-5 h-5 text-primary shrink-0" />
        <p className="text-sm font-medium">
          <span className="font-semibold">{pending.inviterName}</span> wants you as their partner!
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => handleRespond(true)}
          disabled={responding}
          className="flex-1 rounded-xl gap-1.5"
        >
          {responding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleRespond(false)}
          disabled={responding}
          className="flex-1 rounded-xl gap-1.5 text-destructive"
        >
          <X className="w-3.5 h-3.5" />
          Decline
        </Button>
      </div>
    </div>
  );
};

export default PartnerConfirmBanner;
