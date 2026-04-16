import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Save, Clock, Bell, Users, Shield, RotateCcw, MessageSquare, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type SettingsMap = Record<string, string>;

const TIME_ESTIMATE_CONFIGS = [
  { key: "points_16", label: "Points to 16" },
  { key: "points_21", label: "Points to 21" },
  { key: "points_32", label: "Points to 32" },
  { key: "games_4_1_normal", label: "4 games · 1 set · Normal deuce" },
  { key: "games_4_1_silver", label: "4 games · 1 set · Silver deuce" },
  { key: "games_4_1_golden", label: "4 games · 1 set · Golden point" },
  { key: "games_6_1_normal", label: "6 games · 1 set · Normal deuce" },
  { key: "games_6_1_silver", label: "6 games · 1 set · Silver deuce" },
  { key: "games_6_1_golden", label: "6 games · 1 set · Golden point" },
  { key: "games_4_3_normal", label: "4 games · Bo3 · Normal deuce" },
  { key: "games_4_3_silver", label: "4 games · Bo3 · Silver deuce" },
  { key: "games_4_3_golden", label: "4 games · Bo3 · Golden point" },
  { key: "games_6_3_normal", label: "6 games · Bo3 · Normal deuce" },
  { key: "games_6_3_silver", label: "6 games · Bo3 · Silver deuce" },
  { key: "games_6_3_golden", label: "6 games · Bo3 · Golden point" },
];

const DEFAULT_TIME_ESTIMATES: Record<string, number> = {
  points_16: 10, points_21: 14, points_32: 20,
  games_4_1_normal: 18, games_4_1_silver: 16, games_4_1_golden: 14,
  games_6_1_normal: 28, games_6_1_silver: 25, games_6_1_golden: 22,
  games_4_3_normal: 40, games_4_3_silver: 35, games_4_3_golden: 30,
  games_6_3_normal: 65, games_6_3_silver: 58, games_6_3_golden: 50,
};

const SETTINGS_KEYS = [
  "cancellation_deadline_hours",
  "allow_player_cancellation",
  "notify_organizer_on_cancel",
  "auto_promote_waitlist",
  // Match chat settings
  "auto_create_match_chat",
  "new_players_see_old_messages",
  "remove_chat_on_leave",
  "keep_readonly_after_leave",
  "archive_chat_after_completion",
  "archive_chat_after_cancel",
  "match_chat_retention_days",
  "enable_system_messages",
  // Tournament time estimates
  "tournament_default_time_estimates",
] as const;

const DEFAULT_VALUES: SettingsMap = {
  cancellation_deadline_hours: "24",
  allow_player_cancellation: "true",
  notify_organizer_on_cancel: "true",
  auto_promote_waitlist: "true",
  auto_create_match_chat: "true",
  new_players_see_old_messages: "true",
  remove_chat_on_leave: "true",
  keep_readonly_after_leave: "false",
  archive_chat_after_completion: "true",
  archive_chat_after_cancel: "true",
  match_chat_retention_days: "7",
  enable_system_messages: "true",
};

const AdminSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsMap>(DEFAULT_VALUES);
  const [timeEstimates, setTimeEstimates] = useState<Record<string, number>>({ ...DEFAULT_TIME_ESTIMATES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", SETTINGS_KEYS as string[]);

      if (data) {
        const map: SettingsMap = { ...DEFAULT_VALUES };
        data.forEach((row) => {
          if (row.key === "tournament_default_time_estimates") {
            try {
              setTimeEstimates({ ...DEFAULT_TIME_ESTIMATES, ...JSON.parse(row.value) });
            } catch {}
          } else {
            map[row.key] = row.value;
          }
        });
        setSettings(map);
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const hours = parseInt(settings.cancellation_deadline_hours);
    if (isNaN(hours) || hours < 0 || hours > 168) {
      toast({ title: "Invalid value", description: "Cancellation hours must be between 0 and 168.", variant: "destructive" });
      return;
    }
    const retDays = parseInt(settings.match_chat_retention_days);
    if (isNaN(retDays) || retDays < 1 || retDays > 365) {
      toast({ title: "Invalid value", description: "Chat retention days must be between 1 and 365.", variant: "destructive" });
      return;
    }

    setSaving(true);

    // Save regular settings
    for (const key of SETTINGS_KEYS) {
      if (key === "tournament_default_time_estimates") continue;
      const { data: existing } = await supabase
        .from("app_settings")
        .select("id")
        .eq("key", key)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("app_settings")
          .update({ value: settings[key], updated_at: new Date().toISOString(), updated_by: user?.id })
          .eq("key", key);
      } else {
        await supabase
          .from("app_settings")
          .insert({ key, value: settings[key], updated_by: user?.id });
      }
    }

    // Save time estimates
    const teKey = "tournament_default_time_estimates";
    const teValue = JSON.stringify(timeEstimates);
    const { data: teExisting } = await supabase
      .from("app_settings")
      .select("id")
      .eq("key", teKey)
      .maybeSingle();

    if (teExisting) {
      await supabase
        .from("app_settings")
        .update({ value: teValue, updated_at: new Date().toISOString(), updated_by: user?.id })
        .eq("key", teKey);
    } else {
      await supabase
        .from("app_settings")
        .insert({ key: teKey, value: teValue, updated_by: user?.id });
    }

    toast({ title: "Settings saved ✓" });
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
    <div className="px-4 py-6 pt-16 lg:pt-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-destructive" />
        <h1 className="text-2xl font-display font-bold">App Settings</h1>
      </div>

      {/* Cancellation Settings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-elevated p-5 space-y-6"
      >
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Match Cancellation
        </h2>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              Allow player cancellation
            </Label>
            <p className="text-xs text-muted-foreground">
              When disabled, only admins can remove players from matches.
            </p>
          </div>
          <Switch
            checked={settings.allow_player_cancellation === "true"}
            onCheckedChange={(checked) => updateSetting("allow_player_cancellation", String(checked))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cancellation-hours" className="text-sm font-medium">
            Cancellation deadline (hours before match)
          </Label>
          <p className="text-xs text-muted-foreground">
            Players can cancel up to this many hours before the match starts.
          </p>
          <div className="flex items-center gap-3">
            <Input
              id="cancellation-hours"
              type="number"
              min={0}
              max={168}
              value={settings.cancellation_deadline_hours}
              onChange={(e) => updateSetting("cancellation_deadline_hours", e.target.value)}
              className="w-32"
              disabled={settings.allow_player_cancellation !== "true"}
            />
            <span className="text-sm text-muted-foreground">hours</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" />
              Notify organizer on cancellation
            </Label>
            <p className="text-xs text-muted-foreground">
              Send a notification to the match organizer when a player cancels.
            </p>
          </div>
          <Switch
            checked={settings.notify_organizer_on_cancel === "true"}
            onCheckedChange={(checked) => updateSetting("notify_organizer_on_cancel", String(checked))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
              Auto-promote from waitlist
            </Label>
            <p className="text-xs text-muted-foreground">
              Automatically move the next waitlisted player into the open spot.
            </p>
          </div>
          <Switch
            checked={settings.auto_promote_waitlist === "true"}
            onCheckedChange={(checked) => updateSetting("auto_promote_waitlist", String(checked))}
          />
        </div>
      </motion.div>

      {/* Match Chat Settings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card-elevated p-5 space-y-6"
      >
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          Match Chat
        </h2>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Auto-create match chat</Label>
            <p className="text-xs text-muted-foreground">
              Automatically create a group chat when a match is created.
            </p>
          </div>
          <Switch
            checked={settings.auto_create_match_chat === "true"}
            onCheckedChange={(checked) => updateSetting("auto_create_match_chat", String(checked))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Enable system messages</Label>
            <p className="text-xs text-muted-foreground">
              Show automatic messages when players join, leave, or match events occur.
            </p>
          </div>
          <Switch
            checked={settings.enable_system_messages === "true"}
            onCheckedChange={(checked) => updateSetting("enable_system_messages", String(checked))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">New players see old messages</Label>
            <p className="text-xs text-muted-foreground">
              When a player joins, they can see messages sent before they joined.
            </p>
          </div>
          <Switch
            checked={settings.new_players_see_old_messages === "true"}
            onCheckedChange={(checked) => updateSetting("new_players_see_old_messages", String(checked))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Remove chat access on leave</Label>
            <p className="text-xs text-muted-foreground">
              Remove a player's access to the chat when they leave the match.
            </p>
          </div>
          <Switch
            checked={settings.remove_chat_on_leave === "true"}
            onCheckedChange={(checked) => updateSetting("remove_chat_on_leave", String(checked))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Keep read-only access after leaving</Label>
            <p className="text-xs text-muted-foreground">
              Players who leave can still read the chat but not send messages.
            </p>
          </div>
          <Switch
            checked={settings.keep_readonly_after_leave === "true"}
            onCheckedChange={(checked) => updateSetting("keep_readonly_after_leave", String(checked))}
            disabled={settings.remove_chat_on_leave !== "true"}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Archive chat after match completion</Label>
            <p className="text-xs text-muted-foreground">
              Keep the chat visible but archived after the match is completed.
            </p>
          </div>
          <Switch
            checked={settings.archive_chat_after_completion === "true"}
            onCheckedChange={(checked) => updateSetting("archive_chat_after_completion", String(checked))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Archive chat after match cancellation</Label>
            <p className="text-xs text-muted-foreground">
              Keep the chat visible but archived after the match is cancelled.
            </p>
          </div>
          <Switch
            checked={settings.archive_chat_after_cancel === "true"}
            onCheckedChange={(checked) => updateSetting("archive_chat_after_cancel", String(checked))}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Chat retention (days)</Label>
          <p className="text-xs text-muted-foreground">
            How long match chats remain accessible after the match ends.
          </p>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={365}
              value={settings.match_chat_retention_days}
              onChange={(e) => updateSetting("match_chat_retention_days", e.target.value)}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </div>
      </motion.div>

      {/* Tournament Time Estimates */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card-elevated p-5 space-y-4"
      >
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Tournament Time Estimates
        </h2>
        <p className="text-xs text-muted-foreground">
          Default match duration (minutes) per scoring config. Used by the tournament wizard.
        </p>
        <div className="space-y-2">
          {TIME_ESTIMATE_CONFIGS.map((cfg) => (
            <div key={cfg.key} className="flex items-center justify-between gap-3">
              <Label className="text-sm flex-1">{cfg.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={180}
                  value={timeEstimates[cfg.key] ?? DEFAULT_TIME_ESTIMATES[cfg.key]}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val > 0) {
                      setTimeEstimates((prev) => ({ ...prev, [cfg.key]: val }));
                    }
                  }}
                  className="w-20 text-center"
                />
                <span className="text-xs text-muted-foreground w-8">min</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Save button */}
      <Button onClick={handleSave} disabled={saving} className="gap-2 w-full h-12 rounded-xl font-semibold">
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save All Settings"}
      </Button>
    </div>
  );
};

export default AdminSettings;
