import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, Shield } from "lucide-react";
// navigation reserved for future use
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

type LogEntry = {
  id: string;
  type: string;
  note: string;
  target_user_id: string;
  admin_user_id: string;
  created_at: string;
  target_name?: string;
};

const AdminActivityLog = () => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      // Use admin_notes as activity log + points_transactions
      const [{ data: notes }, { data: txs }] = await Promise.all([
        supabase.from("admin_notes").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("points_transactions").select("*").not("admin_user_id", "is", null).order("created_at", { ascending: false }).limit(100),
      ]);

      const allUserIds = new Set<string>();
      (notes || []).forEach((n) => allUserIds.add(n.target_user_id));
      (txs || []).forEach((t) => allUserIds.add(t.user_id));

      const { data: profiles } = allUserIds.size > 0
        ? await supabase.from("profiles").select("user_id, display_name").in("user_id", [...allUserIds])
        : { data: [] };

      const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.display_name]));

      const combined: LogEntry[] = [
        ...(notes || []).map((n) => ({
          id: n.id,
          type: "note",
          note: n.note,
          target_user_id: n.target_user_id,
          admin_user_id: n.admin_user_id,
          created_at: n.created_at,
          target_name: nameMap.get(n.target_user_id) || "Unknown",
        })),
        ...(txs || []).map((t) => ({
          id: t.id,
          type: "points_adjustment",
          note: `${t.amount > 0 ? "+" : ""}${t.amount} XP — ${t.reason || "Manual adjustment"}`,
          target_user_id: t.user_id,
          admin_user_id: t.admin_user_id || "",
          created_at: t.created_at,
          target_name: nameMap.get(t.user_id) || "Unknown",
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setEntries(combined.slice(0, 100));
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <div className="px-4 lg:px-8 py-6 lg:pt-8 space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-display font-bold">Activity Log</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="w-10 h-10 mx-auto mb-2" />
          <p>No admin activity yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="card-elevated p-3 flex items-start gap-3"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                entry.type === "points_adjustment" ? "bg-primary/10" : "bg-muted"
              }`}>
                {entry.type === "points_adjustment" ? (
                  <Clock className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{entry.note}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Player: <span className="font-medium">{entry.target_name}</span>
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {format(new Date(entry.created_at), "MMM d HH:mm")}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminActivityLog;
