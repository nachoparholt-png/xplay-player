import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  variant?: "default" | "primary" | "secondary";
  onClick?: () => void;
}

const StatCard = ({ label, value, icon: Icon, subtitle, variant = "default", onClick }: StatCardProps) => {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={onClick ? { scale: 0.97 } : undefined}
      onClick={onClick}
      className={`bg-surface-container p-5 rounded-2xl flex flex-col justify-between h-32 border-l-4 transition-opacity${onClick ? " cursor-pointer active:opacity-80" : ""}`}
      style={{
        borderLeftColor: variant === "primary"
          ? "hsl(var(--primary))"
          : variant === "secondary"
            ? "hsl(var(--secondary))"
            : "transparent",
      }}
    >
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
      <div className="flex items-end justify-between">
        <span className={`font-display text-3xl font-black italic ${
          variant === "secondary" ? "text-secondary" : variant === "primary" ? "text-foreground" : "text-foreground"
        }`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        <Icon className={`w-5 h-5 ${
          variant === "secondary" ? "text-secondary" : variant === "primary" ? "text-primary" : "text-muted-foreground"
        }`} />
      </div>
      {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
    </motion.div>
  );
};

export default StatCard;
