/**
 * Atoms for the player-side tournament screens (TpKit.jsx port).
 * Chip labels are near-white on an ~18–22% tint of the hue; the hue lives in
 * the tint + icon. Outline chips are facts about the tournament, not about you.
 */
import type { CSSProperties, ReactNode } from "react";
import {
  CircleCheck, Gift, Hourglass, Timer, Mail, Globe, Link as LinkIcon, Lock, UserX, Ban,
  Flame, Zap, Check, Users, ExternalLink, BadgeCheck, MapPin,
} from "lucide-react";
import { MONO_FONT } from "@/lib/tournaments/playerView";

/* ── hues (match TpKit K.*) ─────────────────────────── */
export const HUE = {
  lime: "hsl(var(--primary))",
  amber: "hsl(var(--gold))",
  green: "hsl(var(--win))",
  red: "hsl(var(--destructive))",
  sky: "hsl(var(--silver))",
  lav: "hsl(268 100% 86%)",
  outline: "hsl(206 18% 42%)",
};
export const tint = (c: string, pct = 20) => `color-mix(in oklab, ${c} ${pct}%, transparent)`;

export type ChipKind =
  | "registered" | "comp" | "waitlist" | "offer" | "invited" | "public" | "unlisted" | "private"
  | "withdrawn" | "cancelled" | "left" | "xp" | "paid" | "confirmed" | "full" | "external" | "xclub";

const CHIP: Record<ChipKind, { l: string; c?: string; I: typeof Zap; o?: boolean }> = {
  registered: { l: "Registered", c: HUE.lime, I: CircleCheck },
  comp: { l: "Comp", c: HUE.lav, I: Gift },
  waitlist: { l: "Waitlist", c: HUE.amber, I: Hourglass },
  offer: { l: "Place offered", c: HUE.amber, I: Timer },
  invited: { l: "Invited", I: Mail, o: true },
  public: { l: "Public", I: Globe, o: true },
  unlisted: { l: "Unlisted", I: LinkIcon, o: true },
  private: { l: "Private", I: Lock, o: true },
  withdrawn: { l: "Withdrawn", I: UserX, o: true },
  cancelled: { l: "Cancelled", c: HUE.red, I: Ban },
  left: { l: "left", c: HUE.amber, I: Flame },
  xp: { l: "+100 XP", c: HUE.amber, I: Zap },
  paid: { l: "Paid", c: HUE.green, I: Check },
  confirmed: { l: "Confirmed", c: HUE.green, I: Check },
  full: { l: "Full", I: Users, o: true },
  external: { l: "via Playtomic", I: ExternalLink, o: true },
  xclub: { l: "XPLAY Club", c: HUE.lime, I: BadgeCheck },
};

export function Chip({ k, children, sm, className }: { k: ChipKind; children?: ReactNode; sm?: boolean; className?: string }) {
  const t = CHIP[k];
  const Icon = t.I;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-[0.06em] whitespace-nowrap text-foreground ${sm ? "px-[7px] py-[2px] text-[10px]" : "px-[9px] py-[4px] text-[11px]"} ${className || ""}`}
      style={{
        background: t.o ? "transparent" : tint(t.c as string, 22),
        border: `1px solid ${t.o ? HUE.outline : "transparent"}`,
        lineHeight: 1.4,
      }}
    >
      <Icon style={{ width: sm ? 11 : 12, height: sm ? 11 : 12, color: t.o ? "hsl(var(--foreground))" : t.c }} />
      {children ?? t.l}
    </span>
  );
}

export function FormatChip({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-[3px] text-[11px] font-bold text-foreground whitespace-nowrap"
      style={{ background: tint(HUE.sky, 16) }}
    >
      {children}
    </span>
  );
}

export function Mono({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={`font-semibold tabular-nums ${className || ""}`} style={{ fontFamily: MONO_FONT, ...style }}>
      {children}
    </span>
  );
}

export function DateBlock({ dow, day, mon, tone = "sky" }: { dow: string; day: string; mon: string; tone?: "lime" | "amber" | "sky" }) {
  const c = tone === "lime" ? HUE.lime : tone === "amber" ? HUE.amber : HUE.sky;
  return (
    <div
      className="w-[60px] shrink-0 rounded-[14px] py-2 flex flex-col items-center text-foreground"
      style={{ background: tint(c, 16), border: `1px solid ${tint(c, 45)}` }}
    >
      <Mono className="text-[11px] font-bold">{dow}</Mono>
      <Mono className="text-[28px] font-bold leading-[1.05]">{day}</Mono>
      <Mono className="text-[11px] font-bold">{mon}</Mono>
    </div>
  );
}

export function SectionHead({ title, n, right }: { title: string; n?: number | null; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <div className="flex items-center gap-2">
        <h2 className="font-display font-extrabold text-[18px] tracking-[-0.01em] text-foreground">{title}</h2>
        {n != null && n > 0 && <Mono className="text-[13px] font-bold" style={{ color: HUE.sky }}>{n}</Mono>}
      </div>
      {right}
    </div>
  );
}

export function EmptyLine({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
      <span className="mt-0.5 shrink-0" style={{ color: HUE.sky }}>{icon}</span>
      <div>
        <p className="text-[14px] font-extrabold text-foreground">{title}</p>
        <p className="text-[13px] font-medium text-foreground/90 mt-0.5">{body}</p>
      </div>
    </div>
  );
}

export function VenueLine({ venue, provider, dist }: { venue: string; provider?: { kind: "xclub" | "external"; label: string } | null; dist?: string | null }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      <MapPin className="w-[13px] h-[13px] shrink-0" style={{ color: HUE.sky }} />
      <span className="text-[13px] font-semibold text-foreground truncate">{venue}</span>
      {dist && <Mono className="text-[12px]">{dist}</Mono>}
      {provider && <Chip k={provider.kind} sm>{provider.label}</Chip>}
    </div>
  );
}

/** 16 cells: taken = lime, free = dashed amber. Caps at 32 cells for very large draws. */
export function SeatsBar({ taken, total }: { taken: number; total: number }) {
  if (total > 32) {
    const pct = total > 0 ? Math.min(100, (taken / total) * 100) : 0;
    return (
      <div className="h-2.5 rounded-[3px] overflow-hidden" style={{ border: `1.5px dashed ${HUE.amber}` }}>
        <div className="h-full" style={{ width: `${pct}%`, background: HUE.lime }} />
      </div>
    );
  }
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: Math.max(total, 0) }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-2.5 rounded-[3px]"
          style={i < taken ? { background: HUE.lime } : { border: `1.5px dashed ${HUE.amber}` }}
        />
      ))}
    </div>
  );
}

export function XpLine({ text = "XPLAY Points for playing" }: { text?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] px-3.5 py-3" style={{ background: tint(HUE.amber, 14), border: `1px solid ${tint(HUE.amber, 45)}` }}>
      <Zap className="w-[18px] h-[18px] shrink-0" style={{ color: HUE.amber }} />
      <p className="text-[14px] font-bold text-foreground">
        <Mono className="font-bold" style={{ color: HUE.amber }}>+100</Mono> {text}
      </p>
    </div>
  );
}
