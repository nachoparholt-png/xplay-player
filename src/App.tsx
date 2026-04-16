import React, { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AdminProvider } from "@/contexts/AdminContext";
import AppLayout from "./components/AppLayout";
import SplashScreen from "./components/SplashScreen";
import { useCartSync } from "./hooks/useCartSync";
import { usePushNotifications } from "./hooks/usePushNotifications";
import ErrorBoundary from "./components/ErrorBoundary";
import OfflineBanner from "./components/OfflineBanner";

import Matches from "./pages/Matches";
import CreateMatch from "./pages/CreateMatch";
import MatchDetail from "./pages/MatchDetail";
import ActiveStakes from "./pages/ActiveStakes";
import AdminLayout from "./components/AdminLayout";
import AdminRoute from "./components/AdminRoute";
import AdminPlayers from "./pages/admin/AdminPlayers";
import AdminPlayerDetail from "./pages/admin/AdminPlayerDetail";
import AdminActivityLog from "./pages/admin/AdminActivityLog";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminClubs from "./pages/admin/AdminClubs";
import AdminRatingSettings from "./pages/admin/AdminRatingSettings";
import AdminRewardsSettings from "./pages/admin/AdminRewardsSettings";
import AdminRewardCodes from "./pages/admin/AdminRewardCodes";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminStores from "./pages/admin/AdminStores";
import AdminBettingSettings from "./pages/admin/AdminBettingSettings";
import AdminTournamentCategories from "./pages/admin/AdminTournamentCategories";
import Messages from "./pages/Messages";
import ChatThread from "./pages/ChatThread";
import Rewards from "./pages/Rewards";
import Marketplace from "./pages/Marketplace";
import ProductDetail from "./pages/ProductDetail";
import Orders from "./pages/Orders";
import PaymentSuccess from "./pages/PaymentSuccess";
import Profile from "./pages/Profile";
import ProfileSettings from "./pages/ProfileSettings";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import TournamentsList from "./pages/tournaments/TournamentsList";
import TournamentWizard from "./pages/tournaments/TournamentWizard";
import TournamentDetail from "./pages/tournaments/TournamentDetail";
import TournamentLive from "./pages/tournaments/TournamentLive";
import TournamentBetConfig from "./pages/tournaments/TournamentBetConfig";
import PointsStore from "./pages/PointsStore";
import ClubDetail from "./pages/ClubDetail";
import Bookings from "./pages/Bookings";
import PostMatchStats from "./pages/PostMatchStats";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!session) return <Navigate to="/auth" replace />;
  // Redirect to onboarding if not completed (but don't redirect if already on /onboarding)
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
  // If already onboarded, go to matches
  if (profile && profile.onboarding_completed) return <Navigate to="/matches" replace />;
  return <>{children}</>;
};

/** Resets the error boundary whenever the user navigates to a different route */
const RouteErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
};

const AppRoutes = () => {
  useCartSync();
  usePushNotifications();
  return (
  <RouteErrorBoundary>
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
  </RouteErrorBoundary>
  );
};

const App = () => {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
        <BrowserRouter>
          <AuthProvider>
            <AdminProvider>
              <OfflineBanner />
              <AppRoutes />
            </AdminProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
