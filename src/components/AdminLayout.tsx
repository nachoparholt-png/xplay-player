import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Users, BarChart3, Shield, ArrowLeft, Building2, Sliders, Gift, Package, Store, TrendingUp, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";

const adminNavItems = [
  { path: "/admin/players", icon: Users, label: "Players" },
  { path: "/admin/clubs", icon: Building2, label: "Clubs" },
  { path: "/admin/rating", icon: Sliders, label: "Rating" },
  { path: "/admin/betting", icon: TrendingUp, label: "Betting" },
  { path: "/admin/products", icon: ShoppingBag, label: "Products" },
  { path: "/admin/rewards", icon: Gift, label: "Rewards" },
  { path: "/admin/reward-codes", icon: Package, label: "Codes" },
  { path: "/admin/stores", icon: Store, label: "Stores" },
  { path: "/admin/activity", icon: BarChart3, label: "Activity Log" },
  { path: "/admin/settings", icon: Shield, label: "Settings" },
];

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border/50 bg-sidebar p-4 fixed h-full z-30">
        <div className="flex items-center gap-2.5 px-3 py-4 mb-2">
          <div className="w-9 h-9 rounded-xl bg-destructive flex items-center justify-center">
            <Shield className="w-5 h-5 text-destructive-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-foreground">Admin Panel</span>
        </div>

        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-3 py-2 mb-4 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to App
        </button>

        <nav className="flex-1 space-y-1">
          {adminNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-destructive/10 text-destructive"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-destructive" />
            <span className="font-display font-bold">Admin</span>
          </div>
          <button onClick={() => navigate("/")} className="text-sm text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/50 safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-2">
          {adminNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 relative"
              >
                {isActive && (
                  <motion.div
                    layoutId="admin-nav-indicator"
                    className="absolute -top-2 w-6 h-0.5 bg-destructive rounded-full"
                  />
                )}
                <item.icon
                  className={`w-5 h-5 transition-colors ${isActive ? "text-destructive" : "text-muted-foreground"}`}
                />
                <span
                  className={`text-[10px] font-medium transition-colors ${isActive ? "text-destructive" : "text-muted-foreground"}`}
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

export default AdminLayout;
