import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Zap, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour, REGULAR_STOPS } from "@/contexts/TourContext";
import { useAuth } from "@/contexts/AuthContext";

// ── Checklist definition ─────────────────────────────────────────────────────

const CHECKLIST_ITEMS = [
  {
    label: "Complete your profile",
    xp: 20,
    flag: "profile_completed_bonus_granted",
  },
  {
    label: "Join your first match",
    xp: 30,
    flag: "first_match_bonus_granted",
  },
  {
    label: "Invite a friend",
    xp: 25,
    flag: null, // visual-only for now
  },
];

// ── Main component ───────────────────────────────────────────────────────────

const AppTour = () => {
  const { isActive, currentStop, currentIndex, next, skip } = useTour();
  const { profile } = useAuth();

  if (!isActive || !currentStop) return null;

  // ── Full-screen: Checklist ───────────────────────────────────────────────

  if (currentStop.isChecklist) {
    return (
      <AnimatePresence>
        <motion.div
          key="tour-checklist"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-background/97 backdrop-blur-sm flex flex-col items-center justify-center px-6"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.05 }}
            className="w-full max-w-sm space-y-5"
          >
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="text-5xl mb-3">🏆</div>
              <h2 className="font-display text-2xl font-black uppercase tracking-tight">
                Your First Week
              </h2>
              <p className="text-sm text-muted-foreground">
                Complete these three missions to earn bonus XP
              </p>
            </div>

            {/* Tasks */}
            <div className="space-y-3">
              {CHECKLIST_ITEMS.map((item) => {
                const done = item.flag
                  ? (profile as any)?.[item.flag] === true
                  : false;
                return (
                  <div
                    key={item.label}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-colors ${
                      done
                        ? "bg-primary/10 border-primary/30"
                        : "bg-surface-container border-border/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                          done ? "bg-primary" : "border-2 border-border/50"
                        }`}
                      >
                        {done && <Check className="w-4 h-4 text-primary-foreground" />}
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          done ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-bold text-primary">
                      <Zap className="w-3 h-3" />+{item.xp} XP
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total */}
            <div className="bg-surface-container rounded-2xl p-3.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">
                Finish all three
              </span>
              <div className="flex items-center gap-1 text-sm font-black text-primary">
                <Zap className="w-3.5 h-3.5" />
                +75 XP total
              </div>
            </div>

            <Button
              onClick={next}
              className="w-full h-12 font-display font-black uppercase tracking-wider text-sm gap-2"
            >
              Got it
              <ChevronRight className="w-4 h-4" />
            </Button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Full-screen: Tour complete ────────────────────────────────────────────

  if (currentStop.isComplete) {
    return (
      <AnimatePresence>
        <motion.div
          key="tour-complete"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center px-6 text-center"
        >
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
            className="text-7xl mb-6"
          >
            🚀
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-4 w-full max-w-xs"
          >
            <h2 className="font-display text-3xl font-black uppercase tracking-tight">
              You're Ready!
            </h2>
            <p className="text-muted-foreground text-sm">
              50 XP is already in your pocket. Go find a match and get on the
              court.
            </p>

            <div className="bg-primary/10 border border-primary/30 rounded-2xl px-6 py-3 inline-flex items-center gap-2 mx-auto">
              <Zap className="w-5 h-5 text-primary" />
              <span className="font-display text-3xl font-black text-primary tracking-tight">
                50 XP
              </span>
              <span className="text-sm text-muted-foreground">ready</span>
            </div>

            <Button
              onClick={next}
              className="w-full h-12 font-display font-black uppercase tracking-wider text-sm gap-2 mt-4"
            >
              Let's Play
              <ChevronRight className="w-4 h-4" />
            </Button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Bottom-sheet tooltip (regular stops 0–6) ─────────────────────────────

  const isLastRegularStop = currentIndex === REGULAR_STOPS.length - 1;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`tour-stop-${currentIndex}`}
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="fixed left-4 right-4 z-[100] bg-card border border-white/8 rounded-3xl shadow-2xl shadow-black/40 p-5"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 90px)" }}
      >
        {/* Progress dots + close */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1.5 items-center">
            {REGULAR_STOPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "w-5 bg-primary"
                    : i < currentIndex
                    ? "w-2 bg-primary/40"
                    : "w-2 bg-border"
                }`}
              />
            ))}
          </div>
          <button
            onClick={skip}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stop content */}
        <div className="flex items-start gap-3 mb-5">
          <div className="text-2xl flex-shrink-0 mt-0.5">{currentStop.icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-black text-base uppercase tracking-tight leading-tight mb-1.5">
              {currentStop.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {currentStop.body}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={skip}
            className="text-muted-foreground text-xs font-semibold hover:text-foreground transition-colors"
          >
            Skip tour
          </button>
          <div className="flex-1" />
          <Button
            onClick={next}
            size="sm"
            className="h-9 px-5 font-display font-black uppercase tracking-wider text-xs gap-1.5"
          >
            {isLastRegularStop ? "Almost done" : "Next"}
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AppTour;
