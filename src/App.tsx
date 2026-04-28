import React, { useState, useEffect, lazy, Suspense, ComponentType } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { TourProvider } from "@/contexts/TourContext";
import AppLayout from "./components/AppLayout";
import SplashScreen from "./components/SplashScreen";
import { useCartSync } from "./hooks/useCartSync";
import { usePushNotifications } from "./hooks/usePushNotifications";
import ErrorBoundary from "./components/ErrorBoundary";
import OfflineBanner from "./components/OfflineBanner";
import AdminLayout from "./components/AdminLayout";
import AdminRoute from "./components/AdminRoute";
import { Stripe } from "@capacitor-community/stripe";

// ── Chunk-load resilience ───────────────────────────────────────────────────
// After a Vercel redeploy the old chunk URLs are gone. This wrapper catches
// the "Failed to fetch dynamically imported module" error at the promise level
// and forces a page reload (once per session) so users get the new bundle.
const CHUNK_RELOAD_KEY = "xplay_chunk_reload";
function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Failed to fetch dynamically imported module") ||
          msg.includes("Importing a module script failed") ||
          msg.includes("error loading dynamically imported module")) {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          window.location.reload();
        }
      }
      throw err;
    }
  });
}

// ── Eagerly loaded (critical path — always needed immediately) ──────────────
import Matches from "./pages/Matches";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";

// ── Lazy loaded (loaded on demand when user navigates there) ────────────────
const CreateMatch         = lazyWithRetry(() => import("./pages/CreateMatch"));
const MatchDetail         = lazyWithRetry(() => import("./pages/MatchDetail"));
const PostMatchStats      = lazyWithRetry(() => import("./pages/PostMatchStats"));
const ActiveStakes        = lazyWithRetry(() => import("./pages/ActiveStakes"));
const Messages            = lazyWithRetry(() => import("./pages/Messages"));
const ChatThread          = lazyWithRetry(() => import("./pages/ChatThread"));
const Rewards             = lazyWithRetry(() => import("./pages/Rewards"));
const Marketplace         = lazyWithRetry(() => import("./pages/Marketplace"));
const ProductDetail       = lazyWithRetry(() => import("./pages/ProductDetail"));
const Orders              = lazyWithRetry(() => import("./pages/Orders"));
const PaymentSuccess      = lazyWithRetry(() => import("./pages/PaymentSuccess"));
const Profile             = lazyWithRetry(() => import("./pages/Profile"));
const ProfileSettings     = lazyWithRetry(() => import("./pages/ProfileSettings"));
const PointsStore         = lazyWithRetry(() => import("./pages/PointsStore"));
const ClubDetail          = lazyWithRetry(() => import("./pages/ClubDetail"));
const Bookings            = lazyWithRetry(() => import("./pages/Bookings"));
const TournamentsList     = lazyWithRetry(() => import("./pages/tournaments/TournamentsList"));
const TournamentWizard    = lazyWithRetry(() => import("./pages/tournaments/TournamentWizard"));
const TournamentDetail    = lazyWithRetry(() => import("./pages/tournaments/TournamentDetail"));
const TournamentLive      = lazyWithRetry(() => import("./pages/tournaments/TournamentLive"));
const TournamentBetConfig = lazyWithRetry(() => import("./pages/tournaments/TournamentBetConfig"));

// Admin (lazily loaded — players rarely visit admin routes)
const AdminPlayers            = lazyWithRetry(() => import("./pages/admin/AdminPlayers"));
const AdminPlayerDetail       = lazyWithRetry(() => import("./pages/admin/AdminPlayerDetail"));
const AdminActivityLog        = lazyWithRetry(() => import("./pages/admin/AdminActivityLog"));
const AdminSettings           = lazyWithRetry(() => import("./pages/admin/AdminSettings"));
const AdminClubs              = lazyWithRetry(() => import("./pages/admin/AdminClubs"));
const AdminRatingSettings     = lazyWithRetry(() => import("./pages/admin/AdminRatingSettings"));
const AdminRewardsSettings    = lazyWithRetry(() => import("./pages/admin/AdminRewardsSettings"));
const AdminRewardCodes        = lazyWithRetry(() => import("./pages/admin/AdminRewardCodes"));
const AdminProducts           = lazyWithRetry(() => import("./pages/admin/AdminProducts"));
const AdminStores             = lazyWithRetry(() => import("./pages/admin/AdminStores"));
const AdminBettingSettings    = lazyWithRetry(() => import("./pages/admin/AdminBettingSettings"));
const AdminTournamentCategories = lazyWithRetry(() => import("./pages/admin/AdminTournamentCategories"));

// ── React Query client with caching ────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,      // data fresh for 3 min — no refetch on tab switch
      gcTime:    1000 * 60 * 10,     // keep in cache 10 min after unmount
      retry: 1,
      refetchOnWindowFocus: false,   // don't blast the API every time user switches apps
    },
  },
});

// ── Inline spinner shown while lazy chunks download ────────────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (profile && !profile.onboarding_completed && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (session) return <Navigate to="/matches" replace />;
  return <>{children}</>;
};

const OnboardingRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (profile && profile.onboarding_completed) return <Navigate to="/matches" replace />;
  return <>{children}</>;
};

const RouteErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
};

const AppRoutes = () => {
  useCartSync();
  usePushNotifications();
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />
          <Route path="/" element={<Navigate to="/matches" replace />} />
          <Route path="/matches" element={<ProtectedRoute><AppLayout><Matches /></AppLayout></ProtectedRoute>} />
          <Route path="/matches/create" element={<ProtectedRoute><AppLayout><CreateMatch /></AppLayout></ProtectedRoute>} />
          <Route path="/matches/:id" element={<ProtectedRoute><AppLayout><MatchDetail /></AppLayout></ProtectedRoute>} />
          <Route path="/matches/:id/stats" element={<ProtectedRoute><PostMatchStats /></ProtectedRoute>} />
          <Route path="/tournaments" element={<ProtectedRoute><AppLayout><TournamentsList /></AppLayout></ProtectedRoute>} />
          <Route path="/tournaments/new" element={<ProtectedRoute><AppLayout><TournamentWizard /></AppLayout></ProtectedRoute>} />
          <Route path="/tournaments/:id" element={<ProtectedRoute><AppLayout><TournamentDetail /></AppLayout></ProtectedRoute>} />
          <Route path="/tournaments/:id/live" element={<ProtectedRoute><AppLayout><TournamentLive /></AppLayout></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><AppLayout><Messages /></AppLayout></ProtectedRoute>} />
          <Route path="/messages/:conversationId" element={<ProtectedRoute><AppLayout><ChatThread /></AppLayout></ProtectedRoute>} />
          <Route path="/rewards" element={<ProtectedRoute><AppLayout><Rewards /></AppLayout></ProtectedRoute>} />
          <Route path="/marketplace" element={<ProtectedRoute><AppLayout><Marketplace /></AppLayout></ProtectedRoute>} />
          <Route path="/marketplace/:handle" element={<ProtectedRoute><AppLayout><ProductDetail /></AppLayout></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute><AppLayout><Orders /></AppLayout></ProtectedRoute>} />
          <Route path="/payment-success" element={<ProtectedRoute><AppLayout><PaymentSuccess /></AppLayout></ProtectedRoute>} />
          <Route path="/stakes" element={<ProtectedRoute><AppLayout><ActiveStakes /></AppLayout></ProtectedRoute>} />
          <Route path="/points-store" element={<ProtectedRoute><AppLayout><PointsStore /></AppLayout></ProtectedRoute>} />
          <Route path="/clubs/:clubId" element={<ProtectedRoute><AppLayout><ClubDetail /></AppLayout></ProtectedRoute>} />
          <Route path="/bookings" element={<ProtectedRoute><AppLayout><Bookings /></AppLayout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
          <Route path="/profile/settings" element={<ProtectedRoute><AppLayout><ProfileSettings /></AppLayout></ProtectedRoute>} />
          {/* Admin routes */}
          <Route path="/admin/players" element={<AdminRoute><AdminLayout><AdminPlayers /></AdminLayout></AdminRoute>} />
          <Route path="/admin/players/:userId" element={<AdminRoute><AdminLayout><AdminPlayerDetail /></AdminLayout></AdminRoute>} />
          <Route path="/admin/activity" element={<AdminRoute><AdminLayout><AdminActivityLog /></AdminLayout></AdminRoute>} />
          <Route path="/admin/clubs" element={<AdminRoute><AdminLayout><AdminClubs /></AdminLayout></AdminRoute>} />
          <Route path="/admin/settings" element={<AdminRoute><AdminLayout><AdminSettings /></AdminLayout></AdminRoute>} />
          <Route path="/admin/rating" element={<AdminRoute><AdminLayout><AdminRatingSettings /></AdminLayout></AdminRoute>} />
          <Route path="/admin/rewards" element={<AdminRoute><AdminLayout><AdminRewardsSettings /></AdminLayout></AdminRoute>} />
          <Route path="/admin/reward-codes" element={<AdminRoute><AdminLayout><AdminRewardCodes /></AdminLayout></AdminRoute>} />
          <Route path="/admin/stores" element={<AdminRoute><AdminLayout><AdminStores /></AdminLayout></AdminRoute>} />
          <Route path="/admin/betting" element={<AdminRoute><AdminLayout><AdminBettingSettings /></AdminLayout></AdminRoute>} />
          <Route path="/admin/products" element={<AdminRoute><AdminLayout><AdminProducts /></AdminLayout></AdminRoute>} />
          <Route path="/admin/tournament-categories" element={<AdminRoute><AdminLayout><AdminTournamentCategories /></AdminLayout></AdminRoute>} />
          <Route path="/tournaments/:id/bets" element={<AdminRoute><AdminLayout><TournamentBetConfig /></AdminLayout></AdminRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
};

const App = () => {
  const [splashDone, setSplashDone] = useState(false);

  // Initialise Stripe SDK once on app load
  useEffect(() => {
    const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (pk) {
      Stripe.initialize({ publishableKey: pk }).catch((e) =>
        console.warn("Stripe init failed:", e)
      );
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
        <BrowserRouter>
          <AuthProvider>
            <AdminProvider>
              <TourProvider>
                <OfflineBanner />
                <AppRoutes />
              </TourProvider>
            </AdminProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
