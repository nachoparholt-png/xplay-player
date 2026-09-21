import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Store, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { xpToPence } from "@/lib/pointsCopy";
import { formatPence, productInStock, useStoreProducts, type StoreProduct } from "@/lib/store";

const Marketplace = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const { data: products, isLoading, isError } = useStoreProducts();

  // Back from Stripe without paying → put the held item back into stock straight away.
  useEffect(() => {
    const cancelled = searchParams.get("cancelled_order");
    if (!cancelled) return;
    searchParams.delete("cancelled_order");
    setSearchParams(searchParams, { replace: true });
    supabase.functions
      .invoke("store-order", { body: { action: "cancel", order_id: cancelled } })
      .then(({ data }) => {
        if (data?.paid) {
          navigate("/orders");
          return;
        }
        toast("Payment cancelled", { description: "Nothing was charged and no points were taken." });
        queryClient.invalidateQueries({ queryKey: ["store-products"] });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoriesWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (products ?? []).forEach((p) => {
      if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([cat, count]) => ({ cat, count })).sort((a, b) => a.cat.localeCompare(b.cat));
  }, [products]);

  const filteredProducts = useMemo(
    () => (products ?? []).filter((p) => !activeCategory || p.category === activeCategory),
    [products, activeCategory],
  );

  const userPoints = profile?.padel_park_points ?? 0;

  // Featured product: first in-stock item, only when not filtering
  const featuredProduct = useMemo(
    () => (activeCategory ? null : (products ?? []).find(productInStock) ?? null),
    [products, activeCategory],
  );
  const listProducts = filteredProducts.filter((p) => !featuredProduct || p.id !== featuredProduct.id);

  const open = (p: StoreProduct) => navigate(`/marketplace/${p.id}`);

  return (
    <div className="px-5 py-6 space-y-6 pb-32">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-black tracking-[0.18em] text-muted-foreground uppercase">Shop</div>
          <div className="font-display text-[28px] font-black italic uppercase leading-tight">Gear Store</div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 mt-1 rounded-xl bg-primary/10 border border-primary/20">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-black text-primary">{userPoints.toLocaleString()} XP</span>
        </div>
      </div>

      {/* ── Editor's Pick hero ── */}
      {isLoading ? (
        <div className="rounded-2xl overflow-hidden bg-muted h-56 animate-pulse" />
      ) : featuredProduct && (
        <button
          className="w-full text-left rounded-2xl overflow-hidden relative cursor-pointer active:scale-[0.98] transition-transform bg-card border border-border/30"
          onClick={() => open(featuredProduct)}
        >
          <div className="h-48 w-full overflow-hidden relative bg-muted">
            {featuredProduct.image_url && (
              <img src={featuredProduct.image_url} alt={featuredProduct.title} className="w-full h-full object-cover opacity-75" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-card/95 via-card/30 to-transparent" />
          </div>
          <div className="absolute top-3 left-3">
            <span className="bg-primary text-primary-foreground text-[10px] font-black tracking-[0.18em] uppercase px-2.5 py-1 rounded-full">
              Editor's Pick
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-display text-xl font-black italic uppercase leading-tight text-white">{featuredProduct.title}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <div className="font-display text-lg font-black italic text-primary">
                  {Math.ceil(featuredProduct.point_price).toLocaleString()} XP
                </div>
                <div className="text-[10px] font-bold text-white">or {formatPence(xpToPence(Math.ceil(featuredProduct.point_price)))}</div>
              </div>
              <div className="bg-primary text-primary-foreground font-black text-sm px-4 py-2 rounded-xl">VIEW</div>
            </div>
          </div>
        </button>
      )}

      {/* ── Category tabs with counts ── */}
      {categoriesWithCounts.length > 1 && (
        <div className="flex gap-0 overflow-x-auto border-b border-border/40">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              "flex items-baseline gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-wide shrink-0 transition-colors border-b-2 -mb-px",
              activeCategory === null ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
            )}
          >
            All
          </button>
          {categoriesWithCounts.map(({ cat, count }) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "flex items-baseline gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-wide shrink-0 transition-colors border-b-2 -mb-px",
                activeCategory === cat ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
              )}
            >
              {cat}
              <span className="text-[11px] font-black opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Product list ── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-card border border-border/30">
              <Skeleton className="w-16 h-16 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-20 space-y-3">
          <Store className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground">Store unavailable</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">Couldn't connect right now. Check your connection and try again.</p>
        </div>
      ) : listProducts.length === 0 && !featuredProduct ? (
        <div className="text-center py-20 space-y-3">
          <Store className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm">No products yet. New gear is on its way.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {listProducts.map((product) => {
            const inStock = productInStock(product);
            const xp = Math.ceil(product.point_price);
            return (
              <button
                key={product.id}
                onClick={() => open(product)}
                className={cn(
                  "w-full flex items-center gap-4 p-3 rounded-2xl border transition-colors active:scale-[0.98] text-left",
                  inStock ? "bg-card border-border/30" : "bg-card/50 border-border/20 opacity-60",
                )}
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Store className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-sm font-black italic uppercase leading-tight truncate">{product.title}</div>
                  {!inStock && <div className="text-[11px] text-muted-foreground font-semibold mt-0.5">Out of stock</div>}
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <div className="flex items-center justify-end gap-1">
                    <Zap className="w-3 h-3 text-primary" />
                    <span className="text-sm font-black text-primary">{xp.toLocaleString()} XP</span>
                  </div>
                  <div className="text-[11px] font-semibold text-muted-foreground">or {formatPence(xpToPence(xp))}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Marketplace;
