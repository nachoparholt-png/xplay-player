import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Store, Zap, Loader2, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { formatPence, ORDER_STATUS_PLAYER_LABEL } from "@/lib/store";

const statusColors: Record<string, string> = {
  awaiting_payment: "bg-amber-500/20 text-amber-300",
  pending: "bg-blue-500/20 text-blue-300",
  paid: "bg-blue-500/20 text-blue-300",
  packed: "bg-blue-500/20 text-blue-300",
  shipped: "bg-primary/20 text-primary",
  delivered: "bg-green-500/20 text-green-300",
  fulfilled: "bg-green-500/20 text-green-300",
  cancelled: "bg-destructive/20 text-destructive",
};

const Orders = () => {
  const { session } = useAuth();
  const navigate = useNavigate();

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["redemption-orders", session?.user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("redemption_orders")
        .select("*, products(*)")
        .eq("user_id", session!.user.id)
        .order("created_at", { ascending: false });
      // an abandoned checkout is not an order the player needs to see
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).filter((o: any) => !(o.status === "cancelled" && !o.paid_at && o.cancel_reason !== "admin_refund"
        && o.cancel_reason !== "insufficient_points" && o.cancel_reason !== "paid_after_hold_out_of_stock"));
    },
    enabled: !!session?.user?.id,
  });

  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel("my-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "redemption_orders", filter: `user_id=eq.${session.user.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 pb-32">
      <h1 className="font-display text-2xl font-bold">My Orders</h1>

      {!orders || orders.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <Package className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No orders yet</p>
          <Button variant="outline" onClick={() => navigate("/marketplace")}>
            <Store className="w-4 h-4 mr-2" /> Browse the store
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {orders.map((order: any) => {
            const product = order.products;
            const refunded = order.status === "cancelled";
            return (
              <Card key={order.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-lg bg-secondary/20 overflow-hidden flex-shrink-0">
                      {product?.image_url ? (
                        <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Package className="w-6 h-6 text-muted-foreground" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm">{product?.title || "Product"}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {order.order_number ? `Order #${order.order_number} · ` : ""}
                        {order.variant_label && order.variant_label !== "One size" ? `${order.variant_label} · ` : ""}
                        {new Date(order.created_at).toLocaleDateString("en-GB")}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-2">
                        {order.points_used > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-primary font-semibold">
                            <Zap className="w-3 h-3" /> {Number(order.points_used).toLocaleString()} XP
                          </span>
                        )}
                        {order.cash_paid_cents > 0 && (
                          <span className="text-xs text-foreground/80">
                            {order.points_used > 0 ? "+ " : ""}{formatPence(order.cash_paid_cents)} by card
                            {order.delivery_fee_pence > 0 ? ` (incl. ${formatPence(order.delivery_fee_pence)} delivery)` : ""}
                          </span>
                        )}
                        {order.delivery_free_reason === "pro" && <span className="text-xs text-foreground/80">Free XPLAY Pro delivery</span>}
                      </div>
                    </div>
                    <Badge className={`self-start shrink-0 ${statusColors[order.status] || ""}`}>
                      {ORDER_STATUS_PLAYER_LABEL[order.status] ?? order.status}
                    </Badge>
                  </div>

                  {order.status === "shipped" && (
                    <div className="flex items-start gap-2 text-xs text-foreground/80 bg-muted/50 rounded-xl p-3">
                      <Truck className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Sent {order.shipped_at ? new Date(order.shipped_at).toLocaleDateString("en-GB") : ""}
                        {order.tracking_number ? <> · {order.tracking_carrier || "Tracking"}: <strong className="select-all">{order.tracking_number}</strong></> : ""}
                      </span>
                    </div>
                  )}
                  {refunded && (
                    <p className="text-xs text-foreground/80 bg-muted/50 rounded-xl p-3">
                      {order.cancel_reason === "insufficient_points"
                        ? "You no longer had enough XPLAY Points when the payment arrived, so your card payment was refunded."
                        : order.cancel_reason === "paid_after_hold_out_of_stock"
                          ? "The item sold out before your payment arrived, so your card payment was refunded."
                          : `Cancelled. ${order.refunded_points > 0 ? `${Number(order.refunded_points).toLocaleString()} XP went back to your balance. ` : ""}${order.cash_paid_cents > 0 ? "Your card payment was refunded." : ""}`}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Orders;
