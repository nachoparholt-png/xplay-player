import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Package, ShoppingCart, Zap, Truck, Loader2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Product = {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  photos: string[];
  price_cents: number;
  xp_price: number | null;
  stock_qty: number;
  shipping_enabled: boolean;
};

interface ClubMarketTabProps {
  clubId: string;
  clubName: string;
  membershipDiscount?: number; // market_discount_pct from member's tier
}

const ClubMarketTab = ({ clubId, clubName, membershipDiscount = 0 }: ClubMarketTabProps) => {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [payMode, setPayMode] = useState<"xp" | "card">("xp");
  const [quantity, setQuantity] = useState(1);
  const [wantsShipping, setWantsShipping] = useState(false);
  const [shippingAddress, setShippingAddress] = useState("");
  const [ordering, setOrdering] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const userXp = profile?.padel_park_points ?? 0;

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("club_market_products")
        .select("*")
        .eq("club_id", clubId)
        .eq("active", true)
        .order("created_at", { ascending: false });
      setProducts((data as Product[]) || []);
      setLoading(false);
    };
    fetchProducts();
  }, [clubId]);

  const openProduct = (p: Product) => {
    setSelected(p);
    // Default to XP if available and user has enough, else card
    setPayMode(p.xp_price !== null && userXp >= p.xp_price ? "xp" : "card");
    setQuantity(1);
    setWantsShipping(false);
    setShippingAddress("");
    setModalOpen(true);
  };

  // Apply membership discount to XP price
  const discountedXp = (p: Product) => {
    if (p.xp_price === null) return null;
    if (membershipDiscount <= 0) return p.xp_price;
    return Math.max(1, Math.round(p.xp_price * (1 - membershipDiscount / 100)));
  };

  const discountedPriceCents = (p: Product) => {
    if (p.price_cents <= 0) return 0;
    if (membershipDiscount <= 0) return p.price_cents;
    return Math.max(1, Math.round(p.price_cents * (1 - membershipDiscount / 100)));
  };

  const handleOrder = async () => {
    if (!user || !selected) return;
    if (wantsShipping && !shippingAddress.trim()) {
      toast({ title: "Please enter your shipping address", variant: "destructive" });
      return;
    }
    setOrdering(true);

    const effectiveXp = discountedXp(selected);
    const effectivePrice = discountedPriceCents(selected);

    try {
      if (payMode === "xp") {
        if (effectiveXp === null) throw new Error("This product is not redeemable with XP");
        if (userXp < effectiveXp * quantity) throw new Error(`Not enough XP. You need ${effectiveXp * quantity} XP.`);

        // Deduct XP
        const { error: xpErr } = await supabase
          .from("profiles")
          .update({ padel_park_points: userXp - effectiveXp * quantity })
          .eq("user_id", user.id);
        if (xpErr) throw xpErr;

        // Record transaction
        await supabase.from("xp_transactions").insert({
          user_id: user.id,
          points: -(effectiveXp * quantity),
          type: "club_market_redemption",
          description: `${selected.name} × ${quantity} — ${clubName}`,
        }).maybeSingle();
      }

      // Create order record
      const { error: orderErr } = await supabase.from("club_market_orders").insert({
        product_id: selected.id,
        club_id: clubId,
        player_id: user.id,
        quantity,
        unit_price_cents: payMode === "card" ? effectivePrice : 0,
        xp_used: payMode === "xp" ? (effectiveXp ?? 0) * quantity : 0,
        payment_method: payMode,
        status: payMode === "card" ? "pending" : "confirmed",
        shipping_address: wantsShipping ? { address: shippingAddress } : null,
      });
      if (orderErr) throw orderErr;

      // Decrement stock
      await supabase
        .from("club_market_products")
        .update({ stock_qty: Math.max(0, selected.stock_qty - quantity) })
        .eq("id", selected.id);

      await refreshProfile();
      setModalOpen(false);
      setSuccessOpen(true);
    } catch (e: any) {
      toast({ title: "Order failed", description: e.message, variant: "destructive" });
    } finally {
      setOrdering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <Package className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-sm font-semibold text-foreground">Shop coming soon</p>
        <p className="text-xs text-muted-foreground">This club hasn't added products yet</p>
      </div>
    );
  }

  return (
    <>
      {/* Member discount banner */}
      {membershipDiscount > 0 && (
        <div className="mx-4 mb-4 p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs font-semibold text-primary">
            {membershipDiscount}% member discount applied to all prices
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 px-4 pb-4">
        {products.map(p => {
          const effXp = discountedXp(p);
          const effPrice = discountedPriceCents(p);
          const outOfStock = p.stock_qty === 0;

          return (
            <button
              key={p.id}
              onClick={() => !outOfStock && openProduct(p)}
              disabled={outOfStock}
              className={cn(
                "rounded-2xl bg-card border border-border/50 overflow-hidden text-left transition-all active:scale-[0.97]",
                outOfStock && "opacity-50"
              )}
            >
              {/* Photo */}
              <div className="h-32 bg-muted flex items-center justify-center relative">
                {p.photos?.[0] ? (
                  <img src={p.photos[0]} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-8 h-8 text-muted-foreground/30" />
                )}
                {outOfStock && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Sold Out</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-1.5">
                <p className="text-xs font-bold text-foreground leading-tight line-clamp-2">{p.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {effPrice > 0 && (
                    <span className="text-xs font-black text-foreground">
                      £{(effPrice / 100).toFixed(2)}
                      {membershipDiscount > 0 && p.price_cents > 0 && effPrice < p.price_cents && (
                        <span className="ml-1 text-muted-foreground line-through text-[9px]">
                          £{(p.price_cents / 100).toFixed(2)}
                        </span>
                      )}
                    </span>
                  )}
                  {effXp !== null && (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      {effXp} XP
                      {membershipDiscount > 0 && p.xp_price !== null && effXp < p.xp_price && (
                        <span className="ml-1 text-muted-foreground line-through text-[9px]">{p.xp_price}</span>
                      )}
                    </span>
                  )}
                </div>
                {p.shipping_enabled && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Truck className="w-3 h-3" /> Delivery available
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Product Detail + Order Modal ──────────────────────────────────── */}
      {selected && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="fixed bottom-0 left-0 right-0 top-auto w-full max-w-none translate-x-0 translate-y-0 max-h-[90dvh] overflow-y-auto p-0 bg-card border-border/50 rounded-t-3xl rounded-b-none border-x-0 border-b-0">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Photo */}
            {selected.photos?.[0] && (
              <div className="h-52 bg-muted">
                <img src={selected.photos[0]} alt={selected.name} className="w-full h-full object-cover" />
              </div>
            )}

            <div className="px-5 py-4 space-y-4">
              {/* Header */}
              <div>
                <p className="font-display font-black text-lg leading-tight">{selected.name}</p>
                {selected.sku && <p className="text-[10px] text-muted-foreground mt-0.5">SKU: {selected.sku}</p>}
                {selected.description && (
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{selected.description}</p>
                )}
              </div>

              {/* Payment mode toggle */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Pay with</p>
                <div className="grid grid-cols-2 gap-2">
                  {discountedXp(selected) !== null && (
                    <button
                      onClick={() => setPayMode("xp")}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        payMode === "xp" ? "bg-primary/10 border-primary" : "bg-muted border-border/30"
                      )}
                    >
                      <p className="text-xs font-bold text-primary flex items-center gap-1">
                        <Zap className="w-3 h-3" /> XP Points
                      </p>
                      <p className="text-sm font-black text-foreground mt-0.5">
                        {discountedXp(selected)! * quantity} XP
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        You have {userXp.toLocaleString()} XP
                      </p>
                    </button>
                  )}
                  {discountedPriceCents(selected) > 0 && (
                    <button
                      onClick={() => setPayMode("card")}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        payMode === "card" ? "bg-primary/10 border-primary" : "bg-muted border-border/30"
                      )}
                    >
                      <p className="text-xs font-bold flex items-center gap-1">
                        <ShoppingCart className="w-3 h-3" /> Card
                      </p>
                      <p className="text-sm font-black text-foreground mt-0.5">
                        £{(discountedPriceCents(selected) * quantity / 100).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Pay at collection</p>
                    </button>
                  )}
                </div>
              </div>

              {/* Quantity */}
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium flex-1">Quantity</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-lg font-bold"
                  >
                    −
                  </button>
                  <span className="text-base font-black w-5 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(q => Math.min(selected.stock_qty, q + 1))}
                    className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-lg font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Shipping */}
              {selected.shipping_enabled && (
                <div className="space-y-2">
                  <button
                    onClick={() => setWantsShipping(!wantsShipping)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border transition-colors",
                      wantsShipping ? "bg-primary/10 border-primary" : "bg-muted border-border/30"
                    )}
                  >
                    <Truck className="w-4 h-4 shrink-0" />
                    <div className="flex-1 text-left">
                      <p className="text-xs font-semibold">Request delivery</p>
                      <p className="text-[10px] text-muted-foreground">Club will contact you about shipping</p>
                    </div>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      wantsShipping ? "bg-primary border-primary" : "border-border"
                    )}>
                      {wantsShipping && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                  {wantsShipping && (
                    <Input
                      value={shippingAddress}
                      onChange={e => setShippingAddress(e.target.value)}
                      placeholder="Enter your full delivery address..."
                      className="bg-muted border-border/30 text-sm"
                      style={{ fontSize: "16px" }}
                    />
                  )}
                </div>
              )}

              {/* CTA */}
              <div className="pt-2 pb-2" style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
                {payMode === "xp" && discountedXp(selected) !== null && userXp < discountedXp(selected)! * quantity ? (
                  <div className="text-center space-y-2">
                    <p className="text-xs text-destructive font-semibold">
                      Not enough XP — you need {discountedXp(selected)! * quantity - userXp} more
                    </p>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setPayMode("card")}
                    >
                      Switch to card payment
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full h-[50px] rounded-[14px] font-display font-black italic uppercase text-[15px]"
                    onClick={handleOrder}
                    disabled={ordering}
                  >
                    {ordering ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : payMode === "xp" ? (
                      `Redeem for ${discountedXp(selected)! * quantity} XP`
                    ) : (
                      `Order · £${(discountedPriceCents(selected) * quantity / 100).toFixed(2)}`
                    )}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Success Modal ─────────────────────────────────────────────────── */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="fixed bottom-0 left-0 right-0 top-auto w-full max-w-none translate-x-0 translate-y-0 p-0 bg-card border-border/50 rounded-t-3xl rounded-b-none border-x-0 border-b-0">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>
          <div className="px-5 py-6 text-center space-y-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 24px)" }}>
            <CheckCircle2 className="w-14 h-14 text-primary mx-auto" />
            <div>
              <p className="font-display font-black text-xl">Order placed!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {payMode === "xp"
                  ? "Your XP have been deducted. Collect at the club."
                  : "The club will confirm and prepare your order."}
              </p>
            </div>
            <Button
              className="w-full h-12 rounded-[14px] font-display font-black italic uppercase"
              onClick={() => setSuccessOpen(false)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ClubMarketTab;
