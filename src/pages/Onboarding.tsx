import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Sparkles, Trophy, MessageSquare, Zap, Gift, Check, BarChart3, Globe } from "lucide-react";
import { IconMatches } from "@/components/icons/XPlayIcons";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
// Single source of truth for the ToS version — stamped onto profiles at acceptance.
import { TERMS_VERSION } from "@/pages/Terms";

/* ── Quiz Data ── */

const QUESTIONS = [
  {
    id: "experience",
    question: "How long have you been playing padel?",
    options: [
      { label: "I've never played before", value: 0 },
      { label: "I just started playing", value: 1 },
      { label: "I play occasionally", value: 2 },
      { label: "I play regularly", value: 3 },
      { label: "I compete in tournaments", value: 4 },
    ],
  },
  {
    id: "skill",
    question: "How would you describe your level?",
    options: [
      { label: "Beginner", value: 0 },
      { label: "Beginner–Intermediate", value: 1 },
      { label: "Intermediate", value: 2 },
      { label: "Advanced", value: 3 },
      { label: "Competitive player", value: 4 },
    ],
  },
  {
    id: "frequency",
    question: "How often do you play matches?",
    options: [
      { label: "Rarely", value: 0 },
      { label: "Once a month", value: 1 },
      { label: "Once a week", value: 2 },
      { label: "Several times a week", value: 3 },
      { label: "Almost every day", value: 4 },
    ],
  },
];

function mapExternalToXPlayLevel(externalLevel: number): number {
  // External platforms typically use a 0–10 scale; XPLAY uses 0.5–7.0
  const clamped = Math.max(0, Math.min(10, externalLevel));
  const mapped = (clamped / 10) * 7;
  return Math.max(0.5, Math.min(7.0, Math.round(mapped * 2) / 2));
}

function calculateRecommendedLevel(answers: Record<string, number>): number {
  const total = Object.values(answers).reduce((s, v) => s + v, 0);
  // total ranges 0–12, map to 0.5–6.0
  if (total <= 2) return 1.0;
  if (total <= 4) return 2.0;
  if (total <= 6) return 3.0;
  if (total <= 8) return 3.5;
  if (total <= 10) return 4.5;
  return 5.5;
}

/* ── Step Components ── */

const slideVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

/* ── Age gate + terms acceptance (WS2 — design ref: handoff O1) ── */

/** Age (in whole years) from an ISO date string or Date, UTC-based. */
function ageFromDob(dob: Date | string): number {
  const d = typeof dob === "string" ? new Date(dob) : dob;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - d.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

/** Persistent under-18 block screen. Offers sign-out so the user isn't stuck. */
function UnderageBlock({ onSignOut }: { onSignOut: () => void }) {
  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" className="flex flex-col items-center text-center px-6 py-12 min-h-[80vh] justify-center">
      <div className="w-20 h-20 rounded-3xl bg-destructive/15 flex items-center justify-center mb-8">
        <Sparkles className="w-10 h-10 text-destructive" />
      </div>
      <h1 className="font-display text-[28px] font-black italic uppercase text-foreground mb-4 leading-[0.95]">
        See you<br />in a few years
      </h1>
      <p className="text-[12px] text-muted-foreground leading-[1.6] max-w-xs mb-10">
        XPLAY is for players aged 18 and over, so we can't set up your account today. Thanks
        for your interest — we'd love to see you on court when you're 18.
      </p>
      <Button variant="outline" onClick={onSignOut} className="h-11 rounded-xl font-bold text-sm px-8">
        Sign out
      </Button>
    </motion.div>
  );
}

function AgeTermsStep({
  onContinue,
  onUnderage,
  saving,
}: {
  onContinue: (dobISO: string) => void;
  onUnderage: (dobISO: string) => void;
  saving: boolean;
}) {
  const [dd, setDd] = useState("");
  const [mm, setMm] = useState("");
  const [yyyy, setYyyy] = useState("");
  const [confirm18, setConfirm18] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseDob = (): Date | null => {
    const d = parseInt(dd, 10);
    const m = parseInt(mm, 10);
    const y = parseInt(yyyy, 10);
    if (!d || !m || !y || yyyy.length !== 4 || y < 1900) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    if (date > new Date()) return null;
    return date;
  };

  const handleContinue = () => {
    setError(null);
    const dob = parseDob();
    if (!dob) {
      setError("Please enter a valid date of birth.");
      return;
    }
    const dobISO = dob.toISOString().slice(0, 10);
    if (ageFromDob(dob) < 18) {
      // Persist the failed DOB so a page reload can't bypass the gate.
      onUnderage(dobISO);
      return;
    }
    onContinue(dobISO);
  };

  const canContinue = dd && mm && yyyy && confirm18 && acceptTerms && !saving;

  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" className="flex flex-col px-6 py-12 min-h-[80vh] justify-center max-w-md mx-auto w-full">
      <h1 className="font-display text-[32px] font-black italic uppercase text-foreground mb-2 leading-[0.95]">
        First, the<br /><span className="text-primary">important bit</span>
      </h1>
      <p className="text-[12px] text-muted-foreground leading-[1.6] mb-8">
        XPLAY is for players aged 18 and over.
      </p>

      {/* DOB */}
      <div className="bg-card border border-border/40 rounded-2xl p-4 mb-4">
        <div className="text-[11px] font-display font-black uppercase tracking-[0.12em] text-primary mb-3">
          Date of birth
        </div>
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            placeholder="DD"
            value={dd}
            onChange={(e) => setDd(e.target.value.replace(/\D/g, ""))}
            className="flex-1 min-w-0 bg-background border border-border rounded-xl py-3 text-center font-mono font-bold text-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary"
            aria-label="Day of birth"
          />
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            placeholder="MM"
            value={mm}
            onChange={(e) => setMm(e.target.value.replace(/\D/g, ""))}
            className="flex-1 min-w-0 bg-background border border-border rounded-xl py-3 text-center font-mono font-bold text-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary"
            aria-label="Month of birth"
          />
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="YYYY"
            value={yyyy}
            onChange={(e) => setYyyy(e.target.value.replace(/\D/g, ""))}
            className="flex-[1.4] min-w-0 bg-background border border-border rounded-xl py-3 text-center font-mono font-bold text-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary"
            aria-label="Year of birth"
          />
        </div>

        <button
          type="button"
          onClick={() => setConfirm18(!confirm18)}
          className="flex items-center gap-2.5 mt-4 text-left"
        >
          <span className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0 transition-colors ${confirm18 ? "bg-primary" : "border border-border bg-background"}`}>
            {confirm18 && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3.5} />}
          </span>
          <span className="text-[12.5px] text-foreground/85">
            I confirm I'm <b>18 or over</b>
          </span>
        </button>
      </div>

      {/* Terms */}
      <button
        type="button"
        onClick={() => setAcceptTerms(!acceptTerms)}
        className="flex items-start gap-2.5 text-left mb-6"
      >
        <span className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0 mt-0.5 transition-colors ${acceptTerms ? "bg-primary" : "border border-border bg-background"}`}>
          {acceptTerms && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3.5} />}
        </span>
        <span className="text-[12px] text-muted-foreground leading-[1.5]">
          I agree to the{" "}
          <a href="/terms" target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary underline">
            Privacy Policy
          </a>
          .
        </span>
      </button>

      {error && <p className="text-xs text-destructive mb-4">{error}</p>}

      <Button onClick={handleContinue} disabled={!canContinue} className="w-full h-12 rounded-xl font-bold text-base gap-2">
        {saving ? "Saving…" : "Continue"} {!saving && <ChevronRight className="w-4 h-4" />}
      </Button>
    </motion.div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" className="flex flex-col items-center text-center px-6 py-12 min-h-[80vh] justify-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
        className="w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center mb-8"
      >
        <Sparkles className="w-10 h-10 text-primary" />
      </motion.div>

      <h1 className="font-display text-[32px] font-black italic uppercase text-foreground mb-4 leading-[0.95]">
        Welcome to<br />XPLAY
      </h1>

      <p className="text-[12px] text-muted-foreground leading-[1.6] max-w-xs mb-3">
        XPLAY is a community where players create matches, join games, chat with other players, and earn XPLAY Points they can redeem for rewards.
      </p>

      <p className="text-[11px] text-muted-foreground/60 mb-10">
        This takes less than 30 seconds.
      </p>

      <Button onClick={onNext} className="w-full max-w-xs h-12 rounded-xl font-bold text-base gap-2">
        Start Setup <ChevronRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}

function QuizStep({
  questionIndex,
  onAnswer,
  selectedAnswer,
  onBack,
  onSkip,
}: {
  questionIndex: number;
  onAnswer: (value: number) => void;
  selectedAnswer: number | null;
  onBack: () => void;
  onSkip: () => void;
}) {
  const q = QUESTIONS[questionIndex];
  const letters = ["A", "B", "C", "D", "E"];

  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" key={`q-${questionIndex}`} className="px-6 py-8 min-h-[80vh] flex flex-col">
      {/* STEP INDICATOR */}
      <div className="flex items-end justify-between mb-10">
        <div className="flex items-baseline gap-1">
          <div className="font-display text-[40px] font-black italic text-primary leading-[0.9]">
            {questionIndex + 1}
          </div>
          <div className="text-[18px] font-bold text-muted-foreground/35 font-display leading-[0.9]">
            / 0{QUESTIONS.length}
          </div>
        </div>
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">
          Level Check
        </div>
      </div>

      {/* QUESTION DISPLAY */}
      <h2 className="font-display text-[28px] font-black italic uppercase text-foreground leading-[0.95] tracking-[-0.02em] mb-[10px]">
        {q.question}
      </h2>


      {/* ANSWER OPTIONS - A/B/C/D/E lettered */}
      <div className="flex-1 space-y-2">
        {q.options.map((opt, idx) => {
          const isSelected = selectedAnswer === opt.value;
          const letter = letters[idx];
          return (
            <motion.button
              key={opt.value}
              whileTap={{ scale: 0.97 }}
              onClick={() => onAnswer(opt.value)}
              className={`w-full text-left p-[14px_16px] rounded-[16px] mb-2 flex items-center gap-3 border transition-all duration-200 ${
                isSelected
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-card/40 text-foreground border-border/[0.07]"
              }`}
            >
              <div className={`font-display text-[18px] font-black italic opacity-35 w-[22px] flex-shrink-0 ${
                isSelected ? "opacity-100 text-primary-foreground" : ""
              }`}>
                {letter}
              </div>
              <span className="text-[14px] font-bold flex-1">
                {opt.label}
              </span>
              {isSelected && (
                <div className="text-[14px] font-black flex-shrink-0">✓</div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* BOTTOM NAV */}
      <div className="flex items-center gap-4 mt-8 justify-between">
        <button
          onClick={onBack}
          className="text-[11px] text-muted-foreground/45 font-semibold active:scale-95 transition-transform"
        >
          ← Back
        </button>
        <button
          onClick={onSkip}
          className="text-[11px] text-muted-foreground/45 font-semibold active:scale-95 transition-transform"
        >
          Skip for now
        </button>
      </div>
    </motion.div>
  );
}

function LevelStep({
  recommendedLevel,
  selectedLevel,
  onLevelChange,
  onAccept,
  levelSource,
}: {
  recommendedLevel: number;
  selectedLevel: number;
  onLevelChange: (level: number) => void;
  onAccept: () => void;
  levelSource: "quiz" | "external";
}) {
  const levelLabel = (l: number) => {
    if (l <= 1.5) return "Beginner";
    if (l <= 2.5) return "Beginner–Intermediate";
    if (l <= 3.5) return "Intermediate";
    if (l <= 4.5) return "Advanced";
    if (l <= 5.5) return "Competitive";
    return "Professional";
  };

  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" className="px-6 py-8 min-h-[80vh] flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mb-6">
        <BarChart3 className="w-8 h-8 text-primary" />
      </div>

      <h2 className="font-display text-[28px] font-black italic uppercase text-foreground mb-3 text-center leading-[0.95]">
        Recommended Level
      </h2>

      <p className="text-[12px] text-muted-foreground text-center mb-8 max-w-xs leading-[1.5]">
        {levelSource === "external"
          ? "Based on your ranking on other platforms, we suggest starting at:"
          : "Based on your answers, we recommend starting at:"}
      </p>

      {/* Level display */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="w-32 h-32 rounded-full border-4 border-primary bg-primary/10 flex flex-col items-center justify-center mb-2"
      >
        <span className="font-display text-4xl font-bold text-primary">{selectedLevel.toFixed(1)}</span>
        <span className="text-[10px] font-bold text-primary/70 uppercase tracking-wider">{levelLabel(selectedLevel)}</span>
      </motion.div>

      {selectedLevel !== recommendedLevel && (
        <p className="text-[10px] text-muted-foreground mb-4">
          Suggested: {recommendedLevel.toFixed(1)}
        </p>
      )}

      {/* Slider */}
      <div className="w-full max-w-xs mb-6 mt-4">
        <Slider
          value={[selectedLevel]}
          onValueChange={([v]) => onLevelChange(Math.round(v * 2) / 2)}
          min={0.5}
          max={7}
          step={0.5}
          className="w-full"
        />
        <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground font-medium">
          <span>0.5</span>
          <span>3.5</span>
          <span>7.0</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60 text-center mb-8 max-w-xs">
        You can always update your level later as you play more matches.
      </p>

      <Button onClick={onAccept} className="w-full max-w-xs h-12 rounded-xl font-bold text-base gap-2">
        Accept Level <ChevronRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}

function CourtSideStep({
  selectedSide,
  onSelect,
  onNext,
}: {
  selectedSide: string;
  onSelect: (side: string) => void;
  onNext: () => void;
}) {
  const sides = [
    { value: "left", label: "Left Side", desc: "You prefer the left side of the court" },
    { value: "right", label: "Right Side", desc: "You prefer the right side of the court" },
    { value: "both", label: "Both Sides", desc: "You're comfortable on either side" },
  ];

  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" className="px-6 py-8 min-h-[80vh] flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mb-6">
        <Trophy className="w-8 h-8 text-primary" />
      </div>

      <h2 className="font-display text-[28px] font-black italic uppercase text-foreground mb-3 text-center leading-[0.95]">
        Preferred Court Side
      </h2>

      <p className="text-[12px] text-muted-foreground text-center mb-8 max-w-xs leading-[1.5]">
        Which side of the court do you usually play on?
      </p>

      <div className="w-full max-w-xs space-y-2 mb-8">
        {sides.map((s) => {
          const isSelected = selectedSide === s.value;
          return (
            <motion.button
              key={s.value}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(s.value)}
              className={`w-full text-left p-[14px_16px] rounded-[16px] border transition-all duration-200 flex items-center gap-3 ${
                isSelected
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-card/40 text-foreground border-border/[0.07]"
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                isSelected ? "border-primary-foreground bg-primary-foreground" : "border-muted-foreground/30"
              }`}>
                {isSelected && <Check className="w-3 h-3 text-primary" />}
              </div>
              <div className="flex-1">
                <span className={`text-[14px] font-bold block ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>
                  {s.label}
                </span>
                <span className={`text-[11px] ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground/70"}`}>
                  {s.desc}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground/60 text-center mb-6 max-w-xs">
        You can change this anytime in your profile settings.
      </p>

      <Button onClick={onNext} className="w-full max-w-xs h-12 rounded-xl font-bold text-base gap-2">
        Continue <ChevronRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}

function IntroStep({ onFinish }: { onFinish: () => void }) {
  const features = [
    { icon: IconMatches, label: "Create or join matches" },
    { icon: MessageSquare, label: "Chat with players in match groups" },
    { icon: Zap, label: "Earn XPLAY Points as you compete" },
    { icon: Gift, label: "Earn rewards and redeem gift cards" },
  ];

  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" className="px-6 py-10 min-h-[80vh] flex flex-col items-center text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.15 }}
        className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mb-6"
      >
        <Trophy className="w-8 h-8 text-primary" />
      </motion.div>

      {/* Differentiated from the opening WelcomeStep — this is the wrap-up,
          not a second welcome */}
      <h2 className="font-display text-[28px] font-black italic uppercase text-foreground mb-4 leading-[0.95]">
        You're<br />all set
      </h2>

      <p className="text-[12px] text-muted-foreground leading-[1.6] max-w-xs mb-8">
        Your profile is ready. Here's what you can do from day one — the more you play, the more XPLAY Points (XP) you earn.
      </p>

      <div className="w-full max-w-xs space-y-2.5 mb-10">
        {features.map((f, i) => (
          <motion.div
            key={f.label}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className="flex items-center gap-3 p-[12px_14px] rounded-[14px] bg-card/30 border border-border/[0.07] text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <f.icon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-[13px] font-bold text-foreground">{f.label}</span>
          </motion.div>
        ))}
      </div>

      <Button onClick={onFinish} className="w-full max-w-xs h-12 rounded-xl font-bold text-base gap-2">
        Start Playing <ChevronRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}

/* ── External Platform Step ── */

function ExternalPlatformStep({
  onNext,
}: {
  onNext: (used: boolean, level: number | null, matches: number | null) => void;
}) {
  const [usesOtherPlatform, setUsesOtherPlatform] = useState<boolean | null>(null);
  const [platformLevel, setPlatformLevel] = useState("");
  const [platformMatches, setPlatformMatches] = useState("");

  const canContinue =
    usesOtherPlatform !== null &&
    (!usesOtherPlatform || (platformLevel !== "" && platformMatches !== ""));

  const handleContinue = () => {
    if (!canContinue) return;
    if (!usesOtherPlatform) {
      onNext(false, null, null);
    } else {
      const level = parseFloat(platformLevel);
      const matches = parseInt(platformMatches, 10);
      onNext(true, isNaN(level) ? null : level, isNaN(matches) ? null : matches);
    }
  };

  return (
    <motion.div
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="px-6 py-8 min-h-[80vh] flex flex-col items-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mb-6">
        <Globe className="w-8 h-8 text-primary" />
      </div>

      <h2 className="font-display text-[28px] font-black italic uppercase text-foreground mb-3 text-center leading-[0.95]">
        Other Platforms?
      </h2>

      <p className="text-[12px] text-muted-foreground text-center mb-8 max-w-xs leading-[1.5]">
        Do you already have a ranking on another padel platform?
      </p>

      {/* Yes / No toggle */}
      <div className="w-full max-w-xs flex gap-3 mb-6">
        {([{ label: "Yes, I do", value: true }, { label: "No, I don't", value: false }] as const).map((opt) => {
          const isSelected = usesOtherPlatform === opt.value;
          return (
            <motion.button
              key={String(opt.value)}
              whileTap={{ scale: 0.97 }}
              onClick={() => setUsesOtherPlatform(opt.value)}
              className={`flex-1 p-4 rounded-[16px] border font-bold text-[14px] transition-all duration-200 ${
                isSelected
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-card/40 text-foreground border-border/[0.07]"
              }`}
            >
              {opt.label}
            </motion.button>
          );
        })}
      </div>

      {/* Inputs — only shown when Yes */}
      <AnimatePresence>
        {usesOtherPlatform && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full max-w-xs space-y-4 mb-6 overflow-hidden"
          >
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                Your level on that platform
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                placeholder="e.g. 6.5"
                value={platformLevel}
                onChange={(e) => setPlatformLevel(e.target.value)}
                className="w-full bg-card/40 border border-border/20 rounded-xl px-4 py-3 text-foreground text-[14px] font-bold placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                Matches played there
              </label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 47"
                value={platformMatches}
                onChange={(e) => setPlatformMatches(e.target.value)}
                className="w-full bg-card/40 border border-border/20 rounded-xl px-4 py-3 text-foreground text-[14px] font-bold placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
              />
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start gap-2 bg-primary/8 rounded-xl px-4 py-3"
            >
              <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-primary/80 leading-[1.5]">
                This gives you a more accurate starting rank right away — you're not starting from scratch.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1" />

      <Button
        onClick={handleContinue}
        disabled={!canContinue}
        className="w-full max-w-xs h-12 rounded-xl font-bold text-base gap-2"
      >
        Continue <ChevronRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}

/* ── Welcome Bonus Celebration Step ── */

function WelcomeBonusStep({ onContinue }: { onContinue: () => void }) {
  return (
    <motion.div
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="flex flex-col items-center text-center px-6 py-12 min-h-[80vh] justify-center"
    >
      {/* Animated XP burst */}
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
        className="relative w-28 h-28 flex items-center justify-center mb-8"
      >
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
        <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_0_40px_hsl(var(--primary)/0.4)]">
          <Zap className="w-14 h-14 text-primary-foreground" />
        </div>
      </motion.div>

      {/* Floating +50 XP label */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-primary/10 border border-primary/30 rounded-2xl px-6 py-2 mb-6"
      >
        <span className="font-display text-4xl font-black text-primary tracking-tight">+50 XP</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="space-y-4 mb-10"
      >
        <h2 className="font-display text-[28px] font-black italic uppercase leading-[0.95]">Welcome Bonus!</h2>
        <p className="text-[12px] text-muted-foreground leading-[1.6] max-w-xs">
          50 XPLAY Points have been added to your account. Play matches, refer friends and complete tournaments to earn more.
        </p>
        <p className="text-[11px] text-muted-foreground/60">
          100 XPLAY Points = £1 of catalogue value · Points have no cash value.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65 }}
        className="w-full max-w-xs"
      >
        <Button onClick={onContinue} className="w-full h-12 rounded-xl font-bold text-base gap-2">
          Start Playing <ChevronRight className="w-4 h-4" />
        </Button>
      </motion.div>
    </motion.div>
  );
}

/* ── Main Onboarding Page ── */

type Step = "age-terms" | "welcome" | "quiz-0" | "quiz-1" | "quiz-2" | "external-platform" | "level" | "court-side" | "intro" | "bonus";

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("age-terms");
  const [savingAgeTerms, setSavingAgeTerms] = useState(false);
  // Persistent under-18 block: once a failing DOB is on the profile, the gate
  // can't be bypassed by reloading and re-entering a different date.
  const [underageBlocked, setUnderageBlocked] = useState(
    () => !!profile?.date_of_birth && ageFromDob(profile.date_of_birth) < 18
  );

  useEffect(() => {
    if (profile?.date_of_birth && ageFromDob(profile.date_of_birth) < 18) {
      setUnderageBlocked(true);
    }
  }, [profile?.date_of_birth]);

  const handleUnderage = async (dobISO: string) => {
    setUnderageBlocked(true);
    if (!user) return;
    // Save the DOB (without terms acceptance) so the block persists across reloads.
    await supabase
      .from("profiles")
      .update({ date_of_birth: dobISO })
      .eq("user_id", user.id);
    refreshProfile();
  };

  const handleUnderageSignOut = async () => {
    await signOut();
    navigate("/auth");
  };
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [recommendedLevel, setRecommendedLevel] = useState(3.0);
  const [selectedLevel, setSelectedLevel] = useState(3.0);
  const [preferredSide, setPreferredSide] = useState("both");
  const [saving, setSaving] = useState(false);
  const [levelSource, setLevelSource] = useState<"quiz" | "external">("quiz");
  const [externalPlatformUsed, setExternalPlatformUsed] = useState(false);
  const [externalPlatformLevel, setExternalPlatformLevel] = useState<number | null>(null);
  const [externalPlatformMatches, setExternalPlatformMatches] = useState<number | null>(null);

  // Age gate + terms acceptance — saved immediately so acceptance is recorded
  // even if the user abandons onboarding before the final step.
  const handleAgeTerms = async (dobISO: string) => {
    if (!user || savingAgeTerms) return;
    setSavingAgeTerms(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          date_of_birth: dobISO,
          terms_accepted_at: new Date().toISOString(),
          terms_version: TERMS_VERSION,
        })
        .eq("user_id", user.id);
      if (error) throw error;
      setStep("welcome");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingAgeTerms(false);
    }
  };

  const handleQuizAnswer = (questionIndex: number, value: number) => {
    const qId = QUESTIONS[questionIndex].id;
    const newAnswers = { ...answers, [qId]: value };
    setAnswers(newAnswers);

    // Auto-advance after a brief pause
    setTimeout(() => {
      if (questionIndex < QUESTIONS.length - 1) {
        setStep(`quiz-${questionIndex + 1}` as Step);
      } else {
        // Pre-calculate quiz-based recommendation; may be overridden by external platform step
        const rec = calculateRecommendedLevel(newAnswers);
        setRecommendedLevel(rec);
        setSelectedLevel(rec);
        setStep("external-platform");
      }
    }, 300);
  };

  const handleExternalPlatform = (
    used: boolean,
    level: number | null,
    matches: number | null
  ) => {
    setExternalPlatformUsed(used);
    setExternalPlatformLevel(level);
    setExternalPlatformMatches(matches);

    if (used && level !== null) {
      const xplayLevel = mapExternalToXPlayLevel(level);
      setRecommendedLevel(xplayLevel);
      setSelectedLevel(xplayLevel);
      setLevelSource("external");
    } else {
      setLevelSource("quiz");
    }

    setStep("level");
  };

  const handleAcceptLevel = () => {
    setStep("court-side");
  };

  const handleFinish = async () => {
    if (!user || saving) return;
    setSaving(true);

    try {
      // Save quiz responses
      const quizInserts = Object.entries(answers).map(([qId, val]) => ({
        user_id: user.id,
        question_id: qId,
        selected_answer: QUESTIONS.find((q) => q.id === qId)?.options[val]?.label || String(val),
      }));

      if (quizInserts.length > 0) {
        await supabase.from("quiz_responses").insert(quizInserts);
      }

      // Update profile
      const { error } = await supabase
        .from("profiles")
        .update({
          padel_level: selectedLevel,
          recommended_level: recommendedLevel,
          preferred_side: preferredSide,
          initial_level_source: externalPlatformUsed ? "external_seeded" : "quiz",
          initial_level_date: new Date().toISOString(),
          onboarding_completed: true,
          ...(externalPlatformUsed && {
            external_platform: true,
            external_platform_level: externalPlatformLevel,
            external_platform_matches: externalPlatformMatches,
          }),
        })
        .eq("user_id", user.id);

      if (error) throw error;

      // Grant 50 XP welcome bonus — uses SECURITY DEFINER RPC that bypasses RLS
      await supabase.rpc("increment_points", { p_user_id: user.id, p_amount: 50 });

      await refreshProfile();
      // Show celebration screen before navigating
      setStep("bonus");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getQuizIndex = () => {
    if (step === "quiz-0") return 0;
    if (step === "quiz-1") return 1;
    if (step === "quiz-2") return 2;
    return -1;
  };

  const quizIndex = getQuizIndex();

  return (
    <div className="min-h-screen bg-background overflow-y-auto">
      <AnimatePresence mode="wait">
        {underageBlocked && (
          <UnderageBlock key="underage-block" onSignOut={handleUnderageSignOut} />
        )}
        {!underageBlocked && step === "age-terms" && (
          <AgeTermsStep key="age-terms" onContinue={handleAgeTerms} onUnderage={handleUnderage} saving={savingAgeTerms} />
        )}
        {step === "welcome" && (
          <WelcomeStep key="welcome" onNext={() => setStep("quiz-0")} />
        )}
        {quizIndex >= 0 && (
          <QuizStep
            key={`quiz-${quizIndex}`}
            questionIndex={quizIndex}
            selectedAnswer={answers[QUESTIONS[quizIndex].id] ?? null}
            onAnswer={(v) => handleQuizAnswer(quizIndex, v)}
            onBack={() =>
              quizIndex === 0 ? setStep("welcome") : setStep(`quiz-${quizIndex - 1}` as Step)
            }
            onSkip={() => setStep("external-platform")}
          />
        )}
        {step === "external-platform" && (
          <ExternalPlatformStep
            key="external-platform"
            onNext={handleExternalPlatform}
          />
        )}
        {step === "level" && (
          <LevelStep
            key="level"
            recommendedLevel={recommendedLevel}
            selectedLevel={selectedLevel}
            onLevelChange={setSelectedLevel}
            onAccept={handleAcceptLevel}
            levelSource={levelSource}
          />
        )}
        {step === "court-side" && (
          <CourtSideStep
            key="court-side"
            selectedSide={preferredSide}
            onSelect={setPreferredSide}
            onNext={() => setStep("intro")}
          />
        )}
        {step === "intro" && (
          <IntroStep key="intro" onFinish={handleFinish} />
        )}
        {step === "bonus" && (
          <WelcomeBonusStep
            key="bonus"
            onContinue={() => navigate("/matches", { replace: true })}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Onboarding;
