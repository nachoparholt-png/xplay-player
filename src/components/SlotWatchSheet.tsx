/**
 * SlotWatchSheet — "Notify me" on a taken court slot (waiting list, 25 Sep 2026).
 *
 * Bottom sheet: what's being watched (club · day · time · length), an optional
 * "nearby times" checkbox, NOTIFY ME. Writes a `slot_watches` row; the 5-minute
 * `slot_watches_check()` job flips it to notified and posts an in-app notification.
 * Rendered through a portal so it sits above the create-match dialog.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export interface SlotWatchTarget {
  clubId: string;
  clubName: string;
  date: string; // yyyy-MM-dd
  time: string; // HH:mm
  durationMins: number;
}

interface SlotWatchSheetProps {
  target: SlotWatchTarget | null;
  onClose: () => void;
  /** After the watch is saved. */
  onSaved?: () => void;
}

const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min`);

const SlotWatchSheet = ({ target, onClose, onSaved }: SlotWatchSheetProps) => {
  const { user } = useAuth();
  const [nearby, setNearby] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (target) { setNearby(false); setSaving(false); } }, [target]);

  if (!target) return null;

  const confirm = async () => {
    if (!user || saving) return;
    setSaving(true);
    const { error } = await (supabase as any).from("slot_watches").upsert(
      { user_id: user.id, club_id: target.clubId, slot_date: target.date, start_time: target.time, duration_mins: target.durationMins, nearby, status: "active", notified_at: null },
      { onConflict: "user_id,club_id,slot_date,start_time" },
    );
    setSaving(false);
    if (error) { toast.error("Couldn't save that. Try again."); return; }
    toast.success("We'll tell you if it frees up");
    onSaved?.();
    onClose();
  };

  const dayLabel = format(new Date(target.date + "T00:00:00"), "EEE d MMM");

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end" role="dialog" aria-modal="true" aria-label={`${target.time} is taken`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative w-full bg-background rounded-t-3xl border-t border-border/50 px-5 pt-4 pb-6 space-y-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
        <div className="flex items-start justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/20 text-secondary px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">
            <Bell className="w-3 h-3" /> Slot taken
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 -mt-1 rounded-full flex items-center justify-center text-muted-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <h2 className="font-display text-[26px] font-black italic uppercase leading-none">{target.time} is taken</h2>
          <p className="text-sm text-muted-foreground mt-1.5">We'll tell you the moment it frees up.</p>
        </div>

        <div className="rounded-2xl bg-card border border-border/60 p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-secondary/20 text-secondary flex items-center justify-center flex-shrink-0"><Bell className="w-[18px] h-[18px]" /></div>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Watching</div>
            <div className="text-sm font-bold truncate">{target.clubName}</div>
            <div className="font-mono text-xs text-muted-foreground">{dayLabel} · {target.time} · {fmtDur(target.durationMins)}</div>
          </div>
        </div>

        <label className="flex items-center gap-3 py-1 cursor-pointer select-none">
          <span className={cn("w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0", nearby ? "bg-primary border-primary" : "border-border bg-card")}>
            {nearby && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 8.5l3 3 7-7" /></svg>}
          </span>
          <input type="checkbox" className="sr-only" checked={nearby} onChange={(e) => setNearby(e.target.checked)} />
          <span className="text-sm font-semibold">Also nearby times (±30 min)</span>
        </label>

        <button type="button" onClick={confirm} disabled={saving}
          className={cn("w-full h-14 rounded-full font-display font-black italic uppercase text-base tracking-wide", saving ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}>
          {saving ? "Saving…" : "Notify me"}
        </button>
        <button type="button" onClick={onClose} className="w-full h-11 rounded-full text-sm font-bold text-muted-foreground">Pick another time</button>
      </div>
    </div>,
    document.body,
  );
};

export default SlotWatchSheet;
