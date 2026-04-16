import { useCallback } from "react";
import type { PhaseBlock, ProgressionRule } from "@/lib/tournaments/types";

interface HandlePosition {
  x: number;
  y: number;
}

interface Props {
  rule: ProgressionRule;
  phases: PhaseBlock[];
  /** Called when user clicks the arrow — parent (BuilderCanvas) renders the confirm popup */
  onDeleteRequest: (ruleId: string, x: number, y: number) => void;
  handlePositions?: Record<string, Record<string, HandlePosition>>;
  /** Highlight arrow while its confirm popup is open */
  isPendingDelete?: boolean;
}

// ── Colour palettes ───────────────────────────────────────────────────────────

/** Colours for direct (rank-based) rules */
const DIRECT_RANK_COLORS: Record<string, string> = {
  "1st": "hsl(var(--primary))",
  "W":   "hsl(var(--primary))",
  "2nd": "hsl(47 96% 53%)",
  "3rd": "hsl(var(--muted-foreground) / 0.5)",
  "4th": "hsl(var(--muted-foreground) / 0.3)",
  "L":   "hsl(var(--muted-foreground) / 0.35)",
};

/**
 * Warm amber-orange used for best_of qualifier arrows.
 * Distinct from the rank yellows so users can instantly tell the difference.
 */
const BEST_OF_COLOR = "hsl(30 90% 55%)";

function getDirectColor(rank: string): string {
  if (DIRECT_RANK_COLORS[rank]) return DIRECT_RANK_COLORS[rank];
  if (rank.startsWith("W")) return "hsl(var(--primary))";
  if (rank.startsWith("L")) return "hsl(var(--muted-foreground) / 0.35)";
  return "hsl(var(--muted-foreground) / 0.4)";
}

function getStrokeDash(rule: ProgressionRule): string {
  if (rule.ruleType === "best_of") return "3 5";
  const rank = rule.fromRank;
  if (rank.startsWith("W") || rank === "1st" || rank === "2nd") return "6 3";
  return "4 5";
}

// ── Constants ─────────────────────────────────────────────────────────────────
const BLOCK_W = 260;
const BLOCK_H = 160;

const ConnectionArrow = ({
  rule,
  phases,
  onDeleteRequest,
  handlePositions = {},
  isPendingDelete = false,
}: Props) => {
  const isBestOf = rule.ruleType === "best_of";

  const fromPhase = phases.find((p) => p.id === rule.fromPhaseId);
  const toPhase   = phases.find((p) => p.id === rule.toPhaseId);

  const handlePathClick = useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      e.stopPropagation();
      const svg = (e.target as SVGElement).closest("svg");
      if (!svg) return;
      const pt  = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      onDeleteRequest(rule.id, svgP.x, svgP.y);
    },
    [rule.id, onDeleteRequest]
  );

  if (!fromPhase || !toPhase) return null;

  const fromHandles = handlePositions[rule.fromPhaseId] ?? {};
  const toHandles   = handlePositions[rule.toPhaseId]   ?? {};

  const fromPos = fromHandles[rule.fromRank];
  const x1 = fromPos ? fromPos.x : fromPhase.positionX + BLOCK_W + 20;
  const y1 = fromPos ? fromPos.y : fromPhase.positionY + BLOCK_H / 2;

  const toPos = toHandles["IN"];
  const x2 = toPos ? toPos.x : toPhase.positionX;
  const y2 = toPos ? toPos.y : toPhase.positionY + BLOCK_H / 2;

  // Resolve arrow colour
  const baseColor = isBestOf ? BEST_OF_COLOR : getDirectColor(rule.fromRank);
  const color     = isPendingDelete ? "hsl(var(--destructive))" : baseColor;
  const dashArray = getStrokeDash(rule);

  const gap      = Math.abs(x2 - x1);
  const cpOffset = Math.max(60, gap * 0.45);
  const cx1 = x1 + cpOffset;
  const cx2 = x2 - cpOffset;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const arrowSize   = 6;
  const arrowPoints = `${x2},${y2} ${x2 - arrowSize},${y2 - arrowSize / 2} ${x2 - arrowSize},${y2 + arrowSize / 2}`;
  const dotR        = isBestOf ? 4 : 3;

  const pathD = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;

  // Label pill dimensions — wider for best_of to accommodate the star prefix
  const pillW  = isBestOf ? 42 : 28;
  const pillX  = midX - pillW / 2;
  const pillY  = midY - 8;

  // Label text shown inside the pill
  const labelText = isBestOf ? `★ ${rule.fromRank}` : rule.fromRank;

  return (
    <g
      className="cursor-pointer group"
      aria-label={`${isBestOf ? "Best-of qualifier" : rule.fromRank} → click to ${isBestOf ? "remove" : "delete"}`}
      style={{ pointerEvents: "auto" }}
    >
      {/* Wide invisible hit area (28px) for easy clicking */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={28}
        pointerEvents="stroke"
        style={{ cursor: "pointer" }}
        onClick={handlePathClick}
      />

      {/* ── Best-of: faint outer glow track always visible ─────────────────── */}
      {isBestOf && !isPendingDelete && (
        <path
          d={pathD}
          fill="none"
          stroke={BEST_OF_COLOR}
          strokeWidth={8}
          strokeDasharray={dashArray}
          style={{ pointerEvents: "none" }}
          opacity={0.12}
        />
      )}

      {/* Hover glow layer */}
      <path
        d={pathD}
        fill="none"
        stroke={isPendingDelete ? "hsl(var(--destructive))" : color}
        strokeWidth={isBestOf ? 12 : 10}
        strokeDasharray={dashArray}
        style={{ pointerEvents: "none" }}
        opacity={isPendingDelete ? 0.25 : 0}
        className="transition-all duration-150 group-hover:opacity-20"
      />

      {/* Main bezier path */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={isPendingDelete ? 2.8 : isBestOf ? 2.2 : 1.8}
        strokeDasharray={dashArray}
        style={{ pointerEvents: "none" }}
        className="transition-all duration-150 group-hover:stroke-destructive group-hover:opacity-100"
        opacity={isPendingDelete ? 1 : 0.88}
        onClick={handlePathClick}
      />

      {/* Source dot */}
      <circle
        cx={x1}
        cy={y1}
        r={dotR}
        fill={color}
        style={{ pointerEvents: "none" }}
        className="transition-colors duration-150 group-hover:fill-destructive"
      />

      {/* Arrow head at target */}
      <polygon
        points={arrowPoints}
        fill={color}
        style={{ pointerEvents: "none" }}
        className="transition-colors duration-150 group-hover:fill-destructive"
      />

      {/* ── Rank / qualifier label pill ──────────────────────────────────────── */}
      <g style={{ pointerEvents: "none" }}>
        {/* Pill background — slightly tinted for best_of */}
        {isBestOf && !isPendingDelete && (
          <rect
            x={pillX - 1}
            y={pillY - 1}
            width={pillW + 2}
            height={16}
            rx={5}
            fill={BEST_OF_COLOR}
            opacity={0.12}
          />
        )}
        <rect
          x={pillX}
          y={pillY}
          width={pillW}
          height={14}
          rx={4}
          fill="hsl(var(--card))"
          stroke={color}
          strokeWidth={isBestOf ? 1.5 : 1}
          opacity={0.95}
          className="transition-colors duration-150 group-hover:stroke-destructive"
        />
        <text
          x={midX}
          y={midY + 3}
          textAnchor="middle"
          fontSize={isBestOf ? 7 : 8}
          fontWeight={700}
          fill={color}
          className="select-none transition-colors duration-150 group-hover:fill-destructive"
          style={{ fontFamily: "inherit" }}
        >
          {labelText}
        </text>
      </g>

      {/* ── Best-of: tiebreaker badge below the pill ─────────────────────────── */}
      {isBestOf && !isPendingDelete && rule.tiebreaker && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={midX - 24}
            y={midY + 9}
            width={48}
            height={10}
            rx={3}
            fill="hsl(var(--card))"
            stroke={BEST_OF_COLOR}
            strokeWidth={0.75}
            opacity={0.85}
          />
          <text
            x={midX}
            y={midY + 16}
            textAnchor="middle"
            fontSize={6}
            fontWeight={600}
            fill={BEST_OF_COLOR}
            opacity={0.9}
            className="select-none"
            style={{ fontFamily: "inherit" }}
          >
            {rule.tiebreaker === "points"
              ? "pts"
              : rule.tiebreaker === "wins"
              ? "wins"
              : "game diff"}
            {" · best "}
            {rule.bestOfCount ?? 1}
          </text>
        </g>
      )}
    </g>
  );
};

export default ConnectionArrow;
