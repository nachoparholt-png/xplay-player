import { useState, useEffect, useMemo } from "react";
import { Search, Navigation, NavigationOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGeolocation } from "@/hooks/useGeolocation";
import { distanceMiles } from "@/lib/distance";
import ClubCard from "./ClubCard";

const RADIUS_OPTIONS = [5, 10, 25, 50] as const;
type Radius = typeof RADIUS_OPTIONS[number];

const ClubsExplorer = () => {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // ── Near Me state ──────────────────────────────────────────────
  const { geo, requestLocation, clearLocation } = useGeolocation();
  const [nearMeActive, setNearMeActive] = useState(false);
  const [radius, setRadius] = useState<Radius>(10);

  // ── Data fetch ─────────────────────────────────────────────────
  useEffect(() => {
    const fetchClubs = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("clubs")
        .select("*")
        .eq("club_status", "active")
        .order("club_name");

      const { data: courts } = await supabase
        .from("courts")
        .select("club_id, surface, indoor")
        .eq("active", true);

      const formatSurface = (s: string) =>
        s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      const courtCounts: Record<string, number> = {};
      const courtTypes: Record<string, Set<string>> = {};
      (courts || []).forEach((c: any) => {
        courtCounts[c.club_id] = (courtCounts[c.club_id] || 0) + 1;
        if (!courtTypes[c.club_id]) courtTypes[c.club_id] = new Set();
        const label = c.surface
          ? `${c.indoor ? "Indoor" : "Outdoor"} ${formatSurface(c.surface)}`
          : c.indoor != null
          ? c.indoor ? "Indoor" : "Outdoor"
          : "Padel";
        courtTypes[c.club_id].add(label);
      });

      setClubs(
        (data || []).map((club) => ({
          ...club,
          _activeCourtCount: courtCounts[club.id] || 0,
          _courtTypes: courtTypes[club.id]
            ? Array.from(courtTypes[club.id]).join(" / ")
            : "Padel",
        }))
      );

      if (user) {
        const now = new Date().toISOString();
        const { data: mems } = await supabase
          .from("club_memberships")
          .select("club_id, expires_at")
          .eq("user_id", user.id)
          .eq("status", "active");
        const activeMems = (mems || []).filter(
          (m) => !m.expires_at || m.expires_at > now
        );
        setMemberships(new Set(activeMems.map((m) => m.club_id)));
      }
      setLoading(false);
    };
    fetchClubs();
  }, [user]);

  // ── Toggle Near Me ─────────────────────────────────────────────
  const handleNearMeToggle = async () => {
    if (nearMeActive) {
      setNearMeActive(false);
      clearLocation();
      return;
    }
    // Request location then activate filter once we have coords
    await requestLocation();
    setNearMeActive(true);
  };

  // Keep nearMeActive in sync: if location is denied/errored, deactivate
  useEffect(() => {
    if (nearMeActive && (geo.status === "denied" || geo.status === "error")) {
      setNearMeActive(false);
    }
  }, [geo.status, nearMeActive]);

  // ── Derived club list ──────────────────────────────────────────
  const withDistances = useMemo(() => {
    if (geo.status !== "ok") return clubs.map((c) => ({ ...c, _distanceMi: null }));
    return clubs.map((c) => ({
      ...c,
      _distanceMi:
        c.latitude != null && c.longitude != null
          ? distanceMiles(geo.lat, geo.lng, c.latitude, c.longitude)
          : null,
    }));
  }, [clubs, geo]);

  const filtered = useMemo(() => {
    let list = withDistances;

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.club_name ?? "").toLowerCase().includes(q) ||
          (c.city ?? c.location ?? "").toLowerCase().includes(q)
      );
    }

    // Near Me filter
    if (nearMeActive && geo.status === "ok") {
      list = list.filter(
        (c) => c._distanceMi != null && c._distanceMi <= radius
      );
      // Sort nearest first
      list = [...list].sort((a, b) => (a._distanceMi ?? 999) - (b._distanceMi ?? 999));
    }

    return list;
  }, [withDistances, search, nearMeActive, geo, radius]);

  const isLocating = geo.status === "loading";
  const locationDenied = geo.status === "denied";

  return (
    <div className="space-y-3">
      {/* ── Search + Near Me row ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clubs..."
            style={{ fontSize: "16px" }}
            className="w-full bg-card border border-border/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Near Me button */}
        <button
          onClick={handleNearMeToggle}
          disabled={isLocating}
          className={`h-10 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all flex-shrink-0 ${
            nearMeActive && geo.status === "ok"
              ? "bg-primary text-primary-foreground border-primary shadow-[0_0_12px_hsl(var(--primary)/0.35)]"
              : "bg-card border-border/50 text-muted-foreground hover:text-primary hover:border-primary/40"
          }`}
        >
          {isLocating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : nearMeActive && geo.status === "ok" ? (
            <Navigation className="w-4 h-4" />
          ) : (
            <NavigationOff className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Near Me</span>
        </button>
      </div>

      {/* ── Permission denied notice ── */}
      <AnimatePresence>
        {locationDenied && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive"
          >
            <NavigationOff className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Location access was denied. Enable it in your device settings to use
              the Near Me filter.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Radius picker (shown when Near Me is active) ── */}
      <AnimatePresence>
        {nearMeActive && geo.status === "ok" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex-shrink-0">
                Within
              </span>
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRadius(r)}
                  className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wide transition-all border ${
                    radius === r
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted border-border/30 text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {r} mi
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Count label ── */}
      {!loading && (
        <p className="text-xs text-muted-foreground text-center">
          {nearMeActive && geo.status === "ok"
            ? `${filtered.length} club${filtered.length !== 1 ? "s" : ""} within ${radius} mi`
            : `${filtered.length} club${filtered.length !== 1 ? "s" : ""} in the XPLAY ecosystem`}
        </p>
      )}

      {/* ── Club list ── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-1">
          <p className="text-muted-foreground text-sm">
            {nearMeActive
              ? `No clubs found within ${radius} miles`
              : "No clubs found"}
          </p>
          {nearMeActive && (
            <p className="text-xs text-muted-foreground/60">
              Try increasing the radius
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((club) => (
            <ClubCard
              key={club.id}
              id={club.id}
              name={club.club_name}
              city={club.city ?? club.location}
              courtCount={club._activeCourtCount}
              logoUrl={club.logo_url}
              courtType={club._courtTypes}
              hasMembership={memberships.has(club.id)}
              distanceMi={nearMeActive ? club._distanceMi : null}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ClubsExplorer;
