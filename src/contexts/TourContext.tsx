import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// ── Stop definitions ────────────────────────────────────────────────────────

export interface TourStop {
  step: number;
  route: string | null; // null = stay on current page
  title: string;
  body: string;
  icon: string;
  isChecklist?: boolean;
  isComplete?: boolean;
}

export const TOUR_STOPS: TourStop[] = [
  {
    step: 0,
    route: "/matches",
    title: "Welcome to XPLAY",
    body: "Find opponents. Book courts. Earn rewards. Everything you need to compete is right here.",
    icon: "⚡",
  },
  {
    step: 1,
    route: "/matches",
    title: "Jump Into a Match",
    body: "Open matches are waiting for players like you. Tap any card to see the court, the level and the stakes. Then claim your spot.",
    icon: "🎾",
  },
  {
    step: 2,
    route: "/matches",
    title: "Bet XP, Win More",
    body: "Before any competitive match you can stake XP on your team. Win the match and split the pot. Every point matters.",
    icon: "🏆",
  },
  {
    step: 3,
    route: "/rewards",
    title: "XP Means Real Rewards",
    body: "Every match earns you XP. Rack it up and trade it for gear, discounts and exclusive perks from top brands.",
    icon: "🎁",
  },
  {
    step: 4,
    route: "/rewards",
    title: "Bring Your People",
    body: "Invite friends with your personal link. The moment they sign up you get +25 XP instantly. No limit.",
    icon: "👥",
  },
  {
    step: 5,
    route: "/profile",
    title: "Own Your Profile",
    body: "Add your photo, set your padel level and link your home club. A complete profile gets you +20 XP and more match invites.",
    icon: "🎯",
  },
  {
    step: 6,
    route: null,
    title: "Your First Week Missions",
    body: "",
    icon: "🏆",
    isChecklist: true,
  },
  {
    step: 7,
    route: null,
    title: "You're Ready.",
    body: "50 XP is already in your account. Now go play.",
    icon: "🚀",
    isComplete: true,
  },
];

// Regular (non-fullscreen) stops — used for progress dots
export const REGULAR_STOPS = TOUR_STOPS.filter(
  (s) => !s.isChecklist && !s.isComplete
);

// ── Context ─────────────────────────────────────────────────────────────────

interface TourContextValue {
  isActive: boolean;
  currentStop: TourStop | null;
  currentIndex: number;
  totalRegularStops: number;
  next: () => void;
  skip: () => void;
  startTour: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export const useTour = () => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
};

// ── Provider ─────────────────────────────────────────────────────────────────

export const TourProvider = ({ children }: { children: ReactNode }) => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const autoStartFired = useRef(false);

  // Auto-start: new users only (tour_completed=false AND no matches played yet)
  useEffect(() => {
    if (!profile || !user || autoStartFired.current) return;

    const tourCompleted = (profile as any).tour_completed === true;
    const totalMatches = (profile as any).total_matches ?? 0;

    if (!tourCompleted && totalMatches === 0) {
      autoStartFired.current = true;
      const timer = setTimeout(() => {
        setCurrentIndex(0);
        setIsActive(true);
        navigate("/matches");
      }, 1500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id]);

  const markTourComplete = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ tour_completed: true })
      .eq("user_id", user.id);
  }, [user]);

  const next = useCallback(() => {
    setCurrentIndex((prev) => {
      const nextIndex = prev + 1;

      if (nextIndex >= TOUR_STOPS.length) {
        // Finished
        setIsActive(false);
        markTourComplete();
        navigate("/matches");
        return prev;
      }

      const nextStop = TOUR_STOPS[nextIndex];

      // Navigate if the stop is on a different page
      if (nextStop.route) {
        navigate(nextStop.route);
      }

      // If we just finished the complete screen, close tour
      if (nextStop.isComplete) {
        // Will render the complete screen; clicking its CTA calls next() again → closes
      }

      return nextIndex;
    });
  }, [navigate, markTourComplete]);

  const skip = useCallback(() => {
    setIsActive(false);
    markTourComplete();
  }, [markTourComplete]);

  const startTour = useCallback(async () => {
    if (user) {
      await supabase
        .from("profiles")
        .update({ tour_completed: false })
        .eq("user_id", user.id);
    }
    setCurrentIndex(0);
    setIsActive(true);
    navigate("/matches");
  }, [navigate, user]);

  const currentStop = isActive ? TOUR_STOPS[currentIndex] : null;

  return (
    <TourContext.Provider
      value={{
        isActive,
        currentStop,
        currentIndex,
        totalRegularStops: REGULAR_STOPS.length,
        next,
        skip,
        startTour,
      }}
    >
      {children}
    </TourContext.Provider>
  );
};
