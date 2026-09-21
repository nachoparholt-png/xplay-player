/**
 * XPLAY Store — catalogue, stock and orders live in our own database (no Shopify).
 * Money, points and stock rules are enforced by the `store_*` database functions and
 * the `store-order` edge function; this file only reads and formats.
 * Spec: project doc "XPLAY_Store_Native_Stripe_Spec".
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useXplayPro } from "@/hooks/useXplayPro";

// Generated types predate these tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface StoreVariant {
  id: string;
  product_id: string;
  label: string;
  sku: string | null;
  stock: number;
  low_stock_threshold: number;
  active: boolean;
  sort_order: number;
}

export interface StoreProduct {
  id: string;
  title: string;
  description: string | null;
  category: string;
  point_price: number;
  cash_price_cents: number;
  image_url: string | null;
  active: boolean;
  delivery_size: "small" | "large";
  product_variants: StoreVariant[];
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
}

export const EMPTY_ADDRESS: ShippingAddress = { name: "", line1: "", line2: "", city: "", postcode: "" };

export const formatPence = (pence: number): string => `£${(pence / 100).toFixed(2)}`;

export const sellableVariants = (p: StoreProduct): StoreVariant[] =>
  [...(p.product_variants ?? [])].filter((v) => v.active).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

export const productInStock = (p: StoreProduct): boolean => sellableVariants(p).some((v) => v.stock > 0);

/** UK mainland + Northern Ireland. Jersey, Guernsey and Isle of Man are not served at launch. Server twin: store_valid_uk_postcode(). */
export const isValidUkPostcode = (postcode: string): boolean => {
  const pc = postcode.replace(/\s/g, "").toUpperCase();
  return /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(pc) && !/^(JE|GY|IM)[0-9]/.test(pc);
};

export const addressComplete = (a: ShippingAddress): boolean =>
  a.name.trim().length > 1 && a.line1.trim().length > 3 && a.city.trim().length > 1 && isValidUkPostcode(a.postcode);

const PRODUCT_SELECT = "*, product_variants(*)";

export function useStoreProducts() {
  return useQuery({
    queryKey: ["store-products"],
    queryFn: async (): Promise<StoreProduct[]> => {
      const { data, error } = await db.from("products").select(PRODUCT_SELECT).eq("active", true).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StoreProduct[];
    },
  });
}

export function useStoreProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["store-product", id],
    enabled: !!id,
    queryFn: async (): Promise<StoreProduct | null> => {
      const { data, error } = await db.from("products").select(PRODUCT_SELECT).eq("id", id).eq("active", true).maybeSingle();
      if (error) throw error;
      return (data as StoreProduct) ?? null;
    },
  });
}

export function useSavedAddress() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  return useQuery({
    queryKey: ["store-saved-address", userId],
    enabled: !!userId,
    queryFn: async (): Promise<ShippingAddress | null> => {
      const { data } = await db.from("user_addresses").select("*").eq("user_id", userId).maybeSingle();
      if (!data) return null;
      return { name: data.full_name ?? "", line1: data.line1 ?? "", line2: data.line2 ?? "", city: data.city ?? "", postcode: data.postcode ?? "" };
    },
  });
}

export interface DeliveryQuote {
  feePence: number;
  free: boolean;
  /** Pro member who has already used this month's free deliveries */
  proCapReached: boolean;
  loading: boolean;
}

/** What delivery will cost for this product. The server recalculates; this is for display. */
export function useDeliveryQuote(deliverySize: "small" | "large" | undefined): DeliveryQuote {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const pro = useXplayPro();

  const { data, isLoading } = useQuery({
    queryKey: ["store-delivery-settings", userId, pro.active],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await db
        .from("app_settings")
        .select("key, value")
        .in("key", ["store_delivery_fee_small_pence", "store_delivery_fee_large_pence", "store_free_delivery_per_month"]);
      const map = new Map<string, string>((rows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
      let usedThisMonth = 0;
      if (pro.active) {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const { count } = await db
          .from("redemption_orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("delivery_free_reason", "pro")
          .neq("status", "cancelled")
          .gte("created_at", monthStart.toISOString());
        usedThisMonth = count ?? 0;
      }
      return {
        small: parseInt(map.get("store_delivery_fee_small_pence") ?? "395", 10),
        large: parseInt(map.get("store_delivery_fee_large_pence") ?? "595", 10),
        cap: parseInt(map.get("store_free_delivery_per_month") ?? "1", 10),
        usedThisMonth,
      };
    },
  });

  const base = deliverySize === "large" ? data?.large ?? 595 : data?.small ?? 395;
  const free = pro.active && !!data && data.usedThisMonth < data.cap;
  return { feePence: free ? 0 : base, free, proCapReached: pro.active && !!data && !free, loading: isLoading };
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  pending: "To pack",
  paid: "To pack",
  packed: "Packed",
  shipped: "On its way",
  delivered: "Delivered",
  fulfilled: "Delivered",
  cancelled: "Cancelled",
};

/** What the player sees (they don't need "to pack"). */
export const ORDER_STATUS_PLAYER_LABEL: Record<string, string> = {
  ...ORDER_STATUS_LABEL,
  pending: "Confirmed",
  paid: "Confirmed",
  packed: "Being prepared",
};
