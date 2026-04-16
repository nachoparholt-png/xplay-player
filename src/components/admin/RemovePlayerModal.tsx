import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMatchChat } from "@/hooks/useMatchChat";

interface RemovePlayerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  playerId: string;
  playerName: string;
  onRemoved: () => void;
}

const RemovePlayerModal = ({ open, onOpenChange, matchId, playerId, playerName, onRemoved }: RemovePlayerModalProps) => {
  const { toast } = useToast();
  const { removePlayerFromMatchChat } = useMatchChat();
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);

    const { error } = await supabase
      .from("match_players")
      .delete()
      .eq("match_id", matchId)
      .eq("user_id", playerId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Update match status back to open
      await supabase.from("matches").update({ status: "open" }).eq("id", matchId);

      // Send notification to removed player
      await supabase.rpc("create_notification_for_user", {
        _user_id: playerId,
        _type: "warning",
        _title: "Removed from match",
        _body: reason
          ? `An admin removed you from the match. Reason: ${reason}`
          : "An admin removed you from the match.",
        _link: `/matches/${matchId}`,
      });

      // Remove from match chat
      await removePlayerFromMatchChat(matchId, playerId, "removed");

      toast({ title: "Player removed", description: `${playerName} has been removed from the match.` });
      onOpenChange(false);
      setReason("");
      onRemoved();
    }
    setRemoving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Remove Player
          </DialogTitle>
          <DialogDescription>
            Remove <strong>{playerName}</strong> from this match. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Player requested removal, scheduling conflict..."
              className="resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removing}
              className="flex-1 gap-2"
            >
              <UserMinus className="w-4 h-4" />
              {removing ? "Removing..." : "Remove Player"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RemovePlayerModal;
