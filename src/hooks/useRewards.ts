import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface Reward {
  id: string;
  reward_name: string;
  reward_description: string | null;
  reward_image: string | null;
  category: string;
  points_cost: number;
  stock_limit: number | null;
  current_stock: number | null;
  status: string;
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions_per_user: number | null;
  sort_order: number;
  linked_store_id: string | null;
  stock_status: string;
  redemption_instructions: string | null;
  code_required: boolean;
  external_store_name: string | null;
  // joined store data
  store_name?: string | null;
  store_website_url?: string | null;
  store_redemption_instructions?: string | null;
}

export interface PointsPack {
  id: string;
  amount: number;
  price: number;
  bonus: number;
  label: string;
}

export const useRewards = () => {
  const { user } = useAuth();

  const rewardsQuery = useQuery({
    queryKey: ["rewards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rewards")
        .select("*")
        .order("sort_order");
      if (error) throw error;

      // Fetch linked stores
      const storeIds = [...new Set((data || []).map((r: any) => r.linked_store_id).filter(Boolean))];
      let storesMap: Record<string, any> = {};
      if (storeIds.length > 0) {
        const { data: stores } = await supabase.from("stores").select("id, store_name, website_url, redemption_instructions").in("id", storeIds);
        (stores || []).forEach((s: any) => { storesMap[s.id] = s; });
      }

      return (data || []).map((r: any) => {
        const store = r.linked_store_id ? storesMap[r.linked_store_id] : null;
        return {
          ...r,
          store_name: store?.store_name || r.external_store_name || null,
          store_website_url: store?.website_url || null,
          store_redemption_instructions: store?.redemption_instructions || null,
        } as Reward;
      });
    },
  });

  const settingsQuery = useQuery({
    queryKey: ["reward-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value");
      if (error) throw error;
      const map: Record<string, string> = {};
      data.forEach((s: { key: string; value: string }) => { map[s.key] = s.value; });
      return map;
    },
  });

  const redemptionsQuery = useQuery({
    queryKey: ["my-redemptions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reward_redemptions")
        .select("*")
        .eq("user_id", user!.id)
        .order("redeemed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const transactionsQuery = useQuery({
    queryKey: ["my-transactions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("points_transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const referralsQuery = useQuery({
    queryKey: ["my-referrals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .eq("inviter_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const stakeStatsQuery = useQuery({
    queryKey: ["my-stake-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count: activeCount } = await supabase
        .from("match_stakes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "active");
      const { data: recent } = await supabase
        .from("match_stakes")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return { activeCount: activeCount || 0, recentStakes: recent || [] };
    },
  });

  const getSetting = (key: string, fallback: string = "0") => {
    return settingsQuery.data?.[key] ?? fallback;
  };

  const packagesQuery = useQuery({
    queryKey: ["point-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("point_packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const getPointsPacks = (): PointsPack[] => {
    return (packagesQuery.data || []).map((pkg: any) => ({
      id: pkg.id,
      amount: (pkg.total_points ?? pkg.points) + (pkg.bonus_points || 0),
      price: pkg.price_gbp,
      bonus: pkg.bonus_points || 0,
      label: pkg.name,
    }));
  };

  return {
    rewards: rewardsQuery.data || [],
    settings: settingsQuery.data || {},
    redemptions: redemptionsQuery.data || [],
    transactions: transactionsQuery.data || [],
    referrals: referralsQuery.data || [],
    stakeStats: stakeStatsQuery.data,
    isLoading: rewardsQuery.isLoading || settingsQuery.isLoading,
    getSetting,
    getPointsPacks,
  };
};

export const useRedeemReward = () => {
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();

  return useMutation({
    mutationFn: async ({ rewardId }: { rewardId: string }) => {
      const response = await supabase.functions.invoke("redeem-reward", {
        body: { reward_id: rewardId },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
      queryClient.invalidateQueries({ queryKey: ["my-redemptions"] });
      queryClient.invalidateQueries({ queryKey: ["my-transactions"] });
      refreshProfile();
    },
    onError: (error: Error) => {
      toast({ title: "Redemption failed", description: error.message, variant: "destructive" });
    },
  });
};
