import { motion } from "framer-motion";
import { Upload, CheckCircle, AlertTriangle, Clock, Equal } from "lucide-react";
import { format } from "date-fns";

type TimelineEvent = {
  id: string;
  type: "submission" | "review_validated" | "review_requested" | "auto_closed" | "draw_confirmed";
  actor_name: string | null;
  note: string | null;
  created_at: string;
  score_summary?: string;
};

interface MatchResultTimelineProps {
  events: TimelineEvent[];
}

const getEventConfig = (type: string) => {
  switch (type) {
    case "submission":
      return { icon: <Upload className="w-3.5 h-3.5" />, color: "text-primary", bg: "bg-primary/20", label: "Score submitted" };
    case "review_validated":
      return { icon: <CheckCircle className="w-3.5 h-3.5" />, color: "text-win", bg: "bg-win/20", label: "Score validated" };
    case "review_requested":
      return { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-gold", bg: "bg-gold/20", label: "Review requested" };
    case "auto_closed":
      return { icon: <Clock className="w-3.5 h-3.5" />, color: "text-muted-foreground", bg: "bg-muted", label: "Auto-closed as draw" };
    case "draw_confirmed":
      return { icon: <Equal className="w-3.5 h-3.5" />, color: "text-gold", bg: "bg-gold/20", label: "Draw confirmed" };
    default:
      return { icon: <Clock className="w-3.5 h-3.5" />, color: "text-muted-foreground", bg: "bg-muted", label: type };
  }
};

const MatchResultTimeline = ({ events }: MatchResultTimelineProps) => {
  if (events.length === 0) return null;

  return (
    <div>
      <h3 className="font-display font-bold mb-3 text-sm">Resolution Timeline</h3>
      <div className="space-y-0">
        {events.map((event, i) => {
          const config = getEventConfig(event.type);
          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex gap-3 relative"
            >
              {/* Line */}
              {i < events.length - 1 && (
                <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />
              )}

              {/* Icon */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${config.bg} ${config.color}`}>
                {config.icon}
              </div>

              {/* Content */}
              <div className="pb-4 flex-1">
                <p className="text-sm font-semibold">{config.label}</p>
                <p className="text-xs text-muted-foreground">
                  {event.actor_name && <span>{event.actor_name} • </span>}
                  {format(new Date(event.created_at), "MMM d, HH:mm")}
                </p>
                {event.note && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{event.note}</p>
                )}
                {event.score_summary && (
                  <p className="text-xs font-mono font-semibold mt-1">{event.score_summary}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default MatchResultTimeline;
