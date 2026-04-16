import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { storefrontApiRequest, PRODUCT_BY_HANDLE_QUERY, ShopifyProduct, formatPrice, resolveXpPrice, shopifyInStock } from "@/lib/shopify";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CartDrawer } from "@/components/marketplace/CartDrawer";
import MarketplaceRedeemModal from "@/components/marketplace/RedeemConfirmModal";
import { ArrowLeft, ShoppingCart, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ProductDetail = () => {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, refreshProfile } = useAuth();
  const { addItem, isLoading: cartLoading } = useCartStore();
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ["shopify-product", handle],
    queryFn: async () => {
      const data = await storefrontApiRequest(PRODUCT_BY_HANDLE_QUERY, { handle });
      if (!data?.data?.product) return null;
      return { node: data.data.product } as ShopifyProduct;
    },
    enabled: !!handle,
  });

  const { data: localProduct } = useQuery({
    queryKey: ["local-product", product?.node?.id],
    queryFn: async () => {
      if (!product?.node?.id) return null;
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("shopify_product_id", product.node.id)
        .eq("active", true)
        .maybeSingle();
      return data;
    },
    enabled: !!product?.node?.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-4 text-center py-20">
        <p className="text-muted-foreground">Product not found</p>
        <Button variant="link" onClick={() => navigate("/marketplace")}>Back to Marketplace</Button>
      </div>
    );
  }

  const { node } = product;
  const variants = node.variants.edges;
  const selectedVariant = variants[selectedVariantIdx]?.node;
  const images = node.images.edges;
  const userPoints = profile?.padel_park_points ?? 0;
  // ✅ Option 2: XP price from Shopify metafield → local DB → formula
  const pointPrice = resolveXpPrice(product, localProduct?.point_price);
  // ✅ Option 2: stock status from Shopify (availableForSale), not local DB
  const outOfStock = !shopifyInStock(product);

  const handleAddToCart = async () => {
    if (!selectedVariant || outOfStock) return;
    await addItem({
      product,
      variantId: selectedVariant.id,
      variantTitle: selectedVariant.title,
      price: selectedVariant.price,
      quantity: 1,
      selectedOptions: selectedVariant.selectedOptions || [],
    });
    toast.success("Added to cart", { description: node.title });
  };

  const handleFullPointsRedeem = async (shippingAddress: Record<string, string>) => {
    if (!localProduct) {
      toast.error("This product isn't set up for points redemption yet.");
      return;
    }
    setRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-product", {
        body: { product_id: localProduct.id, shipping_address: shippingAddress },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Redeemed!", { description: `${node.title} has been redeemed successfully.` });
      queryClient.invalidateQueries({ queryKey: ["local-product"] });
      queryClient.invalidateQueries({ queryKey: ["local-products"] });
      queryClient.invalidateQueries({ queryKey: ["shopify-products"] });
      refreshProfile();
      setRedeemOpen(false);
      navigate("/orders");
    } catch (err: any) {
      toast.error("Redemption failed", { description: err.message });
    } finally {
      setRedeeming(false);
    }
  };

  const handleHybridRedeem = async (shippingAddress: Record<string, string>, pointsToUse: number) => {
    if (!localProduct) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-payment-intent", {
        body: { product_id: localProduct.id, shipping_address: shippingAddress, points_to_use: pointsToUse },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error("Payment failed", { description: err.message });
      setRedeeming(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/marketplace")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <CartDrawer />
      </div>

      <div className="aspect-square overflow-hidden rounded-xl bg-secondary/20">
        {images[0] ? (
          <img src={images[0].node.url} alt={images[0].node.altText || node.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">No image</div>
        )}
      </div>

      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold">{node.title}</h1>
        <div className="flex items-center gap-3">
          {pointPrice > 0 && (
            <div className="flex items-center gap-1.5 text-primary text-lg font-bold">
              <Zap className="w-5 h-5" />
              {pointPrice.toLocaleString()} XP
            </div>
          )}
          <p className="text-muted-foreground">
            {selectedVariant ? formatPrice(selectedVariant.price.amount, selectedVariant.price.currencyCode) : ""}
          </p>
        </div>
        {outOfStock && <Badge variant="destructive">Out of Stock</Badge>}

        {variants.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Variant</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((v, idx) => (
                <Badge
                  key={v.node.id}
                  variant={idx === selectedVariantIdx ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setSelectedVariantIdx(idx)}
                >
                  {v.node.title}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm text-muted-foreground leading-relaxed">{node.description}</p>
      </div>

      <div className="space-y-3 pb-6">
        {pointPrice > 0 && (
          <Button className="w-full" size="lg" disabled={outOfStock} onClick={() => setRedeemOpen(true)}>
            <Zap className="w-4 h-4 mr-2" />
            Redeem with Points
          </Button>
        )}

        <Button variant="outline" className="w-full" size="lg" onClick={handleAddToCart} disabled={cartLoading || outOfStock}>
          {cartLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
          Add to Cart (Pay with Card)
        </Button>
      </div>

      <MarketplaceRedeemModal
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        onConfirmFullPoints={handleFullPointsRedeem}
        onConfirmHybrid={handleHybridRedeem}
        productTitle={node.title}
        pointPrice={pointPrice}
        userPoints={userPoints}
        isLoading={redeeming}
      />
    </div>
  );
};

export default ProductDetail;
