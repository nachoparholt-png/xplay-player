/**
 * XPLAY Points Programme Rules
 * ─────────────────────────────
 * Public-facing rules page. Linked from Profile Settings and shown to new
 * users during onboarding. Covers the seven legal bright lines from the
 * design doc (XPLAY_Rewards_Program_Design.html §02).
 *
 * NOTE: This is plain-English programme rules — NOT the full Terms of Service.
 * A separate ToS document should also be updated to reflect the loyalty
 * programme (see XPLAY_Project_Status.md → 🔴 REMAINING).
 */

import { ChevronLeft, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const RULES: { title: string; body: string }[] = [
  {
    title: "1. Points have no cash value",
    body: "XPLAY Points are a promotional reward. They cannot be exchanged for cash, transferred to another person, sold or assigned. XPLAY may revoke, expire or adjust point balances at any time to maintain programme integrity.",
  },
  {
    title: "2. Points are earned, never bought",
    body: "You earn XPLAY Points only by participating: completing matches, daily check-ins, weekly streaks, tournament participation, profile completion and referring friends who play their first match. Points are not for sale.",
  },
  {
    title: "3. Rewards are deterministic — no chance",
    body: "Every reward in the XPLAY catalogue has a fixed point price. There are no mystery boxes, prize draws, spin-the-wheel mechanics, or lootboxes. What you see is what you redeem.",
  },
  {
    title: "4. Match-win bonuses are activity rewards",
    body: "Padel is a game of skill. Bonus points for winning a match are an activity reward for participation and performance — they are not prizes, winnings or payouts. Capped at 4 wins per week to keep things fair.",
  },
  {
    title: "5. No peer-to-peer transfers",
    body: "Players cannot send XPLAY Points to other players. Points are tied to your account and earned individually. Group rewards (e.g., everyone in a completed tournament) come from XPLAY directly.",
  },
  {
    title: "6. Points expire after 24 months",
    body: "To keep balances meaningful, XPLAY Points expire 24 months after the most recent earning event on your account. We will notify you well before any expiration occurs.",
  },
  {
    title: "7. UK programme",
    body: "This programme is operated under the UK Gambling Act 2005 exemption for promotional loyalty schemes (same legal basis as Tesco Clubcard, Boots Advantage and Nectar) and complies with VATA 1994 Schedule 10A multi-purpose voucher rules. We are based in the UK; prices and catalogue values are shown in GBP.",
  },
];

const ProgrammeRules = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border/30 px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h1 className="font-display text-base font-bold">Programme Rules</h1>
        </div>
      </div>

      {/* Hero */}
      <div className="px-5 pt-6 pb-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          XPLAY Points
        </div>
        <h2 className="font-display text-3xl font-black italic leading-[0.95] mb-3">
          100 pts = £1<br />of catalogue value
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          The XPLAY Points programme rewards you for playing, winning, attending tournaments
          and bringing friends into the community. Here's how it works — in plain English.
        </p>
      </div>

      {/* Rules */}
      <div className="px-5 space-y-4 mt-4">
        {RULES.map((rule) => (
          <div
            key={rule.title}
            className="bg-card border border-border/40 rounded-2xl p-4"
          >
            <h3 className="font-semibold text-sm mb-2">{rule.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {rule.body}
            </p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 mt-8 text-[11px] text-muted-foreground/70 leading-relaxed">
        <p className="mb-2">
          For the complete legal terms governing your XPLAY account, see the{" "}
          <button onClick={() => navigate("/terms")} className="text-primary underline">
            Terms of Service
          </button>{" "}
          and{" "}
          <button onClick={() => navigate("/privacy")} className="text-primary underline">
            Privacy Policy
          </button>
          .
        </p>
        <p>
          Questions? Contact support via the help link in Settings.
        </p>
        <p className="mt-4 text-muted-foreground/50">
          XPLAY Points programme · UK · Last updated 26 May 2026
        </p>
      </div>
    </div>
  );
};

export default ProgrammeRules;
