interface SkillBadgeProps {
  category: 1 | 2 | 3 | 4 | 5;
  size?: "sm" | "md";
}

const categoryConfig: Record<number, { label: string; className: string }> = {
  1: { label: "Cat 1 · Pro", className: "bg-gold/20 text-gold" },
  2: { label: "Cat 2 · Advanced", className: "bg-primary/20 text-primary" },
  3: { label: "Cat 3 · Intermediate", className: "bg-secondary/20 text-secondary" },
  4: { label: "Cat 4 · Casual", className: "bg-muted-foreground/20 text-muted-foreground" },
  5: { label: "Cat 5 · Beginner", className: "bg-bronze/20 text-bronze" },
};

const SkillBadge = ({ category, size = "sm" }: SkillBadgeProps) => {
  const { label, className } = categoryConfig[category];
  const sizeClasses = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";

  return (
    <span className={`${className} ${sizeClasses} rounded-md font-bold inline-block`}>
      {label}
    </span>
  );
};

export default SkillBadge;
