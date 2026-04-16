import { useState, useEffect } from "react";
import { TrendingUp, Coins, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface BetBannerProps {
  tournamentId: string;
  userId: string | undefined;
  onPlaceBet: () => void;
}

const BetBanner = ({ tournamentId, userId, onPlaceBet }: BetBannerProps) => {
  const [openWindow, setOpenWindow] = useState<{ stage: string; status: string } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!tournamentId || !userId) return;

    const load = async () => {
      const [{ data: windows }, { data: alloc }] = await Promise.all([
        supabase.from("tournament_bet_windows").select("stage, status").eq("tournament_id", tournamentId).eq("status", "open"),
        supabase.from("tournament_bet_allocations").select("balance_pts").eq("tournament_id", tournamentId).eq("user_id", userId).single(),
      ]);
      if (windows?.length) setOpenWindow(windows[0]);
      if (alloc) setBalance(alloc.balance_pts);
    };
    load();

    // Realtime for windows
    const channel = supabase
      .channel(`bet-banner-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_bet_windows", filter: `tournament_id=eq.${tournamentId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_bet_allocations", filter: `tournament_id=eq.${tournamentId}` }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, userId]);

  if (!openWindow || balance === null) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-40 px-4 lg:bottom-4">
      <div className="max-w-lg mx-auto bg-card/95 backdrop-blur-lg border border-primary/30 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg shadow-primary/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold capitalize">{openWindow.stage} Betting Open</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Coins className="w-3 h-3" />
              <span>{balance} TBP</span>
            </div>
          </div>
        </div>
        <Button size="sm" onClick={onPlaceBet} className="rounded-xl gap-1.5 font-semibold">
          Place Bet
          <ChevronUp className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default BetBanner;
