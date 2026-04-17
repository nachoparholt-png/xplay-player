import React, { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Swords, MessageSquare, Gift, User, Shield, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { useAdmin } from "@/contexts/AdminContext";
import NotificationBell from "@/components/NotificationBell";
import xplayLogo from "@/assets/xplay-logo-full.png";

const navItems = [
  { path: "/matches", icon: Swords, label: "Matches" },
  { path: "/tournaments", icon: Trophy, label: "Tourneys" },
  { path: "/rewards", icon: Gift, label: "Rewards" },
  { path: "/messages", icon: MessageSquare, label: "Messages" },
  { path: "/profile", icon: User, label: "Profile" },
];

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
          <NotificationBell />
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
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
          <NotificationBell />
        </div>

        {/* Scrollable content area */}
        <div
          className={`flex-1 overflow-y-scroll overflow-x-hidden ${location.pathname.startsWith('/messages/') ? '' : 'pb-32'}`}
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          <div className="max-w-4xl mx-auto">{children}</div>
        </div>
      </main>

      {/* Mobile Bottom Nav - hidden on chat threads */}
      <nav
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/98 backdrop-blur-xl border-t border-white/5 ${location.pathname.startsWith('/messages/') ? 'hidden' : ''}`}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="flex items-center justify-around px-2 pt-4 pb-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
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
