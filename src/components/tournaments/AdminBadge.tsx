import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminBadgeProps {
  role?: "admin" | "organiser" | "player";
  size?: "sm" | "md";
  className?: string;
}

const AdminBadge = ({ role = "admin", size = "sm", className }: AdminBadgeProps) => {
  if (role === "player") return null;

  const sizeClasses = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[hsl(45,93%,47%)]/15 ring-1 ring-[hsl(45,93%,47%)]/40",
        size === "sm" ? "p-0.5" : "p-1",
        className
      )}
      title={role === "organiser" ? "Organiser (not playing)" : "Tournament Admin"}
    >
      <Crown className={cn(sizeClasses, "text-[hsl(45,93%,47%)]")} />
    </span>
  );
};

export default AdminBadge;
