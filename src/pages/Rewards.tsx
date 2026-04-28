import { useState, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Package, Zap, ArrowRight, Loader2, Store, ChevronRight, Building2 } from "lucide-react";
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

interface ProfileExtras {
  pending_points?: number | null;
  lifetime_earned?: number | null;
  lifetime_spent?: number | null;
  referral_code?: string | null;
}

interface ReferralRow {
  referral_status: string;
}

interface ShopifyNodeWithTags {
  tags?: string[];
}

import ClubsMarketSection from "@/components/rewards/ClubsMarketSection";
import RewardDetailModal from "@/components/rewards/RewardDetailModal";
import RedeemConfirmModal from "@/components/rewards/RedeemConfirmModal";
import RedemptionSuccessModal from "@/components/rewards/RedemptionSuccessModal";
import MyRewardsSection from "@/components/rewards/MyRewardsSection";
import BuyPointsSection from "@/components/rewards/BuyPointsSection";
import EarnPointsSection from "@/components/rewards/EarnPointsSection";
import StakeOptionsSection from "@/components/rewards/StakeOptionsSection";
import ReferralSection from "@/components/rewards/ReferralSection";
import TransactionHistory from "@/components/rewards/TransactionHistory";
import RewardCatalogCard from "@/components/rewards/RewardCatalogCard";

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
  const [marketTab, setMarketTab] = useState<"xplay" | "clubs">("xplay");

  const catalogRef = useRef<HTMLDivElement>(null);
  const buyRef = useRef<HTMLDivElement>(null);
  const earnRef = useRef<HTMLDivElement>(null);
  const [fabExpanded, setFabExpanded] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (searchParams.get("points_success") === "true") {
      toast({ title: "Points purchased!", description: "Your points have been added to your balance." });
      refreshProfile();
      searchParams.delete("points_success");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

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
  const sortedInStockRewards = [...inStockRewards].sort((a, b) => {
    const aAfford = userPoints >= a.points_cost;
    const bAfford = userPoints >= b.points_cost;
    if (aAfford && !bAfford) return -1;
    if (!aAfford && bAfford) return 1;
    return a.points_cost - b.points_cost;
  });
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
      <div className="px-5 py-6 space-y-6 pb-32">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="h-32 rounded-2xl bg-muted animate-pulse" />
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // Extract Shopify categories
  const categories = Array.from(
    new Set(
      shopifyRewards.flatMap((p) =>
        (p.node as ShopifyNodeWithTags).tags
          ?.filter((t) => t.startsWith("xplay-cat-"))
          .map((t) => t.replace("xplay-cat-", "")) || []
      )
    )
  );
  const filteredShopifyProducts = activeCategory === "all"
    ? shopifyRewards
    : shopifyRewards.filter((p) =>
        (p.node as ShopifyNodeWithTags).tags?.includes(`xplay-cat-${activeCategory}`)
      );

  return (
    <div className="px-5 py-6 space-y-8 pb-32">

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <div className="text-[10px] font-black tracking-[0.16em] text-muted-foreground uppercase">
            Your Balance
          </div>
          <div className="font-display text-[32px] font-black italic text-primary leading-tight">
            {userPoints.toLocaleString()} XP
          </div>
        </div>
        <button
          onClick={() => navigate("/marketplace")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/50 bg-muted/40 hover:border-primary/30 transition-colors"
        >
          <Store className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold text-muted-foreground">Shop</span>
        </button>
      </motion.div>

      {/* ── Market tab switcher ── */}
      <div className="grid grid-cols-2 gap-2 -mt-2">
        {([
          { key: "xplay", label: "XPLAY Market", icon: Zap },
          { key: "clubs", label: "Clubs Market", icon: Building2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setMarketTab(key)}
            className={`flex items-center justify-center gap-2 h-10 rounded-xl text-xs font-bold transition-colors border ${
              marketTab === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted border-border/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Clubs Market Tab ── */}
      {marketTab === "clubs" && <ClubsMarketSection />}

      {/* ── XPLAY Market content (hidden when clubs tab active) ── */}
      {marketTab === "xplay" && <>

      {/* ── Progress to next reward ── */}
      {nextLockedReward && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-black text-primary">{(nextLockedReward.points_cost - userPoints).toLocaleString()} XP</span>
              {" "}to unlock{" "}
              <span className="font-semibold text-foreground">{nextLockedReward.name}</span>
            </p>
            <span className="text-[10px] font-bold text-muted-foreground shrink-0">
              {nextLockedReward.points_cost.toLocaleString()} XP
            </span>
          </div>
          <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, (userPoints / nextLockedReward.points_cost) * 100)}%` }}
            />
          </div>
        </motion.div>
      )}

      {/* ── My Rewards History ── */}
      <MyRewardsSection />

      {/* ── Redeem section ── */}
      <motion.div
        ref={catalogRef}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="space-y-4"
      >
        <div className="text-[11px] font-black tracking-[0.14em] text-muted-foreground uppercase">
          Redeem Points
        </div>

        {sortedInStockRewards.length > 0 ? (
          <div className="space-y-3">
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
        ) : (!shopifyLoading && shopifyRewards.length === 0) ? (
          <div className="text-center py-6 text-muted-foreground">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No rewards available right now</p>
          </div>
        ) : null}
      </motion.div>

      {/* ── Shopify Rewards ── */}
      {(shopifyLoading || shopifyRewards.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="space-y-4"
        >
          <div className="text-[11px] font-black tracking-[0.14em] text-muted-foreground uppercase">
            Gear & Rewards
          </div>

          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {["all", ...categories].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide flex-shrink-0 transition-colors border ${
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted border-border/30 text-muted-foreground"
                  }`}
                >
                  {cat === "all" ? "All" : cat}
                </button>
              ))}
            </div>
          )}

          {shopifyLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredShopifyProducts.map((product, i) => {
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
                    className={`flex items-center gap-4 p-4 rounded-2xl border bg-card transition-opacity ${
                      !canAfford ? "opacity-50 border-border/30" : "border-border/50 hover:border-primary/30"
                    }`}
                  >
                    {image && (
                      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-muted">
                        <img
                          src={image.url}
                          alt={image.altText || product.node.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-display text-sm font-black italic uppercase leading-tight truncate">
                        {product.node.title}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {product.node.description}
                      </p>
                      {costNum && (
                        <div className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-primary" />
                          <span className="text-xs font-black text-primary">{costNum.toLocaleString()} XP</span>
                        </div>
                      )}
                    </div>
                    <button
                      disabled={!canAfford}
                      className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-black uppercase transition-colors ${
                        canAfford
                          ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-95"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      }`}
                    >
                      {canAfford ? "Redeem" : "Need XP"}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Out of Stock ── */}
      {outOfStockRewards.length > 0 && (
        <div className="space-y-3">
          <div className="text-[11px] font-black tracking-[0.14em] text-muted-foreground uppercase">
            Out of Stock
          </div>
          <div className="space-y-3">
            {outOfStockRewards.map((reward) => (
              <RewardCatalogCard key={reward.id} reward={reward} userPoints={userPoints} onSelect={handleSelectReward} />
            ))}
          </div>
        </div>
      )}

      {/* ── Stake ── */}
      <div className="border-t border-border/30 pt-6">
        <StakeOptionsSection
          title={getSetting("stake_section_title", "Stake Your Points")}
          stakeEnabled={getSetting("stake_enabled", "true") === "true"}
          activeStakeCount={stakeStats?.activeCount ?? 0}
          minStake={parseInt(getSetting("minimum_stake_points", "50"))}
          maxStake={parseInt(getSetting("maximum_stake_points", "500"))}
        />
      </div>

      {/* ── Earn More ── */}
      <div ref={earnRef} className="border-t border-border/30 pt-6">
        <EarnPointsSection
          title={getSetting("earn_section_title", "Ways to Earn More Points")}
          settings={settings}
        />
      </div>

      {/* ── Referral ── */}
      <ReferralSection
        title={getSetting("referral_section_title", "Invite Friends")}
        enabled={getSetting("referral_program_enabled", "true") === "true"}
        referralCode={referralCode}
        referralCount={(referrals as ReferralRow[]).filter(r => r.referral_status === "completed").length}
        inviterPoints={getSetting("referral_points_inviter", "200")}
      />

      {/* ── Buy Points ── */}
      <div ref={buyRef} className="border-t border-border/30 pt-6">
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

      {/* ── Transaction History ── */}
      <TransactionHistory transactions={transactions} />

      {/* ── Close XPLAY content fragment ── */}
      </>}

      {/* ── FAB: Buy Points ── */}
      <motion.button
        onClick={() => scrollTo(buyRef)}
        className="fixed bottom-24 right-5 z-40 flex items-center justify-center bg-primary text-primary-foreground shadow-lg font-black text-sm overflow-hidden h-12"
        style={{ minWidth: 48 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          width: fabExpanded ? 152 : 48,
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

      {/* ── Modals ── */}
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
