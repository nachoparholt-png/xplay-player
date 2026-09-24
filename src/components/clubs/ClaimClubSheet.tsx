/**
 * ClaimClubSheet — "Run this club? Get it on XPLAY" lead form (CL7).
 * Writes to club_claim_requests (RLS: insert own, read own/admin).
 */
import { useState } from "react";
import { Check, Users, Percent, LayoutGrid } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clubId: string;
  clubName: string;
}

const inputCls =
  "w-full bg-background border border-outline-variant rounded-xl px-3.5 py-3 text-base text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary";

const ClaimClubSheet = ({ open, onOpenChange, clubId, clubName }: Props) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const valid = name.trim().length > 1 && /^\S+@\S+\.\S+$/.test(email.trim());

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const { error } = await (supabase as any).from("club_claim_requests").insert({
      club_id: clubId,
      contact_name: name.trim(),
      role_at_club: role.trim() || null,
      email: email.trim(),
      phone: phone.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't send your request. Please try again.");
      return;
    }
    setDone(true);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setDone(false); }}>
      <DialogContent className="max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        {done ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-primary flex items-center justify-center">
              <Check className="w-7 h-7 text-primary-foreground" />
            </div>
            <DialogTitle className="font-display text-xl">Request sent</DialogTitle>
            <DialogDescription className="text-sm text-foreground/85">
              Thanks {name.trim().split(" ")[0]}. The XPLAY team will call you about bringing {clubName} onto XPLAY.
            </DialogDescription>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full rounded-full bg-primary text-primary-foreground py-3 text-xs font-display font-black uppercase tracking-widest"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <DialogHeader className="text-left">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/70">For club owners</p>
              <DialogTitle className="font-display text-xl leading-tight">Bring {clubName} to XPLAY</DialogTitle>
              <DialogDescription className="sr-only">Request a call from the XPLAY team</DialogDescription>
            </DialogHeader>

            <ul className="space-y-2.5">
              <Benefit icon={<Users className="w-4 h-4" />} text="Players are already organising matches at your venue on XPLAY" />
              <Benefit icon={<Percent className="w-4 h-4" />} text="0% fee on court bookings" />
              <Benefit icon={<LayoutGrid className="w-4 h-4" />} text="Tournaments, memberships and shop in one place" />
            </ul>

            <div className="space-y-2.5">
              <input className={inputCls} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              <input className={inputCls} placeholder="Role at the club (e.g. owner, manager)" value={role} onChange={(e) => setRole(e.target.value)} />
              <input className={inputCls} placeholder="Email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <input className={inputCls} placeholder="Phone (optional)" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </div>

            <button
              type="button"
              disabled={!valid || saving}
              onClick={submit}
              className="w-full rounded-full bg-primary text-primary-foreground py-3.5 text-xs font-display font-black uppercase tracking-widest disabled:opacity-50"
            >
              {saving ? "Sending…" : "Request a call"}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Benefit = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <li className="flex items-start gap-2.5 text-sm text-foreground">
    <span className="mt-0.5 text-primary flex-shrink-0">{icon}</span>
    {text}
  </li>
);

export default ClaimClubSheet;
