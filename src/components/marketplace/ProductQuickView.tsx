/**
 * ProductQuickView — bottom sheet that slides up when a product card is tapped.
 * Keeps the grid clean and avoids the full product detail page for browsing.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, ShoppingCart, Loader2, Package } from "lucide-react";
import { ShopifyProduct, formatPrice } from "@/lib/shopify";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/stores/cartStore";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MarketplaceRedeemModal from "./RedeemConfirmModal";

interface ProductQuickViewProps {
  product: ShopifyProduct | null;
  pointPrice?: number;
  stock?: number;
  userPoints?: number;
  localProductId?: string;
  onClose: () => void;
}

export default function ProductQuickView({
  product,
  pointPrice,
  stock,
  userPoints = 0,
  localProductId,
  onClose,
}: ProductQuickViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();
  const { addItem, isLoading: cartLoading } = useCartStore();
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const isOpen = !!product;

  if (!product) return null;

  const { node } = product;
  const image = node.images.edges[0]?.node;
  const variant = node.variants.edges[0]?.node;
  const price = node.priceRange.minVariantPrice;
  const outOfStock = stock !== undefined && stock <= 0;
  const canAffordWithPoints = pointPrice !== undefined && userPoints >= pointPrice;

  // Short description — first sentence or first 140 chars
  const rawDesc = node.description || "";
  const shortDesc = rawDesc.length > 140
    ? rawDesc.slice(0, 140).replace(/\s\S*$/, "") + "…"
    : rawDesc;

  const handleAddToCart = async () => {
    if (!variant || outOfStock) return;
    await addItem({
      product,
      variantId: variant.id,
      variantTitle: variant.title,
      price: variant.price,
      quantity: 1,
      selectedOptions: variant.selectedOptions || [],
    });
    toast.success("Added to cart", { description: node.title });
    onClose();
  };

  const handleRedeem = () => {
    if (!localProductId) {
      toast.error("This product isn't set up for points redemption yet.");
      return;
    }
    setRedeemOpen(true);
  };

  const handleConfirmFullPoints = async (shippingAddress: Record<string, string>) => {
    if (!localProductId) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-product", {
        body: { product_id: localProductId, shipping_address: shippingAddress },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Redeemed!", { description: `${node.title} redeemed successfully.` });
      queryClient.invalidateQueries({ queryKey: ["local-products"] });
      refreshProfile();
      setRedeemOpen(false);
      onClose();
      navigate("/orders");
    } catch (err: any) {
      toast.error("Redemption failed", { description: err.message });
    } finally {
      setRedeeming(false);
    }
  };

  const handleConfirmHybrid = async (shippingAddress: Record<string, string>, pointsToUse: number) => {
    if (!localProductId) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-payment-intent", {
        body: { product_id: localProductId, shipping_address: shippingAddress, points_to_use: pointsToUse },
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
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />

            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl overflow-hidden"
              style={{ maxHeight: "85dvh" }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors z-10"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>

              <div className="overflow-y-auto" style={{ maxHeight: "calc(85dvh - 32px)" }}>
                {/* Product image */}
                <div className="w-full aspect-[4/3] overflow-hidden bg-secondary/20 relative">
                  {image ? (
                    <img
                      src={image.url}
                      alt={image.altText || node.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-muted-foreground/30" />
                    </div>
                  )}
                  {outOfStock && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white font-bold text-lg tracking-wide">OUT OF STOCK</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                  {/* Title + prices */}
                  <div>
                    <h2 className="font-display font-bold text-lg leading-tight">{node.title}</h2>
                    <div className="flex items-baseline gap-3 mt-2">
                      {pointPrice !== undefined && pointPrice > 0 && (
                        <div className="flex items-center gap-1 text-primary font-bold text-xl">
                          <Zap className="w-5 h-5" />
                          <span>{pointPrice.toLocaleString()} XP</span>
                        </div>
                      )}
                      <span className="text-muted-foreground text-sm">
                        {formatPrice(price.amount, price.currencyCode)}
                      </span>
                    </div>

                    {/* Points balance indicator */}
                    {pointPrice !== undefined && pointPrice > 0 && (
                      <p className="text-xs mt-1.5 font-medium"
                        style={{ color: canAffordWithPoints ? "#CDFF65" : "#ADBFF0" }}>
                        {canAffordWithPoints
                          ? `✓ You have enough XP (${userPoints.toLocaleString()} XP)`
                          : `You have ${userPoints.toLocaleString()} XP — ${(pointPrice - userPoints).toLocaleString()} XP short`}
                      </p>
                    )}
                  </div>

                  {/* Short description */}
                  {shortDesc && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{shortDesc}</p>
                  )}

                  {/* Stock */}
                  {stock !== undefined && stock > 0 && stock <= 5 && (
                    <p className="text-xs text-amber-400 font-semibold">
                      Only {stock} left in stock
                    </p>
                  )}

                  {/* Actions */}
                  <div className="space-y-2" style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
                    {pointPrice !== undefined && pointPrice > 0 && localProductId && (
                      <Button
                        className="w-full gap-2 h-12 text-base font-bold"
                        onClick={handleRedeem}
                        disabled={outOfStock || redeeming}
                      >
                        {redeeming
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Zap className="w-4 h-4" />}
                        Redeem with XP
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      className="w-full gap-2 h-12 text-base"
                      onClick={handleAddToCart}
                      disabled={outOfStock || cartLoading}
                    >
                      {cartLoading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <ShoppingCart className="w-4 h-4" />}
                      Add to Cart — {formatPrice(price.amount, price.currencyCode)}
                    </Button>

                    {/* See full details link */}
                    <button
                      onClick={() => { onClose(); navigate(`/marketplace/${node.handle}`); }}
                      className="w-full text-center text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1"
                    >
                      See full product details →
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Redeem modal stays outside the sheet */}
      {pointPrice !== undefined && pointPrice > 0 && (
        <MarketplaceRedeemModal
          open={redeemOpen}
          onClose={() => setRedeemOpen(false)}
          onConfirmFullPoints={handleConfirmFullPoints}
          onConfirmHybrid={handleConfirmHybrid}
          productTitle={node.title}
          pointPrice={pointPrice}
          userPoints={userPoints}
          isLoading={redeeming}
        />
      )}
    </>
  );
}
