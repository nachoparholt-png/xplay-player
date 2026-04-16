interface Props {
  label: string;
  color: string;
  size?: "sm" | "md";
}

const SkillCategoryBadge = ({ label, color, size = "sm" }: Props) => {
  const sizeClasses = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full border ${sizeClasses}`}
      style={{
        color,
        borderColor: `${color}40`,
        backgroundColor: `${color}15`,
      }}
    >
      {label}
    </span>
  );
};

export default SkillCategoryBadge;
