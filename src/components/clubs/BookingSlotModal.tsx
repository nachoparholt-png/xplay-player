import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Lock, Globe, Clock, MapPin, ArrowLeft, Sparkles, WifiOff, RefreshCw, Medal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface BookingSlot {
  courtName: string;
  courtType: string;
  date: string;
  time: string;
  duration: string;
  priceCents: number;
  memberDiscountPct: number;
  pricingWindowName: string | null;
  currencySymbol?: string;
  /** Membership tier name of the current user at this club, e.g. "Silver", "Gold" */
  memberTierName?: string | null;
}

interface BookingSlotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: BookingSlot | null;
  onConfirm?: (matchType: "private" | "public") => void;
  loading?: boolean;
  /** True when the last booking attempt failed due to a network error. */
  networkError?: boolean;
  /** Current device connectivity — used to label the retry button. */
  isOnline?: boolean;
}

const tierBadgeStyle = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("platinum")) return "bg-purple-500/15 text-purple-400 border-purple-500/30";
  if (n.includes("gold"))     return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (n.includes("silver"))   return "bg-slate-400/15 text-slate-300 border-slate-400/30";
  return "bg-primary/15 text-primary border-primary/30";
};

const BookingSlotModal = ({ open, onOpenChange, slot, onConfirm, loading, networkError = false, isOnline = true }: BookingSlotModalProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [matchType, setMatchType] = useState<"private" | "public" | null>(null);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1);
      setMatchType(null);
    }, 200);
  };

  if (!slot) return null;

  const curr = slot.currencySymbol ?? '£';
  const basePrice = slot.priceCents / 100;
  const discount = slot.memberDiscountPct > 0 ? basePrice * (slot.memberDiscountPct / 100) : 0;
  const finalPrice = basePrice - discount;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="p-6"
            >
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Choose Match Type</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {slot.courtName} · {slot.date} · {slot.time}
                </p>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 mt-6">
                <button
                  onClick={() => setMatchType("private")}
                  className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                    matchType === "private"
                      ? "border-destructive bg-destructive/10"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-destructive" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm">Private</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Only you & invited players
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setMatchType("public")}
                  className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                    matchType === "public"
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Globe className="w-6 h-6 text-amber-500" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm">Public</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Open for community to join
                    </p>
                  </div>
                </button>
              </div>

              <Button
                className={`w-full mt-6 transition-opacity ${!matchType ? "opacity-50 cursor-not-allowed" : ""}`}
                onClick={() => {
                  if (!matchType) {
                    toast.error("Please select Private or Public to continue");
                    return;
                  }
                  setStep(2);
                }}
              >
                Continue
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="p-6"
            >
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <DialogTitle className="font-display text-xl">Booking Summary</DialogTitle>
                </div>
              </DialogHeader>

              <div className="mt-5 rounded-xl border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{slot.courtName}</span>
                  <Badge variant="outline" className="text-[10px]">{slot.courtType}</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>{slot.date} · {slot.time} · {slot.duration}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {matchType === "private" ? (
                    <Badge className="bg-destructive/20 text-destructive border-0 text-xs">
                      <Lock className="w-3 h-3 mr-1" /> Private
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/20 text-amber-500 border-0 text-xs">
                      <Globe className="w-3 h-3 mr-1" /> Public
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Court rental
                    {slot.pricingWindowName && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-400">
                        ({slot.pricingWindowName})
                      </span>
                    )}
                  </span>
                  <span>{curr}{basePrice.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-500">
                    <span>Member discount ({slot.memberDiscountPct}%)</span>
                    <span>-{curr}{discount.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{curr}{finalPrice.toFixed(2)}</span>
                </div>
              </div>

              {/* Membership tier badge — shown when user has an active discount */}
              {discount > 0 && slot.memberTierName && (
                <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium ${tierBadgeStyle(slot.memberTierName)}`}>
                  <Medal className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{slot.memberTierName} Member discount applied</span>
                </div>
              )}

              {/* Upgrade prompt — shown when no membership discount on a paid slot */}
              {slot.memberDiscountPct === 0 && basePrice > 0 && (
                <div className="mt-4 bg-primary/10 border border-primary/20 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-sm font-semibold text-primary">Save with a membership</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Club members get discounts on every court booking and coaching session. Join to start saving today.
                  </p>
                </div>
              )}

              {networkError ? (
                <Button
                  className="w-full mt-6 gap-2"
                  variant={isOnline ? "default" : "outline"}
                  disabled={loading || !isOnline}
                  onClick={() => { if (matchType) onConfirm?.(matchType); }}
                >
                  {loading ? (
                    "Processing…"
                  ) : isOnline ? (
                    <><RefreshCw className="w-4 h-4" /> Retry Payment</>
                  ) : (
                    <><WifiOff className="w-4 h-4" /> No Connection</>
                  )}
                </Button>
              ) : (
                <Button className="w-full mt-6" disabled={loading} onClick={() => { if (matchType) onConfirm?.(matchType); }}>
                  {loading ? "Processing…" : "Continue to Payment"}
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default BookingSlotModal;
