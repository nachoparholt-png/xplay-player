import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Save, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { computeOdds, simulateTournament, STAGE_ORDER, STAGE_DEPTH, type TierConfig, type TeamInput } from "@/lib/tournaments/betOddsEngine";

interface BetConfig {
  id: string;
  tournament_id: string;
  allocation_pts: number;
  tier_config: TierConfig[];
  house_reserve_pts: number;
  risk_threshold: number;
  close_threshold: number;
  max_stake_per_stage: number;
  max_payout_pts: number;
  pot_share_pct: number;
  house_boost_pts: number;
  organizer_prize_pts: number;
}

interface BetWindow {
  id: string;
  stage: string;
  status: string;
  total_staked_pts: number;
  total_potential_payout_pts: number;
  total_actual_payout_pts: number;
  house_pnl_pts: number;
}

interface OddsRow {
  team_id: string;
  team_name: string;
  stage: string;
  true_probability: number;
  tier_label: string;
  odds_multiplier: number;
  is_capped: boolean;
  is_offered: boolean;
  line_status: string;
  worst_case_payout_pts: number;
}

const TournamentBetConfig = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useAuth();
  const { toast } = useToast();

  const [config, setConfig] = useState<BetConfig | null>(null);
  const [windows, setWindows] = useState<BetWindow[]>([]);
  const [oddsRows, setOddsRows] = useState<OddsRow[]>([]);
  const [teams, setTeams] = useState<{ id: string; team_name: string; player1_id: string; player2_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [computingOdds, setComputingOdds] = useState(false);
  const phases = STAGE_ORDER;
  // Editable form state
  const [allocationPts, setAllocationPts] = useState(500);
  const [maxStake, setMaxStake] = useState(500);
  const [maxPayout, setMaxPayout] = useState(5000);
  const [houseReserve, setHouseReserve] = useState(100000);
  const [riskThreshold, setRiskThreshold] = useState(0.6);
  const [closeThreshold, setCloseThreshold] = useState(1.0);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [potSharePct, setPotSharePct] = useState(0.50);
  const [houseBoostPts, setHouseBoostPts] = useState(0);
  const [organizerPrizePts, setOrganizerPrizePts] = useState(0);

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    const [configRes, windowsRes, teamsRes, oddsRes] = await Promise.all([
      supabase.from("tournament_bet_config").select("*").eq("tournament_id", id!).maybeSingle(),
      supabase.from("tournament_bet_windows").select("*").eq("tournament_id", id!),
      supabase.from("tournament_teams").select("id, team_name, player1_id, player2_id").eq("tournament_id", id!),
      supabase.from("tournament_bet_odds").select("*").eq("tournament_id", id!),
    ]);

    const teamsData = (teamsRes.data || []) as typeof teamsRes.data;
    setTeams(teamsData || []);

    if (configRes.data) {
      const c = configRes.data as BetConfig;
      setConfig(c);
      setAllocationPts(c.allocation_pts);
      setMaxStake(c.max_stake_per_stage);
      setMaxPayout(c.max_payout_pts);
      setHouseReserve(c.house_reserve_pts);
      setRiskThreshold(c.risk_threshold);
      setCloseThreshold(c.close_threshold);
      setTiers(c.tier_config as TierConfig[]);
      setPotSharePct(Number(c.pot_share_pct ?? 0.50));
      setHouseBoostPts(c.house_boost_pts ?? 0);
      setOrganizerPrizePts(c.organizer_prize_pts ?? 0);
    } else {
      // Set defaults
      const defaultTiers: TierConfig[] = [
        { label: "T1", minProb: 0.30, maxProb: 1.00, k: 1.10, maxMult: 5 },
        { label: "T2", minProb: 0.10, maxProb: 0.30, k: 1.15, maxMult: 12 },
        { label: "T3", minProb: 0.05, maxProb: 0.10, k: 1.20, maxMult: 25 },
        { label: "T4", minProb: 0.02, maxProb: 0.05, k: 1.35, maxMult: 60 },
        { label: "T5", minProb: 0.01, maxProb: 0.02, k: 1.50, maxMult: 120 },
        { label: "T6", minProb: 0.00, maxProb: 0.01, k: 1.50, maxMult: 150 },
      ];
      setTiers(defaultTiers);
    }

    setWindows((windowsRes.data || []) as BetWindow[]);

    // Map odds with team names
    const mapped = (oddsRes.data || []).map((o) => ({
      ...o,
      team_name: teamsData?.find((t) => t.id === o.team_id)?.team_name || "Unknown",
    }));
    setOddsRows(mapped);
    setLoading(false);
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    const payload = {
      tournament_id: id!,
      allocation_pts: allocationPts,
      tier_config: JSON.parse(JSON.stringify(tiers)),
      house_reserve_pts: houseReserve,
      risk_threshold: riskThreshold,
      close_threshold: closeThreshold,
      max_stake_per_stage: maxStake,
      max_payout_pts: maxPayout,
      pot_share_pct: potSharePct,
      house_boost_pts: houseBoostPts,
      organizer_prize_pts: organizerPrizePts,
      updated_at: new Date().toISOString(),
    };

    const { error } = config
      ? await supabase.from("tournament_bet_config").update(payload).eq("id", config.id)
      : await supabase.from("tournament_bet_config").insert([payload]);

    setSaving(false);
    if (error) {
      toast({ title: "Error saving config", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Config saved" });
      loadData();
    }
  };

  const handleComputeOdds = async () => {
    setComputingOdds(true);
    const { error } = await supabase.functions.invoke("compute-bet-odds", {
      body: { tournamentId: id },
    });
    setComputingOdds(false);
    if (error) {
      toast({ title: "Error computing odds", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Odds computed successfully" });
      loadData();
    }
  };

  const handleToggleWindow = async (stage: string, currentStatus: string) => {
    const newStatus = currentStatus === "open" ? "pending" : "open";
    if (newStatus === "open") {
      await supabase.functions.invoke("open-bet-window", {
        body: { tournamentId: id, stage },
      });
    } else {
      // Close window
      const serviceUpdate = await supabase
        .from("tournament_bet_windows")
        .update({ status: "closed", closes_at: new Date().toISOString() })
        .eq("tournament_id", id!)
        .eq("stage", stage);
      if (serviceUpdate.error) {
        toast({ title: "Error", description: serviceUpdate.error.message, variant: "destructive" });
        return;
      }
    }
    toast({ title: `Window ${newStatus === "open" ? "opened" : "closed"}` });
    loadData();
  };

  const updateTier = (index: number, field: keyof TierConfig, value: number) => {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  // Client-side odds preview
  const previewOdds = useMemo(() => {
    if (!teams.length || !tiers.length) return [];
    const teamInputs: TeamInput[] = teams.map((t) => ({
      teamId: t.id,
      avgElo: 1300,
    }));
    const sim = simulateTournament(teamInputs, 1000);
    return sim.flatMap((s) =>
      phases.map((stageKey) => {
        const prob = s[stageKey] ?? 0;
        const depth = STAGE_DEPTH[stageKey];
        const odds = computeOdds(prob, tiers, maxPayout, maxStake, teams.length, houseReserve, riskThreshold, closeThreshold, depth);
        const team = teams.find((t) => t.id === s.teamId);
        return {
          teamId: s.teamId,
          teamName: team?.team_name || "?",
          stage: stageKey,
          trueProb: prob,
          ...odds,
        };
      })
    );
  }, [teams, tiers, maxPayout, maxStake, houseReserve, riskThreshold, closeThreshold]);

  // Liability gauge
  const worstCase = useMemo(() => {
    const activeOdds = oddsRows.length ? oddsRows : previewOdds;
    return activeOdds.reduce((max, o: any) => Math.max(max, o.worstCasePayout ?? o.worst_case_payout_pts ?? 0), 0);
  }, [oddsRows, previewOdds]);

  const liabilityPct = houseReserve > 0 ? Math.min((worstCase / houseReserve) * 100, 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-card/95 backdrop-blur-lg border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <TrendingUp className="w-5 h-5 text-primary" />
          <h1 className="font-display font-bold text-lg">Bet Configuration</h1>
        </div>
      </div>

      <div className="p-4 space-y-6 max-w-3xl mx-auto">
        {/* Section A: Allocation & Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allocation & Limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Free TBP per player</Label>
                <Input type="number" value={allocationPts} onChange={(e) => setAllocationPts(+e.target.value)} />
              </div>
              <div>
                <Label>Max stake per stage</Label>
                <Input type="number" value={maxStake} onChange={(e) => setMaxStake(+e.target.value)} />
              </div>
              <div>
                <Label>Max payout per bet</Label>
                <Input type="number" value={maxPayout} onChange={(e) => setMaxPayout(+e.target.value)} />
              </div>
              <div>
                <Label>House reserve (TBP)</Label>
                <Input type="number" value={houseReserve} onChange={(e) => setHouseReserve(+e.target.value)} />
              </div>
              <div>
                <Label>Risk threshold (%)</Label>
                <Input type="number" step="0.01" value={riskThreshold} onChange={(e) => setRiskThreshold(+e.target.value)} />
              </div>
              <div>
                <Label>Close threshold (%)</Label>
                <Input type="number" step="0.01" value={closeThreshold} onChange={(e) => setCloseThreshold(+e.target.value)} />
              </div>
              <div>
                <Label>Pool share %</Label>
                <Input type="number" step="0.01" min={0} max={1} value={potSharePct} onChange={(e) => setPotSharePct(+e.target.value)} />
              </div>
              <div>
                <Label>House boost (TBP)</Label>
                <Input type="number" min={0} value={houseBoostPts} onChange={(e) => setHouseBoostPts(+e.target.value)} />
              </div>
              <div>
                <Label>Champion prize (TBP)</Label>
                <Input type="number" min={0} value={organizerPrizePts} onChange={(e) => setOrganizerPrizePts(+e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section B: Tier Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tier Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-2">Tier</th>
                    <th className="text-left py-2 pr-2">Min Prob</th>
                    <th className="text-left py-2 pr-2">K-Factor</th>
                    <th className="text-left py-2 pr-2">Max Mult</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((tier, i) => (
                    <tr key={tier.label} className="border-b border-border/30">
                      <td className="py-2 pr-2 font-medium">{tier.label}</td>
                      <td className="py-2 pr-2">{(tier.minProb * 100).toFixed(0)}%+</td>
                      <td className="py-2 pr-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={tier.k}
                          onChange={(e) => updateTier(i, "k", +e.target.value)}
                          className="h-8 w-20"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          type="number"
                          value={tier.maxMult}
                          onChange={(e) => updateTier(i, "maxMult", +e.target.value)}
                          className="h-8 w-20"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Liability Gauge */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Liability Gauge</span>
                <span className={liabilityPct > 80 ? "text-destructive font-medium" : "text-muted-foreground"}>
                  {worstCase.toLocaleString()} / {houseReserve.toLocaleString()} TBP ({liabilityPct.toFixed(0)}%)
                </span>
              </div>
              <Progress
                value={liabilityPct}
                className={`h-3 ${liabilityPct > 80 ? "[&>div]:bg-destructive" : liabilityPct > 50 ? "[&>div]:bg-yellow-500" : ""}`}
              />
            </div>

            {/* Odds Preview Table */}
            {(oddsRows.length > 0 || previewOdds.length > 0) && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Odds Preview</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-1.5">Team</th>
                        <th className="text-left py-1.5">Stage</th>
                        <th className="text-right py-1.5">Prob</th>
                        <th className="text-left py-1.5">Tier</th>
                        <th className="text-right py-1.5">Mult</th>
                        <th className="text-left py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(oddsRows.length > 0 ? oddsRows : previewOdds).map((row: any, i) => (
                        <tr key={i} className="border-b border-border/20">
                          <td className="py-1.5">{row.team_name || row.teamName}</td>
                          <td className="py-1.5 capitalize">{row.stage}</td>
                          <td className="py-1.5 text-right">{((row.true_probability || row.trueProb || 0) * 100).toFixed(1)}%</td>
                          <td className="py-1.5">
                            <Badge variant="outline" className="text-[10px]">{row.tier_label || row.tierLabel}</Badge>
                          </td>
                          <td className="py-1.5 text-right font-mono">
                            {row.is_offered !== false && row.isOffered !== false
                              ? `×${(row.odds_multiplier || row.oddsMultiplier || 0).toFixed(2)}`
                              : "—"}
                          </td>
                          <td className="py-1.5">
                            {(row.is_capped || row.isCapped) && (
                              <Badge className="text-[10px] bg-yellow-500/20 text-yellow-700">CAP</Badge>
                            )}
                            {(row.line_status || row.lineStatus) === "risk" && (
                              <Badge className="text-[10px] bg-yellow-500/20 text-yellow-700 ml-1">RISK</Badge>
                            )}
                            {(row.line_status || row.lineStatus) === "closed" && (
                              <Badge className="text-[10px] bg-destructive/20 text-destructive ml-1">CLOSED</Badge>
                            )}
                            {(row.line_status || row.lineStatus) === "open" && (row.is_offered !== false && row.isOffered !== false) && (
                              <Badge className="text-[10px] bg-green-500/20 text-green-700 ml-1">OPEN</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section C: Window Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Betting Windows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {phases.map((stage) => {
              const w = windows.find((w) => w.stage === stage);
              const status = w?.status || "pending";
              return (
                <div key={stage} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                  <div className="flex items-center gap-3">
                    <span className="font-medium capitalize text-sm">{stage}</span>
                    <Badge
                      variant="outline"
                      className={
                        status === "open"
                          ? "border-green-500 text-green-700"
                          : status === "settled"
                            ? "border-muted text-muted-foreground"
                            : status === "closed"
                              ? "border-destructive text-destructive"
                              : ""
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    {w && (
                      <div className="text-xs text-muted-foreground text-right">
                        <div>Staked: {w.total_staked_pts}</div>
                        <div>P&L: {w.house_pnl_pts >= 0 ? "+" : ""}{w.house_pnl_pts}</div>
                      </div>
                    )}
                    {status !== "settled" && (
                      <Switch
                        checked={status === "open"}
                        onCheckedChange={() => handleToggleWindow(stage, status)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button onClick={handleSaveConfig} disabled={saving} className="flex-1">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Config"}
          </Button>
          <Button variant="outline" onClick={handleComputeOdds} disabled={computingOdds}>
            <RefreshCw className={`w-4 h-4 mr-2 ${computingOdds ? "animate-spin" : ""}`} />
            {computingOdds ? "Computing..." : "Compute Odds"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TournamentBetConfig;
