/**
 * XplayClubCard — tier 1 (our customers). Photo card, lime badge, benefit chips, lime Book CTA.
 * Lime is reserved for this tier: if it's lime, it happens in XPLAY.
 */
import { BadgeCheck, CreditCard, Zap, Crown, MapPin } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { formatMiles } from "@/lib/distance";
import { clubInitials } from "./clubTier";

interface Props {
  id: string;
  name: string;
  address?: string | null;
  courtCount: number;
  logoUrl?: string | null;
  coverUrl?: string | null;
  hasMembership?: boolean;
  hasMembershipPlans?: boolean;
  distanceMi?: number | null;
}

const XplayClubCard = ({
  id, name, address, courtCount, logoUrl, coverUrl, hasMembership, hasMembershipPlans, distanceMi,
}: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const open = (tab?: string) =>
    navigate(`/clubs/${id}${tab ? `?tab=${tab}` : ""}`, { state: { from: location.pathname } });

  return (
    <div className="w-full min-w-0 rounded-2xl border border-primary/50 bg-card overflow-hidden">
      {/* Cover */}
      <button type="button" onClick={() => open()} className="relative block w-full h-28 bg-surface-container-low text-left">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-surface-container-low to-surface-container-lowest" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
        <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">
          <BadgeCheck className="w-3 h-3" /> XPLAY Club
        </span>
        {distanceMi != null && (
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-background/85 text-foreground px-2.5 py-1 text-[11px] font-mono font-bold">
            <MapPin className="w-3 h-3" /> {formatMiles(distanceMi)}
          </span>
        )}
      </button>

      <div className="p-3.5 space-y-3">
        <button type="button" onClick={() => open()} className="flex items-center gap-3 w-full text-left min-w-0">
          <div className="w-11 h-11 rounded-full bg-surface-container-high flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-primary">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-display font-black text-primary">{clubInitials(name)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-display font-bold text-base text-foreground truncate">{name}</h3>
              {hasMembership && (
                <span className="flex-shrink-0 rounded-full bg-secondary/20 border border-secondary/40 text-foreground px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                  Pro Member
                </span>
              )}
            </div>
            <p className="text-xs text-foreground/80 truncate">
              {address || "—"}
              {courtCount > 0 && <span className="font-mono"> · {courtCount} court{courtCount !== 1 ? "s" : ""}</span>}
            </p>
          </div>
        </button>

        <div className="flex flex-wrap gap-1.5">
          <Benefit icon={<CreditCard className="w-3 h-3" />} label="Book & pay in app" />
          <Benefit icon={<Zap className="w-3 h-3" />} label="Earn points" />
          {hasMembershipPlans && <Benefit icon={<Crown className="w-3 h-3" />} label="Memberships" />}
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
          <p className="text-xs text-foreground/80">Court guaranteed the moment you book</p>
          <button
            type="button"
            onClick={() => open("courts")}
            className="flex-shrink-0 rounded-full bg-primary text-primary-foreground px-5 py-2 text-xs font-display font-black uppercase tracking-widest active:scale-95 transition-transform"
          >
            Book
          </button>
        </div>
      </div>
    </div>
  );
};

const Benefit = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/30 text-foreground px-2.5 py-1 text-[11px] font-semibold">
    <span className="text-primary">{icon}</span>
    {label}
  </span>
);

export default XplayClubCard;
