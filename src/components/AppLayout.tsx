import React, { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageSquare, Shield, Home, CalendarDays } from "lucide-react";
import { motion } from "framer-motion";
import { useAdmin } from "@/contexts/AdminContext";
import NotificationBell from "@/components/NotificationBell";
import PointsBalanceChip from "@/components/points/PointsBalanceChip";
import AppTour from "@/components/AppTour";
// Transparent cut-out of the full logo, so it sits on the header colour (no purple box)
import xplayLogo from "@/assets/xplay-logo-header.png";
import {
  IconMatches,
  IconTournaments,
  IconRewards,
  IconProfile,
} from "@/components/icons/XPlayIcons";
import { TOURNAMENTS_ENABLED } from "@/lib/featureFlags";

// Mobile tab bar — exactly 4 slots (Home redesign, 25 Sep 2026):
// Home · Activity · Rewards · Profile. Matches and Tournaments live inside Home /
// Activity; Messages is always the header icon (both lanes).
const navItems = [
  { path: "/", icon: Home, label: "Home" },
  { path: "/activity", icon: CalendarDays, label: "Activity" },
  { path: "/rewards", icon: IconRewards, label: "Rewards" },
  { path: "/profile", icon: IconProfile, label: "Profile" },
];

// Desktop sidebar — the full list
const sidebarItems = [
  { path: "/", icon: Home, label: "Home" },
  { path: "/activity", icon: CalendarDays, label: "Activity" },
  { path: "/matches", icon: IconMatches, label: "Matches" },
  ...(TOURNAMENTS_ENABLED ? [{ path: "/tournaments", icon: IconTournaments, label: "Tournaments" }] : []),
  { path: "/rewards", icon: IconRewards, label: "Rewards" },
  { path: "/messages", icon: MessageSquare, label: "Messages" },
  { path: "/profile", icon: IconProfile, label: "Profile" },
];

const isPathActive = (pathname: string, path: string) =>
  path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/");

const AppLayout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();

  return (
    <div className="h-full bg-background flex overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border/50 bg-sidebar p-4 fixed h-full z-30">
        <div className="flex items-center justify-between px-3 py-4 mb-6">
          <div className="flex items-center gap-2.5">
            <img src={xplayLogo} alt="XPLAY" className="h-9 w-auto object-contain rounded-xl" />
          </div>
          <div className="flex items-center gap-2">
            <PointsBalanceChip />
            <NotificationBell />
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {sidebarItems.map((item) => {
            const isActive = isPathActive(location.pathname, item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {isAdmin && (
          <button
            onClick={() => navigate("/admin/players")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-destructive hover:bg-destructive/10 mt-2 border border-destructive/20"
          >
            <Shield className="w-5 h-5" />
            Admin Panel
          </button>
        )}

      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div
          className="lg:hidden shrink-0 z-40 bg-background px-4 flex items-center justify-between"
          style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))' }}
        >
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 active:opacity-70 transition-opacity"
            aria-label="Home"
          >
            <img src={xplayLogo} alt="X Play" className="h-8 w-auto object-contain" />
          </button>
          <div className="flex items-center gap-1.5">
            <PointsBalanceChip compact />
            {/* Messages — always in the header (no longer a tab) */}
            <button
              onClick={() => navigate("/messages")}
              className={`p-2 rounded-xl transition-colors active:scale-95 ${
                location.pathname.startsWith("/messages")
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="Messages"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <NotificationBell />
          </div>
        </div>

        {/* Scrollable content area */}
        <div
          className={`flex-1 overflow-y-scroll overflow-x-hidden ${location.pathname.startsWith('/messages/') ? '' : 'pb-28'}`}
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          <div className={`max-w-4xl mx-auto ${location.pathname.startsWith("/messages/") ? "h-full" : ""}`}>{children}</div>
        </div>
      </main>

      {/* App Tour overlay — rendered above everything except the nav */}
      <AppTour />

      {/* Mobile Bottom Nav - hidden on chat threads */}
      <nav
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/98 backdrop-blur-xl border-t border-white/5 ${location.pathname.startsWith('/messages/') ? 'hidden' : ''}`}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
      >
        <div className="flex items-center justify-around px-2 pt-4 pb-1">
          {navItems.map((item) => {
            const isActive = isPathActive(location.pathname, item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1 min-w-[60px] py-0.5 relative"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -top-3 w-8 h-0.5 bg-primary rounded-full"
                  />
                )}
                <item.icon
                  className={`w-6 h-6 transition-colors ${isActive ? "text-primary" : "text-muted-foreground/70"}`}
                />
                <span
                  className={`text-[10px] font-semibold tracking-wide transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground/60"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;
