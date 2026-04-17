import { useState, useEffect } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ClubCard from "./ClubCard";

const ClubsExplorer = () => {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClubs = async () => {
      setLoading(true);
      const { data } = await supabase.from("clubs").select("*").eq("club_status", "active").order("club_name");
      
      // Count active courts and derive court types from surface + indoor columns
      const { data: courts } = await supabase.from("courts").select("club_id, surface, indoor").eq("active", true);
      const formatSurface = (s: string) =>
        s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      const courtCounts: Record<string, number> = {};
      const courtTypes: Record<string, Set<string>> = {};
      (courts || []).forEach((c: any) => {
        courtCounts[c.club_id] = (courtCounts[c.club_id] || 0) + 1;
        if (!courtTypes[c.club_id]) courtTypes[c.club_id] = new Set();
        const label = c.surface
          ? `${c.indoor ? "Indoor" : "Outdoor"} ${formatSurface(c.surface)}`
          : c.indoor != null ? (c.indoor ? "Indoor" : "Outdoor") : "Padel";
        courtTypes[c.club_id].add(label);
      });

      setClubs((data || []).map(club => ({
        ...club,
        _activeCourtCount: courtCounts[club.id] || 0,
        _courtTypes: courtTypes[club.id] ? Array.from(courtTypes[club.id]).join(" / ") : "Padel",
      })));

      if (user) {
        const now = new Date().toISOString();
        const { data: mems } = await supabase.from("club_memberships")
          .select("club_id, expires_at")
          .eq("user_id", user.id)
          .eq("status", "active");
        // Filter out expired memberships
        const activeMems = (mems || []).filter(
          (m) => !m.expires_at || m.expires_at > now
        );
        setMemberships(new Set(activeMems.map((m) => m.club_id)));
      }
      setLoading(false);
    };
    fetchClubs();
  }, [user]);

  const filtered = clubs.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.club_name ?? '').toLowerCase().includes(q) ||
      (c.city ?? c.location ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clubs..."
            className="w-full bg-card border border-border/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Count label */}
      {!loading && (
        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} club{filtered.length !== 1 ? "s" : ""} in the XPLAY ecosystem
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm">No clubs found</p>
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ClubsExplorer;
