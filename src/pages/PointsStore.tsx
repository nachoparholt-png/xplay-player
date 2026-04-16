import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, Loader2, Award, CreditCard, Users, Copy, Share2, Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  storefrontApiRequest,
  PRODUCTS_QUERY,
  createShopifyCart,
  formatPrice,
  type ShopifyProduct,
} from "@/lib/shopify";

/** Parse XP value from title like "XPLAY 120 Points" → 120 */
function parseXpFromTitle(title: string): number | null {
  const match = title.match(/(\d+)\s*points/i);
  return match ? parseInt(match[1], 10) : null;
}

const PointsStore = () => {
  const { profile, user } = useAuth();
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [showReferral, setShowReferral] = useState(false);
  const [copied, setCopied] = useState(false);
  const [referralCount, setReferralCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase.from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("inviter_user_id", user.id)
      .eq("referral_status", "completed")
      .then(({ count }) => setReferralCount(count || 0));
  }, [user]);

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const data = await storefrontApiRequest(PRODUCTS_QUERY, {
          first: 20,
          query: "tag:xplay-points-package",
        });
        const edges: ShopifyProduct[] = data?.data?.products?.edges || [];
        // Sort by price ascending
        const sorted = [...edges].sort(
          (a, b) =>
            parseFloat(a.node.priceRange.minVariantPrice.amount) -
            parseFloat(b.node.priceRange.minVariantPrice.amount)
        );
        setProducts(sorted);
      } catch (err) {
        console.error("Failed to fetch points packages:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPackages();
  }, []);

  const handleBuy = async (product: ShopifyProduct) => {
    const variant = product.node.variants.edges[0]?.node;
    if (!variant) return;
    setBuyingId(product.node.id);
    // Open blank tab immediately to preserve user gesture (avoids popup blocker)
    const newTab = window.open('about:blank', '_blank');
    try {
      const result = await createShopifyCart({
        lineId: null,
        product,
        variantId: variant.id,
        variantTitle: variant.title,
        price: variant.price,
        quantity: 1,
        selectedOptions: variant.selectedOptions || [],
      });
      if (result?.checkoutUrl) {
        if (newTab) {
          newTab.location.href = result.checkoutUrl;
        } else {
          window.location.href = result.checkoutUrl;
        }
      } else {
        newTab?.close();
        toast.error("Failed to create checkout");
      }
    } catch (err: any) {
      newTab?.close();
      toast.error("Checkout failed", { description: err.message });
    } finally {
      setBuyingId(null);
    }
  };

  const getBadge = (index: number, total: number) => {
    if (total <= 1) return null;
    if (index === Math.floor(total / 2)) return "MOST POPULAR";
    if (index === total - 1) return "BEST VALUE";
    return null;
  };

  const userPoints = profile?.padel_park_points ?? 0;

  return (
    <div className="px-6 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display font-black tracking-tighter uppercase text-xl italic text-primary">
          BUY POINTS
        </h1>
        <div className="bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-primary font-display text-sm font-bold">
            {userPoints.toLocaleString()} XP
          </span>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        Purchase points packages to stake on matches, redeem rewards, and more.
      </p>

      {/* Referral CTA */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <button
          onClick={() => setShowReferral(true)}
          className="w-full flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-bold text-foreground">Share & Earn 50 XPLAY Points</p>
            <p className="text-xs text-muted-foreground">Invite a friend and earn points when they sign up</p>
          </div>
          <Share2 className="w-4 h-4 text-primary shrink-0" />
        </button>
      </motion.div>

      {/* Referral Bottom Sheet */}
      {showReferral && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowReferral(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-lg bg-card rounded-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">Share & Earn</h3>
              <button onClick={() => setShowReferral(false)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Share your referral code with friends. When they sign up using your link, you'll earn <span className="text-primary font-semibold">50 XPLAY points</span>.
              </p>
            </div>

            {profile?.referral_code && (
              <>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border border-border/50">
                  <span className="flex-1 text-sm font-mono text-foreground truncate">{profile.referral_code}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(profile.referral_code!);
                      setCopied(true);
                      toast.success("Code copied!");
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      const baseUrl = "https://racketeer-rewards.lovable.app";
                      const link = `${baseUrl}/auth?ref=${profile.referral_code}`;
                      navigator.clipboard.writeText(link);
                      setCopied(true);
                      toast.success("Link copied!");
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Link
                  </Button>
                </div>
              </>
            )}

            {referralCount > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
                <span className="text-sm text-muted-foreground">{referralCount} friend{referralCount !== 1 ? "s" : ""} joined</span>
                <div className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                  <span className="font-display text-sm font-bold text-primary">+{referralCount * 50} earned</span>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Zap className="w-10 h-10 mx-auto mb-3" />
          <p className="text-sm font-medium">No points packages available yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {products.map((product, i) => {
            const variant = product.node.variants.edges[0]?.node;
            const price = variant?.price;
            const xpValue = parseXpFromTitle(product.node.title);
            const badge = getBadge(i, products.length);

            // Calculate bonus: price in £ × 10 = base points, anything above is bonus
            const priceNum = price ? parseFloat(price.amount) : 0;
            const impliedBase = Math.round(priceNum * 10);
            const bonus = xpValue && xpValue > impliedBase ? xpValue - impliedBase : null;

            return (
              <motion.div
                key={product.node.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="relative overflow-hidden hover:border-primary/40 transition-colors h-full flex flex-col">
                  {badge && (
                    <div className="absolute top-3 right-3">
                      <Badge variant="secondary" className="text-[10px] font-black uppercase">
                        {badge}
                      </Badge>
                    </div>
                  )}
                  <CardContent className="p-5 space-y-4 flex flex-col flex-1">
                    <div>
                      <h3 className="font-display font-bold text-lg tracking-tight">
                        {product.node.title}
                      </h3>
                      {product.node.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {product.node.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-end justify-between">
                      {xpValue && (
                        <div>
                          <div className="flex items-center gap-1">
                            <Zap className="w-5 h-5 text-primary" />
                            <span className="text-3xl font-display font-black text-primary">
                              {xpValue.toLocaleString()} XP
                            </span>
                          </div>
                          {bonus && bonus > 0 && (
                            <div className="flex items-center gap-1 text-xs text-secondary font-bold mt-0.5">
                              <Award className="w-3 h-3" />
                              +{bonus.toLocaleString()} bonus
                            </div>
                          )}
                        </div>
                      )}
                      <div className="text-right">
                        <span className="text-sm font-medium text-muted-foreground">
                          {price ? formatPrice(price.amount, price.currencyCode) : ""}
                        </span>
                      </div>
                    </div>

                    <Button
                      className="w-full font-display font-bold uppercase mt-auto"
                      onClick={() => handleBuy(product)}
                      disabled={buyingId === product.node.id || !variant?.availableForSale}
                    >
                      {buyingId === product.node.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Buy Now
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PointsStore;
