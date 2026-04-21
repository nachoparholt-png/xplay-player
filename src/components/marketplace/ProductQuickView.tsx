/**
 * ProductQuickView — bottom sheet that slides up when a product card is tapped.
 * Keeps the grid clean and avoids the full product detail page for browsing.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Package, ArrowRight } from "lucide-react";
import { ShopifyProduct, formatPrice } from "@/lib/shopify";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/stores/cartStore";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-[28px] overflow-hidden"
              style={{ maxHeight: "85dvh" }}
            >
              {/* Grab handle */}
              <div className="flex justify-center pt-4 pb-0">
                <div className="w-10 h-1 rounded-full bg-muted" />
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: "calc(85dvh - 32px)" }}>
                {/* Product image */}
                <div className="w-full aspect-square overflow-hidden bg-muted relative px-4 pt-4">
                  {image ? (
                    <img
                      src={image.url}
                      alt={image.altText || node.title}
                      className="w-full h-full object-cover rounded-[22px]"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center rounded-[22px] bg-muted">
                      <Package className="w-12 h-12 text-muted-foreground/30" />
                    </div>
                  )}
                  {outOfStock && (
                    <div className="absolute inset-4 bg-black/50 rounded-[22px] flex items-center justify-center">
                      <span className="text-white font-bold text-lg tracking-wide">OUT OF STOCK</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                  {/* Brand label */}
                  <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">
                      Brand
                    </p>
                    {/* Product title */}
                    <h2 className="font-display text-[26px] font-black italic uppercase text-foreground leading-[0.95]">
                      {node.title}
                    </h2>
                  </div>

                  {/* XP-first pricing section */}
                  {pointPrice !== undefined && pointPrice > 0 && (
                    <div>
                      {/* Big XP price */}
                      <div className="flex items-baseline gap-2 mb-1">
                        <div className="font-display text-[34px] font-black italic text-primary tracking-[-0.03em]">
                          {pointPrice.toLocaleString()}
                        </div>
                        <div className="text-[12px] font-black text-primary tracking-[0.1em] mt-1">
                          XP
                        </div>
                      </div>

                      {/* Cash price */}
                      <p className="text-[11px] text-muted-foreground ml-auto inline-block">
                        or {formatPrice(price.amount, price.currencyCode)}
                      </p>

                      {/* Points balance */}
                      <p className="text-[10px] text-muted-foreground mt-3">
                        You have{" "}
                        <span className="text-primary font-bold">
                          {userPoints.toLocaleString()} XP
                        </span>
                        {!canAffordWithPoints && ` · ${(pointPrice - userPoints).toLocaleString()} short`}
                      </p>

                      {/* Progress bar */}
                      <div className="h-1 rounded-full bg-muted mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${Math.min((userPoints / pointPrice) * 100, 100)}%` }}
                        />
                      </div>

                      {/* Divider */}
                      <div className="border-b border-border/[0.08] pb-4 mb-4 mt-4" />
                    </div>
                  )}

                  {/* Variants section */}
                  {node.variants.edges && node.variants.edges.length > 1 && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1.5">
                        Weight
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {node.variants.edges.map((v) => (
                          <button
                            key={v.node.id}
                            className={cn(
                              "px-[14px] py-2 rounded-[12px] font-display text-[11px] font-black transition-colors",
                              v.node.id === variant?.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-card border border-border/10 text-foreground"
                            )}
                          >
                            {v.node.title}
                          </button>
                        ))}
                      </div>
                      <div className="border-b border-border/[0.08] pb-4 mb-4 mt-4" />
                    </div>
                  )}

                  {/* Stock warning */}
                  {stock !== undefined && stock > 0 && stock <= 5 && (
                    <p className="text-xs text-amber-400 font-semibold">
                      Only {stock} left in stock
                    </p>
                  )}

                  {/* Short description */}
                  {shortDesc && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{shortDesc}</p>
                  )}

                  {/* Spacer for sticky CTA */}
                  <div style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
                    <div className="h-32" />
                  </div>
                </div>
              </div>

              {/* Sticky CTA button */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-card to-transparent" style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 16px) + 16px)` }}>
                {pointPrice !== undefined && pointPrice > 0 && localProductId ? (
                  <>
                    <button
                      onClick={handleRedeem}
                      disabled={outOfStock || redeeming}
                      className="w-full h-[54px] rounded-[16px] bg-primary text-primary-foreground font-display text-[14px] font-black italic uppercase tracking-[0.04em] shadow-[0_6px_28px_hsl(var(--primary)/0.35)] flex items-center justify-between px-[18px] disabled:opacity-50"
                    >
                      <span>
                        {canAffordWithPoints
                          ? "Redeem with XP"
                          : `Buy · Mix XP + €`}
                      </span>
                      {redeeming ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowRight className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={handleAddToCart}
                      disabled={outOfStock || cartLoading}
                      className="w-full text-[11px] font-bold text-muted-foreground text-center mt-2 hover:text-foreground transition-colors"
                    >
                      {cartLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin inline" />
                      ) : (
                        <>
                          Pay full price with{" "}
                          <u>card</u>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleAddToCart}
                    disabled={outOfStock || cartLoading}
                    className="w-full h-[54px] rounded-[16px] bg-primary text-primary-foreground font-display text-[14px] font-black italic uppercase tracking-[0.04em] shadow-[0_6px_28px_hsl(var(--primary)/0.35)] flex items-center justify-between px-[18px] disabled:opacity-50"
                  >
                    <span>Add to cart</span>
                    {cartLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                  </button>
                )}
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
