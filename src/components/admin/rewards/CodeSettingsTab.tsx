import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

const settingFields = [
  { key: "enable_code_based_rewards", label: "Enable Code-Based Rewards", type: "boolean" as const },
  { key: "code_assignment_method", label: "Code Assignment Method", type: "select" as const, options: ["fifo_import_order", "earliest_expiry_first", "manual_priority"] },
  { key: "reservation_enabled", label: "Code Reservation Enabled", type: "boolean" as const },
  { key: "reservation_timeout_minutes", label: "Reservation Timeout (minutes)", type: "number" as const },
  { key: "require_external_quantity_check", label: "Require External Quantity Check", type: "boolean" as const },
  { key: "stock_availability_mode", label: "Stock Availability Mode", type: "select" as const, options: ["use_code_inventory_only", "use_external_quantity_only", "require_both_code_and_external_quantity"] },
  { key: "stock_status_mode", label: "Stock Status Mode", type: "select" as const, options: ["automatic_from_code_inventory", "manual_override_allowed", "hybrid"] },
  { key: "low_stock_threshold_default", label: "Default Low Stock Threshold", type: "number" as const },
  { key: "expiring_code_warning_days", label: "Expiring Code Warning (days)", type: "number" as const },
  { key: "allow_manual_external_quantity_update", label: "Allow Manual External Qty Update", type: "boolean" as const },
  { key: "allow_manual_stock_override", label: "Allow Manual Stock Override", type: "boolean" as const },
  { key: "require_reward_store_mapping", label: "Require Reward-Store Mapping", type: "boolean" as const },
  { key: "max_redemptions_per_user_default", label: "Default Max Redemptions per User", type: "number" as const },
  { key: "stock_alerts_enabled", label: "Stock Alerts Enabled", type: "boolean" as const },
];

const CodeSettingsTab = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("app_settings").select("key, value");
      const map: Record<string, string> = {};
      data?.forEach((s) => { map[s.key] = s.value; });
      setSettings(map);
      setOriginal(map);
      setLoading(false);
    };
    fetch();
  }, []);

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const changed = Object.entries(settings).filter(([k, v]) => original[k] !== v);
    for (const [key, value] of changed) {
      // Upsert: update if exists, insert if not
      const { error } = await supabase.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
      if (error) {
        await supabase.from("app_settings").insert({ key, value });
      }
    }
    setOriginal({ ...settings });
    setSaving(false);
    toast({ title: "Settings saved", description: `${changed.length} setting(s) updated.` });
  };

  const hasChanges = Object.entries(settings).some(([k, v]) => original[k] !== v);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-sm flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" />
          Gift Card Rewards Settings
        </h3>
        <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving} className="gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </Button>
      </div>

      {settingFields.map((field) => (
        <motion.div key={field.key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="text-sm font-medium">{field.label}</label>
              <p className="text-xs text-muted-foreground mt-0.5">Key: {field.key}</p>
            </div>
            {field.type === "boolean" ? (
              <Switch
                checked={settings[field.key] === "true"}
                onCheckedChange={(v) => handleChange(field.key, v ? "true" : "false")}
              />
            ) : field.type === "select" ? (
              <select
                value={settings[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="max-w-[200px] h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
              >
                {field.options?.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
              </select>
            ) : (
              <Input
                type="number"
                value={settings[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="max-w-[200px]"
              />
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default CodeSettingsTab;
