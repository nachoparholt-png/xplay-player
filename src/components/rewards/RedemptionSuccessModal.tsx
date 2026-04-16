import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, Copy, ExternalLink, Gift } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface RedemptionSuccessModalProps {
  open: boolean;
  onClose: () => void;
  data: {
    reward_name: string;
    assigned_code: string | null;
    external_store_name: string | null;
    delivery_message: string | null;
    expiration_date: string | null;
    store_website_url?: string | null;
    redemption_instructions?: string | null;
  } | null;
}

const RedemptionSuccessModal = ({ open, onClose, data }: RedemptionSuccessModalProps) => {
  if (!data) return null;

  const copyCode = () => {
    if (data.assigned_code) {
      navigator.clipboard.writeText(data.assigned_code);
      toast({ title: "Code copied to clipboard!" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="font-display text-center">Reward Redeemed! 🎉</DialogTitle>
          <DialogDescription className="text-center">
            You've successfully redeemed <strong>{data.reward_name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {data.assigned_code && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-center space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Your Code</p>
              <code className="text-xl font-mono font-bold text-primary block">{data.assigned_code}</code>
              <Button size="sm" variant="outline" onClick={copyCode} className="gap-1.5 text-xs">
                <Copy className="w-3.5 h-3.5" />
                Copy Code
              </Button>
            </div>
          )}

          {data.external_store_name && (
            <div className="p-3 rounded-xl bg-muted/50 space-y-1">
              <p className="text-xs text-muted-foreground">Redeem at</p>
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">{data.external_store_name}</span>
                {data.store_website_url && (
                  <a href={data.store_website_url} target="_blank" rel="noopener noreferrer" className="ml-auto text-primary hover:underline text-xs flex items-center gap-0.5">
                    Visit <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {(data.redemption_instructions || data.delivery_message) && (
            <div className="p-3 rounded-xl bg-muted/50 space-y-1">
              <p className="text-xs text-muted-foreground">Instructions</p>
              <p className="text-sm">{data.redemption_instructions || data.delivery_message}</p>
            </div>
          )}

          {data.expiration_date && (
            <p className="text-xs text-muted-foreground text-center">
              Code expires: {new Date(data.expiration_date).toLocaleDateString()}
            </p>
          )}
        </div>

        <Button onClick={onClose} className="w-full mt-2">
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default RedemptionSuccessModal;
