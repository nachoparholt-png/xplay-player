/**
 * XPLAY Terms of Service
 * ──────────────────────
 * Public route (/terms) — reachable signed-out (App Store review requires a
 * working EULA/terms link). Loyalty-programme aligned; no stakes/wagering.
 *
 * TODO before solicitor review / Gate C:
 *  - Replace COMPANY_NAME / COMPANY_DETAILS placeholders with the registered
 *    legal entity (name, company number, registered address).
 *  - Confirm CONTACT_EMAIL.
 */

import { ChevronLeft, ScrollText } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const TERMS_VERSION = "2026-06-11";

const COMPANY_NAME = "XPLAY"; // TODO: registered legal entity name
const CONTACT_EMAIL = "support@xplay.app"; // TODO: confirm support address

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. Who we are",
    body: [
      `These Terms of Service ("Terms") are an agreement between you and ${COMPANY_NAME} ("XPLAY", "we", "us"), a company based in the United Kingdom. They govern your use of the XPLAY player app, the XPLAY club tools and the XPLAY website (together, the "Service").`,
      "By creating an account or using the Service you agree to these Terms and to our Privacy Policy. If you do not agree, please do not use the Service.",
    ],
  },
  {
    title: "2. Eligibility — you must be 18 or over",
    body: [
      "The Service is for adults. You must be at least 18 years old to create an account. We ask for your date of birth at sign-up and may suspend accounts where we reasonably believe the holder is under 18.",
    ],
  },
  {
    title: "3. Your account",
    body: [
      "You agree to provide accurate information, keep your sign-in method secure, and maintain only one account. You are responsible for activity on your account. Tell us promptly if you believe your account has been compromised.",
    ],
  },
  {
    title: "4. The Service",
    body: [
      "XPLAY lets you create and join padel matches, enter tournaments, book courts at participating clubs, message other players, track a skill rating, earn XPLAY Points and redeem them for rewards. Clubs listed on XPLAY are independent businesses: the playing experience at a venue, court conditions and on-site services are the club's responsibility.",
    ],
  },
  {
    title: "5. XPLAY Points loyalty programme",
    body: [
      "XPLAY Points are a promotional loyalty reward, not money. The programme is governed by the XPLAY Points Programme Rules (available in the app), which form part of these Terms. In short: points have no cash value and cannot be sold, transferred or exchanged for cash; points are earned through activity and are never sold; every reward has a fixed points price — there are no chance-based mechanics; points expire 24 months after your most recent earning event; and we may adjust, revoke or expire points where necessary to protect the integrity of the programme (for example, in cases of fraud or abuse).",
      "The reward catalogue may change at any time, and rewards are subject to availability. A points price shown alongside a £ figure (e.g. \"100 pts = £1\") describes catalogue value only — it is not a currency rate.",
    ],
  },
  {
    title: "6. Bookings, purchases and payments",
    body: [
      "Court bookings, club products and other paid items are sold at the price shown at checkout (in GBP, including VAT where applicable). Card payments are processed by our payment provider (Stripe); we do not store your card details.",
      "Cancellation and refund treatment for bookings follows the policy of the club concerned, shown at the time of booking. Where you cancel a match registration within the permitted window, any XPLAY Points used in connection with that registration are returned to your balance.",
    ],
  },
  {
    title: "7. Redeeming rewards",
    body: [
      "Redemptions are confirmed in the app and may generate a collection code. Physical rewards are collected at the venue stated on the reward. Redeemed points are deducted at confirmation. If we cannot fulfil a redemption, we will re-credit your points in full.",
    ],
  },
  {
    title: "8. Community and fair play",
    body: [
      "You agree to: report scores honestly; not manipulate matches, ratings or the points programme; treat other players, club staff and our team with respect; and not use the Service for anything unlawful. We may remove content, correct scores and ratings, and suspend or close accounts involved in abuse, harassment, discrimination, cheating or fraud. Points obtained through manipulation may be forfeited.",
    ],
  },
  {
    title: "9. Your content",
    body: [
      "You keep ownership of content you post (such as your profile photo and messages). You grant us a non-exclusive, royalty-free licence to host and display that content within the Service so the app can work. Do not post content that is unlawful, infringing, abusive or that you don't have the right to share.",
    ],
  },
  {
    title: "10. Skill rating",
    body: [
      "Your XPLAY rating is calculated from match results to improve match quality. Ratings are estimates, may be recalculated or corrected by us at any time, and carry no monetary or contractual value.",
    ],
  },
  {
    title: "11. Playing sport is at your own risk",
    body: [
      "Padel is a physical sport. You are responsible for ensuring you are fit to play, using appropriate equipment, and following venue safety rules. To the extent permitted by law, XPLAY is not responsible for injuries or losses arising from the sport itself or from conditions at a venue, which remain the responsibility of the club concerned.",
    ],
  },
  {
    title: "12. Suspension and ending these Terms",
    body: [
      "You can stop using the Service and delete your account at any time from Profile → Settings. We may suspend or terminate accounts that break these Terms, with notice where reasonable. If your account is closed for fraud or serious abuse, unredeemed points are forfeited; otherwise we will give you a reasonable opportunity to redeem an outstanding balance before closure takes effect.",
    ],
  },
  {
    title: "13. Our liability",
    body: [
      "Nothing in these Terms excludes or limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot be excluded under UK law. Subject to that, we are not liable for losses that were not foreseeable when you accepted these Terms, losses not caused by our breach, or business losses. The Service is provided for personal, non-commercial use.",
      "Your statutory consumer rights are not affected by these Terms.",
    ],
  },
  {
    title: "14. Changes",
    body: [
      "We may update the Service and these Terms. For material changes we will give you notice in the app, and continued use after the effective date constitutes acceptance. The version date of these Terms is shown below.",
    ],
  },
  {
    title: "15. Governing law",
    body: [
      "These Terms are governed by the laws of England and Wales, and disputes may be brought in the courts of England and Wales. If you live elsewhere in the UK, you may also rely on the consumer protections and courts of your home nation.",
    ],
  },
  {
    title: "16. Contact",
    body: [
      `Questions about these Terms: ${CONTACT_EMAIL}.`,
    ],
  },
];

const Terms = () => {
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
          <ScrollText className="w-4 h-4 text-primary" />
          <h1 className="font-display text-base font-bold">Terms of Service</h1>
        </div>
      </div>

      {/* Hero */}
      <div className="px-5 pt-6 pb-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">XPLAY</div>
        <h2 className="font-display text-3xl font-black italic leading-[0.95] mb-3">
          The legal bit,
          <br />
          in plain English
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          These terms govern your XPLAY account, matches, tournaments, bookings and the XPLAY
          Points programme. The Programme Rules and Privacy Policy form part of these terms.
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
          <button onClick={() => navigate("/privacy")} className="text-primary underline">
            Privacy Policy
          </button>{" "}
          and the{" "}
          <button onClick={() => navigate("/programme-rules")} className="text-primary underline">
            XPLAY Points Programme Rules
          </button>
          .
        </p>
        <p className="mt-4 text-muted-foreground/50">
          XPLAY Terms of Service · UK · Version {TERMS_VERSION}
        </p>
      </div>
    </div>
  );
};

export default Terms;
