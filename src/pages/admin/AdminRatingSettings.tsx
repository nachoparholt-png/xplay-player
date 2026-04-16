import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Sliders, Shield, Repeat, Scale, TrendingUp, AlertTriangle, Users, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type SettingsMap = Record<string, string>;

const RATING_SETTINGS_KEYS = [
  // Level Scale
  "level_min", "level_max", "level_display_precision", "level_internal_precision",
  // Initial Level
  "default_initial_level", "self_assessment_enabled", "coach_verification_enabled", "admin_override_allowed",
  // Match Types
  "ranked_match_types", "allow_level_change_on_draw", "allow_level_change_on_auto_closed_match",
  // Team Level
  "team_level_method",
  // Expected Result
  "rating_divisor", "expected_score_formula_type",
  // Actual Result
  "win_value", "draw_value", "loss_value",
  // Level Change
  "base_k_factor", "match_weight_default", "max_level_change_per_match", "min_level_change_per_match",
  // Reliability
  "reliability_initial_value", "reliability_increase_per_match", "reliability_decay_rate", "reliability_max_value",
  "low_reliability_threshold", "medium_reliability_threshold", "high_reliability_threshold",
  "low_reliability_multiplier", "medium_reliability_multiplier", "high_reliability_multiplier",
  // Provisional
  "provisional_match_count", "provisional_k_multiplier", "provisional_badge_enabled",
  // Repeated Opponent
  "enable_repeated_match_reduction", "repeated_match_window_days", "repeated_match_detection_mode",
  "repeat_match_2_multiplier", "repeat_match_3_multiplier", "repeat_match_4_plus_multiplier",
  // Loss
  "apply_repeat_penalty_to_losses", "loss_multiplier", "upset_loss_multiplier",
  // Draw
  "draw_rating_enabled", "draw_adjustment_strength", "draw_expected_result_modifier",
  // Safety
  "max_level_change_per_day", "level_floor", "level_ceiling",
  // Override
  "allow_manual_level_override", "override_lock_period_days", "override_requires_reason",
];

const SettingRow = ({ label, description, value, onChange, type = "number" }: {
  label: string; description: string; value: string; onChange: (v: string) => void; type?: "number" | "text";
}) => (
  <div className="space-y-1.5">
    <Label className="text-sm font-medium">{label}</Label>
    <p className="text-xs text-muted-foreground">{description}</p>
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-40 h-9 rounded-lg bg-muted border-border/50"
    />
  </div>
);

const ToggleRow = ({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) => (
  <div className="flex items-center justify-between">
    <div className="space-y-0.5 flex-1 mr-4">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

const AdminRatingSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", RATING_SETTINGS_KEYS);
      const map: SettingsMap = {};
      if (data) data.forEach((r) => { map[r.key] = r.value; });
      setSettings(map);
      setLoading(false);
    };
    fetch();
  }, []);

  const s = (key: string, fallback = "") => settings[key] ?? fallback;
  const update = (key: string, value: string) => setSettings((p) => ({ ...p, [key]: value }));
  const isBool = (key: string) => s(key) === "true";

  const handleSave = async () => {
    setSaving(true);
    for (const key of Object.keys(settings)) {
      const { data: existing } = await supabase.from("app_settings").select("id").eq("key", key).maybeSingle();
      if (existing) {
        await supabase.from("app_settings").update({ value: settings[key], updated_at: new Date().toISOString(), updated_by: user?.id }).eq("key", key);
      } else {
        await supabase.from("app_settings").insert({ key, value: settings[key], updated_by: user?.id });
      }
    }
    toast({ title: "Rating settings saved ✓" });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="px-4 py-6 pt-16 lg:pt-6 flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pt-16 lg:pt-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sliders className="w-6 h-6 text-destructive" />
          <h1 className="text-2xl font-display font-bold">Rating System</h1>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save All"}
        </Button>
      </div>

      <Tabs defaultValue="core" className="space-y-4">
        <TabsList className="bg-muted/50 rounded-xl p-1 flex-wrap h-auto gap-1">
          <TabsTrigger value="core" className="rounded-lg text-xs">Core</TabsTrigger>
          <TabsTrigger value="reliability" className="rounded-lg text-xs">Reliability</TabsTrigger>
          <TabsTrigger value="match" className="rounded-lg text-xs">Match Impact</TabsTrigger>
          <TabsTrigger value="repeat" className="rounded-lg text-xs">Repeat Opponents</TabsTrigger>
          <TabsTrigger value="draw" className="rounded-lg text-xs">Draws & Losses</TabsTrigger>
          <TabsTrigger value="safety" className="rounded-lg text-xs">Safety</TabsTrigger>
          <TabsTrigger value="initial" className="rounded-lg text-xs">Initial Level</TabsTrigger>
        </TabsList>

        {/* Core Settings */}
        <TabsContent value="core">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-5 space-y-5">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" /> Rating Core Settings
            </h2>
            <SettingRow label="Base K-Factor" description="Controls how much each match affects rating. Higher = more volatile." value={s("base_k_factor", "0.5")} onChange={(v) => update("base_k_factor", v)} />
            <SettingRow label="Rating Divisor" description="Elo formula divisor. Higher values reduce sensitivity to level differences." value={s("rating_divisor", "400")} onChange={(v) => update("rating_divisor", v)} />
            <SettingRow label="Match Weight Default" description="Default weight applied to each match." value={s("match_weight_default", "1.0")} onChange={(v) => update("match_weight_default", v)} />
            <div className="grid grid-cols-3 gap-4">
              <SettingRow label="Win Value" description="Numeric value for win" value={s("win_value", "1.0")} onChange={(v) => update("win_value", v)} />
              <SettingRow label="Draw Value" description="Numeric value for draw" value={s("draw_value", "0.5")} onChange={(v) => update("draw_value", v)} />
              <SettingRow label="Loss Value" description="Numeric value for loss" value={s("loss_value", "0.0")} onChange={(v) => update("loss_value", v)} />
            </div>
            <SettingRow label="Ranked Match Types" description="Comma-separated match formats that affect rating (e.g. competitive,americana)" value={s("ranked_match_types", "competitive,americana")} onChange={(v) => update("ranked_match_types", v)} type="text" />
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Team Level Method</Label>
              <p className="text-xs text-muted-foreground">How team level is calculated from individual levels.</p>
              <Select value={s("team_level_method", "average")} onValueChange={(v) => update("team_level_method", v)}>
                <SelectTrigger className="w-48 h-9 rounded-lg bg-muted border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="average">Average</SelectItem>
                  <SelectItem value="weighted_average">Weighted Average</SelectItem>
                  <SelectItem value="median">Median</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        </TabsContent>

        {/* Reliability */}
        <TabsContent value="reliability">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-5 space-y-5">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Reliability & Confidence
            </h2>
            <SettingRow label="Initial Reliability" description="Starting reliability for new players (0–100)" value={s("reliability_initial_value", "30")} onChange={(v) => update("reliability_initial_value", v)} />
            <SettingRow label="Increase Per Match" description="Reliability gained per validated match" value={s("reliability_increase_per_match", "3")} onChange={(v) => update("reliability_increase_per_match", v)} />
            <SettingRow label="Decay Rate" description="Monthly decay for inactive players" value={s("reliability_decay_rate", "0.5")} onChange={(v) => update("reliability_decay_rate", v)} />
            <SettingRow label="Max Value" description="Maximum reliability score" value={s("reliability_max_value", "100")} onChange={(v) => update("reliability_max_value", v)} />
            <h3 className="font-semibold text-sm pt-2">Thresholds & Multipliers</h3>
            <div className="grid grid-cols-2 gap-4">
              <SettingRow label="Low Threshold" description="Below this = low" value={s("low_reliability_threshold", "30")} onChange={(v) => update("low_reliability_threshold", v)} />
              <SettingRow label="Low Multiplier" description="K multiplier for low reliability" value={s("low_reliability_multiplier", "1.5")} onChange={(v) => update("low_reliability_multiplier", v)} />
              <SettingRow label="Medium Threshold" description="Below this = medium" value={s("medium_reliability_threshold", "60")} onChange={(v) => update("medium_reliability_threshold", v)} />
              <SettingRow label="Medium Multiplier" description="K multiplier for medium" value={s("medium_reliability_multiplier", "1.0")} onChange={(v) => update("medium_reliability_multiplier", v)} />
              <SettingRow label="High Threshold" description="Above this = high" value={s("high_reliability_threshold", "80")} onChange={(v) => update("high_reliability_threshold", v)} />
              <SettingRow label="High Multiplier" description="K multiplier for high" value={s("high_reliability_multiplier", "0.8")} onChange={(v) => update("high_reliability_multiplier", v)} />
            </div>
            <h3 className="font-semibold text-sm pt-2">Provisional Period</h3>
            <SettingRow label="Provisional Match Count" description="Matches before exiting provisional status" value={s("provisional_match_count", "10")} onChange={(v) => update("provisional_match_count", v)} />
            <SettingRow label="Provisional K Multiplier" description="Extra K multiplier during provisional period" value={s("provisional_k_multiplier", "2.0")} onChange={(v) => update("provisional_k_multiplier", v)} />
            <ToggleRow label="Show Provisional Badge" description="Display provisional badge on player profiles" checked={isBool("provisional_badge_enabled")} onChange={(v) => update("provisional_badge_enabled", String(v))} />
          </motion.div>
        </TabsContent>

        {/* Match Impact */}
        <TabsContent value="match">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-5 space-y-5">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Match Impact
            </h2>
            <SettingRow label="Max Level Change Per Match" description="Maximum change from a single match" value={s("max_level_change_per_match", "0.5")} onChange={(v) => update("max_level_change_per_match", v)} />
            <SettingRow label="Min Level Change Per Match" description="Minimum change (filters noise)" value={s("min_level_change_per_match", "0.01")} onChange={(v) => update("min_level_change_per_match", v)} />
            <ToggleRow label="Level Change on Draw" description="Whether draws affect player ratings" checked={isBool("allow_level_change_on_draw")} onChange={(v) => update("allow_level_change_on_draw", String(v))} />
            <ToggleRow label="Level Change on Auto-Closed" description="Whether auto-closed matches affect ratings" checked={isBool("allow_level_change_on_auto_closed_match")} onChange={(v) => update("allow_level_change_on_auto_closed_match", String(v))} />
          </motion.div>
        </TabsContent>

        {/* Repeat Opponents */}
        <TabsContent value="repeat">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-5 space-y-5">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              <Repeat className="w-5 h-5 text-primary" /> Repeated Opponent Rules
            </h2>
            <ToggleRow label="Enable Repeat Reduction" description="Reduce rating impact for repeated opponents" checked={isBool("enable_repeated_match_reduction")} onChange={(v) => update("enable_repeated_match_reduction", String(v))} />
            <SettingRow label="Window (Days)" description="Time window to check for repeated opponents" value={s("repeated_match_window_days", "30")} onChange={(v) => update("repeated_match_window_days", v)} />
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Detection Mode</Label>
              <p className="text-xs text-muted-foreground">How to identify repeated opponents.</p>
              <Select value={s("repeated_match_detection_mode", "same_opponent_pair")} onValueChange={(v) => update("repeated_match_detection_mode", v)}>
                <SelectTrigger className="w-56 h-9 rounded-lg bg-muted border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact_same_team">Exact Same Team</SelectItem>
                  <SelectItem value="same_opponent_pair">Same Opponent Pair</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <SettingRow label="2nd Match" description="Multiplier" value={s("repeat_match_2_multiplier", "0.7")} onChange={(v) => update("repeat_match_2_multiplier", v)} />
              <SettingRow label="3rd Match" description="Multiplier" value={s("repeat_match_3_multiplier", "0.4")} onChange={(v) => update("repeat_match_3_multiplier", v)} />
              <SettingRow label="4th+ Match" description="Multiplier" value={s("repeat_match_4_plus_multiplier", "0.2")} onChange={(v) => update("repeat_match_4_plus_multiplier", v)} />
            </div>
          </motion.div>
        </TabsContent>

        {/* Draw & Loss */}
        <TabsContent value="draw">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-5 space-y-5">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              <Scale className="w-5 h-5 text-primary" /> Draws & Losses
            </h2>
            <ToggleRow label="Draw Rating Enabled" description="Whether draws affect ratings at all" checked={isBool("draw_rating_enabled")} onChange={(v) => update("draw_rating_enabled", String(v))} />
            <SettingRow label="Draw Adjustment Strength" description="How strongly draws affect rating (0–1)" value={s("draw_adjustment_strength", "0.5")} onChange={(v) => update("draw_adjustment_strength", v)} />
            <SettingRow label="Loss Multiplier" description="General multiplier applied to losses" value={s("loss_multiplier", "1.0")} onChange={(v) => update("loss_multiplier", v)} />
            <SettingRow label="Upset Loss Multiplier" description="Extra multiplier when losing to lower-rated team" value={s("upset_loss_multiplier", "1.2")} onChange={(v) => update("upset_loss_multiplier", v)} />
            <ToggleRow label="Repeat Penalty on Losses" description="Apply repeated opponent reduction to losses too" checked={isBool("apply_repeat_penalty_to_losses")} onChange={(v) => update("apply_repeat_penalty_to_losses", String(v))} />
          </motion.div>
        </TabsContent>

        {/* Safety */}
        <TabsContent value="safety">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-5 space-y-5">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-primary" /> Safety Limits
            </h2>
            <SettingRow label="Max Change Per Day" description="Maximum total level change in a single day" value={s("max_level_change_per_day", "1.0")} onChange={(v) => update("max_level_change_per_day", v)} />
            <SettingRow label="Level Floor" description="Absolute minimum level" value={s("level_floor", "0.0")} onChange={(v) => update("level_floor", v)} />
            <SettingRow label="Level Ceiling" description="Absolute maximum level" value={s("level_ceiling", "7.0")} onChange={(v) => update("level_ceiling", v)} />
            <h3 className="font-semibold text-sm pt-2">Manual Overrides</h3>
            <ToggleRow label="Allow Manual Override" description="Let admins manually set player levels" checked={isBool("allow_manual_level_override")} onChange={(v) => update("allow_manual_level_override", String(v))} />
            <SettingRow label="Override Lock Period (Days)" description="Days before override can be changed again" value={s("override_lock_period_days", "7")} onChange={(v) => update("override_lock_period_days", v)} />
            <ToggleRow label="Require Reason" description="Require admins to provide a reason for overrides" checked={isBool("override_requires_reason")} onChange={(v) => update("override_requires_reason", String(v))} />
          </motion.div>
        </TabsContent>

        {/* Initial Level */}
        <TabsContent value="initial">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-5 space-y-5">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Initial Level Configuration
            </h2>
            <SettingRow label="Default Initial Level" description="Level assigned to new players" value={s("default_initial_level", "2.0")} onChange={(v) => update("default_initial_level", v)} />
            <ToggleRow label="Self-Assessment Enabled" description="Allow players to self-assess their level" checked={isBool("self_assessment_enabled")} onChange={(v) => update("self_assessment_enabled", String(v))} />
            <ToggleRow label="Coach Verification" description="Require coach verification for initial level" checked={isBool("coach_verification_enabled")} onChange={(v) => update("coach_verification_enabled", String(v))} />
            <ToggleRow label="Admin Override Allowed" description="Allow admins to set initial level directly" checked={isBool("admin_override_allowed")} onChange={(v) => update("admin_override_allowed", String(v))} />
            <div className="grid grid-cols-2 gap-4">
              <SettingRow label="Level Min" description="Minimum level on scale" value={s("level_min", "0.0")} onChange={(v) => update("level_min", v)} />
              <SettingRow label="Level Max" description="Maximum level on scale" value={s("level_max", "7.0")} onChange={(v) => update("level_max", v)} />
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminRatingSettings;
