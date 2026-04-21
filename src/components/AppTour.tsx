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
          className="fixed inset-0 z-[100] flex flex-col"
          style={{ backgroundColor: "#0A0A0A" }}
        >
          {/* Top bar — XPLAY wordmark */}
          <div className="flex items-center justify-between px-5 pt-14 pb-2">
            <span
              className="text-white font-black text-xl tracking-widest uppercase"
              style={{ fontFamily: "system-ui, sans-serif", letterSpacing: "0.15em" }}
            >
              XPLAY
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col justify-center px-6">
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.05 }}
              className="w-full max-w-sm mx-auto space-y-6"
            >
              {/* Trophy + headline */}
              <div className="text-center space-y-3">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.15 }}
                  className="text-6xl"
                >
                  🏆
                </motion.div>
                <h2
                  className="font-black uppercase leading-none"
                  style={{ fontSize: 32, color: "#C8F135", letterSpacing: "-0.02em" }}
                >
                  YOUR FIRST WEEK
                </h2>
                <p className="text-sm" style={{ color: "#888" }}>
                  Complete these three missions to earn bonus XP
                </p>
              </div>

              {/* Mission rows */}
              <div className="space-y-3">
                {CHECKLIST_ITEMS.map((item, idx) => {
                  const done = item.flag
                    ? (profile as any)?.[item.flag] === true
                    : false;
                  return (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + idx * 0.07 }}
                      className="flex items-center justify-between rounded-2xl border px-4 py-3.5"
                      style={{
                        backgroundColor: done ? "rgba(200,241,53,0.08)" : "rgba(255,255,255,0.05)",
                        borderColor: done ? "rgba(200,241,53,0.35)" : "rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: done ? "#C8F135" : "transparent",
                            border: done ? "none" : "2px solid rgba(255,255,255,0.2)",
                          }}
                        >
                          {done && <Check className="w-4 h-4" style={{ color: "#0A0A0A" }} />}
                        </div>
                        <span
                          className="text-sm font-semibold"
                          style={{ color: done ? "#C8F135" : "#fff" }}
                        >
                          {item.label}
                        </span>
                      </div>
                      <div
                        className="flex items-center gap-1 text-xs font-black rounded-full px-2.5 py-1"
                        style={{ backgroundColor: "rgba(200,241,53,0.15)", color: "#C8F135" }}
                      >
                        <Zap className="w-3 h-3" />
                        +{item.xp} XP
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Reward banner */}
              <div
                className="rounded-2xl px-4 py-3.5 flex items-center justify-between"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-wider" style={{ color: "#888" }}>
                    Finish all three
                  </p>
                  <p className="text-[10px]" style={{ color: "#555" }}>
                    Bonus progression pack
                  </p>
                </div>
                <div className="flex items-center gap-1.5 font-black" style={{ color: "#C8F135" }}>
                  <Zap className="w-4 h-4" />
                  <span className="text-lg">+75 XP</span>
                  <span className="text-xs" style={{ color: "#888" }}>total</span>
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={next}
                className="w-full h-13 rounded-2xl font-black uppercase tracking-wider text-sm flex items-center justify-center gap-2"
                style={{
                  height: 52,
                  backgroundColor: "#C8F135",
                  color: "#0A0A0A",
                  fontSize: 14,
                  letterSpacing: "0.08em",
                }}
              >
                GOT IT
              </button>
            </motion.div>
          </div>

          {/* Safe area bottom padding */}
          <div style={{ paddingBottom: "env(safe-area-inset-bottom, 24px)" }} />
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
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 text-center"
          style={{ backgroundColor: "#0A0A0A" }}
        >
          {/* Glow radial behind rocket */}
          <div
            className="absolute"
            style={{
              top: "25%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 280,
              height: 280,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(200,241,53,0.18) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* Rocket */}
          <motion.div
            initial={{ scale: 0, rotate: -30, y: 40 }}
            animate={{ scale: 1, rotate: 0, y: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 14, delay: 0.1 }}
            className="text-8xl mb-6 relative z-10"
          >
            🚀
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="space-y-4 w-full max-w-xs relative z-10"
          >
            <h2
              className="font-black uppercase leading-none"
              style={{ fontSize: 42, color: "#fff", letterSpacing: "-0.03em" }}
            >
              YOU'RE<br />READY.
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "#888" }}>
              50 XP is already in your account. Now go play.
            </p>

            {/* XP badge */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.55, type: "spring", stiffness: 300, damping: 18 }}
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 mx-auto"
              style={{
                backgroundColor: "rgba(200,241,53,0.12)",
                border: "1px solid rgba(200,241,53,0.35)",
              }}
            >
              <Zap className="w-5 h-5" style={{ color: "#C8F135" }} />
              <span
                className="font-black"
                style={{ fontSize: 28, color: "#C8F135", lineHeight: 1 }}
              >
                50 XP
              </span>
            </motion.div>

            {/* CTA */}
            <motion.button
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
              onClick={next}
              className="w-full rounded-2xl font-black uppercase tracking-wider flex items-center justify-center gap-2"
              style={{
                marginTop: 12,
                height: 56,
                backgroundColor: "#C8F135",
                color: "#0A0A0A",
                fontSize: 15,
                letterSpacing: "0.1em",
              }}
            >
              LET'S PLAY
            </motion.button>
          </motion.div>

          <div style={{ paddingBottom: "env(safe-area-inset-bottom, 24px)" }} />
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
