import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp } from "lucide-react";

interface Props {
  userId: string;
}

type ChartEntry = {
  date: string;
  level: number;
  change: number;
  result: "win" | "loss" | "draw";
};

const RatingEvolutionChart = ({ userId }: Props) => {
  const [data, setData] = useState<ChartEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data: history } = await supabase
        .from("rating_history")
        .select("new_level, level_change, actual_result, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(20);

      if (history && history.length > 0) {
        setData(
          history.map((h) => ({
            date: new Date(h.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
            level: parseFloat(h.new_level.toFixed(2)),
            change: parseFloat(h.level_change.toFixed(2)),
            result: h.actual_result > 0.5 ? "win" : h.actual_result < 0.5 ? "loss" : "draw",
          }))
        );
      }
      setLoading(false);
    };
    fetchHistory();
  }, [userId]);

  if (loading) {
    return (
      <div className="card-elevated p-4 h-[220px] space-y-3 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 rounded bg-muted" />
          <div className="h-3 w-20 rounded bg-muted" />
        </div>
        <div className="h-[160px] rounded-lg bg-muted/60" />
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="card-elevated p-4 text-center text-sm text-muted-foreground">
        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>Play more rated matches to see your level evolution chart.</p>
      </div>
    );
  }

  const minLevel = Math.floor(Math.min(...data.map((d) => d.level)) * 2) / 2 - 0.5;
  const maxLevel = Math.ceil(Math.max(...data.map((d) => d.level)) * 2) / 2 + 0.5;
  const startLevel = data[0].level;

  return (
    <div className="card-elevated p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-sm">Level Evolution</h3>
        <span className="text-xs text-muted-foreground">Last {data.length} matches</span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="levelGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minLevel, maxLevel]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            tickCount={5}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload as ChartEntry;
              return (
                <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
                  <p className="font-semibold">{d.date}</p>
                  <p>Level: <span className="font-mono font-bold">{d.level.toFixed(2)}</span></p>
                  <p className={d.change > 0 ? "text-win" : d.change < 0 ? "text-loss" : "text-muted-foreground"}>
                    {d.change > 0 ? "+" : ""}{d.change.toFixed(2)} ({d.result === "win" ? "W" : d.result === "loss" ? "L" : "D"})
                  </p>
                </div>
              );
            }}
          />
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            strokeOpacity={0.5}
            vertical={false}
          />
          <ReferenceLine
            y={startLevel}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            strokeOpacity={0.4}
          />
          <Area
            type="monotone"
            dataKey="level"
            fill="url(#levelGrad)"
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="level"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            dot={({ cx, cy, payload }: any) => {
              const entry = payload as ChartEntry;
              const color =
                entry.result === "win"
                  ? "hsl(var(--win))"
                  : entry.result === "loss"
                  ? "hsl(var(--loss))"
                  : "hsl(var(--muted-foreground))";
              return (
                <circle
                  key={`${cx}-${cy}`}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={color}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                />
              );
            }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--primary))", fill: "hsl(var(--card))" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-win" /> Win
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-loss" /> Loss
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground" /> Draw
        </span>
      </div>
    </div>
  );
};

export default RatingEvolutionChart;
