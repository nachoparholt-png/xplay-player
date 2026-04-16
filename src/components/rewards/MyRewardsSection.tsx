import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Gift, ExternalLink, Copy, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

type MyRedemption = {
  id: string;
  reward_id: string;
  reward_code_id: string | null;
  linked_store_id: string | null;
  points_spent: number;
  redemption_status: string;
  redeemed_at: string;
  delivery_message: string | null;
  reward_name?: string;
  unique_code?: string;
  store_name?: string;
  website_url?: string;
  redemption_instructions?: string;
  expiration_date?: string | null;
};

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  completed: { label: "Ready to Use", icon: CheckCircle, className: "bg-primary/10 text-primary" },
  expired: { label: "Expired", icon: AlertTriangle, className: "bg-destructive/10 text-destructive" },
  pending: { label: "Pending", icon: Clock, className: "bg-muted text-muted-foreground" },
};

const MyRewardsSection = () => {
  const { user } = useAuth();
  const [redemptions, setRedemptions] = useState<MyRedemption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("reward_redemptions")
        .select("*")
        .eq("user_id", user.id)
        .order("redeemed_at", { ascending: false })
        .limit(50);

      if (data && data.length > 0) {
        const rewardIds = [...new Set(data.map((r: any) => r.reward_id))];
        const codeIds = data.map((r: any) => r.reward_code_id).filter(Boolean);
        const storeIds = data.map((r: any) => r.linked_store_id).filter(Boolean);

        const [{ data: rewards }, codeResult, storeResult] = await Promise.all([
          supabase.from("rewards").select("id, reward_name, redemption_instructions").in("id", rewardIds),
          codeIds.length > 0
            ? supabase.from("reward_codes").select("id, unique_code, expiration_date").in("id", codeIds)
            : Promise.resolve({ data: [] }),
          storeIds.length > 0
            ? supabase.from("stores").select("id, store_name, website_url, redemption_instructions").in("id", storeIds)
            : Promise.resolve({ data: [] }),
        ]);

        const enriched = data.map((r) => {
          const reward = rewards?.find((rw) => rw.id === r.reward_id);
          const code = codeIds.length > 0 ? codeResult.data?.find((c) => c.id === r.reward_code_id) : null;
          const store = storeIds.length > 0 ? storeResult.data?.find((s) => s.id === r.linked_store_id) : null;
          return {
            ...r,
            reward_name: reward?.reward_name || "Unknown",
            unique_code: code?.unique_code || null,
            expiration_date: code?.expiration_date || null,
            store_name: store?.store_name || null,
            website_url: store?.website_url || null,
            redemption_instructions: store?.redemption_instructions || reward?.redemption_instructions || r.delivery_message,
          };
        });
        setRedemptions(enriched);
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Code copied!" });
  };

  if (loading) return null;
  if (redemptions.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Gift className="w-5 h-5 text-primary" />
        <h2 className="font-display font-bold text-lg">My Rewards</h2>
      </div>

      <div className="space-y-2">
        {redemptions.map((r, i) => {
          const status = statusConfig[r.redemption_status] || statusConfig.completed;
          const StatusIcon = status.icon;
          const isExpired = r.expiration_date && new Date(r.expiration_date) < new Date();

          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`card-elevated p-4 space-y-2 ${isExpired ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display font-bold text-sm">{r.reward_name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(r.redeemed_at), "MMM d, yyyy")} · {r.points_spent} XP
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${isExpired ? statusConfig.expired.className : status.className}`}>
                  <StatusIcon className="w-3 h-3" />
                  {isExpired ? "Expired" : status.label}
                </span>
              </div>

              {r.unique_code && !isExpired && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/50 border border-border">
                  <code className="text-sm font-mono font-bold text-primary flex-1 truncate">{r.unique_code}</code>
                  <Button size="sm" variant="ghost" onClick={() => copyCode(r.unique_code!)} className="h-7 px-2 gap-1 text-xs">
                    <Copy className="w-3 h-3" />
                    Copy
                  </Button>
                </div>
              )}

              {r.store_name && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Redeem at: <strong className="text-foreground">{r.store_name}</strong></span>
                  {r.website_url && (
                    <a href={r.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                      Visit <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {r.redemption_instructions && (
                <p className="text-xs text-muted-foreground italic">{r.redemption_instructions}</p>
              )}

              {r.expiration_date && !isExpired && (
                <p className="text-[10px] text-muted-foreground">
                  Expires: {format(new Date(r.expiration_date), "MMM d, yyyy")}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default MyRewardsSection;
