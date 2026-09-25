/**
 * Club store (25 Sep 2026) — /clubs/:clubId/store.
 * Redeem XPLAY Points at the club. Same product query and the same redemption writes as
 * ClubMarketTab (profile points deduction, xp_transactions, club_market_orders, stock decrement).
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Package, Loader2, Truck } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type TierRow, tierMarketDiscount } from "@/lib/clubs/membershipTiers";

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
  category?: string | null;
};

type Collect = { code: string; name: string; at: Date };

const ClubStore = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [clubName, setClubName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [membershipDiscount, setMembershipDiscount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [wantsShipping, setWantsShipping] = useState(false);
  const [shippingAddress, setShippingAddress] = useState("");
  const [ordering, setOrdering] = useState(false);
  const [collect, setCollect] = useState<Collect | null>(null);

  const userXp = profile?.padel_park_points ?? 0;

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: club }, { data }, mem] = await Promise.all([
        supabase.from("clubs").select("club_name").eq("id", clubId).maybeSingle(),
        // Same query as ClubMarketTab
        (supabase as any).from("club_market_products").select("*").eq("club_id", clubId).eq("active", true).order("created_at", { ascending: false }),
        user ? supabase.from("club_memberships").select("tier_id").eq("user_id", user.id).eq("club_id", clubId).eq("active", true).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      let disc = 0;
      const tierId = (mem?.data as any)?.tier_id as string | null | undefined;
      if (tierId) {
        const { data: tier } = await supabase.from("membership_tiers").select("*").eq("id", tierId).maybeSingle();
        disc = tierMarketDiscount(tier as TierRow | null);
      }
      if (cancelled) return;
      setClubName((club as any)?.club_name ?? "");
      setProducts((data as Product[]) || []);
      setMembershipDiscount(disc);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clubId, user]);

  // Same discount rule as ClubMarketTab
  const discountedXp = (p: Product) => {
    if (p.xp_price === null) return null;
    if (membershipDiscount <= 0) return p.xp_price;
    return Math.max(1, Math.round(p.xp_price * (1 - membershipDiscount / 100)));
  };

  const open = (p: Product) => { setSelected(p); setQuantity(1); setWantsShipping(false); setShippingAddress(""); };

  const handleOrder = async () => {
    if (!user || !selected || !clubId) return;
    if (wantsShipping && !shippingAddress.trim()) { toast({ title: "Enter your delivery address", variant: "destructive" }); return; }
    setOrdering(true);
    const effectiveXp = discountedXp(selected);
    try {
      if (effectiveXp === null) throw new Error("This item can't be redeemed with XPLAY Points");
      if (userXp < effectiveXp * quantity) throw new Error(`Not enough XP. You need ${effectiveXp * quantity} XP.`);

      // Deduct XP
      const { error: xpErr } = await supabase.from("profiles").update({ padel_park_points: userXp - effectiveXp * quantity }).eq("user_id", user.id);
      if (xpErr) throw xpErr;

      // Record transaction
      await (supabase as any).from("xp_transactions").insert({
        user_id: user.id,
        points: -(effectiveXp * quantity),
        type: "club_market_redemption",
        description: `${selected.name} × ${quantity} — ${clubName}`,
      }).maybeSingle();

      // Create order record (same row as ClubMarketTab; the id feeds the collect code)
      const { data: order, error: orderErr } = await (supabase as any).from("club_market_orders").insert({
        product_id: selected.id,
        club_id: clubId,
        player_id: user.id,
        quantity,
        unit_price_cents: 0,
        xp_used: effectiveXp * quantity,
        payment_method: "xp",
        status: "confirmed",
        shipping_address: wantsShipping ? { address: shippingAddress } : null,
      }).select("id").maybeSingle();
      if (orderErr) throw orderErr;

      // Decrement stock
      await (supabase as any).from("club_market_products").update({ stock_qty: Math.max(0, selected.stock_qty - quantity) }).eq("id", selected.id);

      await refreshProfile();
      const id = ((order as any)?.id as string | undefined) ?? "";
      setCollect({ code: id ? id.replace(/-/g, "").slice(-6).toUpperCase() : "AT DESK", name: `${selected.name}${quantity > 1 ? ` × ${quantity}` : ""}`, at: new Date() });
      setProducts((prev) => prev.map((p) => (p.id === selected.id ? { ...p, stock_qty: Math.max(0, p.stock_qty - quantity) } : p)));
      setSelected(null);
    } catch (e: any) {
      toast({ title: "Order failed", description: e.message, variant: "destructive" });
    } finally { setOrdering(false); }
  };

  const categories = [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))];
  const list = category ? products.filter((p) => p.category === category) : products;
  const selXp = selected ? discountedXp(selected) : null;

  return (
    <div className="px-4 pt-3 pb-32 space-y-5">
      <header className="flex items-center gap-2.5">
        <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95"><ArrowLeft className="w-4 h-4" /></button>
        <span className="text-xs font-bold text-muted-foreground truncate">{clubName}</span>
      </header>

      <div>
        <h1 className="font-display text-[28px] font-black italic uppercase leading-tight">Club store</h1>
        <p className="text-sm text-muted-foreground mt-1">Redeem your XPLAY Points at the club. Show the code at the desk.</p>
      </div>

      <div className="rounded-2xl bg-card border border-border/60 px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Your points</div>
          <div className="font-mono text-2xl font-bold text-secondary leading-tight">{userXp.toLocaleString()} XP</div>
        </div>
        <button onClick={() => navigate("/rewards")} className="text-xs font-bold text-primary">How to earn ›</button>
      </div>

      {collect && (
        <div className="rounded-2xl border-2 border-dashed border-primary px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-primary">Ready to collect</div>
          <div className="flex items-center justify-between mt-1">
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">{collect.name}</div>
              <div className="text-xs text-muted-foreground">{format(collect.at, "EEE d MMM · HH:mm")}</div>
            </div>
            <span className="font-mono text-xl font-bold tracking-widest">{collect.code}</span>
          </div>
        </div>
      )}

      {membershipDiscount > 0 && <p className="text-xs font-semibold text-secondary">{membershipDiscount}% member discount applied</p>}

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 scrollbar-hide">
          {[null, ...categories].map((c) => (
            <button key={c ?? "all"} onClick={() => setCategory(c)}
              className={cn("flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border", category === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>
              {c ?? "All"}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nothing in the store yet.</p>
      ) : (
        <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/60">
          {list.map((p) => {
            const xp = discountedXp(p);
            const out = p.stock_qty === 0;
            const short = xp !== null ? xp - userXp : 0;
            return (
              <div key={p.id} className={cn("px-4 py-3 flex items-center gap-3", out && "opacity-50")}>
                <div className="w-11 h-11 rounded-xl bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
                  {p.photos?.[0] ? <img src={p.photos[0]} alt="" className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-muted-foreground/50" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{p.name}</div>
                  {xp !== null ? (
                    <div className="font-mono text-sm text-secondary">{xp.toLocaleString()} XP{membershipDiscount > 0 && p.xp_price !== null && xp < p.xp_price && <span className="ml-1 text-muted-foreground line-through text-xs">{p.xp_price}</span>}</div>
                  ) : (
                    <div className="font-mono text-sm text-muted-foreground">£{(p.price_cents / 100).toFixed(2)} at the desk</div>
                  )}
                </div>
                {xp !== null && !out && (
                  short > 0 ? (
                    <span className="rounded-full bg-muted text-muted-foreground px-3 py-2 text-xs font-bold whitespace-nowrap">{short.toLocaleString()} more</span>
                  ) : (
                    <button onClick={() => open(p)} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-black uppercase tracking-wider active:scale-95">Redeem</button>
                  )
                )}
                {out && <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Sold out</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Confirm sheet ── */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="fixed bottom-0 left-0 right-0 top-auto w-full max-w-none translate-x-0 translate-y-0 max-h-[90dvh] overflow-y-auto p-0 bg-card border-border/50 rounded-t-3xl rounded-b-none border-x-0 border-b-0">
          {selected && (
            <div className="px-5 pt-4 pb-6 space-y-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 16px)" }}>
              <div>
                <p className="font-display font-black text-lg leading-tight">{selected.name}</p>
                {selected.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{selected.description}</p>}
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium flex-1">Quantity</p>
                <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-lg font-bold">−</button>
                <span className="font-mono text-base font-black w-5 text-center">{quantity}</span>
                <button onClick={() => setQuantity((q) => Math.min(selected.stock_qty, q + 1))} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-lg font-bold">+</button>
              </div>
              {selected.shipping_enabled && (
                <div className="space-y-2">
                  <button onClick={() => setWantsShipping((v) => !v)} className={cn("w-full flex items-center gap-3 p-3 rounded-xl border", wantsShipping ? "bg-primary/10 border-primary" : "bg-muted border-border/30")}>
                    <Truck className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-semibold flex-1 text-left">Deliver it</span>
                  </button>
                  {wantsShipping && <Input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="Delivery address" className="bg-muted border-border/30 text-sm" style={{ fontSize: "16px" }} />}
                </div>
              )}
              {selXp !== null && userXp < selXp * quantity ? (
                <p className="text-xs text-destructive font-semibold text-center">You need <span className="font-mono">{(selXp * quantity - userXp).toLocaleString()}</span> more XP</p>
              ) : (
                <button onClick={handleOrder} disabled={ordering} className="w-full h-[50px] rounded-[14px] bg-primary text-primary-foreground font-display font-black italic uppercase text-[15px] active:scale-[0.98] disabled:opacity-60">
                  {ordering ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Redeem · ${((selXp ?? 0) * quantity).toLocaleString()} XP`}
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClubStore;
