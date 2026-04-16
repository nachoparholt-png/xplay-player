import { useState } from "react";
import { UserMinus, UserPlus, AlertTriangle, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { handleWithdrawal, applyWalkover } from "@/lib/tournaments/withdrawalEngine";
import { notifyPlayerWithdrawal } from "@/lib/tournaments/tournamentNotifications";

interface TeamInfo {
  id: string;
  team_name: string;
  player1_id: string;
  player2_id: string | null;
}

interface WithdrawalPanelProps {
  tournamentId: string;
  tournamentName: string;
  teams: TeamInfo[];
  profiles: Record<string, string>;
  isCreator: boolean;
  currentUserId?: string;
  onWithdrawalComplete: () => void;
}

const WithdrawalPanel = ({
  tournamentId,
  tournamentName,
  teams,
  profiles,
  isCreator,
  currentUserId,
  onWithdrawalComplete,
}: WithdrawalPanelProps) => {
  const { toast } = useToast();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [standbyPlayerId, setStandbyPlayerId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // All unique player IDs in the tournament
  const allPlayerIds = teams.flatMap((t) =>
    [t.player1_id, t.player2_id].filter(Boolean) as string[]
  );

  const getPlayerName = (uid: string) => profiles[uid] || "Player";

  const handleWithdrawConfirm = async () => {
    if (!selectedPlayerId) return;
    setProcessing(true);

    const result = await handleWithdrawal(
      tournamentId,
      selectedPlayerId,
      standbyPlayerId
    );

    if (result.success) {
      const withdrawnName = getPlayerName(selectedPlayerId);
      const replacedName = standbyPlayerId ? getPlayerName(standbyPlayerId) : undefined;

      // Notify all players
      const otherPlayerIds = allPlayerIds.filter((uid) => uid !== selectedPlayerId);
      await notifyPlayerWithdrawal(
        tournamentId,
        tournamentName,
        otherPlayerIds,
        withdrawnName,
        replacedName
      );

      toast({
        title: standbyPlayerId
          ? `${withdrawnName} replaced by ${replacedName}`
          : `${withdrawnName} withdrawn (${result.walkoversApplied} walkovers applied)`,
      });

      onWithdrawalComplete();
    } else {
      toast({
        title: "Withdrawal failed",
        description: result.error,
        variant: "destructive",
      });
    }

    setProcessing(false);
    setConfirmOpen(false);
    setWithdrawOpen(false);
    setSelectedPlayerId(null);
    setStandbyPlayerId(null);
  };

  // Self-withdrawal for non-creator players
  const handleSelfWithdraw = () => {
    if (!currentUserId) return;
    setSelectedPlayerId(currentUserId);
    setStandbyPlayerId(null);
    setConfirmOpen(true);
  };

  const isCurrentPlayerInTournament = currentUserId
    ? allPlayerIds.includes(currentUserId)
    : false;

  return (
    <>
      {/* Self-withdraw button for players */}
      {!isCreator && isCurrentPlayerInTournament && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelfWithdraw}
          className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
        >
          <UserMinus className="w-3.5 h-3.5" />
          Withdraw
        </Button>
      )}

      {/* Admin withdrawal panel for creator */}
      {isCreator && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWithdrawOpen(true)}
          className="rounded-xl gap-1.5"
        >
          <UserMinus className="w-3.5 h-3.5" />
          Manage Players
        </Button>
      )}

      {/* Admin modal: select player to withdraw */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="w-5 h-5 text-destructive" />
              Manage Withdrawals
            </DialogTitle>
            <DialogDescription>
              Withdraw a player and optionally assign a standby replacement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Player to withdraw</label>
              <Select
                value={selectedPlayerId || ""}
                onValueChange={(v) => setSelectedPlayerId(v)}
              >
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Select player..." />
                </SelectTrigger>
                <SelectContent>
                  {allPlayerIds.map((uid) => (
                    <SelectItem key={uid} value={uid}>
                      {getPlayerName(uid)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-muted-foreground" />
                Standby replacement (optional)
              </label>
              <Select
                value={standbyPlayerId || "none"}
                onValueChange={(v) => setStandbyPlayerId(v === "none" ? null : v)}
              >
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="No replacement (walkover)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No replacement (walkover)</SelectItem>
                  {/* In a real app, this would show standby/waitlist players */}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Without a replacement, all pending matches will be awarded as walkovers.
              </p>
            </div>

            <Button
              onClick={() => selectedPlayerId && setConfirmOpen(true)}
              disabled={!selectedPlayerId}
              className="w-full rounded-xl h-11 font-semibold gap-2"
              variant="destructive"
            >
              <AlertTriangle className="w-4 h-4" />
              Withdraw Player
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm withdrawal?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedPlayerId && (
                <>
                  <strong>{getPlayerName(selectedPlayerId)}</strong> will be withdrawn from {tournamentName}.
                  {standbyPlayerId
                    ? ` They will be replaced by ${getPlayerName(standbyPlayerId)}.`
                    : " All their pending matches will be awarded as walkovers to opponents."}
                  <br /><br />
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={processing}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWithdrawConfirm}
              disabled={processing}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? "Processing..." : "Confirm Withdrawal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default WithdrawalPanel;

/**
 * Inline walkover button for a specific match (creator only).
 */
export const WalkoverButton = ({
  matchId,
  teamAId,
  teamBId,
  teamAName,
  teamBName,
  onComplete,
}: {
  matchId: string;
  teamAId: string | null;
  teamBId: string | null;
  teamAName: string;
  teamBName: string;
  onComplete: () => void;
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleWalkover = async (winnerTeamId: string) => {
    setProcessing(true);
    const result = await applyWalkover(matchId, winnerTeamId, "manual_walkover");
    if (result.success) {
      toast({ title: "Walkover applied ✅" });
      onComplete();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
    setProcessing(false);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="text-[10px] h-6 px-2 text-muted-foreground hover:text-foreground gap-1"
      >
        <Trophy className="w-3 h-3" />
        W/O
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl max-w-xs" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-sm">Award Walkover</DialogTitle>
            <DialogDescription className="text-xs">
              Select the winner of this match by walkover.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {teamAId && (
              <Button
                variant="outline"
                className="w-full rounded-xl justify-start gap-2"
                onClick={() => handleWalkover(teamAId)}
                disabled={processing}
              >
                <Trophy className="w-4 h-4 text-primary" />
                {teamAName} wins
              </Button>
            )}
            {teamBId && (
              <Button
                variant="outline"
                className="w-full rounded-xl justify-start gap-2"
                onClick={() => handleWalkover(teamBId)}
                disabled={processing}
              >
                <Trophy className="w-4 h-4 text-primary" />
                {teamBName} wins
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
