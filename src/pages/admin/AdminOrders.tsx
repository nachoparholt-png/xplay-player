import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Truck, PackageCheck, CheckCircle2, Undo2, Copy, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { formatPence, ORDER_STATUS_LABEL } from "@/lib/store";

// Generated types predate the store columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Order = any;

const FILTERS = [
  { key: "to_pack", label: "To pack", statuses: ["paid", "pending"] },
  { key: "packed", label: "Packed", statuses: ["packed"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered", "fulfilled"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  { key: "awaiting", label: "Awaiting payment", statuses: ["awaiting_payment"] },
] as const;

const statusColors: Record<string, string> = {
  awaiting_payment: "bg-amber-500/20 text-amber-300",
  pending: "bg-blue-500/20 text-blue-300",
  paid: "bg-blue-500/20 text-blue-300",
  packed: "bg-violet-500/20 text-violet-300",
  shipped: "bg-primary/20 text-primary",
  delivered: "bg-green-500/20 text-green-300",
  fulfilled: "bg-green-500/20 text-green-300",
  cancelled: "bg-destructive/20 text-destructive",
};

const addressLines = (a: Record<string, string> | null): string[] =>
  a ? [a.name, a.line1 ?? a.address1, a.line2 ?? a.address2, a.city, a.postcode ?? a.zip, "United Kingdom"].filter(Boolean) as string[] : [];

const AdminOrders = () => {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("to_pack");
  const [busy, setBusy] = useState<string | null>(null);
  const [shipOrder, setShipOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("Royal Mail");
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [restock, setRestock] = useState(true);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-store-orders"],
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await db.from("redemption_orders").select("*, products(title, image_url)").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((o: Order) => o.user_id)));
      const { data: people } = ids.length
        ? await db.from("profiles_contact").select("user_id, display_name, full_name, email").in("user_id", ids)
        : { data: [] };
      const byId = new Map((people ?? []).map((p: Order) => [p.user_id, p]));
      return (data ?? []).map((o: Order) => ({ ...o, player: byId.get(o.user_id) ?? null }));
    },
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    FILTERS.forEach((f) => { c[f.key] = (orders ?? []).filter((o) => (f.statuses as readonly string[]).includes(o.status)).length; });
    return c;
  }, [orders]);

  const visible = (orders ?? []).filter((o) => (FILTERS.find((f) => f.key === filter)!.statuses as readonly string[]).includes(o.status));
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-store-orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const setStatus = async (order: Order, status: string, trackingNumber?: string, trackingCarrier?: string) => {
    setBusy(order.id);
    try {
      const { error } = await db.rpc("store_admin_set_status", {
        _order_id: order.id, _status: status, _tracking_number: trackingNumber ?? null, _tracking_carrier: trackingCarrier ?? null,
      });
      if (error) throw error;
      toast.success(`Order #${order.order_number} → ${ORDER_STATUS_LABEL[status]}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the order");
    } finally {
      setBusy(null);
    }
  };

  const confirmRefund = async () => {
    if (!refundOrder) return;
    setBusy(refundOrder.id);
    try {
      const { data, error } = await supabase.functions.invoke("store-order", {
        body: { action: "admin_refund", order_id: refundOrder.id, restock },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.card_error) {
        toast.warning("Points returned, but the card refund failed", { description: `${data.card_error}. Refund ${formatPence(data.cash_paid_cents)} by hand in the Stripe dashboard.`, duration: 15000 });
      } else {
        toast.success(`Order #${refundOrder.order_number} cancelled and refunded`);
      }
      setRefundOrder(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(null);
    }
  };

  const copyAddress = async (order: Order) => {
    try {
      await navigator.clipboard.writeText(addressLines(order.shipping_address).join("\n"));
      toast.success("Address copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" /> Store orders
        </h1>
        <p className="text-sm text-muted-foreground">Pack, ship and refund orders from the XPLAY store.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
            {f.label} <span className="ml-1.5 opacity-70">{counts[f.key] ?? 0}</span>
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">Nothing here.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {visible.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded bg-secondary/20 overflow-hidden shrink-0">
                      {o.products?.image_url && <img src={o.products.image_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">
                        #{o.order_number} · {o.products?.title ?? "Product"}
                        {o.variant_label && o.variant_label !== "One size" ? ` · ${o.variant_label}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                        {" · "}{o.player?.display_name || o.player?.full_name || "Player"}{o.player?.email ? ` · ${o.player.email}` : ""}
                      </div>
                    </div>
                  </div>
                  <Badge className={`shrink-0 ${statusColors[o.status] || ""}`}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</Badge>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deliver to</span>
                      <button type="button" onClick={() => copyAddress(o)} className="text-xs text-primary inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
                    </div>
                    {addressLines(o.shipping_address).map((line, i) => <div key={i}>{line}</div>)}
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Payment</div>
                    <div>{Number(o.status === "awaiting_payment" ? o.points_to_use : o.points_used).toLocaleString()} XP</div>
                    <div>Item on card: {formatPence(o.item_cash_pence ?? 0)}</div>
                    <div>Delivery: {o.delivery_free_reason === "pro" ? "Free (XPLAY Pro)" : formatPence(o.delivery_fee_pence ?? 0)}</div>
                    {o.tracking_number && <div>{o.tracking_carrier || "Tracking"}: <span className="font-mono select-all">{o.tracking_number}</span></div>}
                    {o.status === "cancelled" && <div className="text-muted-foreground">Reason: {String(o.cancel_reason ?? "").replace(/_/g, " ")}</div>}
                    {o.status === "cancelled" && o.cash_paid_cents > 0 && !o.stripe_refund_id && o.cancel_reason === "admin_refund" && (
                      <div className="text-destructive font-semibold">Card refund not recorded — check Stripe</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {["paid", "pending"].includes(o.status) && (
                    <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => setStatus(o, "packed")}>
                      <PackageCheck className="w-4 h-4 mr-1" /> Mark packed
                    </Button>
                  )}
                  {["paid", "pending", "packed", "shipped"].includes(o.status) && (
                    <Button size="sm" disabled={busy === o.id} onClick={() => { setShipOrder(o); setTracking(o.tracking_number ?? ""); setCarrier(o.tracking_carrier ?? "Royal Mail"); }}>
                      <Truck className="w-4 h-4 mr-1" /> {o.status === "shipped" ? "Edit tracking" : "Mark shipped"}
                    </Button>
                  )}
                  {o.status === "shipped" && (
                    <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => setStatus(o, "delivered")}>
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Mark delivered
                    </Button>
                  )}
                  {["paid", "pending", "packed", "shipped", "delivered"].includes(o.status) && (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === o.id} onClick={() => { setRefundOrder(o); setRestock(!["shipped", "delivered"].includes(o.status)); }}>
                      <Undo2 className="w-4 h-4 mr-1" /> Cancel & refund
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Ship */}
      <Dialog open={!!shipOrder} onOpenChange={(v) => { if (!v) setShipOrder(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Order #{shipOrder?.order_number} shipped</DialogTitle>
            <DialogDescription>The player gets a notification with the tracking number.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Carrier</Label><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} style={{ fontSize: "16px" }} /></div>
            <div><Label>Tracking number (optional)</Label><Input value={tracking} onChange={(e) => setTracking(e.target.value)} style={{ fontSize: "16px" }} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipOrder(null)}>Cancel</Button>
            <Button onClick={async () => { const o = shipOrder; setShipOrder(null); if (o) await setStatus(o, "shipped", tracking, carrier); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund */}
      <Dialog open={!!refundOrder} onOpenChange={(v) => { if (!v) setRefundOrder(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel and refund order #{refundOrder?.order_number}?</DialogTitle>
            <DialogDescription>
              {Number(refundOrder?.points_used ?? 0).toLocaleString()} XP go back to the player
              {refundOrder?.cash_paid_cents > 0 ? ` and ${formatPence(refundOrder.cash_paid_cents)} is refunded to their card through Stripe` : ""}. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Switch checked={restock} onCheckedChange={setRestock} />
            <Label>Put the item back into stock</Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOrder(null)}>Keep order</Button>
            <Button variant="destructive" onClick={confirmRefund} disabled={busy === refundOrder?.id}>
              {busy === refundOrder?.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Cancel & refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOrders;
