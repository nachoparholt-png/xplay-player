/**
 * Club membership (25 Sep 2026) — /clubs/:clubId/membership.
 * Plan cards from membership_tiers, example price for tonight's court, pinned join button.
 * Purchase / cancel go through the existing edge functions (purchase-membership, cancel-membership)
 * with the in-app-browser re-check after Stripe.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { type TierRow, isStaffTier, tierDiscount, tierBenefits, money, periodShort, periodLong, perPlayer } from "@/lib/clubs/membershipTiers";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MembershipRow { id: string; tier_id: string | null; status?: string | null; cancels_at?: string | null; role?: string | null }
type FirstSlot = { starts_at: string; mins: number; price: number };

const ClubMembership = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [clubName, setClubName] = useState("");
  const [currency, setCurrency] = useState("£");
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [mine, setMine] = useState<MembershipRow | null>(null);
  const [slot, setSlot] = useState<FirstSlot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [switchConfirm, setSwitchConfirm] = useState<TierRow | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const loadMembership = async () => {
    if (!user || !clubId) return null;
    const { data } = await supabase.from("club_memberships").select("*").eq("user_id", user.id).eq("club_id", clubId).eq("active", true).maybeSingle();
    return (data as MembershipRow | null) ?? null;
  };

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
      const [{ data: club }, { data: tierRows }, mem, { data: courts }] = await Promise.all([
        supabase.from("clubs").select("club_name, currency_symbol").eq("id", clubId).maybeSingle(),
        supabase.from("membership_tiers").select("*").eq("club_id", clubId).eq("active", true).order("sort_order"),
        loadMembership(),
        supabase.from("courts").select("id").eq("club_id", clubId).eq("active", true),
      ]);
      let first: FirstSlot | null = null;
      const courtIds = (courts || []).map((c: any) => c.id);
      if (courtIds.length) {
        const { data: sl } = await supabase.from("court_slots").select("starts_at, ends_at, price").in("court_id", courtIds).eq("status", "available").is("coaching_session_id", null)
          .gte("starts_at", new Date().toISOString()).lte("starts_at", endOfDay.toISOString()).order("starts_at").limit(1);
        const s = (sl || [])[0] as any;
        if (s && s.price != null) first = { starts_at: s.starts_at, mins: Math.max(15, Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000)), price: Number(s.price) };
      }
      if (cancelled) return;
      setClubName((club as any)?.club_name ?? "");
      setCurrency((club as any)?.currency_symbol ?? "£");
      const list = ((tierRows || []) as TierRow[]).filter((t) => !isStaffTier(t));
      setTiers(list);
      setMine(mem);
      setSlot(first);
      setSelected(mem?.tier_id && list.some((t) => t.id === mem.tier_id) ? mem.tier_id : popularId(list) ?? list[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clubId, user]);

  // Re-check after the in-app browser closes (post-Stripe)
  const prevIdRef = useRef<string | null>(null);
  useEffect(() => { prevIdRef.current = mine?.id ?? null; }, [mine]);
  useEffect(() => {
    let handle: Awaited<ReturnType<typeof Browser.addListener>> | null = null;
    Browser.addListener("browserFinished", async () => {
      const mem = await loadMembership();
      setMine(mem);
      if (mem?.id && mem.id !== prevIdRef.current) toast.success("Membership active");
    }).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, [user, clubId]);

  const purchase = async (tierId: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-membership", { body: { tier_id: tierId, club_id: clubId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) { await Browser.open({ url: data.url }); return; }
      toast.success("Membership active");
      setMine(await loadMembership());
    } catch (e: any) { toast.error(e.message || "Failed"); } finally { setBusy(false); }
  };

  const join = (tier: TierRow) => {
    if (mine?.tier_id && mine.tier_id !== tier.id) { setSwitchConfirm(tier); return; }
    purchase(tier.id);
  };

  const cancel = async () => {
    if (!mine) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-membership", { body: { membership_id: mine.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMine((prev) => (prev ? { ...prev, status: "cancelling", cancels_at: data?.cancels_at ?? null } : null));
      toast.success(data?.cancels_at ? `Ends on ${new Date(data.cancels_at).toLocaleDateString()}` : "Membership cancelled");
    } catch (e: any) { toast.error(e.message || "Failed to cancel"); } finally { setBusy(false); setCancelOpen(false); }
  };

  const myTier = mine?.tier_id ? tiers.find((t) => t.id === mine.tier_id) ?? null : null;
  const sel = tiers.find((t) => t.id === selected) ?? null;
  const popular = popularId(tiers);
  const selDiscount = tierDiscount(sel);
  const isMine = !!sel && sel.id === mine?.tier_id;

  if (loading) {
    return <div className="flex justify-center items-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="px-4 pt-3 pb-40 space-y-5">
      <header className="flex items-center gap-2.5">
        <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95"><ArrowLeft className="w-4 h-4" /></button>
        <span className="text-xs font-bold text-muted-foreground truncate">{clubName}</span>
      </header>

      <div>
        <h1 className="font-display text-[28px] font-black italic uppercase leading-tight">Membership</h1>
        <p className="text-sm text-muted-foreground mt-1">Pay the club monthly, book cheaper every time.</p>
      </div>

      {mine?.status === "cancelling" && mine.cancels_at && (
        <div className="rounded-xl border border-secondary/60 px-3.5 py-2.5 text-xs">Active until <span className="font-mono font-bold">{format(new Date(mine.cancels_at), "d MMM yyyy")}</span>, then it ends.</div>
      )}

      {tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plans yet.</p>
      ) : (
        <div className="space-y-3">
          {tiers.map((t) => {
            const yours = t.id === mine?.tier_id;
            const on = t.id === selected;
            const d = tierDiscount(t);
            const benefits = tierBenefits(t).slice(0, 4);
            const lines = benefits.length ? benefits : [d > 0 ? `${d}% off every court` : "Member prices", t.advance_booking_days ? `Book ${t.advance_booking_days} days ahead` : ""].filter(Boolean);
            return (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className={cn("w-full rounded-2xl bg-card border-2 p-4 text-left transition-colors", yours ? "border-secondary" : on ? "border-primary" : "border-border/60")}>
                <div className="flex items-center gap-2">
                  <span className="font-display font-black italic uppercase text-lg flex-1">{t.name}</span>
                  {yours && <span className="rounded-full bg-secondary/20 text-secondary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">Yours</span>}
                  {!yours && t.id === popular && <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">Popular</span>}
                  <span className="font-mono text-base font-bold">{money(t.price_cents, currency)} <span className="text-xs text-muted-foreground font-normal">/{periodShort(t.billing_period)}</span></span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {lines.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm"><Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" /><span>{b}</span></li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      )}

      {slot && selDiscount > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Tonight's court</div>
          <span className="font-mono">{format(new Date(slot.starts_at), "HH:mm")} · {slot.mins >= 60 ? `${Math.floor(slot.mins / 60)}h${slot.mins % 60 ? ` ${slot.mins % 60}` : ""}` : `${slot.mins} min`}</span>
          {" → "}
          <span className="font-mono font-bold text-primary">{perPlayer(slot.price, selDiscount, currency)} pp</span>
          <span className="text-muted-foreground"> (was <span className="font-mono">{perPlayer(slot.price, 0, currency)}</span>)</span>
        </div>
      )}

      {/* ── Pinned action ── */}
      {sel && (
        <div className="fixed left-0 right-0 bottom-[var(--bottom-nav-clearance)] z-30 px-4 pt-3 pb-2 bg-gradient-to-t from-background via-background to-transparent lg:bottom-0">
          {isMine ? (
            mine?.status === "active" ? (
              <button onClick={() => setCancelOpen(true)} disabled={busy} className="w-full rounded-xl border border-border py-3.5 text-sm font-bold active:scale-[0.98] disabled:opacity-50">Cancel membership</button>
            ) : null
          ) : (
            <button onClick={() => join(sel)} disabled={busy} className="w-full rounded-xl bg-secondary text-secondary-foreground py-3.5 font-display font-black italic uppercase text-sm tracking-wider active:scale-[0.98] disabled:opacity-50">
              {busy ? "…" : `Join ${sel.name} · ${money(sel.price_cents, currency)} ${periodLong(sel.billing_period)}`}
            </button>
          )}
          <p className="text-[11px] text-muted-foreground text-center mt-2">Paid to the club through XPLAY. Cancel any time.</p>
        </div>
      )}

      <AlertDialog open={!!switchConfirm} onOpenChange={(o) => { if (!o) setSwitchConfirm(null); }}>
        <AlertDialogContent className="bg-card border border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Switch to {switchConfirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {myTier && switchConfirm && switchConfirm.price_cents > myTier.price_cents
                ? "Your current plan ends now and you pay for the new one. Time left on the old plan is credited."
                : "Your current plan is replaced by this one from the next billing date."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep current</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-primary text-primary-foreground font-bold" onClick={() => { if (switchConfirm) { purchase(switchConfirm.id); setSwitchConfirm(null); } }}>Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelOpen} onOpenChange={(o) => { if (!o) setCancelOpen(false); }}>
        <AlertDialogContent className="bg-card border border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-destructive">Cancel membership?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">You keep it until the end of the current period, then it does not renew.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground font-bold" disabled={busy} onClick={(e) => { e.preventDefault(); cancel(); }}>{busy ? "Cancelling…" : "Yes, cancel"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** Middle tier by price when there are 3 or more, else none. */
function popularId(list: TierRow[]): string | null {
  if (list.length < 3) return null;
  const sorted = [...list].sort((a, b) => a.price_cents - b.price_cents);
  return sorted[Math.floor(sorted.length / 2)].id;
}

export default ClubMembership;
