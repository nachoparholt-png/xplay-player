import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Package, Search, Trash2, Edit, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

type RewardCode = {
  id: string;
  reward_id: string;
  unique_code: string;
  source_reference: string | null;
  code_status: string;
  expiration_date: string | null;
  imported_at: string;
  redeemed_at: string | null;
  redeemed_by_user_id: string | null;
  admin_note: string | null;
};

type Reward = { id: string; reward_name: string };

interface Props {
  rewards: Reward[];
  onRefresh: () => void;
}

const statusColors: Record<string, string> = {
  available: "bg-primary/10 text-primary",
  reserved: "bg-secondary/10 text-secondary",
  redeemed: "bg-muted text-muted-foreground",
  expired: "bg-destructive/10 text-destructive",
  disabled: "bg-muted text-muted-foreground",
};

const CodeInventoryTab = ({ rewards, onRefresh }: Props) => {
  const [codes, setCodes] = useState<RewardCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterReward, setFilterReward] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [addingCode, setAddingCode] = useState(false);
  const [newCode, setNewCode] = useState({ reward_id: "", unique_code: "", source_reference: "", expiration_date: "", admin_note: "" });

  const fetchCodes = async () => {
    setLoading(true);
    let query = supabase.from("reward_codes").select("*").order("imported_at", { ascending: false }).limit(200);
    if (filterReward) query = query.eq("reward_id", filterReward);
    if (filterStatus) query = query.eq("code_status", filterStatus);
    const { data } = await query;
    setCodes(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCodes(); }, [filterReward, filterStatus]);

  const filtered = codes.filter((c) =>
    !search || c.unique_code.toLowerCase().includes(search.toLowerCase()) ||
    c.source_reference?.toLowerCase().includes(search.toLowerCase())
  );

  const getRewardName = (id: string) => rewards.find((r) => r.id === id)?.reward_name || "Unknown";

  const handleAddCode = async () => {
    if (!newCode.reward_id || !newCode.unique_code.trim()) {
      toast({ title: "Reward and code are required", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("reward_codes").insert({
      reward_id: newCode.reward_id,
      unique_code: newCode.unique_code.trim(),
      source_reference: newCode.source_reference || null,
      expiration_date: newCode.expiration_date || null,
      admin_note: newCode.admin_note || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message.includes("unique") ? "Duplicate code for this reward" : error.message, variant: "destructive" });
    } else {
      toast({ title: "Code added" });
      setNewCode({ reward_id: "", unique_code: "", source_reference: "", expiration_date: "", admin_note: "" });
      setAddingCode(false);
      fetchCodes();
    }
  };

  const handleUpdateStatus = async (codeId: string, newStatus: string) => {
    await supabase.from("reward_codes").update({ code_status: newStatus }).eq("id", codeId);
    toast({ title: `Code ${newStatus}` });
    fetchCodes();
  };

  const handleDelete = async (codeId: string) => {
    await supabase.from("reward_codes").delete().eq("id", codeId);
    toast({ title: "Code deleted" });
    fetchCodes();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search codes..." className="pl-9" />
        </div>
        <select
          value={filterReward}
          onChange={(e) => setFilterReward(e.target.value)}
          className="h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
        >
          <option value="">All Rewards</option>
          {rewards.map((r) => <option key={r.id} value={r.id}>{r.reward_name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="redeemed">Redeemed</option>
          <option value="expired">Expired</option>
          <option value="disabled">Disabled</option>
        </select>
        <Button size="sm" onClick={() => setAddingCode(!addingCode)} variant={addingCode ? "secondary" : "default"}>
          {addingCode ? "Cancel" : "Add Code"}
        </Button>
      </div>

      {addingCode && (
        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-4 space-y-3">
          <p className="text-sm font-medium">Add Single Code</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newCode.reward_id}
              onChange={(e) => setNewCode({ ...newCode, reward_id: e.target.value })}
              className="h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
            >
              <option value="">Select Reward</option>
              {rewards.map((r) => <option key={r.id} value={r.id}>{r.reward_name}</option>)}
            </select>
            <Input value={newCode.unique_code} onChange={(e) => setNewCode({ ...newCode, unique_code: e.target.value })} placeholder="Unique code" />
            <Input value={newCode.source_reference} onChange={(e) => setNewCode({ ...newCode, source_reference: e.target.value })} placeholder="Source ref (optional)" />
            <Input type="date" value={newCode.expiration_date} onChange={(e) => setNewCode({ ...newCode, expiration_date: e.target.value })} />
          </div>
          <Input value={newCode.admin_note} onChange={(e) => setNewCode({ ...newCode, admin_note: e.target.value })} placeholder="Admin note (optional)" />
          <Button size="sm" onClick={handleAddCode}>Save Code</Button>
        </motion.div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-2" />
          <p>No codes found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((code) => (
            <div key={code.id} className="card-elevated p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-bold truncate">{code.unique_code}</code>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusColors[code.code_status] || "bg-muted text-muted-foreground"}`}>
                    {code.code_status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {getRewardName(code.reward_id)}
                  {code.source_reference && ` · ${code.source_reference}`}
                  {code.expiration_date && ` · Exp: ${new Date(code.expiration_date).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {code.code_status === "available" && (
                  <button onClick={() => handleUpdateStatus(code.id, "disabled")} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Disable">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </button>
                )}
                {code.code_status === "disabled" && (
                  <button onClick={() => handleUpdateStatus(code.id, "available")} className="p-1.5 rounded-lg hover:bg-muted text-primary" title="Enable">
                    <Package className="w-3.5 h-3.5" />
                  </button>
                )}
                {code.code_status !== "redeemed" && (
                  <button onClick={() => handleDelete(code.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CodeInventoryTab;
