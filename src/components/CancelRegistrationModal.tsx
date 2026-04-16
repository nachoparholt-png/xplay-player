import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Shield, Coins, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useMatchChat } from "@/hooks/useMatchChat";
import { format, parseISO, addHours } from "date-fns";

interface CancelRegistrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  matchClub: string;
  matchDate: string;
  matchTime: string;
  onCancelled: () => void;
}

const CancelRegistrationModal = ({
  open,
  onOpenChange,
  matchId,
  matchClub,
  matchDate,
  matchTime,
  onCancelled,
}: CancelRegistrationModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { removePlayerFromMatchChat } = useMatchChat();
  const [cancelling, setCancelling] = useState(false);
  const [activeStake, setActiveStake] = useState<{ points_staked: number } | null>(null);
  const [loadingStake, setLoadingStake] = useState(true);

  useEffect(() => {
    if (!open || !user) return;
    const fetchStake = async () => {
      setLoadingStake(true);
      const { data } = await supabase
        .from("match_stakes")
        .select("points_staked")
        .eq("match_id", matchId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      setActiveStake(data);
      setLoadingStake(false);
    };
    fetchStake();
  }, [open, matchId, user]);

  const formattedDate = (() => {
    try {
      return format(parseISO(`${matchDate}T${matchTime}`), "EEEE, MMM d 'at' HH:mm");
    } catch {
      return `${matchDate} at ${matchTime}`;
    }
  })();

  const handleConfirmCancel = async () => {
    if (!user || cancelling) return;
    setCancelling(true);

    // Remove player from match
    const { error } = await supabase
      .from("match_players")
      .delete()
      .eq("match_id", matchId)
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Something went wrong", description: error.message, variant: "destructive" });
      setCancelling(false);
      return;
    }

    // Refund active stake if exists
    if (activeStake && activeStake.points_staked > 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("padel_park_points")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        const newBalance = profile.padel_park_points + activeStake.points_staked;
        await supabase.from("profiles").update({ padel_park_points: newBalance }).eq("user_id", user.id);

        await supabase.from("match_stakes").update({
          status: "settled",
          settled_at: new Date().toISOString(),
        }).eq("match_id", matchId).eq("user_id", user.id).eq("status", "active");

        await supabase.from("points_transactions").insert({
          user_id: user.id,
          transaction_type: "refunded",
          amount: activeStake.points_staked,
          balance_before: profile.padel_park_points,
          balance_after: newBalance,
          related_match_id: matchId,
          reason: "Stake refunded — player cancelled registration",
        });
      }
    }

    // Notify the first waitlisted player that a spot is available — they must claim it themselves
    const { data: waitlisted } = await supabase
      .from("match_players")
      .select("id, user_id")
      .eq("match_id", matchId)
      .eq("status", "waitlist")
      .order("joined_at", { ascending: true })
      .limit(1);

    if (waitlisted && waitlisted.length > 0) {
      const next = waitlisted[0];
      // Do NOT auto-promote — player must tap to claim the spot themselves
      await supabase.rpc("create_notification_for_user", {
        _user_id: next.user_id,
        _type: "match_update",
        _title: "⚡ A spot just opened!",
        _body: `A place is available in the match at ${matchClub}. Open the app to claim it — first come, first served!`,
        _link: `/matches/${matchId}`,
      });
    }

    // Update match status back to open
    await supabase.from("matches").update({ status: "open" }).eq("id", matchId);

    // Remove from match chat with system message
    await removePlayerFromMatchChat(matchId, user.id, "cancelled");

    // Notify the organizer
    const { data: matchData } = await supabase
      .from("matches")
      .select("organizer_id")
      .eq("id", matchId)
      .single();

    if (matchData && matchData.organizer_id !== user.id) {
      const { data: cancellerProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();

      await supabase.rpc("create_notification_for_user", {
        _user_id: matchData.organizer_id,
        _type: "match_update",
        _title: "Player left your match",
        _body: `${cancellerProfile?.display_name || "A player"} cancelled their registration for the match at ${matchClub}.`,
        _link: `/matches/${matchId}`,
      });
    }

    toast({ title: "Registration cancelled", description: "Your spot is now available to other players." });
    onOpenChange(false);
    onCancelled();
    setCancelling(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border/50 p-0">
        <div className="p-6 space-y-5">
          <DialogHeader className="space-y-3">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <DialogTitle className="font-display text-xl text-center">
              Cancel your registration?
            </DialogTitle>
            <DialogDescription className="text-center text-sm">
              Are you sure you want to cancel your spot in this match? This action cannot be undone automatically.
            </DialogDescription>
          </DialogHeader>

          {/* Match info summary */}
          <div className="rounded-xl bg-muted/50 p-3.5 space-y-2">
            <p className="font-semibold text-sm">{matchClub}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formattedDate}
            </p>
          </div>

          {/* Consequences */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What happens next</p>

            <div className="flex items-start gap-2.5 text-sm">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs">1</span>
              </div>
              <p className="text-muted-foreground">You will be removed from the player list</p>
            </div>

            <div className="flex items-start gap-2.5 text-sm">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs">2</span>
              </div>
              <p className="text-muted-foreground">The first waitlisted player gets notified and must claim the spot</p>
            </div>

            {!loadingStake && activeStake && activeStake.points_staked > 0 && (
              <div className="flex items-start gap-2.5 text-sm">
                <div className="w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Coins className="w-3 h-3 text-gold" />
                </div>
                <p className="text-muted-foreground">
                  Your stake of <span className="font-semibold text-foreground">{activeStake.points_staked} XP</span> will be refunded
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-1">
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={cancelling}
              className="w-full h-12 rounded-xl font-semibold"
            >
              {cancelling ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin" />
                  Cancelling...
                </div>
              ) : (
                "Confirm Cancellation"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={cancelling}
              className="w-full h-12 rounded-xl font-semibold"
            >
              Keep My Spot
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CancelRegistrationModal;
