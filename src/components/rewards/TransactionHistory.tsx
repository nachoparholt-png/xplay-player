import { motion } from "framer-motion";
import { History, ArrowUpRight, ArrowDownRight, Zap } from "lucide-react";
import { format } from "date-fns";

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  reason: string | null;
  created_at: string;
}

interface TransactionHistoryProps {
  transactions: Transaction[];
}

const typeLabels: Record<string, string> = {
  earned: "Earned",
  staked: "Staked",
  won: "Won",
  lost: "Lost",
  refunded: "Refunded",
  manual_adjustment: "Adjustment",
  admin_correction: "Correction",
};

const TransactionHistory = ({ transactions }: TransactionHistoryProps) => {
  if (transactions.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-muted-foreground" />
        <h2 className="font-display font-bold text-lg">Transaction History</h2>
      </div>

      <div className="card-elevated divide-y divide-border/50">
        {transactions.map((tx, i) => {
          const isPositive = tx.amount > 0;
          return (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 p-3"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPositive ? "bg-primary/10" : "bg-destructive/10"}`}>
                {isPositive ? (
                  <ArrowUpRight className="w-4 h-4 text-primary" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-destructive" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.reason || typeLabels[tx.transaction_type] || tx.transaction_type}</p>
                <p className="text-[10px] text-muted-foreground">{format(new Date(tx.created_at), "MMM d, HH:mm")}</p>
              </div>
              <div className="flex items-center gap-1">
                <Zap className={`w-3 h-3 ${isPositive ? "text-primary" : "text-destructive"}`} />
                <span className={`stat-number text-sm ${isPositive ? "text-primary" : "text-destructive"}`}>
                  {isPositive ? "+" : ""}{tx.amount.toLocaleString()}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default TransactionHistory;
