import { motion } from "framer-motion";
import { MapPin, ChevronRight, Navigation } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { formatMiles } from "@/lib/distance";

interface ClubCardProps {
  id: string;
  name: string;
  city?: string | null;
  courtCount: number;
  logoUrl?: string | null;
  courtType: string;
  hasMembership?: boolean;
  /** Miles from the user's current position. Null = not available / filter inactive. */
  distanceMi?: number | null;
}

const ClubCard = ({
  id, name, city, courtCount, logoUrl, courtType, hasMembership, distanceMi,
}: ClubCardProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const courtTypes = (courtType ?? "").split("/").map((t) => t.trim().toUpperCase()).filter(Boolean);

  return (
    <motion.button
      onClick={() => navigate(`/clubs/${id}`, { state: { from: location.pathname } })}
      className="w-full bg-card rounded-2xl border border-border/40 p-4 text-left hover:border-primary/30 transition-all active:scale-[0.98] group"
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center gap-3">
        {/* Logo / Initials */}
        <div className="w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0 border border-border/30">
          {logoUrl ? (
            <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-display font-black text-primary">
              {name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-sm text-foreground truncate">{name}</h3>
            {hasMembership && (
              <span className="text-[8px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full flex-shrink-0 border border-primary/30">
                Pro Member
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {city ?? "—"} • {courtCount} court{courtCount !== 1 ? "s" : ""}
          </p>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {courtTypes.map((type) => (
              <span
                key={type}
                className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-md border border-border/30"
              >
                {type}
              </span>
            ))}

            {/* Distance badge — only shown when Near Me filter is active */}
            {distanceMi != null && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 flex items-center gap-0.5 ml-auto">
                <Navigation className="w-2.5 h-2.5" />
                {formatMiles(distanceMi)}
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0" />
      </div>
    </motion.button>
  );
};

export default ClubCard;
