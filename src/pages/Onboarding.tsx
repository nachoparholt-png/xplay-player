import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Sparkles, Trophy, MessageSquare, Zap, Gift, Check, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

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

      <h1 className="font-display text-3xl font-bold text-foreground mb-4">
        Welcome to<br />Padel Park
      </h1>

      <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mb-2">
        Padel Park is a community where players can create matches, join games, chat with other players, and compete using Padel Park Points and stakes.
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
}: {
  questionIndex: number;
  onAnswer: (value: number) => void;
  selectedAnswer: number | null;
}) {
  const q = QUESTIONS[questionIndex];
  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" key={`q-${questionIndex}`} className="px-6 py-8 min-h-[80vh] flex flex-col">
      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full flex-1 transition-all duration-300 ${
              i < questionIndex ? "bg-primary" : i === questionIndex ? "bg-primary animate-pulse" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <p className="text-[10px] uppercase tracking-widest font-bold text-primary mb-2">
        Question {questionIndex + 1} of {QUESTIONS.length}
      </p>

      <h2 className="font-display text-xl font-bold text-foreground mb-6 leading-snug">
        {q.question}
      </h2>

      <div className="space-y-2.5 flex-1">
        {q.options.map((opt) => {
          const isSelected = selectedAnswer === opt.value;
          return (
            <motion.button
              key={opt.value}
              whileTap={{ scale: 0.97 }}
              onClick={() => onAnswer(opt.value)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-md shadow-primary/10"
                  : "border-border bg-card hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                }`}>
                  {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <span className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                  {opt.label}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

function LevelStep({
  recommendedLevel,
  selectedLevel,
  onLevelChange,
  onAccept,
}: {
  recommendedLevel: number;
  selectedLevel: number;
  onLevelChange: (level: number) => void;
  onAccept: () => void;
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

      <h2 className="font-display text-2xl font-bold text-foreground mb-2 text-center">
        Recommended Level
      </h2>

      <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs">
        Based on your answers, we recommend starting at:
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
        <div className="flex justify-between mt-1.5 text-[9px] text-muted-foreground font-medium">
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

      <h2 className="font-display text-2xl font-bold text-foreground mb-2 text-center">
        Preferred Court Side
      </h2>

      <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs">
        Which side of the court do you usually play on?
      </p>

      <div className="w-full max-w-xs space-y-2.5 mb-8">
        {sides.map((s) => {
          const isSelected = selectedSide === s.value;
          return (
            <motion.button
              key={s.value}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(s.value)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-md shadow-primary/10"
                  : "border-border bg-card hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                }`}>
                  {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <div>
                  <span className={`text-sm font-medium block ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground/70">{s.desc}</span>
                </div>
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
    { icon: Trophy, label: "Create or join matches" },
    { icon: MessageSquare, label: "Chat with players in match groups" },
    { icon: Zap, label: "Stake points and compete" },
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

      <h2 className="font-display text-2xl font-bold text-foreground mb-3">
        Welcome to<br />Padel Park
      </h2>

      <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mb-8">
        Padel Park helps players connect and compete. The more you play and grow the community, the more Padel Park Points you earn.
      </p>

      <div className="w-full max-w-xs space-y-3 mb-10">
        {features.map((f, i) => (
          <motion.div
            key={f.label}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <f.icon className="w-4.5 h-4.5 text-primary" />
            </div>
            <span className="text-sm font-medium text-foreground">{f.label}</span>
          </motion.div>
        ))}
      </div>

      <Button onClick={onFinish} className="w-full max-w-xs h-12 rounded-xl font-bold text-base gap-2">
        Start Playing <ChevronRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}

/* ── Main Onboarding Page ── */

type Step = "welcome" | "quiz-0" | "quiz-1" | "quiz-2" | "level" | "court-side" | "intro";

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("welcome");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [recommendedLevel, setRecommendedLevel] = useState(3.0);
  const [selectedLevel, setSelectedLevel] = useState(3.0);
  const [preferredSide, setPreferredSide] = useState("both");
  const [saving, setSaving] = useState(false);

  const handleQuizAnswer = (questionIndex: number, value: number) => {
    const qId = QUESTIONS[questionIndex].id;
    const newAnswers = { ...answers, [qId]: value };
    setAnswers(newAnswers);

    // Auto-advance after a brief pause
    setTimeout(() => {
      if (questionIndex < QUESTIONS.length - 1) {
        setStep(`quiz-${questionIndex + 1}` as Step);
      } else {
        const rec = calculateRecommendedLevel(newAnswers);
        setRecommendedLevel(rec);
        setSelectedLevel(rec);
        setStep("level");
      }
    }, 300);
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
          initial_level_source: "quiz",
          initial_level_date: new Date().toISOString(),
          onboarding_completed: true,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      await refreshProfile();
      toast({ title: "You're all set! 🎾", description: `Your starting level is ${selectedLevel.toFixed(1)}` });
      navigate("/matches", { replace: true });
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
        {step === "welcome" && (
          <WelcomeStep key="welcome" onNext={() => setStep("quiz-0")} />
        )}
        {quizIndex >= 0 && (
          <QuizStep
            key={`quiz-${quizIndex}`}
            questionIndex={quizIndex}
            selectedAnswer={answers[QUESTIONS[quizIndex].id] ?? null}
            onAnswer={(v) => handleQuizAnswer(quizIndex, v)}
          />
        )}
        {step === "level" && (
          <LevelStep
            key="level"
            recommendedLevel={recommendedLevel}
            selectedLevel={selectedLevel}
            onLevelChange={setSelectedLevel}
            onAccept={handleAcceptLevel}
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
      </AnimatePresence>
    </div>
  );
};

export default Onboarding;
