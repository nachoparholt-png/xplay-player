import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Zap, CreditCard } from "lucide-react";
import { useState, useMemo } from "react";

interface RedeemConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmFullPoints: (shippingAddress: Record<string, string>) => void;
  onConfirmHybrid: (shippingAddress: Record<string, string>, pointsToUse: number) => void;
  productTitle: string;
  pointPrice: number;
  userPoints: number;
  isLoading: boolean;
}

const MarketplaceRedeemModal = ({
  open, onClose, onConfirmFullPoints, onConfirmHybrid,
  productTitle, pointPrice, userPoints, isLoading,
}: RedeemConfirmModalProps) => {
  const maxSlider = Math.min(userPoints, pointPrice);
  const [pointsToUse, setPointsToUse] = useState(maxSlider);
  const [address, setAddress] = useState({ line1: "", city: "", postcode: "" });

  const remainingPoints = pointPrice - pointsToUse;
  // 10 XP = £1 → 1 XP = £0.10 → remaining in pence = remainingPoints * 10
  const cardChargePence = remainingPoints * 10;
  const cardCharge = (cardChargePence / 100).toFixed(2);
  const isFullPoints = pointsToUse >= pointPrice;
  const balanceAfter = userPoints - pointsToUse;

  const handleConfirm = () => {
    if (isFullPoints) {
      onConfirmFullPoints(address);
    } else {
      onConfirmHybrid(address, pointsToUse);
    }
  };

  // Reset slider when modal opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setPointsToUse(maxSlider);
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Redeem Product</DialogTitle>
          <DialogDescription>
            Choose how to pay for <strong>{productTitle}</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Slider */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Points to use</Label>
          <Slider
            min={0}
            max={maxSlider}
            step={1}
            value={[pointsToUse]}
            onValueChange={([v]) => setPointsToUse(v)}
          />
          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => setPointsToUse(0)}
            >
              No XP (Card Only)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => setPointsToUse(maxSlider)}
            >
              Use All XP
            </Button>
          </div>
        </div>

        {/* Live breakdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 text-sm">
            <span className="text-muted-foreground">Product cost</span>
            <div className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="font-bold text-primary">{pointPrice.toLocaleString()} XP</span>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="w-3.5 h-3.5" /> Points used
            </span>
            <span className="font-bold">{pointsToUse.toLocaleString()} XP</span>
          </div>
          {!isFullPoints && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary border border-border text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CreditCard className="w-3.5 h-3.5" /> Card charge
              </span>
              <span className="font-bold">£{cardCharge}</span>
            </div>
          )}
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm">
            <span className="text-muted-foreground">Balance after</span>
            <span className="font-bold text-primary">{balanceAfter.toLocaleString()} XP</span>
          </div>
        </div>

        {/* Shipping address */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">Shipping Address (optional)</Label>
          <Input placeholder="Address line 1" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />
          <div className="flex gap-2">
            <Input placeholder="City" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
            <Input placeholder="Postcode" value={address.postcode} onChange={(e) => setAddress({ ...address, postcode: e.target.value })} />
          </div>
        </div>

        {!isFullPoints && (
          <p className="text-xs text-muted-foreground">
            You'll be redirected to Stripe to complete the £{cardCharge} payment.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading
              ? "Processing..."
              : isFullPoints
                ? `Redeem ${pointsToUse.toLocaleString()} XP`
                : `Pay £${cardCharge} + ${pointsToUse} XP`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MarketplaceRedeemModal;
