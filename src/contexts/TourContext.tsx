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
    body: "This is your arena. Browse open matches, see who's playing, and jump into the action — all in one place.",
    icon: "🏟️",
  },
  {
    step: 1,
    route: "/matches",
    title: "Find Your Match",
    body: "Switch between your own matches and all open ones. Tap any card to join a team or view the court.",
    icon: "🎾",
  },
  {
    step: 2,
    route: "/matches",
    title: "Explore Clubs",
    body: "Tap 'Clubs' at the top to browse venues near you — see courts, schedules, and book directly.",
    icon: "🏢",
  },
  {
    step: 3,
    route: "/matches",
    title: "Stake XP on Matches",
    body: "Competitive matches let you bet XP on who wins. Stake before the match starts and collect from the pot if your team pulls through.",
    icon: "⚡",
  },
  {
    step: 4,
    route: "/rewards",
    title: "Your XP Balance",
    body: "XP is your currency — earn it every time you play, win extra by betting on outcomes, and spend it on real rewards.",
    icon: "💰",
  },
  {
    step: 5,
    route: "/rewards",
    title: "Invite Friends, Earn More",
    body: "Share your personal invite link. When a friend signs up through it, you get +25 XP instantly — no cap.",
    icon: "👥",
  },
  {
    step: 6,
    route: "/profile",
    title: "Your Player Identity",
    body: "Add a photo, confirm your level, and link your home club. A complete profile earns +20 XP and gets you more match invites.",
    icon: "🎯",
  },
  {
    step: 7,
    route: null,
    title: "Your First Week Missions",
    body: "",
    icon: "🏆",
    isChecklist: true,
  },
  {
    step: 8,
    route: null,
    title: "You're Ready to Play!",
    body: "Your 50 XP welcome bonus is already in your pocket. Go find a match and get on the court.",
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
