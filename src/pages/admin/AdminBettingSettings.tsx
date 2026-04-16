import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Save, Loader2, TrendingUp, Zap, Percent, Settings2, Shield, ShieldOff,
  RotateCcw, AlertTriangle, Activity, Flame
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_TIER_CONFIG,
  eloWinProb,
  computeOdds,
  type TierConfig,
  type BetConfig,
} from "@/lib/betting";
import { Slider } from "@/components/ui/slider";

const DEFAULT_TOURNEY_TIERS: TierConfig[] = [
  { label: "T1", minProb: 0.30, maxProb: 1.00, k: 1.10, maxMult: 5 },
  { label: "T2", minProb: 0.10, maxProb: 0.30, k: 1.15, maxMult: 12 },
  { label: "T3", minProb: 0.05, maxProb: 0.10, k: 1.20, maxMult: 25 },
  { label: "T4", minProb: 0.02, maxProb: 0.05, k: 1.35, maxMult: 60 },
  { label: "T5", minProb: 0.01, maxProb: 0.02, k: 1.50, maxMult: 120 },
  { label: "T6", minProb: 0.00, maxProb: 0.01, k: 1.50, maxMult: 150 },
];

const TournamentBettingDefaults = () => {
  const { toast } = useToast();
  const [tiers, setTiers] = useState<TierConfig[]>(DEFAULT_TOURNEY_TIERS);
  const [potSharePct, setPotSharePct] = useState(50);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsId, setDefaultsId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("tournament_bet_config")
        .select("*")
        .is("tournament_id", null)
        .maybeSingle();
      if (data) {
        setDefaultsId(data.id);
        if (Array.isArray(data.tier_config) && data.tier_config.length > 0) setTiers(data.tier_config);
        if (data.pot_share_pct != null) setPotSharePct(Math.round(Number(data.pot_share_pct) * 100));
      }
    };
    load();
  }, []);

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    const payload = {
      tier_config: JSON.parse(JSON.stringify(tiers)),
      pot_share_pct: potSharePct / 100,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (defaultsId) {
      ({ error } = await supabase.from("tournament_bet_config").update(payload).eq("id", defaultsId));
    } else {
      payload.tournament_id = null;
      payload.allocation_pts = 500;
      payload.house_reserve_pts = 100000;
      payload.max_stake_per_stage = 500;
      payload.max_payout_pts = 5000;
      const res = await supabase.from("tournament_bet_config").insert([payload]).select().single();
      error = res.error;
      if (res.data) setDefaultsId(res.data.id);
    }

    setSavingDefaults(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Tournament defaults saved" });
    }
  };

  const updateTier = (idx: number, field: keyof TierConfig, value: number) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="w-4 h-4 text-primary" />
              Tournament Betting Defaults
            </CardTitle>
            <CardDescription>Global defaults applied to new tournaments</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setTiers(DEFAULT_TOURNEY_TIERS); setPotSharePct(50); }} className="gap-1 text-xs">
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
            <Button size="sm" onClick={handleSaveDefaults} disabled={savingDefaults} className="gap-1">
              {savingDefaults ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pool Share Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>Pool Share %</Label>
            <Badge variant="outline" className="font-mono">{potSharePct}%</Badge>
          </div>
          <Slider
            value={[potSharePct]}
            onValueChange={([v]) => setPotSharePct(v)}
            min={0}
            max={100}
            step={5}
          />
          <p className="text-xs text-muted-foreground">Percentage of losing stakes redistributed to winners as pool bonus</p>
        </div>

        <Separator />

        {/* Tier Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left py-2 px-2">Tier</th>
                <th className="text-center py-2 px-2">Prob Range</th>
                <th className="text-center py-2 px-2">k</th>
                <th className="text-center py-2 px-2">Max Mult</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, idx) => (
                <tr key={idx} className="border-b border-border/30">
                  <td className="py-2 px-2"><Badge variant="secondary" className="text-[10px] font-mono">{tier.label}</Badge></td>
                  <td className="py-2 px-2 text-center text-xs text-muted-foreground font-mono">{(tier.minProb * 100).toFixed(0)}–{(tier.maxProb * 100).toFixed(0)}%</td>
                  <td className="py-2 px-2 text-center">
                    <Input type="number" step={0.01} min={1.0} max={3.0} value={tier.k}
                      onChange={(e) => updateTier(idx, "k", parseFloat(e.target.value) || 1.1)}
                      className="w-20 text-center mx-auto h-7 text-xs" />
                  </td>
                  <td className="py-2 px-2 text-center">
                    <Input type="number" step={1} min={1} max={200} value={tier.maxMult}
                      onChange={(e) => updateTier(idx, "maxMult", parseFloat(e.target.value) || 5)}
                      className="w-20 text-center mx-auto h-7 text-xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};


const PREVIEW_MATCHUPS = [
  { label: "Even Match", eloA: 1500, eloB: 1500 },
  { label: "Slight Edge", eloA: 1600, eloB: 1500 },
  { label: "Clear Favourite", eloA: 1800, eloB: 1500 },
  { label: "Heavy Favourite", eloA: 2000, eloB: 1400 },
];

const AdminBettingSettings = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<BetConfig>({
    enabled: true,
    house_reserve_pts: 50000,
    min_stake: 1,
    max_stake: 15,
    max_payout_pts: 500,
    risk_threshold: 0.60,
    close_threshold: 0.85,
    tier_config: DEFAULT_TIER_CONFIG,
    high_pot_boost_pts: 50,
    high_pot_max_per_match: 3,
    max_exposure_pct: 0.30,
  });
  const [configId, setConfigId] = useState<string | null>(null);

  useEffect(() => { fetchConfig(); fetchTournaments(); }, []);

  const fetchTournaments = async () => {
    const { data } = await supabase
      .from("tournaments")
      .select("id, name, status, start_date")
      .in("status", ["draft", "active"])
      .order("start_date", { ascending: false })
      .limit(20);
    if (data) setTournaments(data);
  };

  const fetchConfig = async () => {
    const { data, error } = await supabase
      .from("match_bet_config")
      .select("*")
      .limit(1)
      .single();

    if (!error && data) {
      setConfigId(data.id);
      setConfig({
        enabled: data.enabled,
        house_reserve_pts: data.house_reserve_pts,
        min_stake: data.min_stake,
        max_stake: data.max_stake,
        max_payout_pts: data.max_payout_pts,
        risk_threshold: Number(data.risk_threshold),
        close_threshold: Number(data.close_threshold),
        tier_config: data.tier_config as TierConfig[],
        high_pot_boost_pts: data.high_pot_boost_pts,
        high_pot_max_per_match: data.high_pot_max_per_match,
        max_exposure_pct: Number(data.max_exposure_pct),
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!configId) return;
    setSaving(true);
    const { error } = await supabase
      .from("match_bet_config")
      .update({
        enabled: config.enabled,
        house_reserve_pts: config.house_reserve_pts,
        min_stake: config.min_stake,
        max_stake: config.max_stake,
        max_payout_pts: config.max_payout_pts,
        risk_threshold: config.risk_threshold,
        close_threshold: config.close_threshold,
        tier_config: config.tier_config,
        high_pot_boost_pts: config.high_pot_boost_pts,
        high_pot_max_per_match: config.high_pot_max_per_match,
        max_exposure_pct: config.max_exposure_pct,
        updated_at: new Date().toISOString(),
      })
      .eq("id", configId);

    if (error) {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Betting config updated." });
    }
    setSaving(false);
  };

  const updateTier = (idx: number, field: keyof TierConfig, value: number) => {
    const updated = [...config.tier_config];
    updated[idx] = { ...updated[idx], [field]: value };
    setConfig({ ...config, tier_config: updated });
  };

  const resetTiers = () => {
    setConfig({ ...config, tier_config: [...DEFAULT_TIER_CONFIG] });
  };

  // Live odds preview
  const previewOdds = useMemo(() => {
    return PREVIEW_MATCHUPS.map((m) => {
      const probA = eloWinProb(m.eloA, m.eloB);
      const probB = 1 - probA;
      const oddsA = computeOdds(probA, config.tier_config);
      const oddsB = computeOdds(probB, config.tier_config);
      return { ...m, probA, probB, oddsA, oddsB };
    });
  }, [config.tier_config]);

  // Exposure gauge — worst case = all players bet max on max multiplier
  const maxMultInTiers = Math.max(...config.tier_config.map((t) => t.maxMult));
  const theoreticalWorstCase = config.max_stake * maxMultInTiers;
  const exposurePct = Math.min((theoreticalWorstCase / config.house_reserve_pts) * 100, 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Match Betting Config
          </h1>
          <p className="text-muted-foreground text-sm">ELO-based tiered k-factor odds system</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </Button>
      </motion.div>

      {/* Kill Switch */}
      <Card className={!config.enabled ? "border-destructive/50 bg-destructive/5" : ""}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            {config.enabled ? (
              <Shield className="w-5 h-5 text-primary" />
            ) : (
              <ShieldOff className="w-5 h-5 text-destructive" />
            )}
            <div>
              <p className="font-semibold text-sm">Betting System</p>
              <p className="text-xs text-muted-foreground">
                {config.enabled ? "Active — markets can be created" : "Disabled — no new markets"}
              </p>
            </div>
          </div>
          <Switch checked={config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* House Reserve & Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-primary" />
              House Reserve & Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>House Reserve (pts)</Label>
              <Input
                type="number" min={1000}
                value={config.house_reserve_pts}
                onChange={(e) => setConfig({ ...config, house_reserve_pts: parseInt(e.target.value) || 50000 })}
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Single-bet exposure gauge</span>
                <span>{exposurePct.toFixed(1)}%</span>
              </div>
              <Progress value={exposurePct} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Worst single bet: {config.max_stake} × {maxMultInTiers.toFixed(1)} = {theoreticalWorstCase.toFixed(0)} pts
              </p>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Min Stake</Label>
                <Input type="number" min={1} value={config.min_stake}
                  onChange={(e) => setConfig({ ...config, min_stake: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Stake</Label>
                <Input type="number" min={1} value={config.max_stake}
                  onChange={(e) => setConfig({ ...config, max_stake: parseInt(e.target.value) || 15 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Payout</Label>
                <Input type="number" min={1} value={config.max_payout_pts}
                  onChange={(e) => setConfig({ ...config, max_payout_pts: parseInt(e.target.value) || 500 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Exposure %</Label>
                <Input type="number" step={0.05} min={0.05} max={1}
                  value={config.max_exposure_pct}
                  onChange={(e) => setConfig({ ...config, max_exposure_pct: parseFloat(e.target.value) || 0.30 })} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liability Thresholds */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-primary" />
              Liability Thresholds
            </CardTitle>
            <CardDescription>Control when lines move to risk / closed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Risk Threshold</Label>
                <Badge variant="outline" className="font-mono">{(config.risk_threshold * 100).toFixed(0)}%</Badge>
              </div>
              <Input type="range" min={0.1} max={0.95} step={0.05}
                value={config.risk_threshold}
                onChange={(e) => setConfig({ ...config, risk_threshold: parseFloat(e.target.value) })}
                className="accent-primary" />
              <p className="text-xs text-muted-foreground">
                Line shows "at risk" when potential payout ≥ {(config.risk_threshold * 100).toFixed(0)}% of reserve
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Close Threshold</Label>
                <Badge variant="destructive" className="font-mono">{(config.close_threshold * 100).toFixed(0)}%</Badge>
              </div>
              <Input type="range" min={0.2} max={1.0} step={0.05}
                value={config.close_threshold}
                onChange={(e) => setConfig({ ...config, close_threshold: parseFloat(e.target.value) })}
                className="accent-destructive" />
              <p className="text-xs text-muted-foreground">
                Line closes when potential payout ≥ {(config.close_threshold * 100).toFixed(0)}% of reserve
              </p>
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-primary" />
                <Label className="font-semibold text-sm">High Pot Settings</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Boost Cost (pts)</Label>
                  <Input type="number" min={1} value={config.high_pot_boost_pts}
                    onChange={(e) => setConfig({ ...config, high_pot_boost_pts: parseInt(e.target.value) || 50 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Boosts/Match</Label>
                  <Input type="number" min={1} max={10} value={config.high_pot_max_per_match}
                    onChange={(e) => setConfig({ ...config, high_pot_max_per_match: parseInt(e.target.value) || 3 })} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tiered K-Factor Config */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4 text-primary" />
                Tiered K-Factor Configuration
              </CardTitle>
              <CardDescription>Each tier inflates true probability by k, caps multiplier at maxMult</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={resetTiers} className="gap-1 text-xs">
              <RotateCcw className="w-3 h-3" /> Reset Defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-xs text-muted-foreground">Tier</th>
                  <th className="text-center py-2 px-2 text-xs text-muted-foreground">Prob Range</th>
                  <th className="text-center py-2 px-2 text-xs text-muted-foreground">k Factor</th>
                  <th className="text-center py-2 px-2 text-xs text-muted-foreground">Max Mult</th>
                  <th className="text-center py-2 px-2 text-xs text-muted-foreground">House Edge</th>
                  <th className="text-center py-2 px-2 text-xs text-muted-foreground">Cap?</th>
                </tr>
              </thead>
              <tbody>
                {config.tier_config.map((tier, idx) => {
                  const midProb = (tier.minProb + tier.maxProb) / 2;
                  const houseEdge = ((tier.k - 1) * 100).toFixed(0);
                  const testOdds = computeOdds(midProb, config.tier_config);
                  return (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2 px-2">
                        <Badge variant="secondary" className="font-mono text-xs">{tier.label}</Badge>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className="font-mono text-xs text-muted-foreground">
                          {(tier.minProb * 100).toFixed(0)}–{(tier.maxProb * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Input type="number" step={0.01} min={1.0} max={3.0}
                          value={tier.k}
                          onChange={(e) => updateTier(idx, "k", parseFloat(e.target.value) || 1.1)}
                          className="w-20 text-center mx-auto h-7 text-xs" />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Input type="number" step={0.5} min={1.0} max={50}
                          value={tier.maxMult}
                          onChange={(e) => updateTier(idx, "maxMult", parseFloat(e.target.value) || 2.0)}
                          className="w-20 text-center mx-auto h-7 text-xs" />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className="text-xs font-mono text-primary">+{houseEdge}%</span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {testOdds.isCapped ? (
                          <Badge variant="destructive" className="text-[10px]">CAP</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Live Odds Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="w-4 h-4 text-primary" />
            Live Odds Preview
          </CardTitle>
          <CardDescription>Hypothetical matchups recalculated from your tier config</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {previewOdds.map((m, idx) => (
              <div key={idx} className="rounded-lg border border-border/50 p-3 bg-surface-container-low">
                <p className="text-xs font-semibold text-foreground mb-2">{m.label}</p>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>ELO {m.eloA}</span>
                  <span>vs</span>
                  <span>ELO {m.eloB}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Team A</p>
                    <p className="text-sm font-bold text-primary">
                      {m.oddsA.isOffered ? `×${m.oddsA.oddsMultiplier.toFixed(2)}` : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{(m.probA * 100).toFixed(1)}%</p>
                    <Badge variant="secondary" className="text-[9px] mt-0.5">{m.oddsA.tierLabel}</Badge>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">VS</span>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Team B</p>
                    <p className="text-sm font-bold text-primary">
                      {m.oddsB.isOffered ? `×${m.oddsB.oddsMultiplier.toFixed(2)}` : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{(m.probB * 100).toFixed(1)}%</p>
                    <Badge variant="secondary" className="text-[9px] mt-0.5">{m.oddsB.tierLabel}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tournament Betting Defaults */}
      <TournamentBettingDefaults />

      {/* Tournament Bet Config Links */}
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Tournament Bet Config
          </CardTitle>
          <CardDescription>Configure betting for individual tournaments</CardDescription>
        </CardHeader>
        <CardContent>
          {tournaments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No active tournaments</p>
          ) : (
            <div className="space-y-2">
              {tournaments.map((t: any) => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/tournaments/${t.id}/bets`)}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.start_date ? new Date(t.start_date).toLocaleDateString() : "No date"} · {t.status}
                    </p>
                  </div>
                  <Badge variant={t.status === "active" ? "default" : "secondary"} className="text-[10px]">
                    {t.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminBettingSettings;
