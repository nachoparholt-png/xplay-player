import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface CountdownTimerProps {
  deadlineAt: string;
  onExpired?: () => void;
}

const CountdownTimer = ({ deadlineAt, onExpired }: CountdownTimerProps) => {
  const [timeLeft, setTimeLeft] = useState("");
  const [expired, setExpired] = useState(false);
  const [urgency, setUrgency] = useState<"normal" | "warning" | "critical">("normal");

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const deadline = new Date(deadlineAt).getTime();
      const diff = deadline - now;

      if (diff <= 0) {
        setExpired(true);
        setTimeLeft("Expired");
        onExpired?.();
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(`${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);

      if (hours < 1) setUrgency("critical");
      else if (hours < 4) setUrgency("warning");
      else setUrgency("normal");
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadlineAt, onExpired]);

  const colorClass = expired
    ? "text-destructive"
    : urgency === "critical"
    ? "text-destructive"
    : urgency === "warning"
    ? "text-gold"
    : "text-muted-foreground";

  const bgClass = expired
    ? "bg-destructive/10 border-destructive/20"
    : urgency === "critical"
    ? "bg-destructive/10 border-destructive/20 animate-pulse"
    : urgency === "warning"
    ? "bg-gold/10 border-gold/20"
    : "bg-muted/50 border-border/50";

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${bgClass}`}>
      <Clock className={`w-4 h-4 ${colorClass}`} />
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {expired ? "Deadline passed" : "Time remaining"}
        </p>
        <p className={`font-mono font-bold text-sm ${colorClass}`}>{timeLeft}</p>
      </div>
    </div>
  );
};

export default CountdownTimer;
