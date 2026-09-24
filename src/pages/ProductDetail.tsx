import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MarketplaceRedeemModal from "@/components/marketplace/RedeemConfirmModal";
import { ArrowLeft, Zap, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { xpToPence } from "@/lib/pointsCopy";
import {
  formatPence, sellableVariants, useDeliveryQuote, useSavedAddress, useStoreProduct, type ShippingAddress,
} from "@/lib/store";

const ProductDetail = () => {
  // route param is still called :handle; it now carries the product id
  const { handle: productId } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, refreshProfile } = useAuth();
  const { data: product, isLoading } = useStoreProduct(productId);
  const { data: savedAddress } = useSavedAddress();
  const delivery = useDeliveryQuote(product?.delivery_size);

  const variants = useMemo(() => (product ? sellableVariants(product) : []), [product]);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  // preselect the first size that is in stock
  useEffect(() => {
    if (variantId || variants.length === 0) return;
    setVariantId((variants.find((v) => v.stock > 0) ?? variants[0]).id);
  }, [variants, variantId]);

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
        <Button variant="link" onClick={() => navigate("/marketplace")}>Back to the store</Button>
      </div>
    );
  }

  const selected = variants.find((v) => v.id === variantId) ?? null;
  const userPoints = profile?.padel_park_points ?? 0;
  const pointPrice = Math.ceil(product.point_price);
  const outOfStock = !selected || selected.stock <= 0;
  const lowStock = !!selected && selected.stock > 0 && selected.stock <= selected.low_stock_threshold;

  const handleConfirm = async (shippingAddress: ShippingAddress, pointsToUse: number) => {
    if (!selected) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke("store-order", {
        body: { action: "create", variant_id: selected.id, points_to_use: pointsToUse, shipping_address: shippingAddress },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        window.location.href = data.url; // Stripe; we come back on /payment-success
        return;
      }
      toast.success("Order confirmed", { description: `${product.title} — order #${data?.order?.order_number}` });
      queryClient.invalidateQueries({ queryKey: ["store-product"] });
      queryClient.invalidateQueries({ queryKey: ["store-products"] });
      queryClient.invalidateQueries({ queryKey: ["store-saved-address"] });
      queryClient.invalidateQueries({ queryKey: ["store-delivery-settings"] });
      refreshProfile();
      setRedeemOpen(false);
      navigate("/orders");
    } catch (err) {
      toast.error("Order not placed", { description: err instanceof Error ? err.message : "Something went wrong" });
      queryClient.invalidateQueries({ queryKey: ["store-product"] });
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/marketplace")}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <div className="aspect-square overflow-hidden rounded-xl bg-secondary/20">
        {product.image_url ? (
          <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">No image</div>
        )}
      </div>

      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold">{product.title}</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-primary text-lg font-bold">
            <Zap className="w-5 h-5" />
            {pointPrice.toLocaleString()} XP
          </div>
          <p className="text-muted-foreground">or {formatPence(xpToPence(pointPrice))}</p>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Truck className="w-4 h-4" />
          {delivery.free ? "Free UK delivery with XPLAY Pro" : `UK delivery ${formatPence(delivery.feePence)}`}
        </p>
        {outOfStock && <Badge variant="destructive">Out of stock</Badge>}
        {lowStock && <Badge variant="outline">Only {selected!.stock} left</Badge>}

        {variants.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Size</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={v.stock <= 0}
                  onClick={() => setVariantId(v.id)}
                  className={`min-h-[44px] min-w-[44px] px-4 rounded-xl border text-sm font-bold transition-colors ${
                    v.id === variantId
                      ? "bg-primary text-primary-foreground border-primary"
                      : v.stock <= 0
                        ? "border-border/40 text-muted-foreground/50 line-through"
                        : "border-border text-foreground"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Button before the long description so it is on the first screen. */}
        <div className="pt-1">
          <Button className="w-full h-12 rounded-xl" size="lg" disabled={outOfStock} onClick={() => setRedeemOpen(true)}>
            <Zap className="w-4 h-4 mr-2" />
            {userPoints > 0 ? "Redeem with XPLAY Points" : "Buy now"}
          </Button>
        </div>

        {product.description && (
          <div className="pb-6">
            <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground mb-2">About this product</h2>
            <p className={`text-sm text-foreground/80 leading-relaxed whitespace-pre-line ${descOpen ? "" : "line-clamp-5"}`}>{product.description}</p>
            {product.description.length > 260 && (
              <button type="button" onClick={() => setDescOpen(!descOpen)} className="mt-1 min-h-[44px] text-sm font-semibold text-primary">
                {descOpen ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        )}
      </div>

      <MarketplaceRedeemModal
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        onConfirm={handleConfirm}
        productTitle={product.title}
        variantLabel={selected?.label}
        pointPrice={pointPrice}
        userPoints={userPoints}
        delivery={delivery}
        savedAddress={savedAddress}
        isLoading={redeeming}
      />
    </div>
  );
};

export default ProductDetail;
