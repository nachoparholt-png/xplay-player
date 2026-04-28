import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Package, ChevronRight, MapPin, Loader2, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

type ClubWithProducts = {
  id: string;
  club_name: string;
  location: string | null;
  city: string | null;
  logo_url?: string | null;
  product_count: number;
  preview_photo: string | null;
};

const ClubsMarketSection = () => {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<ClubWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const fetchClubsWithProducts = async () => {
      setLoading(true);

      // Get clubs that have at least one active product
      const { data: productRows } = await supabase
        .from("club_market_products")
        .select("club_id, photos")
        .eq("active", true)
        .gt("stock_qty", 0);

      if (!productRows || productRows.length === 0) {
        setClubs([]);
        setLoading(false);
        return;
      }

      // Count and preview photos per club
      const countMap = new Map<string, { count: number; photo: string | null }>();
      for (const row of productRows) {
        const existing = countMap.get(row.club_id) ?? { count: 0, photo: null };
        const photos = Array.isArray(row.photos) ? row.photos : [];
        countMap.set(row.club_id, {
          count: existing.count + 1,
          photo: existing.photo ?? (photos[0] || null),
        });
      }

      const clubIds = [...countMap.keys()];
      const { data: clubRows } = await supabase
        .from("clubs")
        .select("id, club_name, location, city")
        .in("id", clubIds)
        .eq("club_status", "active");

      const enriched: ClubWithProducts[] = (clubRows || []).map(c => ({
        ...c,
        product_count: countMap.get(c.id)?.count ?? 0,
        preview_photo: countMap.get(c.id)?.photo ?? null,
      }));

      setClubs(enriched);
      setLoading(false);
    };

    fetchClubsWithProducts();
  }, []);

  const filtered = filter.trim()
    ? clubs.filter(c =>
        c.club_name.toLowerCase().includes(filter.toLowerCase()) ||
        (c.city ?? "").toLowerCase().includes(filter.toLowerCase()) ||
        (c.location ?? "").toLowerCase().includes(filter.toLowerCase())
      )
    : clubs;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="text-center py-12 space-y-2 px-4">
        <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-sm font-semibold text-foreground">No club shops yet</p>
        <p className="text-xs text-muted-foreground">
          Clubs will appear here once they add products to their market
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-6">
      {/* Search */}
      <div className="relative">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search clubs..."
          className="w-full h-10 rounded-xl bg-muted border border-border/30 px-4 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
          style={{ fontSize: "16px" }}
        />
      </div>

      {/* Club cards */}
      <div className="space-y-3">
        {filtered.map(club => (
          <button
            key={club.id}
            onClick={() => navigate(`/clubs/${club.id}?tab=shop`)}
            className="w-full bg-card border border-border/50 rounded-2xl overflow-hidden flex items-center gap-0 text-left active:scale-[0.98] transition-transform"
          >
            {/* Thumbnail */}
            <div className="w-20 h-20 bg-muted flex-shrink-0 flex items-center justify-center">
              {club.preview_photo ? (
                <img src={club.preview_photo} alt="" className="w-full h-full object-cover" />
              ) : (
                <Package className="w-6 h-6 text-muted-foreground/30" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 px-4 py-3 min-w-0">
              <p className="font-display font-bold text-sm text-foreground truncate">{club.club_name}</p>
              {(club.city || club.location) && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {club.city || club.location}
                </p>
              )}
              <p className="text-[11px] text-primary font-semibold mt-1.5">
                {club.product_count} product{club.product_count !== 1 ? "s" : ""} available
              </p>
            </div>

            <ChevronRight className="w-4 h-4 text-muted-foreground mr-4 shrink-0" />
          </button>
        ))}

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No clubs match your search</p>
        )}
      </div>
    </div>
  );
};

export default ClubsMarketSection;
