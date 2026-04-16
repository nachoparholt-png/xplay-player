import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface QuickActionProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  variant?: "primary" | "default";
}

const QuickAction = ({ icon: Icon, label, onClick, variant = "default" }: QuickActionProps) => {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-colors ${
        variant === "primary"
          ? "bg-primary text-primary-foreground glow-primary"
          : "bg-muted hover:bg-muted/80 text-foreground"
      }`}
    >
      <Icon className="w-6 h-6" />
      <span className="text-xs font-semibold">{label}</span>
    </motion.button>
  );
};

export default QuickAction;
