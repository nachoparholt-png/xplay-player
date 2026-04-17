import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShopifyProduct, storefrontApiRequest, PRODUCTS_QUERY, resolveXpPrice, shopifyInStock } from "@/lib/shopify";
import { supabase } from "@/integrations/supabase/client";
import ProductCard from "@/components/marketplace/ProductCard";
import ProductQuickView from "@/components/marketplace/ProductQuickView";
import { CartDrawer } from "@/components/marketplace/CartDrawer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Store } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";

const Marketplace = () => {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [quickViewProduct, setQuickViewProduct] = useState<ShopifyProduct | null>(null);
  const [quickViewMeta, setQuickViewMeta] = useState<{ pointPrice?: number; stock?: number; localProductId?: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

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

  // Build a map of shopify_product_id -> local product
  const localProductMap = useMemo(() => {
    const map = new Map<string, { id: string; point_price: number; stock: number; category: string }>();
    localProducts?.forEach((p) => {
      if (p.shopify_product_id) {
        map.set(p.shopify_product_id, { id: p.id, point_price: p.point_price, stock: p.stock, category: p.category });
      }
    });
    return map;
  }, [localProducts]);

  // Categories from local products
  const categories = useMemo(() => {
    const cats = new Set<string>();
    localProducts?.forEach((p) => cats.add(p.category));
    return Array.from(cats).sort();
  }, [localProducts]);

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!shopifyProducts) return [];
    return shopifyProducts.filter((p) => {
      const matchesSearch = !debouncedSearch || p.node.title.toLowerCase().includes(debouncedSearch.toLowerCase());
      const local = localProductMap.get(p.node.id);
      const matchesCategory = !activeCategory || local?.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [shopifyProducts, debouncedSearch, activeCategory, localProductMap]);

  const userPoints = profile?.padel_park_points ?? 0;

  return (
    <>
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Marketplace</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Balance: <span className="text-primary font-semibold">{userPoints.toLocaleString()} XP</span>
          </p>
        </div>
        <CartDrawer />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <Badge
            variant={activeCategory === null ? "default" : "outline"}
            className="cursor-pointer shrink-0"
            onClick={() => setActiveCategory(null)}
          >
            All
          </Badge>
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              className="cursor-pointer shrink-0 capitalize"
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      )}

      {/* Product grid */}
      {shopifyLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden bg-card border border-border/40">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-3.5 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : shopifyError ? (
        <div className="text-center py-20 space-y-3">
          <Store className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground">Marketplace unavailable</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            We couldn't connect to the store right now. Please check your connection and try again.
          </p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Store className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No products found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const local = localProductMap.get(product.node.id);
            // ✅ Option 2: XP price from Shopify metafield → local DB → formula
            const derivedPointPrice = resolveXpPrice(product, local?.point_price);
            // ✅ Option 2: stock status from Shopify (availableForSale), not local DB
            const inStock = shopifyInStock(product);
            return (
              <ProductCard
                key={product.node.id}
                product={product}
                pointPrice={derivedPointPrice}
                inStock={inStock}
                userPoints={userPoints}
                localProductId={local?.id}
                onClick={() => {
                  setQuickViewProduct(product);
                  setQuickViewMeta({ pointPrice: derivedPointPrice, stock: inStock ? 1 : 0, localProductId: local?.id });
                }}
              />
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
