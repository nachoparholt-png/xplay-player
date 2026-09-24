/**
 * OtherClubRow — tier 2 (not hosted by XPLAY). Plain list row on the page ground:
 * square neutral tile, neutral provider chip, next slot + from-price in mono. No lime.
 */
import { ChevronRight, ExternalLink, Info } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { formatMiles } from "@/lib/distance";
import { clubInitials, formatNextSlot, isMembersOnly, providerLabel } from "./clubTier";

interface Props {
  id: string;
  name: string;
  area?: string | null;
  provider?: string | null;
  nextSlotAt?: string | null;
  nextSlotPriceCents?: number | null;
  currencySymbol?: string;
  distanceMi?: number | null;
}

const OtherClubRow = ({ id, name, area, provider, nextSlotAt, nextSlotPriceCents, currencySymbol = "£", distanceMi }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const via = providerLabel(provider);
  const membersOnly = isMembersOnly(provider);
  const next = nextSlotAt ? formatNextSlot(nextSlotAt) : null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/clubs/${id}`, { state: { from: location.pathname } })}
      className="w-full min-w-0 flex items-center gap-3 py-3 text-left border-b border-border/60 last:border-b-0 active:bg-card/60"
    >
      <div className="w-10 h-10 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-display font-bold text-muted-foreground">{clubInitials(name)}</span>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-sans font-bold text-sm text-foreground truncate">{name}</h3>
        <div className="flex items-center gap-2 mt-1 min-w-0">
          {distanceMi != null ? (
            <span className="font-mono text-[11px] text-foreground/80 flex-shrink-0">{formatMiles(distanceMi)}</span>
          ) : area ? (
            <span className="text-[11px] text-foreground/80 truncate">{area}</span>
          ) : null}
          {membersOnly ? (
            <>
              <span className="inline-flex items-center flex-shrink-0 rounded-full border border-outline-variant bg-surface-container-high text-foreground px-2 py-0.5 text-[10px] font-semibold">
                {via}
              </span>
              <span className="inline-flex items-center flex-shrink-0 rounded-full border border-outline-variant bg-surface-container-high text-foreground px-2 py-0.5 text-[10px] font-semibold">
                Members only
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 flex-shrink-0 rounded-full border border-outline-variant bg-surface-container-high text-foreground px-2 py-0.5 text-[10px] font-semibold">
              {via ? <ExternalLink className="w-2.5 h-2.5" /> : <Info className="w-2.5 h-2.5" />}
              {via ? `via ${via}` : "Info only"}
            </span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        {membersOnly ? (
          <p className="text-[11px] text-foreground/70">Book in the DL app</p>
        ) : next ? (
          <>
            <p className="text-xs text-foreground">
              {next.day} <span className="font-mono font-bold">{next.time}</span>
            </p>
            {nextSlotPriceCents != null && (
              <p className="font-mono text-[11px] text-foreground/80">
                from {currencySymbol}{Math.round(nextSlotPriceCents / 100)}
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-foreground/70">{via ? "No slots right now" : "No live availability"}</p>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
};

export default OtherClubRow;
