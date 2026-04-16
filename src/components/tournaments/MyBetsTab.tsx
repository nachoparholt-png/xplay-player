import { useState, useEffect } from "react";
import { Coins, TrendingUp, CheckCircle, XCircle, MinusCircle, Link2, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface Bet {
  id: string;
  stage: string;
  stake_pts: number;
  odds_multiplier: number;
  odds_at_placement: number;
  potential_payout_pts: number;
  status: string;
  actual_payout_pts: number | null;
  pool_bonus_pts: number | null;
  placed_at: string;
  team_id: string;
  collected_at: string | null;
  auto_collected: boolean;
  source_bet_id: string | null;
}

interface MyBetsTabProps {
  tournamentId: string;
  userId: string;
  teamNames: Record<string, string>;
}

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  active: { icon: TrendingUp, color: "text-primary", label: "Active" },
  won: { icon: CheckCircle, color: "text-[hsl(var(--win))]", label: "Won" },
  lost: { icon: XCircle, color: "text-destructive", label: "Lost" },
  void: { icon: MinusCircle, color: "text-muted-foreground", label: "Void" },
};

const MyBetsTab = ({ tournamentId, userId, teamNames }: MyBetsTabProps) => {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("tournament_bets")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("user_id", userId)
        .order("placed_at", { ascending: false });
      setBets(data || []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`my-bets-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_bets", filter: `tournament_id=eq.${tournamentId}` }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, userId]);

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!bets.length) {
    return (
      <div className="text-center py-8">
        <Coins className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No bets placed yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bets.map((bet) => {
        const cfg = statusConfig[bet.status] || statusConfig.active;
        const Icon = cfg.icon;
        const lockedMultiplier = bet.odds_at_placement && bet.odds_at_placement > 1
          ? bet.odds_at_placement
          : bet.odds_multiplier;
        return (
          <div key={bet.id} className="bg-card rounded-xl p-3 border border-border/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icon className={`w-5 h-5 ${cfg.color}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{teamNames[bet.team_id] || "Team"}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{bet.stage}</Badge>
                  {bet.source_bet_id && (
                    <Link2 className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {bet.stake_pts} TBP at ×{Number(lockedMultiplier).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <Badge className={`text-xs ${
                bet.status === "won" ? "bg-[hsl(var(--win))]/20 text-[hsl(var(--win))]" :
                bet.status === "lost" ? "bg-destructive/20 text-destructive" :
                bet.status === "active" ? "bg-primary/20 text-primary" :
                "bg-muted text-muted-foreground"
              }`}>
                {cfg.label}
              </Badge>
              {bet.status === "won" && bet.actual_payout_pts != null && (
                <div>
                  <p className="text-xs font-bold text-[hsl(var(--win))] mt-0.5">+{bet.actual_payout_pts + (bet.pool_bonus_pts || 0)} TBP</p>
                  {bet.pool_bonus_pts != null && bet.pool_bonus_pts > 0 && (
                    <p className="text-[10px] text-muted-foreground">incl. {bet.pool_bonus_pts} pool bonus</p>
                  )}
                  {bet.collected_at && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Download className="w-2.5 h-2.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {bet.auto_collected ? "Auto-collected" : "Collected"}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {bet.status === "active" && (
                <p className="text-xs text-muted-foreground mt-0.5">→ {bet.potential_payout_pts} TBP</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MyBetsTab;
