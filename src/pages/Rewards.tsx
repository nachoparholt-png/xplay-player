import { useState, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, ShoppingCart, Star, Clock, Package, Zap, ArrowRight, Loader2, Filter, Store } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRewards, useRedeemReward, type Reward, type PointsPack } from "@/hooks/useRewards";
import { supabase } from "@/integrations/supabase/client";
import {
  storefrontApiRequest,
  COLLECTION_BY_HANDLE_QUERY,
  getMetafieldValue,
  type ShopifyCollectionProduct,
} from "@/lib/shopify";

import { toast } from "@/hooks/use-toast";

/**
 * Columns added by DB migrations after the last `supabase gen types` run.
 * Remove this interface and use the generated Profile type once types are regenerated.
 */
interface ProfileExtras {
  pending_points?: number | null;
  lifetime_earned?: number | null;
  lifetime_spent?: number | null;
  referral_code?: string | null;
}

/** Minimal shape of a referral row used for filtering in this component. */
interface ReferralRow {
  referral_status: string;
}

/** Extends ShopifyCollectionProduct's node with the optional tags array from Shopify. */
interface ShopifyNodeWithTags {
  tags?: string[];
}

import PointsWalletCard from "@/components/rewards/PointsWalletCard";
import RewardCatalogCard from "@/components/rewards/RewardCatalogCard";
import RewardDetailModal from "@/components/rewards/RewardDetailModal";
import RedeemConfirmModal from "@/components/rewards/RedeemConfirmModal";
import RedemptionSuccessModal from "@/components/rewards/RedemptionSuccessModal";
import MyRewardsSection from "@/components/rewards/MyRewardsSection";
import BuyPointsSection from "@/components/rewards/BuyPointsSection";
import EarnPointsSection from "@/components/rewards/EarnPointsSection";
import StakeOptionsSection from "@/components/rewards/StakeOptionsSection";
import ReferralSection from "@/components/rewards/ReferralSection";
import TransactionHistory from "@/components/rewards/TransactionHistory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const Rewards = () => {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    rewards, settings, transactions, referrals, stakeStats,
    isLoading, getSetting, getPointsPacks,
  } = useRewards();
  const redeemMutation = useRedeemReward();

  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successData, setSuccessData] = useState<unknown>(null);
  const [suggestedMissing, setSuggestedMissing] = useState<number | undefined>();
  const [shopifyRewards, setShopifyRewards] = useState<ShopifyCollectionProduct[]>([]);
  const [shopifyLoading, setShopifyLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");

  const catalogRef = useRef<HTMLDivElement>(null);
  const buyRef = useRef<HTMLDivElement>(null);
  const earnRef = useRef<HTMLDivElement>(null);
  const [fabExpanded, setFabExpanded] = useState(true);
  const lastScrollY = useRef(0);

  // Handle points_success redirect from Stripe
  useEffect(() => {
    if (searchParams.get("points_success") === "true") {
      toast({ title: "Points purchased!", description: "Your points have been added to your balance." });
      refreshProfile();
      searchParams.delete("points_success");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // Fetch Shopify-backed rewards
  useEffect(() => {
    const fetchShopifyRewards = async () => {
      try {
        const data = await storefrontApiRequest(COLLECTION_BY_HANDLE_QUERY, {
          handle: "xplay-rewards",
          first: 50,
        });
        const edges = data?.data?.collection?.products?.edges || [];
        setShopifyRewards(edges);
      } catch (err) {
        console.error("Failed to fetch Shopify rewards:", err);
      } finally {
        setShopifyLoading(false);
      }
    };
    fetchShopifyRewards();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 10) setFabExpanded(true);
      else if (currentY > lastScrollY.current + 5) setFabExpanded(false);
      else if (currentY < lastScrollY.current - 5) setFabExpanded(true);
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const userPoints = profile?.padel_park_points ?? 0;
  // Cast through ProfileExtras for columns added after the last type generation
  const profileExt = profile as (typeof profile & ProfileExtras) | null;
  const pendingPoints  = profileExt?.pending_points  ?? 0;
  const lifetimeEarned = profileExt?.lifetime_earned ?? 0;
  const lifetimeSpent  = profileExt?.lifetime_spent  ?? 0;
  const referralCode   = profileExt?.referral_code   ?? null;

  const availableRewards = rewards.filter(
    (r) => r.status === "active" || r.status === "coming_soon"
  );

  const inStockRewards = availableRewards.filter(
    (r) => r.stock_status === "in_stock" && r.status === "active" && (r.current_stock === null || r.current_stock > 0)
  );

  // Sort by affordability: redeemable first, then ascending by cost
  const sortedInStockRewards = [...inStockRewards].sort((a, b) => {
    const aAfford = userPoints >= a.points_cost;
    const bAfford = userPoints >= b.points_cost;
    if (aAfford && !bAfford) return -1;
    if (!aAfford && bAfford) return 1;
    return a.points_cost - b.points_cost;
  });

  // Next reward the user can't yet afford — used for progress bar
  const nextLockedReward = [...inStockRewards]
    .filter((r) => userPoints < r.points_cost)
    .sort((a, b) => a.points_cost - b.points_cost)[0] ?? null;

  const outOfStockRewards = availableRewards.filter(
    (r) => r.stock_status === "out_of_stock" || (r.current_stock !== null && r.current_stock <= 0 && r.stock_status !== "coming_soon")
  );
  const comingSoonRewards = availableRewards.filter(
    (r) => r.stock_status === "coming_soon" || r.status === "coming_soon"
  );

  const handleSelectReward = (reward: Reward) => {
    setSelectedReward(reward);
    setDetailOpen(true);
  };

  const handleStartRedeem = (reward: Reward) => {
    setDetailOpen(false);
    setSelectedReward(reward);
    setConfirmOpen(true);
  };

  const handleConfirmRedeem = () => {
    if (!selectedReward) return;
    redeemMutation.mutate(
      { rewardId: selectedReward.id },
      {
        onSuccess: (data) => {
          setConfirmOpen(false);
          setSelectedReward(null);
          setSuccessData(data);
          setSuccessOpen(true);
        },
      }
    );
  };

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return (
      <div className="px-6 py-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-7 w-40 rounded-lg bg-muted animate-pulse" />
          <div className="h-8 w-24 rounded-full bg-muted animate-pulse" />
        </div>
        {/* Wallet card skeleton */}
        <div className="h-36 rounded-2xl bg-muted animate-pulse" />
        {/* Catalog skeleton */}
        <div className="space-y-3">
          <div className="h-5 w-32 rounded bg-muted animate-pulse" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-container rounded-2xl p-5 space-y-3">
              <div className="flex justify-between">
                <div className="space-y-1.5 flex-1">
                  <div className="h-5 w-3/5 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-2/5 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-6 w-16 rounded bg-muted animate-pulse ml-4" />
              </div>
              <div className="h-10 w-full rounded-full bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display font-black tracking-tighter uppercase text-xl italic text-primary">
          {getSetting("rewards_section_title", "XPLAY REWARDS")}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/marketplace")}
            className="bg-surface-container px-3 py-1.5 rounded-full border border-border/50 flex items-center gap-1.5 active:scale-95 transition-transform"
            aria-label="Marketplace"
          >
            <Store className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground font-display text-xs font-bold">Shop</span>
          </button>
          <div className="bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-primary font-display text-sm font-bold">{userPoints.toLocaleString()} XP</span>
          </div>
        </div>
      </div>

      {/* FAB */}
      <motion.button
        onClick={() => scrollTo(buyRef)}
        className="fixed bottom-24 right-5 lg:bottom-8 lg:right-8 z-40 flex items-center justify-center bg-primary text-primary-foreground shadow-lg hover:shadow-xl font-black text-sm overflow-hidden h-12"
        style={{ minWidth: 48 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          width: fabExpanded ? 160 : 48,
          borderRadius: fabExpanded ? 16 : 24,
          paddingLeft: fabExpanded ? 16 : 0,
          paddingRight: fabExpanded ? 16 : 0,
        }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
      >
        <ShoppingCart className="w-5 h-5 flex-shrink-0" />
        <AnimatePresence>
          {fabExpanded && (
            <motion.span
              key="label"
              initial={{ width: 0, opacity: 0, marginLeft: 0 }}
              animate={{ width: "auto", opacity: 1, marginLeft: 8 }}
              exit={{ width: 0, opacity: 0, marginLeft: 0 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden font-display uppercase tracking-wider"
            >
              Buy Points
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Points Wallet */}
      <PointsWalletCard
        available={userPoints}
        pending={pendingPoints}
        lifetimeEarned={lifetimeEarned}
        lifetimeSpent={lifetimeSpent}
        onRedeem={() => scrollTo(catalogRef)}
        onBuy={() => scrollTo(buyRef)}
        onEarn={() => scrollTo(earnRef)}
      />

      {/* Progress to next unlock */}
      {nextLockedReward && (
        <div className="space-y-2">
          <div className="flex justify-between items-baseline gap-2">
            <p className="text-xs text-muted-foreground leading-snug">
              <span className="font-bold text-primary">{(nextLockedReward.points_cost - userPoints).toLocaleString()} XP</span>
              {" "}until{" "}
              <span className="font-semibold text-foreground">{nextLockedReward.name}</span>
            </p>
            <span className="text-xs font-bold text-muted-foreground shrink-0">{nextLockedReward.points_cost.toLocaleString()} XP</span>
          </div>
          <div className="h-2 w-full bg-muted/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (userPoints / nextLockedReward.points_cost) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* My Rewards History */}
      <MyRewardsSection />

      {/* Redeem Points Section */}
      <div ref={catalogRef} className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="font-display text-xl font-extrabold tracking-tight uppercase">REDEEM POINTS</h2>
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </div>

        {sortedInStockRewards.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {sortedInStockRewards.map((reward, i) => (
              <motion.div
                key={reward.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <RewardCatalogCard reward={reward} userPoints={userPoints} onSelect={handleSelectReward} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2" />
            <p className="text-sm">No rewards available right now</p>
          </div>
        )}
      </div>

      {/* Shopify Rewards Section */}
      {shopifyRewards.length > 0 && (() => {
        // Extract categories from tags
        const categories = Array.from(
          new Set(
            shopifyRewards.flatMap((p) =>
              (p.node as ShopifyNodeWithTags).tags
                ?.filter((t) => t.startsWith("xplay-cat-"))
                .map((t) => t.replace("xplay-cat-", "")) || []
            )
          )
        );

        const filteredProducts = activeCategory === "all"
          ? shopifyRewards
          : shopifyRewards.filter((p) =>
              (p.node as ShopifyNodeWithTags).tags?.includes(`xplay-cat-${activeCategory}`)
            );

        return (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-extrabold tracking-tight uppercase">Shopify Rewards</h2>

            {categories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <Button
                  size="sm"
                  variant={activeCategory === "all" ? "default" : "outline"}
                  onClick={() => setActiveCategory("all")}
                  className="text-xs font-bold uppercase"
                >
                  All
                </Button>
                {categories.map((cat) => (
                  <Button
                    key={cat}
                    size="sm"
                    variant={activeCategory === cat ? "default" : "outline"}
                    onClick={() => setActiveCategory(cat)}
                    className="text-xs font-bold uppercase capitalize"
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              {filteredProducts.map((product, i) => {
                const redemptionCost = getMetafieldValue(product.node.metafields, "xplay_redemption_cost");
                const costNum = redemptionCost ? parseInt(redemptionCost) : null;
                const canAfford = costNum ? userPoints >= costNum : true;
                const image = product.node.images.edges[0]?.node;

                return (
                  <motion.div
                    key={product.node.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Card className={`overflow-hidden ${!canAfford ? "opacity-60" : ""}`}>
                      <CardContent className="p-4 flex gap-4">
                        {image && (
                          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                            <img src={image.url} alt={image.altText || product.node.title} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <h3 className="font-display font-bold text-sm truncate">{product.node.title}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-2">{product.node.description}</p>
                          {costNum && (
                            <div className="flex items-center gap-1">
                              <Zap className="w-3 h-3 text-primary" />
                              <span className="text-xs font-bold text-primary">{costNum.toLocaleString()} XP</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 flex items-center">
                          <Button size="sm" disabled={!canAfford} className="text-xs font-bold">
                            {canAfford ? "Redeem" : "Not enough XP"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Out of Stock */}
      {outOfStockRewards.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display font-bold text-lg text-muted-foreground uppercase">Out of Stock</h2>
          <div className="grid grid-cols-1 gap-4">
            {outOfStockRewards.map((reward) => (
              <RewardCatalogCard key={reward.id} reward={reward} userPoints={userPoints} onSelect={handleSelectReward} />
            ))}
          </div>
        </div>
      )}

      {/* Coming Soon */}
      {comingSoonRewards.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-secondary" />
            <h2 className="font-display font-bold text-lg text-secondary uppercase">Coming Soon</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {comingSoonRewards.map((reward) => (
              <RewardCatalogCard key={reward.id} reward={reward} userPoints={userPoints} onSelect={handleSelectReward} />
            ))}
          </div>
        </div>
      )}

      {/* Stake Options */}
      <StakeOptionsSection
        title={getSetting("stake_section_title", "Stake Your Points")}
        stakeEnabled={getSetting("stake_enabled", "true") === "true"}
        activeStakeCount={stakeStats?.activeCount ?? 0}
        minStake={parseInt(getSetting("minimum_stake_points", "50"))}
        maxStake={parseInt(getSetting("maximum_stake_points", "500"))}
      />

      {/* Earn More Points */}
      <div ref={earnRef}>
        <EarnPointsSection
          title={getSetting("earn_section_title", "Ways to Earn More Points")}
          settings={settings}
        />
      </div>

      {/* Referral Section */}
      <ReferralSection
        title={getSetting("referral_section_title", "Invite Friends")}
        enabled={getSetting("referral_program_enabled", "true") === "true"}
        referralCode={referralCode}
        referralCount={(referrals as ReferralRow[]).filter(r => r.referral_status === "completed").length}
        inviterPoints={getSetting("referral_points_inviter", "200")}
      />

      {/* Buy Points */}
      <div ref={buyRef}>
        <BuyPointsSection
          title={getSetting("buy_points_section_title", "Buy More Points")}
          enabled={getSetting("enable_points_purchase", "true") === "true"}
          packs={getPointsPacks()}
          onBuyPack={async (pack: PointsPack) => {
            try {
              const { data, error } = await supabase.functions.invoke("create-checkout", {
                body: { package_id: pack.id },
              });
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              if (data?.url) window.location.href = data.url;
            } catch (err: any) {
              toast({ title: "Purchase failed", description: err.message, variant: "destructive" });
            }
          }}
          suggestedAmount={suggestedMissing}
        />
      </div>

      {/* Transaction History */}
      <TransactionHistory transactions={transactions} />

      {/* Modals */}
      <RewardDetailModal
        reward={selectedReward}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedReward(null); }}
        userPoints={userPoints}
        onRedeem={handleStartRedeem}
        onBuyPoints={() => {
          setDetailOpen(false);
          if (selectedReward) setSuggestedMissing(selectedReward.points_cost - userPoints);
          scrollTo(buyRef);
        }}
        onEarnMore={() => { setDetailOpen(false); scrollTo(earnRef); }}
      />

      <RedeemConfirmModal
        reward={selectedReward}
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setSelectedReward(null); }}
        onConfirm={handleConfirmRedeem}
        userPoints={userPoints}
        isLoading={redeemMutation.isPending}
      />

      <RedemptionSuccessModal
        open={successOpen}
        onClose={() => { setSuccessOpen(false); setSuccessData(null); }}
        data={successData}
      />
    </div>
  );
};

export default Rewards;
