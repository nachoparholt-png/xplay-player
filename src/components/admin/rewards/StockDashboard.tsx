import { useState, useEffect } from "react";
import { AlertTriangle, Package, Loader2, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Reward = {
  id: string;
  reward_name: string;
  points_cost: number;
  status: string;
  stock_status: string;
  code_required: boolean;
  stock_mode: string;
  external_quantity: number | null;
  low_stock_threshold: number | null;
  current_stock: number | null;
  linked_store_id: string | null;
};

type CodeStats = {
  reward_id: string;
  available: number;
  reserved: number;
  redeemed: number;
  expired: number;
  disabled: number;
  total: number;
};

type StoreRecord = { id: string; store_name: string; website_url: string | null };

interface Props {
  rewards: Reward[];
}

const StockDashboard = ({ rewards }: Props) => {
  const [codeStats, setCodeStats] = useState<CodeStats[]>([]);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      // Fetch stores
      const storeIds = [...new Set(rewards.map((r) => r.linked_store_id).filter(Boolean))];
      if (storeIds.length > 0) {
        const { data } = await supabase.from("stores").select("id, store_name, website_url").in("id", storeIds);
        setStores(data || []);
      }

      // Fetch code stats
      const stats: CodeStats[] = [];
      for (const r of rewards.filter((r) => r.code_required)) {
        const { data } = await supabase
          .from("reward_codes")
          .select("code_status")
          .eq("reward_id", r.id);
        const codes = data || [];
        stats.push({
          reward_id: r.id,
          available: codes.filter((c) => c.code_status === "available").length,
          reserved: codes.filter((c) => c.code_status === "reserved").length,
          redeemed: codes.filter((c) => c.code_status === "redeemed").length,
          expired: codes.filter((c) => c.code_status === "expired").length,
          disabled: codes.filter((c) => c.code_status === "disabled").length,
          total: codes.length,
        });
      }
      setCodeStats(stats);
      setLoading(false);
    };
    fetch();
  }, [rewards]);

  const getStoreName = (id: string | null) => stores.find((s) => s.id === id)?.store_name || null;

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      {rewards.map((reward) => {
        const stats = codeStats.find((s) => s.reward_id === reward.id);
        const isCodeBased = reward.code_required;
        const availableCodes = stats?.available ?? 0;
        const extQty = reward.external_quantity;
        const effectiveStock = extQty !== null && isCodeBased
          ? Math.min(availableCodes, extQty)
          : isCodeBased ? availableCodes : (reward.current_stock ?? 0);
        const lowThreshold = reward.low_stock_threshold ?? 5;
        const isLowStock = effectiveStock <= lowThreshold && effectiveStock > 0;
        const isOutOfStock = effectiveStock <= 0 || reward.stock_status === "out_of_stock";
        const isComingSoon = reward.stock_status === "coming_soon";
        const storeName = getStoreName(reward.linked_store_id);

        return (
          <div key={reward.id} className={`card-elevated p-4 ${isOutOfStock ? "border-destructive/30" : isLowStock ? "border-gold/30" : ""}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display font-bold text-sm">{reward.reward_name}</h3>
                <p className="text-xs text-muted-foreground">
                  {reward.points_cost} XP · {reward.status}
                  {storeName && (
                    <span className="inline-flex items-center gap-1 ml-2">
                      <Store className="w-3 h-3" /> {storeName}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isComingSoon && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/10 text-secondary font-semibold">
                    Coming Soon
                  </span>
                )}
                {isOutOfStock && !isComingSoon && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> No Stock
                  </span>
                )}
                {isLowStock && !isOutOfStock && !isComingSoon && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold/10 text-gold font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Low Stock
                  </span>
                )}
                {!isOutOfStock && !isLowStock && !isComingSoon && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    Healthy
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mt-3">
              {isCodeBased && stats && (
                <>
                  <StatBox label="Total Codes" value={stats.total} />
                  <StatBox label="Available" value={stats.available} highlight={stats.available > 0} />
                  <StatBox label="Reserved" value={stats.reserved} />
                  <StatBox label="Redeemed" value={stats.redeemed} />
                  <StatBox label="Expired" value={stats.expired} warn={stats.expired > 0} />
                  <StatBox label="Disabled" value={stats.disabled} />
                </>
              )}
              {extQty !== null && <StatBox label="Ext. Qty" value={extQty} />}
              <StatBox label="Effective" value={effectiveStock} highlight={effectiveStock > 0} warn={isLowStock || isOutOfStock} />
            </div>
          </div>
        );
      })}

      {rewards.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-2" />
          <p>No rewards in catalog</p>
        </div>
      )}
    </div>
  );
};

const StatBox = ({ label, value, highlight, warn }: { label: string; value: number; highlight?: boolean; warn?: boolean }) => (
  <div className="text-center p-2 rounded-lg bg-muted/50">
    <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
    <p className={`text-sm font-bold ${warn ? "text-destructive" : highlight ? "text-primary" : ""}`}>{value}</p>
  </div>
);

export default StockDashboard;
