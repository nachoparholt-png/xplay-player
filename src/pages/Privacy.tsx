/**
 * XPLAY Privacy Policy
 * ────────────────────
 * Public route (/privacy) — reachable signed-out (App Store review requires a
 * working privacy-policy URL; UK GDPR requires notice at point of collection).
 *
 * TODO before solicitor review / Gate C:
 *  - Replace COMPANY_NAME placeholder with the registered legal entity.
 *  - Confirm CONTACT_EMAIL (data-protection contact).
 */

import { ChevronLeft, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const PRIVACY_VERSION = "2026-06-11";

const COMPANY_NAME = "XPLAY"; // TODO: registered legal entity name
const CONTACT_EMAIL = "support@xplay.app"; // TODO: confirm data-protection address

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. Who is responsible for your data",
    body: [
      `${COMPANY_NAME} ("XPLAY", "we") is the data controller for personal data processed through the XPLAY player app, club tools and website. We are based in the United Kingdom and process data under UK GDPR and the Data Protection Act 2018.`,
      `Contact for privacy matters: ${CONTACT_EMAIL}.`,
    ],
  },
  {
    title: "2. What we collect",
    body: [
      "Account data — name, email address and profile photo (from Google sign-in or your email sign-in), and your date of birth (to verify you are 18 or over).",
      "Profile data — skill level, preferred court side, location text and preferred club, plus answers to the level quiz.",
      "Activity data — matches and tournaments you create or join, scores, your skill-rating history, XPLAY Points balance and transaction history, reward redemptions, bookings and orders.",
      "Messages — chats in match and tournament groups, and notifications we send you.",
      "Device data — push-notification tokens and basic diagnostic logs.",
      "Approximate location — only if you grant permission, to show matches near you. You can decline; the app works without it.",
      "Clipboard — only when you tap \"Paste from Playtomic\", we read your clipboard once, on your device, to pre-fill match details. Nothing is read in the background.",
      "Payments — handled by Stripe. We receive confirmation of payment and the last details needed for receipts; we never see or store your full card number.",
    ],
  },
  {
    title: "3. Why we use it (legal bases)",
    body: [
      "To provide the Service — accounts, matchmaking, tournaments, points, rewards, bookings and messaging (performance of our contract with you).",
      "To keep the platform fair and safe — fraud prevention, programme-integrity checks, enforcing our Terms (legitimate interests).",
      "To improve the Service — aggregate usage statistics and diagnostics (legitimate interests).",
      "With your consent — push notifications and location. You can withdraw consent at any time in your device settings.",
      "To meet legal obligations — tax and accounting records for payments.",
    ],
  },
  {
    title: "4. Who we share it with",
    body: [
      "Other players — your display name, photo, level and match participation are visible in the app as part of how the Service works. Your email, date of birth and transaction history are not shown to other players.",
      "Clubs you play at — participating clubs see the booking and check-in information needed to host you (name, level, booking details).",
      "Service providers — hosting and database (Supabase, hosted in the EU, eu-central-1), payments (Stripe), transactional email (Resend), sign-in (Google). Each acts under contract as our processor.",
      "We do not sell your personal data and we do not show third-party advertising.",
    ],
  },
  {
    title: "5. International transfers",
    body: [
      "Your data is hosted in the European Union. Where a provider processes data outside the UK/EEA, we rely on UK adequacy regulations or standard contractual clauses.",
    ],
  },
  {
    title: "6. How long we keep it",
    body: [
      "Account and profile data — for as long as you have an account, then deleted or anonymised within 30 days of account deletion.",
      "Points and payment transaction records — kept up to 6 years where required for tax, accounting and dispute purposes.",
      "Messages — kept while the related match/tournament chat is active; expired chats are cleaned up automatically.",
    ],
  },
  {
    title: "7. Your rights",
    body: [
      "You have the right to access, correct, delete and port your data, to object to or restrict certain processing, and to withdraw consent. To exercise any right, contact us or use the in-app account deletion option in Profile → Settings.",
      "You also have the right to complain to the Information Commissioner's Office (ico.org.uk) if you are unhappy with how we handle your data.",
    ],
  },
  {
    title: "8. No under-18s",
    body: [
      "XPLAY is for adults aged 18 and over. We do not knowingly process children's data; if we learn an account holder is under 18 we will close the account and delete the data.",
    ],
  },
  {
    title: "9. Security",
    body: [
      "Data is encrypted in transit, access is restricted by row-level security in our database, and privileged operations require authenticated, role-checked access. No system is perfectly secure, but we review our security posture regularly.",
    ],
  },
  {
    title: "10. Changes to this policy",
    body: [
      "We will notify you in the app of material changes to this policy. The version date is shown below.",
    ],
  },
];

const Privacy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border/30 px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h1 className="font-display text-base font-bold">Privacy Policy</h1>
        </div>
      </div>

      {/* Hero */}
      <div className="px-5 pt-6 pb-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">XPLAY</div>
        <h2 className="font-display text-3xl font-black italic leading-[0.95] mb-3">
          Your data,
          <br />
          explained simply
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          What we collect, why, who sees it and the rights you have over it — under UK GDPR.
        </p>
      </div>

      {/* Sections */}
      <div className="px-5 space-y-4 mt-4">
        {SECTIONS.map((s) => (
          <div key={s.title} className="bg-card border border-border/40 rounded-2xl p-4">
            <h3 className="font-semibold text-sm mb-2">{s.title}</h3>
            {s.body.map((p, i) => (
              <p key={i} className="text-xs text-muted-foreground leading-relaxed mb-2 last:mb-0">
                {p}
              </p>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 mt-8 text-[11px] text-muted-foreground/70 leading-relaxed">
        <p>
          See also the{" "}
          <button onClick={() => navigate("/terms")} className="text-primary underline">
            Terms of Service
          </button>{" "}
          and the{" "}
          <button onClick={() => navigate("/programme-rules")} className="text-primary underline">
            XPLAY Points Programme Rules
          </button>
          .
        </p>
        <p className="mt-4 text-muted-foreground/50">
          XPLAY Privacy Policy · UK · Version {PRIVACY_VERSION}
        </p>
      </div>
    </div>
  );
};

export default Privacy;
