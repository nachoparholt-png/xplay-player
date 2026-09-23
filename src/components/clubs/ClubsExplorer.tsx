import { useState, useEffect, useMemo } from "react";
import { Search, Navigation, NavigationOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGeolocation } from "@/hooks/useGeolocation";
import { distanceMiles } from "@/lib/distance";
import XplayClubCard from "./XplayClubCard";
import OtherClubRow from "./OtherClubRow";
import { isOtherClub } from "./clubTier";
import { Sparkles, Share2 } from "lucide-react";
import { toast } from "sonner";

const RADIUS_OPTIONS = [5, 10, 25, 50] as const;
type Radius = typeof RADIUS_OPTIONS[number];

const ClubsExplorer = () => {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  // Two-tier model: "all" (default — useful from day one) or XPLAY Clubs only
  const [tierFilter, setTierFilter] = useState<"all" | "xplay">("all");
  const [showAllOther, setShowAllOther] = useState(false);

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
        .neq("kind", "organiser")
        .order("club_name");

      const { data: courts } = await supabase
        .from("courts")
        .select("club_id, surface, indoor")
        .eq("active", true);

      // Next external slot per club (fails soft: rows just show no slot)
      const nextSlots: Record<string, { provider: string | null; starts_at: string; price_cents: number | null }> = {};
      try {
        const { data: slotRows } = await (supabase as any).rpc("clubs_next_external_slot");
        (slotRows || []).forEach((r: any) => { nextSlots[r.club_id] = r; });
      } catch { /* RPC not deployed yet → no slot info */ }

      // Which clubs sell memberships (benefit chip on XPLAY Club cards)
      const { data: tierRows } = await supabase.from("membership_tiers").select("club_id").eq("active", true);
      const clubsWithTiers = new Set((tierRows || []).map((t: any) => t.club_id));

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
          _nextSlot: nextSlots[club.id] ?? null,
          _hasTiers: clubsWithTiers.has(club.id),
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
      // Word-by-word, ignoring spaces/punctuation/accents, so "padel hub epsom"
      // finds "PADELHUB KT19 Epsom" and "kt19" or a postcode also work.
      const squash = (v: string) =>
        v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      const words = search.toLowerCase().split(/\s+/).map(squash).filter(Boolean);
      list = list.filter((c) => {
        const hay = squash(
          [c.club_name, c.city, c.location, c.postcode, c.address_line_1].filter(Boolean).join(" ")
        );
        return words.every((w) => hay.includes(w));
      });
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

  // ── Two tiers ──────────────────────────────────────────────────
  const xplayClubs = useMemo(() => filtered.filter((c) => !isOtherClub(c.source)), [filtered]);
  const otherClubs = useMemo(() => {
    const list = filtered.filter((c) => isOtherClub(c.source));
    if (nearMeActive && geo.status === "ok") return list; // already nearest-first
    // Clubs with a live slot first (soonest first), then the rest A–Z
    return [...list].sort((a, b) => {
      const as = a._nextSlot?.starts_at, bs = b._nextSlot?.starts_at;
      if (as && bs) return as.localeCompare(bs);
      if (as) return -1;
      if (bs) return 1;
      return (a.club_name ?? "").localeCompare(b.club_name ?? "");
    });
  }, [filtered, nearMeActive, geo.status]);
  const OTHER_PAGE = 8;
  const otherVisible = showAllOther || search.trim() ? otherClubs : otherClubs.slice(0, OTHER_PAGE);

  const handleTellYourClub = async () => {
    const payload = {
      title: "XPLAY for padel clubs",
      text: "We organise our padel matches on XPLAY. If the club joined, we could book and pay courts in the app too:",
      url: "https://xplay-landing-delta.vercel.app/",
    };
    try {
      const cap = await import("@capacitor/share");
      await cap.Share.share(payload);
      return;
    } catch (e) {
      if (e instanceof Error && /cancel/i.test(e.message)) return;
    }
    try {
      if (navigator.share) { await navigator.share(payload); return; }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${payload.text} ${payload.url}`);
      toast.success("Message copied — paste it to your club");
    } catch { /* nothing else to try */ }
  };

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
            className="w-full bg-card border border-border/50 rounded-xl pl-10 pr-4 py-2.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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

      {/* ── Tier filter ── */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card border border-border/50">
        {([["all", "All clubs"], ["xplay", "XPLAY Clubs"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTierFilter(key)}
            className={`py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider transition-colors ${
              tierFilter === key ? "bg-primary text-primary-foreground" : "text-foreground/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Count line — states the split honestly ── */}
      {!loading && (
        <p className="text-xs text-foreground/80 text-center font-mono">
          {xplayClubs.length} XPLAY Club{xplayClubs.length !== 1 ? "s" : ""} · {otherClubs.length} other club{otherClubs.length !== 1 ? "s" : ""}
          {nearMeActive && geo.status === "ok" ? ` within ${radius} mi` : " nearby"}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Tier 1 · XPLAY Clubs ── */}
          <section className="space-y-3">
            <div>
              <h2 className="font-display font-black italic uppercase text-lg text-foreground tracking-tight">XPLAY Clubs</h2>
              <p className="text-xs text-foreground/80">Book, pay and earn points without leaving the app</p>
            </div>

            {xplayClubs.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {xplayClubs.map((club) => (
                  <XplayClubCard
                    key={club.id}
                    id={club.id}
                    name={club.club_name}
                    address={[club.address_line_1, club.postcode].filter(Boolean).join(", ") || club.city || club.location}
                    courtCount={club._activeCourtCount}
                    logoUrl={club.logo_url}
                    coverUrl={club.banner_url ?? club.image_url}
                    hasMembership={memberships.has(club.id)}
                    hasMembershipPlans={club._hasTiers}
                    distanceMi={club._distanceMi}
                  />
                ))}
              </div>
            ) : search.trim() ? (
              <p className="text-sm text-foreground/80">No XPLAY Clubs match “{search.trim()}”.</p>
            ) : (
              /* Launch state — intentional, not an empty state */
              <div className="rounded-2xl border border-primary/50 bg-card p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-base text-foreground">XPLAY Clubs are coming to London</h3>
                    <p className="text-sm text-foreground/85 mt-0.5">
                      At an XPLAY Club you book and pay the court in the app, the court is guaranteed, and you earn more points.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleTellYourClub}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-primary text-primary py-2.5 text-xs font-display font-black uppercase tracking-widest active:scale-[0.98] transition-transform"
                >
                  <Share2 className="w-3.5 h-3.5" /> Tell your club about XPLAY
                </button>
              </div>
            )}
          </section>

          {/* ── Tier 2 · Other clubs ── */}
          {tierFilter === "all" ? (
            <section className="space-y-1">
              <div className="pb-1">
                <h2 className="font-display font-black italic uppercase text-lg text-foreground tracking-tight">Other clubs near you</h2>
                <p className="text-xs text-foreground/80">
                  Live availability from their booking system · you book and pay there
                </p>
              </div>

              {otherClubs.length === 0 ? (
                <p className="text-sm text-foreground/80 py-4">
                  {nearMeActive ? `No other clubs within ${radius} miles — try a bigger radius.` : "No other clubs found."}
                </p>
              ) : (
                <>
                  <div>
                    {otherVisible.map((club) => (
                      <OtherClubRow
                        key={club.id}
                        id={club.id}
                        name={club.club_name}
                        area={club.city ?? club.location}
                        provider={club._nextSlot?.provider ?? club.external_provider}
                        nextSlotAt={club._nextSlot?.starts_at}
                        nextSlotPriceCents={club._nextSlot?.price_cents}
                        currencySymbol={club.currency_symbol ?? "£"}
                        distanceMi={club._distanceMi}
                      />
                    ))}
                  </div>
                  {otherVisible.length < otherClubs.length && (
                    <button
                      type="button"
                      onClick={() => setShowAllOther(true)}
                      className="w-full py-3 text-xs font-bold text-foreground"
                    >
                      <span className="font-mono">Showing {otherVisible.length} of {otherClubs.length}</span> · Show more
                    </button>
                  )}
                </>
              )}
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setTierFilter("all")}
              className="w-full py-3 text-sm text-foreground/85"
            >
              Looking for another club? <span className="font-bold text-foreground underline underline-offset-2">Show all clubs</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ClubsExplorer;
