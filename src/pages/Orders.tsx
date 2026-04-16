import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Store, Zap, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  paid: "bg-blue-500/20 text-blue-400",
  fulfilled: "bg-green-500/20 text-green-400",
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
      return data || [];
    },
    enabled: !!session?.user?.id,
  });

  // Realtime subscription
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
    <div className="p-4 space-y-6">
      <h1 className="font-display text-2xl font-bold">My Orders</h1>

      {!orders || orders.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <Package className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No orders yet</p>
          <Button variant="outline" onClick={() => navigate("/marketplace")}>
            <Store className="w-4 h-4 mr-2" /> Browse Marketplace
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order: any) => {
            const product = order.products;
            return (
              <Card key={order.id}>
                <CardContent className="p-4 flex gap-4">
                  <div className="w-16 h-16 rounded-lg bg-secondary/20 overflow-hidden flex-shrink-0">
                    {product?.image_url ? (
                      <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Package className="w-6 h-6 text-muted-foreground" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{product?.title || "Product"}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(order.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {order.points_used > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-primary">
                          <Zap className="w-3 h-3" /> {order.points_used} XP
                        </span>
                      )}
                      {order.cash_paid_cents > 0 && (
                        <span className="text-xs text-muted-foreground">
                          + £{(order.cash_paid_cents / 100).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge className={`self-start ${statusColors[order.status] || ""}`}>
                    {order.status}
                  </Badge>
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
