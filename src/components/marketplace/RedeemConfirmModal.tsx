import { xpToPence } from "@/lib/pointsCopy";
import { addressComplete, EMPTY_ADDRESS, formatPence, isValidUkPostcode, type DeliveryQuote, type ShippingAddress } from "@/lib/store";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Zap, CreditCard, Truck } from "lucide-react";
import { useEffect, useState } from "react";

interface RedeemConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (shippingAddress: ShippingAddress, pointsToUse: number) => void;
  productTitle: string;
  variantLabel?: string;
  pointPrice: number;
  userPoints: number;
  delivery: DeliveryQuote;
  savedAddress: ShippingAddress | null | undefined;
  isLoading: boolean;
}

const Row = ({ label, value, tone = "muted" }: { label: React.ReactNode; value: React.ReactNode; tone?: "muted" | "card" | "primary" }) => (
  <div
    className={`flex items-center justify-between p-3 rounded-xl text-sm ${
      tone === "primary" ? "bg-primary/10 border border-primary/20" : tone === "card" ? "bg-secondary border border-border" : "bg-muted/50"
    }`}
  >
    <span className={`flex items-center gap-1.5 ${tone === "card" ? "text-secondary-foreground font-semibold" : "text-muted-foreground"}`}>{label}</span>
    <span className={`font-bold ${tone === "primary" ? "text-primary" : tone === "card" ? "text-secondary-foreground" : ""}`}>{value}</span>
  </div>
);

const MarketplaceRedeemModal = ({
  open, onClose, onConfirm, productTitle, variantLabel, pointPrice, userPoints, delivery, savedAddress, isLoading,
}: RedeemConfirmModalProps) => {
  const maxSlider = Math.min(userPoints, pointPrice);
  const hasUsableXP = maxSlider > 0;
  const [pointsToUse, setPointsToUse] = useState(maxSlider);
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_ADDRESS);

  // Each time the sheet opens: all usable points, and the saved address if there is one.
  useEffect(() => {
    if (!open) return;
    setPointsToUse(maxSlider);
    if (savedAddress) setAddress((a) => (a.line1 ? a : savedAddress));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, savedAddress]);

  const itemCardPence = xpToPence(pointPrice - pointsToUse); // 100 XP = £1 → 1 XP = 1p
  const totalCardPence = itemCardPence + delivery.feePence;
  const balanceAfter = userPoints - pointsToUse;
  const postcodeTyped = address.postcode.trim().length >= 5;
  const postcodeOk = isValidUkPostcode(address.postcode);
  const ready = addressComplete(address);
  // Stripe will not take a card payment under 30p
  const tooSmall = totalCardPence > 0 && totalCardPence < 30;

  const buttonLabel = isLoading
    ? "Processing..."
    : totalCardPence === 0
      ? `Redeem ${pointsToUse.toLocaleString()} XP`
      : pointsToUse > 0
        ? `Pay ${formatPence(totalCardPence)} + ${pointsToUse.toLocaleString()} XP`
        : `Pay ${formatPence(totalCardPence)} by card`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">{hasUsableXP ? "Redeem product" : "Buy with card"}</DialogTitle>
          <DialogDescription>
            <strong>{productTitle}</strong>{variantLabel && variantLabel !== "One size" ? ` · ${variantLabel}` : ""}
            {!hasUsableXP && <> — you don't have XPLAY Points to use yet, so the full amount goes on your card.</>}
          </DialogDescription>
        </DialogHeader>

        {hasUsableXP && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Points to use</Label>
            <Slider min={0} max={maxSlider} step={1} value={[pointsToUse]} onValueChange={([v]) => setPointsToUse(v)} />
            <div className="flex justify-between">
              <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => setPointsToUse(0)}>
                Pay by card only
              </Button>
              <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => setPointsToUse(maxSlider)}>
                Use all my points
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Row label="Product" value={<span className="text-primary">{pointPrice.toLocaleString()} XP</span>} />
          {hasUsableXP && <Row label={<><Zap className="w-3.5 h-3.5" /> Points used</>} value={`${pointsToUse.toLocaleString()} XP`} />}
          {itemCardPence > 0 && <Row label={<><CreditCard className="w-3.5 h-3.5" /> Product on card</>} value={formatPence(itemCardPence)} />}
          <Row
            label={<><Truck className="w-3.5 h-3.5" /> UK delivery</>}
            value={delivery.free ? "Free with XPLAY Pro" : formatPence(delivery.feePence)}
          />
          {delivery.proCapReached && (
            <p className="text-xs text-muted-foreground px-1">You've used this month's free XPLAY Pro delivery.</p>
          )}
          <Row tone="card" label="To pay by card" value={formatPence(totalCardPence)} />
          {pointsToUse > 0 && (
            <p className="text-xs text-muted-foreground px-1">
              Your {pointsToUse.toLocaleString()} XP save you {formatPence(xpToPence(pointsToUse))}. Without points: {formatPence(xpToPence(pointPrice) + delivery.feePence)}{delivery.feePence > 0 ? " (product + delivery)" : ""}.
            </p>
          )}
          {hasUsableXP && <Row tone="primary" label="Points balance after" value={`${balanceAfter.toLocaleString()} XP`} />}
        </div>

        <div
          className="space-y-3"
          onKeyDown={(e) => {
            // iOS keyboard: Return moves to the next field; on the last field it closes the keyboard.
            if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
            e.preventDefault();
            const fields = Array.from(e.currentTarget.querySelectorAll("input"));
            const i = fields.indexOf(e.target);
            if (i >= 0 && i < fields.length - 1) fields[i + 1].focus();
            else e.target.blur();
          }}
        >
          <Label className="text-sm font-medium">Delivery address (UK only)</Label>
          <Input placeholder="Full name" autoComplete="name" enterKeyHint="next" autoCapitalize="words" value={address.name}
            onChange={(e) => setAddress({ ...address, name: e.target.value })} style={{ fontSize: "16px" }} />
          <Input placeholder="Address line 1" autoComplete="address-line1" enterKeyHint="next" value={address.line1}
            onChange={(e) => setAddress({ ...address, line1: e.target.value })} style={{ fontSize: "16px" }} />
          <Input placeholder="Address line 2 (optional)" autoComplete="address-line2" enterKeyHint="next" value={address.line2}
            onChange={(e) => setAddress({ ...address, line2: e.target.value })} style={{ fontSize: "16px" }} />
          <div className="flex gap-2">
            <Input placeholder="Town or city" autoComplete="address-level2" enterKeyHint="next" value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })} style={{ fontSize: "16px" }} />
            <Input placeholder="Postcode" autoComplete="postal-code" enterKeyHint="done" autoCapitalize="characters" value={address.postcode}
              onChange={(e) => setAddress({ ...address, postcode: e.target.value.toUpperCase() })} style={{ fontSize: "16px" }} />
          </div>
          {postcodeTyped && !postcodeOk ? (
            <p className="text-xs text-destructive">We only deliver within the UK for now. Please enter a valid UK postcode.</p>
          ) : !ready ? (
            <p className="text-xs text-muted-foreground">We need your name and full UK address to send this to you. We'll remember it for next time.</p>
          ) : null}
        </div>

        {tooSmall && (
          <p className="text-xs text-destructive">Card payments start at £0.30. Use all your points, or fewer points.</p>
        )}
        {totalCardPence > 0 && !tooSmall && (
          <p className="text-xs text-muted-foreground">
            You'll go to Stripe to pay {formatPence(totalCardPence)}. We hold the item for you for 30 minutes; your points are only taken once the payment goes through.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={() => onConfirm(address, pointsToUse)} disabled={isLoading || !ready || tooSmall || delivery.loading}>
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MarketplaceRedeemModal;
