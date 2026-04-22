import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, Send, ArrowLeftRight } from "lucide-react";

interface SlotActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: string;
  onJoin: () => void;
  onInvite: () => void;
  onSwitchTeam?: () => void;
  isJoined: boolean;
  isFull: boolean;
  isInOtherTeam?: boolean;
}

const SlotActionModal = ({ open, onOpenChange, team, onJoin, onInvite, onSwitchTeam, isJoined, isFull, isInOtherTeam }: SlotActionModalProps) => {
  const teamLabel = team === "A" ? "Team A" : "Team B";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs p-5">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {isInOtherTeam ? `Switch to ${teamLabel}?` : `Join ${teamLabel}?`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 mt-2">
          {isInOtherTeam && onSwitchTeam && (
            <Button onClick={onSwitchTeam} className="w-full h-11 rounded-xl font-semibold gap-2">
              <ArrowLeftRight className="w-4 h-4" />
              Switch to {teamLabel}
            </Button>
          )}
          {!isJoined && !isFull && !isInOtherTeam && (
            <Button onClick={onJoin} className="w-full h-11 rounded-xl font-semibold gap-2">
              <UserPlus className="w-4 h-4" />
              Join This Spot
            </Button>
          )}
          {isJoined && !isInOtherTeam && (
            <p className="text-sm text-muted-foreground text-center py-2">You're already in this match</p>
          )}
          {isFull && !isJoined && !isInOtherTeam && (
            <p className="text-sm text-muted-foreground text-center py-2">This match is full</p>
          )}
          <Button variant="outline" onClick={onInvite} className="w-full h-11 rounded-xl font-semibold gap-2">
            <Send className="w-4 h-4" />
            Invite a Friend
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full h-10 rounded-xl text-muted-foreground">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SlotActionModal;
