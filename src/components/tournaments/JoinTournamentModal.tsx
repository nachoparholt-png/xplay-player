import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Check, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import TournamentStructurePreview from "./TournamentStructurePreview";

import type { BracketConfig, TournamentFormat } from "@/lib/tournaments/types";

interface Contact {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface JoinTournamentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  tournamentType: "pairs" | "individual";
  formatType: TournamentFormat;
  playerCount: number;
  courtCount: number;
  bracketConfig: BracketConfig;
  filledPlayers: string[];
  existingPlayerIds: string[];
  takenSlots: number[];
  onJoined: (partnerId?: string, slotIndex?: number) => void;
  skillLevelMin?: number | null;
  skillLevelMax?: number | null;
  requireAdminApproval?: boolean;
}

const JoinTournamentModal = ({
  open,
  onOpenChange,
  tournamentId,
  tournamentType,
  formatType,
  playerCount,
  courtCount,
  bracketConfig,
  filledPlayers,
  existingPlayerIds,
  takenSlots,
  onJoined,
  skillLevelMin,
  skillLevelMax,
  requireAdminApproval,
}: JoinTournamentModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [playerLevel, setPlayerLevel] = useState<number | null>(null);
  const [levelLoading, setLevelLoading] = useState(false);

  const isPairs = tournamentType === "pairs";

  const hasRange = skillLevelMin != null && skillLevelMax != null;
  // Check player level for skill range validation
  const isOutOfRange = hasRange && playerLevel !== null
    ? playerLevel < skillLevelMin || playerLevel > skillLevelMax
    : false;
  const isBlocked = isOutOfRange && !requireAdminApproval;

  useEffect(() => {
    if (!open || !user || !hasRange) return;
    setLevelLoading(true);
    supabase
      .from("profiles")
      .select("padel_level")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setPlayerLevel(data?.padel_level ?? null);
        setLevelLoading(false);
      });
  }, [open, user, hasRange]);

  // Fetch contacts for pairs mode
  useEffect(() => {
    if (!open || !isPairs || !user) return;
    const fetchContacts = async () => {
      setFetching(true);
      const { data: requests } = await supabase
        .from("contact_requests")
        .select("sender_id, receiver_id")
        .eq("status", "accepted")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (!requests || requests.length === 0) {
        setContacts([]);
        setFetching(false);
        return;
      }

      const contactIds = requests.map((r) =>
        r.sender_id === user.id ? r.receiver_id : r.sender_id
      );

      // Exclude already-joined players
      const availableIds = contactIds.filter(
        (id) => !existingPlayerIds.includes(id)
      );

      if (availableIds.length === 0) {
        setContacts([]);
        setFetching(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", availableIds);

      setContacts(
        (profiles || []).map((p) => ({
          user_id: p.user_id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        }))
      );
      setFetching(false);
    };
    fetchContacts();
  }, [open, isPairs, user, existingPlayerIds]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setSelectedPartner(null);
      setSelectedSlot(null);
      setSearch("");
    }
  }, [open]);

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) =>
      c.display_name?.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const handleConfirm = async () => {
    if (!user) return;
    setLoading(true);

    // If out of range + approval required, submit approval request instead
    if (isOutOfRange && requireAdminApproval) {
      const { error } = await supabase
        .from("tournament_approval_requests")
        .insert({
          tournament_id: tournamentId,
          user_id: user.id,
          player_rating: playerLevel,
        });

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({
          title: "Request submitted ⏳",
          description: "The organiser will review your request.",
        });
      }
      onOpenChange(false);
      setLoading(false);
      return;
    }

    if (isPairs && !selectedPartner) {
      toast({ title: "Select a partner", variant: "destructive" });
      setLoading(false);
      return;
    }

    if (!isPairs && selectedSlot === null) {
      toast({ title: "Select a slot", variant: "destructive" });
      setLoading(false);
      return;
    }

    const insertData: Record<string, unknown> = {
      tournament_id: tournamentId,
      user_id: user.id,
    };

    if (isPairs) {
      insertData.partner_user_id = selectedPartner;
      insertData.partner_status = "pending";
    } else {
      insertData.partner_status = "solo";
      insertData.slot_index = selectedSlot;
    }

    const { error } = await supabase
      .from("tournament_players")
      .insert(insertData);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Notify partner in pairs mode
    if (isPairs && selectedPartner) {
      const partnerProfile = contacts.find((c) => c.user_id === selectedPartner);
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();

      await supabase.rpc("create_notification_for_user", {
        _user_id: selectedPartner,
        _type: "tournament",
        _title: "Tournament Partner Request 🎾",
        _body: `${myProfile?.display_name || "A player"} wants you as their partner!`,
        _link: `/tournaments/${tournamentId}`,
      });

      toast({
        title: "Request sent! 🎾",
        description: `Waiting for ${partnerProfile?.display_name || "your partner"} to confirm.`,
      });
    } else {
      toast({ title: "Joined! 🎉", description: "You've joined the tournament." });
    }

    onJoined(selectedPartner || undefined, selectedSlot ?? undefined);
    onOpenChange(false);
    setLoading(false);
  };

  const selectableSlots = useMemo(() => {
    if (isPairs) return [];
    const total = playerCount;
    const available: number[] = [];
    for (let i = 0; i < total; i++) {
      if (!takenSlots.includes(i)) available.push(i);
    }
    return available;
  }, [isPairs, playerCount, takenSlots]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-display">
            {isPairs ? "Choose Your Partner" : "Pick Your Slot"}
          </DialogTitle>
        </DialogHeader>

        {/* Skill range validation banners */}
        {hasRange && !levelLoading && (
          <>
            {isBlocked && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Level not eligible</p>
                  <p className="text-xs mt-0.5">
                    This tournament requires level {skillLevelMin}–{skillLevelMax}. Your level is {playerLevel ?? "not set"}.
                  </p>
                </div>
              </div>
            )}
            {isOutOfRange && requireAdminApproval && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Level outside range</p>
                  <p className="text-xs mt-0.5">
                    This tournament targets {skillLevelMin}–{skillLevelMax}. Your level ({playerLevel ?? "N/A"}) requires organiser approval.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {isBlocked ? (
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full rounded-xl h-11">
            Close
          </Button>
        ) : isPairs ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {fetching ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {contacts.length === 0
                    ? "No available contacts. Add contacts first!"
                    : "No contacts match your search."}
                </p>
              ) : (
                filteredContacts.map((c) => (
                  <button
                    key={c.user_id}
                    onClick={() => setSelectedPartner(c.user_id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors ${
                      selectedPartner === c.user_id
                        ? "bg-primary/10 border border-primary/30"
                        : "bg-muted/30 hover:bg-muted/50 border border-transparent"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                      {c.display_name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <span className="text-sm font-medium truncate flex-1">
                      {c.display_name || "Player"}
                    </span>
                    {selectedPartner === c.user_id && (
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Tap an empty slot to choose your position.
            </p>
            <TournamentStructurePreview
              formatType={formatType}
              tournamentType={tournamentType}
              playerCount={playerCount}
              courtCount={courtCount}
              bracketConfig={bracketConfig}
              filledPlayers={filledPlayers}
              selectableSlots={selectableSlots}
              selectedSlot={selectedSlot}
              onSlotClick={(idx) => setSelectedSlot(idx)}
            />
          </div>
        )}

        <Button
          onClick={handleConfirm}
          disabled={loading || (!isOutOfRange && isPairs && !selectedPartner) || (!isOutOfRange && !isPairs && selectedSlot === null)}
          className="w-full rounded-xl h-11 font-semibold gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isOutOfRange && requireAdminApproval
            ? "Request to Join"
            : isPairs
              ? selectedPartner
                ? "Send Partner Request"
                : "Select a Partner"
              : selectedSlot !== null
                ? `Join Slot #${selectedSlot + 1}`
                : "Select a Slot"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default JoinTournamentModal;
