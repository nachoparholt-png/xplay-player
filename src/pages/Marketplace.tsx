import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShopifyProduct, storefrontApiRequest, PRODUCTS_QUERY, resolveXpPrice, shopifyInStock } from "@/lib/shopify";
import { supabase } from "@/integrations/supabase/client";
import ProductQuickView from "@/components/marketplace/ProductQuickView";
import { CartDrawer } from "@/components/marketplace/CartDrawer";
import { Store, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const Marketplace = () => {
  const { profile } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [quickViewProduct, setQuickViewProduct] = useState<ShopifyProduct | null>(null);
  const [quickViewMeta, setQuickViewMeta] = useState<{ pointPrice?: number; stock?: number; localProductId?: string } | null>(null);

  // Fetch Shopify products
  const { data: shopifyProducts, isLoading: shopifyLoading, isError: shopifyError } = useQuery({
    queryKey: ["shopify-products"],
    queryFn: async () => {
      const data = await storefrontApiRequest(PRODUCTS_QUERY, { first: 50, query: "-tag:xplay-points-package" });
      return (data?.data?.products?.edges || []) as ShopifyProduct[];
    },
    retry: 1,
  });

  // Fetch local products for point pricing
  const { data: localProducts } = useQuery({
    queryKey: ["local-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("active", true);
      return data || [];
    },
  });

  const localProductMap = useMemo(() => {
    const map = new Map<string, { id: string; point_price: number; stock: number; category: string }>();
    localProducts?.forEach((p) => {
      if (p.shopify_product_id) {
        map.set(p.shopify_product_id, { id: p.id, point_price: p.point_price, stock: p.stock, category: p.category });
      }
    });
    return map;
  }, [localProducts]);

  // Categories with counts
  const categoriesWithCounts = useMemo(() => {
    if (!shopifyProducts) return [];
    const counts = new Map<string, number>();
    shopifyProducts.forEach((p) => {
      const local = localProductMap.get(p.node.id);
      if (local?.category) {
        counts.set(local.category, (counts.get(local.category) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .map(([cat, count]) => ({ cat, count }))
      .sort((a, b) => a.cat.localeCompare(b.cat));
  }, [shopifyProducts, localProductMap]);

  const filteredProducts = useMemo(() => {
    if (!shopifyProducts) return [];
    return shopifyProducts.filter((p) => {
      const local = localProductMap.get(p.node.id);
      return !activeCategory || local?.category === activeCategory;
    });
  }, [shopifyProducts, activeCategory, localProductMap]);

  const userPoints = profile?.padel_park_points ?? 0;

  // Featured product: first in-stock item, only when not filtering
  const featuredProduct = useMemo(() => {
    if (!shopifyProducts || activeCategory) return null;
    return shopifyProducts.find((p) => shopifyInStock(p)) ?? null;
  }, [shopifyProducts, activeCategory]);

  // Products below the hero (skip featured in the list)
  const listProducts = useMemo(() => {
    return filteredProducts.filter((p) => !featuredProduct || p.node.id !== featuredProduct.node.id);
  }, [filteredProducts, featuredProduct]);

  const formatPrice = (amount: string, currency: string) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: 0,
    }).format(parseFloat(amount));

  return (
    <>
      <div className="px-5 py-6 space-y-6 pb-32">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-black tracking-[0.18em] text-muted-foreground uppercase">
              Shop
            </div>
            <div className="font-display text-[28px] font-black italic uppercase leading-tight">
              Gear Store
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-black text-primary">{userPoints.toLocaleString()} XP</span>
            </div>
            <CartDrawer />
          </div>
        </div>

        {/* ── Editor's Pick hero ── */}
        {shopifyLoading ? (
          <div className="rounded-2xl overflow-hidden bg-muted h-56 animate-pulse" />
        ) : featuredProduct && (() => {
          const local = localProductMap.get(featuredProduct.node.id);
          const xpPrice = resolveXpPrice(featuredProduct, local?.point_price);
          const heroImage = featuredProduct.node.images.edges[0]?.node;
          const price = featuredProduct.node.priceRange.minVariantPrice;
          const vendor = featuredProduct.node.vendor;
          return (
            <button
              className="w-full text-left rounded-2xl overflow-hidden relative cursor-pointer active:scale-[0.98] transition-transform bg-card border border-border/30"
              onClick={() => {
                setQuickViewProduct(featuredProduct);
                setQuickViewMeta({ pointPrice: xpPrice, stock: shopifyInStock(featuredProduct) ? 1 : 0, localProductId: local?.id });
              }}
            >
              {heroImage && (
                <div className="h-48 w-full overflow-hidden relative">
                  <img
                    src={heroImage.url}
                    alt={heroImage.altText || featuredProduct.node.title}
                    className="w-full h-full object-cover opacity-75"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card/95 via-card/30 to-transparent" />
                </div>
              )}
              {/* EDITOR'S PICK badge */}
              <div className="absolute top-3 left-3">
                <span className="bg-primary text-primary-foreground text-[9px] font-black tracking-[0.18em] uppercase px-2.5 py-1 rounded-full">
                  Editor's Pick
                </span>
              </div>
              {/* Content overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {vendor && (
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">
                      {vendor}
                    </div>
                  )}
                  <div className="font-display text-xl font-black italic uppercase leading-tight text-white">
                    {featuredProduct.node.title}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    {price.amount && (
                      <div className="font-display text-lg font-black italic text-white">
                        {formatPrice(price.amount, price.currencyCode || "GBP")}
                      </div>
                    )}
                    {xpPrice && (
                      <div className="text-[10px] font-bold text-primary">
                        or {xpPrice.toLocaleString()} XP
                      </div>
                    )}
                  </div>
                  <div className="bg-primary text-primary-foreground font-black text-sm px-4 py-2 rounded-xl">
                    BUY
                  </div>
                </div>
              </div>
            </button>
          );
        })()}

        {/* ── Category tabs with counts ── */}
        {categoriesWithCounts.length > 0 && (
          <div className="flex gap-0 overflow-x-auto border-b border-border/40">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                "flex items-baseline gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-wide shrink-0 transition-colors border-b-2 -mb-px",
                activeCategory === null
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
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
                  activeCategory === cat
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {cat}
                <span className="text-[9px] font-black opacity-60">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Product list ── */}
        {shopifyLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-card border border-border/30">
                <Skeleton className="w-16 h-16 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
                <div className="space-y-1 text-right">
                  <Skeleton className="h-4 w-14 rounded" />
                  <Skeleton className="h-3 w-12 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : shopifyError ? (
          <div className="text-center py-20 space-y-3">
            <Store className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-sm font-semibold text-foreground">Store unavailable</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Couldn't connect right now. Check your connection and try again.
            </p>
          </div>
        ) : listProducts.length === 0 && !featuredProduct ? (
          <div className="text-center py-20 space-y-3">
            <Store className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground text-sm">No products found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {listProducts.map((product) => {
              const local = localProductMap.get(product.node.id);
              const xpPrice = resolveXpPrice(product, local?.point_price);
              const inStock = shopifyInStock(product);
              const image = product.node.images.edges[0]?.node;
              const price = product.node.priceRange.minVariantPrice;
              const vendor = product.node.vendor;

              return (
                <button
                  key={product.node.id}
                  onClick={() => {
                    setQuickViewProduct(product);
                    setQuickViewMeta({ pointPrice: xpPrice, stock: inStock ? 1 : 0, localProductId: local?.id });
                  }}
                  className={cn(
                    "w-full flex items-center gap-4 p-3 rounded-2xl border transition-colors active:scale-[0.98] text-left",
                    inStock
                      ? "bg-card border-border/30 hover:border-primary/30"
                      : "bg-card/50 border-border/20 opacity-50"
                  )}
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                    {image ? (
                      <img
                        src={image.url}
                        alt={image.altText || product.node.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Store className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Name + subtitle */}
                  <div className="flex-1 min-w-0">
                    {vendor && (
                      <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">
                        {vendor}
                      </div>
                    )}
                    <div className="font-display text-sm font-black italic uppercase leading-tight truncate">
                      {product.node.title}
                    </div>
                    {!inStock && (
                      <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">Out of stock</div>
                    )}
                  </div>

                  {/* Price */}
                  <div className="text-right shrink-0 space-y-0.5">
                    {price.amount && (
                      <div className="font-display text-sm font-black italic text-foreground">
                        {formatPrice(price.amount, price.currencyCode || "GBP")}
                      </div>
                    )}
                    {xpPrice && (
                      <div className="flex items-center justify-end gap-1">
                        <Zap className="w-2.5 h-2.5 text-primary" />
                        <span className="text-[10px] font-black text-primary">{xpPrice.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Product quick view bottom sheet */}
      <ProductQuickView
        product={quickViewProduct}
        pointPrice={quickViewMeta?.pointPrice}
        stock={quickViewMeta?.stock}
        localProductId={quickViewMeta?.localProductId}
        userPoints={userPoints}
        onClose={() => { setQuickViewProduct(null); setQuickViewMeta(null); }}
      />
    </>
  );
};

export default Marketplace;
