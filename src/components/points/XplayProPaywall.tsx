/**
 * XplayProPaywall
 * ───────────────
 * Bottom sheet pitching XPLAY Pro premium subscription. Triggered from the
 * Rewards page and the points balance area. Stripe wiring is deferred — until
 * XPLAY_PRO_ENABLED is flipped on, the CTA shows "Coming Soon" rather than
 * attempting checkout.
 *
 * Design follows the navy/lime palette and the 2× point multiplier story from
 * XPLAY_Rewards_Program_Design.html §05.
 */

import { Sparkles, Zap, TrendingUp, Crown, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useXplayPro } from "@/hooks/useXplayPro";
import { XPLAY_PRO_ENABLED } from "@/lib/featureFlags";
import { toast } from "sonner";

interface XplayProPaywallProps {
  open: boolean;
  onClose: () => void;
}

const BENEFITS = [
  { icon: TrendingUp, title: "2× XPLAY Points", desc: "On every action: matches, wins, streaks, referrals." },
  { icon: Crown,      title: "10% off court bookings", desc: "Save on every booking at XPLAY partner clubs." },
  { icon: Zap,        title: "Priority booking window", desc: "See the best slots 48 hours before everyone else." },
  { icon: Sparkles,   title: "1 free tournament entry / month", desc: "Enter any qualifying tournament — on us." },
  { icon: Check,      title: "Pro-only rewards", desc: "Exclusive merch and experiences in the rewards catalogue." },
];

const XplayProPaywall = ({ open, onClose }: XplayProPaywallProps) => {
  const pro = useXplayPro();

  const handleSubscribe = () => {
    if (XPLAY_PRO_ENABLED) {
      // Hook this up to the create-stripe-subscription edge function once it exists.
      toast.error("Subscription flow not yet wired. Coming soon.");
      return;
    }
    toast("XPLAY Pro is launching soon", {
      description: "Tap the bell on the rewards page and we'll let you know.",
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-50"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border/40 rounded-t-3xl max-h-[88vh] overflow-y-auto"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="px-5 pt-3 pb-6">
              {/* Hero */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary-foreground fill-primary-foreground" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Premium tier
                  </div>
                  <div className="font-display text-xl font-black italic">
                    XPLAY <span className="text-primary">Pro</span>
                  </div>
                </div>
              </div>

              <h2 className="font-display text-3xl font-black italic leading-[0.95] mb-2">
                Earn 2× faster.<br />Play better courts.
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                The XPLAY membership for players who take it seriously.
              </p>

              {/* Price card */}
              <div className="bg-card border border-border/40 rounded-2xl p-5 mb-5">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl font-black tabular-nums">£7.99</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Cancel anytime. No commitment.
                </div>
              </div>

              {/* Benefits */}
              <div className="space-y-3 mb-6">
                {BENEFITS.map((b) => (
                  <div key={b.title} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <b.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{b.title}</div>
                      <div className="text-xs text-muted-foreground">{b.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {pro.active ? (
                <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 text-center">
                  <Sparkles className="w-5 h-5 text-primary mx-auto mb-1 fill-primary" />
                  <div className="font-bold text-sm text-primary">You're already a Pro member</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Multiplier active · {pro.multiplier}× on every action
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleSubscribe}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-display font-black text-sm uppercase tracking-widest active:scale-[0.98] transition-transform"
                >
                  {XPLAY_PRO_ENABLED ? "Start XPLAY Pro" : "Notify me when it launches"}
                </button>
              )}

              {/* Legal disclosure */}
              <p className="text-[10px] text-muted-foreground/60 text-center mt-3 leading-relaxed">
                XPLAY Pro is a paid subscription. XPLAY Points earned through the Pro multiplier are
                a promotional reward only — they have no cash value. See Programme Rules for details.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default XplayProPaywall;
