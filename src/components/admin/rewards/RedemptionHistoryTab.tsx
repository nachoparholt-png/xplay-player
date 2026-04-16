import { useState, useEffect } from "react";
import { Loader2, History, Search, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

type Redemption = {
  id: string;
  user_id: string;
  reward_id: string;
  reward_code_id: string | null;
  linked_store_id: string | null;
  points_spent: number;
  redemption_status: string;
  redeemed_at: string;
  delivery_message: string | null;
  reward_name?: string;
  user_name?: string;
  code_value?: string;
  store_name?: string;
  expiration_date?: string | null;
};

const RedemptionHistoryTab = () => {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("reward_redemptions")
        .select("*")
        .order("redeemed_at", { ascending: false })
        .limit(200);

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((r) => r.user_id))];
        const rewardIds = [...new Set(data.map((r) => r.reward_id))];
        const codeIds = data.map((r) => r.reward_code_id).filter(Boolean);
        const storeIds = [...new Set(data.map((r) => r.linked_store_id).filter(Boolean))];

        const [{ data: profiles }, { data: rewards }, codesResult, storesResult] = await Promise.all([
          supabase.from("profiles").select("user_id, display_name").in("user_id", userIds),
          supabase.from("rewards").select("id, reward_name").in("id", rewardIds),
          codeIds.length > 0
            ? supabase.from("reward_codes").select("id, unique_code, expiration_date").in("id", codeIds)
            : Promise.resolve({ data: [] }),
          storeIds.length > 0
            ? supabase.from("stores").select("id, store_name").in("id", storeIds)
            : Promise.resolve({ data: [] }),
        ]);

        const enriched = data.map((r) => ({
          ...r,
          user_name: profiles?.find((p) => p.user_id === r.user_id)?.display_name || "Unknown",
          reward_name: rewards?.find((rw) => rw.id === r.reward_id)?.reward_name || "Unknown",
          code_value: r.reward_code_id ? codesResult.data?.find((c) => c.id === r.reward_code_id)?.unique_code || null : null,
          expiration_date: r.reward_code_id ? codesResult.data?.find((c) => c.id === r.reward_code_id)?.expiration_date || null : null,
          store_name: r.linked_store_id ? storesResult.data?.find((s) => s.id === r.linked_store_id)?.store_name || null : null,
        }));
        setRedemptions(enriched);
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = redemptions.filter((r) => {
    if (filterStatus && r.redemption_status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.user_name?.toLowerCase().includes(q) ||
        r.reward_name?.toLowerCase().includes(q) ||
        r.code_value?.toLowerCase().includes(q) ||
        r.store_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by user, reward, code, store..." className="pl-9" />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <History className="w-10 h-10 mx-auto mb-2" />
          <p>No redemptions found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="card-elevated p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{r.user_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.reward_name} · {r.points_spent} XP
                    {r.code_value && <> · <code className="font-mono">{r.code_value}</code></>}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    r.redemption_status === "completed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {r.redemption_status}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {format(new Date(r.redeemed_at), "MMM d, HH:mm")}
                  </p>
                </div>
              </div>
              {(r.store_name || r.expiration_date) && (
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {r.store_name && (
                    <span className="flex items-center gap-1">
                      <Store className="w-3 h-3" /> {r.store_name}
                    </span>
                  )}
                  {r.expiration_date && (
                    <span>Exp: {format(new Date(r.expiration_date), "MMM d, yyyy")}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RedemptionHistoryTab;
