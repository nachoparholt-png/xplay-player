import { Clock, Users } from "lucide-react";
import { formatInClubTz } from "@/utils/dateTimezone";

interface EventCardProps {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  maxAttendees?: number | null;
  attendeeCount: number;
  isSignedUp: boolean;
  onSignUp: () => void;
  loading?: boolean;
  currencySymbol?: string;
  timezone?: string | null;
}

const EventCard = ({ title, description, startsAt, endsAt, priceCents, maxAttendees, attendeeCount, isSignedUp, onSignUp, loading, currencySymbol = '£', timezone }: EventCardProps) => {
  const spotsLeft = maxAttendees ? maxAttendees - attendeeCount : null;

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1 min-w-0">
          <h3 className="font-display font-bold text-sm text-foreground">{title}</h3>
          {description && <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>}
        </div>
        {priceCents > 0 && (
          <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-full flex-shrink-0">
            {currencySymbol}{(priceCents / 100).toFixed(2)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatInClubTz(startsAt, "EEE d MMM, HH:mm", timezone)} – {formatInClubTz(endsAt, "HH:mm", timezone)}
        </span>
        {spotsLeft !== null && (
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {spotsLeft > 0 ? `${spotsLeft} spots left` : "Full"}
          </span>
        )}
      </div>

      <button
        onClick={onSignUp}
        disabled={isSignedUp || loading || (spotsLeft !== null && spotsLeft <= 0)}
        className="w-full py-2 rounded-xl text-xs font-display font-bold uppercase tracking-wider transition-all disabled:opacity-50 active:scale-[0.98] bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
      >
        {isSignedUp ? "Signed Up ✓" : loading ? "..." : "Sign Up"}
      </button>
    </div>
  );
};

export default EventCard;
