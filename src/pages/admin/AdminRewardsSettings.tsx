import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Gift, Save, Loader2, Zap, ShoppingCart, Users, Swords, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

interface SettingField {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "textarea";
  description?: string;
}

const sections: { id: string; label: string; icon: typeof Gift; fields: SettingField[] }[] = [
  {
    id: "earning", label: "Points Earning", icon: Zap,
    fields: [
      { key: "welcome_points_enabled", label: "Welcome Points Enabled", type: "boolean" },
      { key: "welcome_points_amount", label: "Welcome Points Amount", type: "number" },
      { key: "points_per_match_played", label: "Points per Match Played", type: "number" },
      { key: "points_per_match_won", label: "Points per Match Won", type: "number" },
      { key: "points_per_stake_action", label: "Points per Stake Action", type: "number" },
      { key: "profile_completion_points", label: "Profile Completion Points", type: "number" },
      { key: "campaign_bonus_points", label: "Campaign Bonus Points", type: "number" },
    ],
  },
  {
    id: "referral", label: "Referral Program", icon: Users,
    fields: [
      { key: "referral_program_enabled", label: "Referral Program Enabled", type: "boolean" },
      { key: "referral_points_inviter", label: "Points for Inviter", type: "number" },
      { key: "referral_points_invited_user", label: "Points for Invited User", type: "number" },
    ],
  },
  {
    id: "purchase", label: "Point Purchase", icon: ShoppingCart,
    fields: [
      { key: "enable_points_purchase", label: "Enable Points Purchase", type: "boolean" },
      { key: "exact_missing_points_purchase_enabled", label: "Exact Missing Points Purchase", type: "boolean" },
      { key: "minimum_purchase_amount", label: "Minimum Purchase Amount", type: "number" },
      { key: "points_pack_1_amount", label: "Pack 1 Amount", type: "number" },
      { key: "points_pack_1_price", label: "Pack 1 Price", type: "text" },
      { key: "points_pack_1_bonus", label: "Pack 1 Bonus", type: "number" },
      { key: "points_pack_2_amount", label: "Pack 2 Amount", type: "number" },
      { key: "points_pack_2_price", label: "Pack 2 Price", type: "text" },
      { key: "points_pack_2_bonus", label: "Pack 2 Bonus", type: "number" },
      { key: "points_pack_3_amount", label: "Pack 3 Amount", type: "number" },
      { key: "points_pack_3_price", label: "Pack 3 Price", type: "text" },
      { key: "points_pack_3_bonus", label: "Pack 3 Bonus", type: "number" },
      { key: "points_pack_4_amount", label: "Pack 4 Amount", type: "number" },
      { key: "points_pack_4_price", label: "Pack 4 Price", type: "text" },
      { key: "points_pack_4_bonus", label: "Pack 4 Bonus", type: "number" },
    ],
  },
  {
    id: "staking", label: "Staking Rules", icon: Swords,
    fields: [
      { key: "stake_enabled", label: "Staking Enabled", type: "boolean" },
      { key: "minimum_stake_points", label: "Minimum Stake", type: "number" },
      { key: "maximum_stake_points", label: "Maximum Stake", type: "number" },
      { key: "draw_refund_rule", label: "Draw Refund Rule", type: "text", description: "full, partial, or none" },
      { key: "points_distribution_rule", label: "Distribution Rule", type: "text", description: "winner_takes_all or proportional" },
    ],
  },
  {
    id: "ux", label: "UX & Copy", icon: Type,
    fields: [
      { key: "rewards_section_title", label: "Rewards Page Title", type: "text" },
      { key: "rewards_helper_text", label: "Helper Description", type: "textarea" },
      { key: "earn_section_title", label: "Earn Section Title", type: "text" },
      { key: "stake_section_title", label: "Stake Section Title", type: "text" },
      { key: "referral_section_title", label: "Referral Section Title", type: "text" },
      { key: "buy_points_section_title", label: "Buy Points Section Title", type: "text" },
    ],
  },
];

const AdminRewardsSettings = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase.from("app_settings").select("key, value");
    const map: Record<string, string> = {};
    data?.forEach((s) => { map[s.key] = s.value; });
    setSettings(map);
    setOriginal(map);
    setLoading(false);
  };

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const changed = Object.entries(settings).filter(([k, v]) => original[k] !== v);

    for (const [key, value] of changed) {
      await supabase.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    }

    setOriginal({ ...settings });
    setSaving(false);
    toast({ title: "Settings saved", description: `${changed.length} setting(s) updated.` });
  };

  const hasChanges = Object.entries(settings).some(([k, v]) => original[k] !== v);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 mt-12 lg:mt-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Points & Rewards</h1>
            <p className="text-sm text-muted-foreground">Configure all reward and points settings</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={!hasChanges || saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </Button>
      </div>

      <Tabs defaultValue="earning">
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start bg-muted">
          {sections.map((s) => (
            <TabsTrigger key={s.id} value={s.id} className="gap-1.5 text-xs whitespace-nowrap">
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {sections.map((section) => (
          <TabsContent key={section.id} value={section.id} className="space-y-4 mt-4">
            {section.fields.map((field) => (
              <motion.div
                key={field.key}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-elevated p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium">{field.label}</label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {field.description || `Key: ${field.key}`}
                    </p>
                  </div>

                  {field.type === "boolean" ? (
                    <Switch
                      checked={settings[field.key] === "true"}
                      onCheckedChange={(v) => handleChange(field.key, v ? "true" : "false")}
                    />
                  ) : field.type === "textarea" ? (
                    <textarea
                      value={settings[field.key] || ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="w-full max-w-xs h-20 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm resize-none"
                    />
                  ) : (
                    <Input
                      type={field.type === "number" ? "number" : "text"}
                      value={settings[field.key] || ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="max-w-[200px]"
                    />
                  )}
                </div>
              </motion.div>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default AdminRewardsSettings;
