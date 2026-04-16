import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Package, Plus, Upload, History, Settings, AlertTriangle, Search, Filter, Download, Trash2, Edit, Eye, EyeOff, Loader2, Save, ShoppingBag, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import RewardFormModal from "@/components/admin/rewards/RewardFormModal";
import CodeInventoryTab from "@/components/admin/rewards/CodeInventoryTab";
import RedemptionHistoryTab from "@/components/admin/rewards/RedemptionHistoryTab";
import BulkImportModal from "@/components/admin/rewards/BulkImportModal";
import StockDashboard from "@/components/admin/rewards/StockDashboard";
import CodeSettingsTab from "@/components/admin/rewards/CodeSettingsTab";

type Reward = {
  id: string;
  reward_name: string;
  reward_description: string | null;
  reward_image: string | null;
  category: string;
  points_cost: number;
  status: string;
  source_type: string;
  code_required: boolean;
  stock_mode: string;
  external_store_name: string | null;
  external_quantity: number | null;
  low_stock_threshold: number | null;
  current_stock: number | null;
  stock_limit: number | null;
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions_per_user: number | null;
  admin_notes: string | null;
  sort_order: number | null;
  linked_store_id: string | null;
  stock_status: string;
  redemption_instructions: string | null;
};

const AdminRewardCodes = () => {
  const { user } = useAuth();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [editReward, setEditReward] = useState<Reward | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportRewardId, setBulkImportRewardId] = useState<string | null>(null);

  const fetchRewards = async () => {
    const { data } = await supabase
      .from("rewards")
      .select("*")
      .order("sort_order");
    setRewards(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRewards(); }, []);

  const handleCreateReward = () => {
    setEditReward(null);
    setFormOpen(true);
  };

  const handleEditReward = (reward: Reward) => {
    setEditReward(reward);
    setFormOpen(true);
  };

  const handleBulkImport = (rewardId?: string) => {
    setBulkImportRewardId(rewardId || null);
    setBulkImportOpen(true);
  };

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
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Reward Codes Inventory</h1>
            <p className="text-sm text-muted-foreground">Manage rewards, codes, stock, and redemptions</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleBulkImport()} className="gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            Import Codes
          </Button>
          <Button size="sm" onClick={handleCreateReward} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            New Reward
          </Button>
        </div>
      </div>

      <Tabs defaultValue="catalog">
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start bg-muted">
          <TabsTrigger value="catalog" className="gap-1.5 text-xs whitespace-nowrap">
            <ShoppingBag className="w-3.5 h-3.5" />
            Catalog
          </TabsTrigger>
          <TabsTrigger value="codes" className="gap-1.5 text-xs whitespace-nowrap">
            <Package className="w-3.5 h-3.5" />
            Codes
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-1.5 text-xs whitespace-nowrap">
            <BarChart3 className="w-3.5 h-3.5" />
            Stock
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs whitespace-nowrap">
            <History className="w-3.5 h-3.5" />
            Redemptions
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-xs whitespace-nowrap">
            <Settings className="w-3.5 h-3.5" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4 space-y-3">
          {rewards.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">No rewards created yet</p>
              <Button size="sm" onClick={handleCreateReward}>Create First Reward</Button>
            </div>
          ) : (
            rewards.map((reward, i) => (
              <motion.div
                key={reward.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="card-elevated p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {reward.reward_image ? (
                      <img src={reward.reward_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingBag className="w-6 h-6 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display font-bold text-sm">{reward.reward_name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{reward.reward_description}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                        reward.status === "active" ? "bg-primary/10 text-primary" :
                        reward.status === "coming_soon" ? "bg-secondary/10 text-secondary" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {reward.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="font-semibold text-primary">{reward.points_cost} XP</span>
                      <span>{reward.category}</span>
                      <span>{reward.source_type.replace(/_/g, " ")}</span>
                      {reward.code_required && (
                        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-medium">Code-based</span>
                      )}
                      {reward.external_store_name && <span>Store: {reward.external_store_name}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={() => handleEditReward(reward)} className="h-7 text-xs gap-1">
                        <Edit className="w-3 h-3" />
                        Edit
                      </Button>
                      {reward.code_required && (
                        <Button size="sm" variant="outline" onClick={() => handleBulkImport(reward.id)} className="h-7 text-xs gap-1">
                          <Upload className="w-3 h-3" />
                          Add Codes
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </TabsContent>

        <TabsContent value="codes" className="mt-4">
          <CodeInventoryTab rewards={rewards} onRefresh={fetchRewards} />
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <StockDashboard rewards={rewards} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <RedemptionHistoryTab />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <CodeSettingsTab />
        </TabsContent>
      </Tabs>

      <RewardFormModal
        reward={editReward}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={fetchRewards}
      />

      <BulkImportModal
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        rewards={rewards}
        preselectedRewardId={bulkImportRewardId}
        onImported={fetchRewards}
      />
    </div>
  );
};

export default AdminRewardCodes;
