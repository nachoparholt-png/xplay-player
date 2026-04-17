import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Copy, Share2, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface ReferralSectionProps {
  title: string;
  enabled: boolean;
  referralCode: string | null;
  referralCount: number;
  inviterPoints: string;
}

const ReferralSection = ({ title, enabled, referralCode, referralCount, inviterPoints }: ReferralSectionProps) => {
  const [copied, setCopied] = useState(false);

  if (!enabled) return null;

  const referralLink = referralCode
    ? `${window.location.origin}/auth?ref=${referralCode}`
    : "";

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast({ title: "Link copied!", description: "Share it with your friends." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share && referralLink) {
      try {
        await navigator.share({ title: "Join XPLAY", text: "Join me on XPLAY — compete, earn XP, and win rewards. Sign up with my link:", url: referralLink });
      } catch {}
    } else {
      handleCopy();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-secondary" />
        <h2 className="font-display font-bold text-lg">{title}</h2>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-elevated p-4 space-y-3"
      >
        <p className="text-sm text-muted-foreground">
          Invite players to join XPLAY and earn <span className="text-primary font-semibold">50 XPLAY points</span> when they sign up through your link.
        </p>

        {referralCode && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/50 border border-border/50">
            <span className="flex-1 text-sm font-mono text-foreground truncate">{referralCode}</span>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" onClick={handleCopy} className="flex-1 gap-1.5">
            <Copy className="w-3.5 h-3.5" />
            Copy Link
          </Button>
          <Button size="sm" variant="outline" onClick={handleShare} className="flex-1 gap-1.5">
            <Share2 className="w-3.5 h-3.5" />
            Share Invite
          </Button>
        </div>

        {referralCount > 0 && (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <span className="text-sm text-muted-foreground">{referralCount} friend{referralCount !== 1 ? "s" : ""} joined</span>
            <div className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="stat-number text-sm text-primary">+{referralCount * 50} XPLAY earned</span>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ReferralSection;
