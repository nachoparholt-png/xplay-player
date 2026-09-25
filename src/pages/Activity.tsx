/**
 * Activity — everything the player has on (Home redesign, 25 Sep 2026).
 *
 * Upcoming / Past · a 14-day strip (dot = something on that day, "Pick a date"
 * for anything further) · type chips (All · Matches · Tournaments · Lessons) ·
 * the list grouped by day. One card = one thing to do; tap → its page.
 * Also here: lessons the player is enrolled in (coaching_enrollments) and slot
 * watches (waiting list, "We'll tell you if it frees up", with a Cancel).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, CircleDot, Trophy, GraduationCap, CalendarDays, Bell } from "lucide-react";
import { format, addDays, startOfDay, isSameDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { TOURNAMENTS_ENABLED } from "@/lib/featureFlags";

type Kind = "match" | "tournament" | "lesson" | "watch";
type Tone = "amber" | "green" | "lime" | "muted";
type Item = {
  kind: Kind;
  id: string;
  at: Date;
  dateKey: string; // yyyy-MM-dd
  time: string;
  durationMins: number | null;
  club: string;
  /** Lessons: the session title (shown above the club). */
  title?: string;
  /** Lessons and watches: where a tap goes. */
  clubId?: string;
  status: { text: string; tone: Tone };
};

type Segment = "upcoming" | "past";
type TypeFilter = "all" | Kind;

const ACTIVE = ["open", "almost_full", "full", "awaiting_score", "score_submitted", "pending_review", "review_requested"];
const DONE = ["completed", "confirmed", "draw", "closed_as_draw", "auto_closed", "cancelled"];
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min`);
const toneClass: Record<Tone, string> = { amber: "text-secondary", green: "text-win", lime: "text-primary", muted: "text-muted-foreground" };

const dayHeader = (key: string) => {
  const d = new Date(key + "T00:00:00");
  const today = startOfDay(new Date());
  if (isSameDay(d, today)) return `Today · ${format(d, "EEE d")}`;
  if (isSameDay(d, addDays(today, 1))) return `Tomorrow · ${format(d, "EEE d")}`;
  return format(d, "EEE d MMM");
};

const Activity = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [segment, setSegment] = useState<Segment>("upcoming");
  const [type, setType] = useState<TypeFilter>("all");
  const [day, setDay] = useState<string | null>(null); // yyyy-MM-dd, null = All
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const dateInput = useRef<HTMLInputElement>(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const strip = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(startOfDay(new Date()), i)), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const out: Item[] = [];
      const [joinsRes, orgRes] = await Promise.all([
        supabase.from("match_players").select("match_id").eq("user_id", user.id).in("status", ["confirmed", "waitlist"]),
        supabase.from("matches").select("id").eq("organizer_id", user.id),
      ]);
      const ids = [...new Set([...(joinsRes.data || []).map((j) => j.match_id), ...(orgRes.data || []).map((m) => m.id)])];
      if (ids.length) {
        let q = supabase.from("matches").select("*").in("id", ids);
        q = segment === "upcoming"
          ? q.in("status", ACTIVE as any).gte("match_date", today).order("match_date", { ascending: true }).order("match_time", { ascending: true })
          : q.or(`match_date.lt.${today},status.in.(${DONE.join(",")})`).order("match_date", { ascending: false }).order("match_time", { ascending: false });
        const { data: rows } = await q.limit(120);
        const ms = (rows || []) as any[];
        const counts = new Map<string, number>();
        if (ms.length) {
          const { data: pl } = await supabase.from("match_players").select("match_id").in("match_id", ms.map((m) => m.id)).eq("status", "confirmed");
          (pl || []).forEach((p) => counts.set(p.match_id, (counts.get(p.match_id) ?? 0) + 1));
        }
        for (const m of ms) {
          const spots = m.max_players - (counts.get(m.id) ?? 0);
          const mine = m.organizer_id === user.id;
          let status: Item["status"];
          if (segment === "past") status = m.status === "cancelled" ? { text: "Cancelled", tone: "muted" } : ACTIVE.includes(m.status) ? { text: "Add the score", tone: "lime" } : { text: "Played", tone: "muted" };
          else if (["awaiting_score", "pending_review", "review_requested", "score_submitted"].includes(m.status)) status = { text: "Add the score", tone: "lime" };
          else if (mine && m.court_booking_status === "not_booked") status = { text: "Book the court", tone: "amber" };
          else if (spots > 0) status = { text: `${spots} spot${spots === 1 ? "" : "s"} left`, tone: "amber" };
          else status = { text: "Court reserved", tone: "green" };
          out.push({ kind: "match", id: m.id, at: new Date(`${m.match_date}T${m.match_time}`), dateKey: m.match_date, time: m.match_time.slice(0, 5), durationMins: m.duration_mins ?? null, club: m.club, status });
        }
      }
      if (TOURNAMENTS_ENABLED) {
        const sb = supabase as any;
        const { data: tp } = await sb.from("tournament_players").select("tournament_id").eq("user_id", user.id).eq("status", "confirmed");
        const tids = ((tp || []) as { tournament_id: string }[]).map((t) => t.tournament_id);
        if (tids.length) {
          let q = sb.from("tournaments").select("*").in("id", tids);
          q = segment === "upcoming"
            ? q.gte("scheduled_date", today).neq("status", "cancelled").order("scheduled_date", { ascending: true })
            : q.or(`scheduled_date.lt.${today},status.eq.completed`).order("scheduled_date", { ascending: false });
          const { data: ts } = await q.limit(60);
          for (const t of (ts || []) as any[]) {
            if (!t.scheduled_date) continue;
            const status: Item["status"] = segment === "past" ? { text: t.status === "completed" ? "Played" : "Cancelled", tone: "muted" }
              : (t.ticket_price_cents ?? 0) > 0 ? { text: "Ticket paid", tone: "green" } : { text: "Registered", tone: "green" };
            out.push({ kind: "tournament", id: t.id, at: new Date(`${t.scheduled_date}T${t.scheduled_time ?? "00:00"}`), dateKey: t.scheduled_date,
              time: (t.scheduled_time as string | null)?.slice(0, 5) ?? "—", durationMins: t.total_time_mins ?? null, club: t.venue_name ?? t.club ?? t.name, status });
          }
        }
      }
      // Lessons I'm enrolled in (coaching_enrollments → coaching_sessions).
      {
        const sb = supabase as any;
        const { data: en } = await sb.from("coaching_enrollments").select("session_id").eq("user_id", user.id).eq("status", "confirmed");
        const sids = [...new Set(((en || []) as { session_id: string }[]).map((e) => e.session_id))];
        if (sids.length) {
          const nowIso = new Date().toISOString();
          let q = sb.from("coaching_sessions").select("id, club_id, title, session_date, start_time, end_time, starts_at, ends_at, status, clubs(club_name), coach:profiles!coaching_sessions_coach_id_fkey(display_name, full_name)").in("id", sids);
          q = segment === "upcoming" ? q.gte("session_date", today).neq("status", "cancelled").order("session_date").order("start_time")
            : q.lt("session_date", today).order("session_date", { ascending: false }).order("start_time", { ascending: false });
          const { data: ss } = await q.limit(60);
          for (const c of (ss || []) as any[]) {
            const at = c.starts_at ? new Date(c.starts_at) : new Date(`${c.session_date}T${c.start_time}`);
            const end = c.ends_at ? new Date(c.ends_at) : new Date(`${c.session_date}T${c.end_time}`);
            if (segment === "upcoming" && end.getTime() < Date.parse(nowIso) - 60 * 60 * 1000) continue;
            const coach = c.coach?.display_name || c.coach?.full_name || null;
            const status: Item["status"] = segment === "past" ? { text: c.status === "cancelled" ? "Cancelled" : "Done", tone: "muted" }
              : c.status === "cancelled" ? { text: "Cancelled", tone: "muted" } : coach ? { text: `With ${coach}`, tone: "green" } : { text: "Booked", tone: "green" };
            out.push({ kind: "lesson", id: c.id, at, dateKey: format(at, "yyyy-MM-dd"), time: format(at, "HH:mm"),
              durationMins: Math.max(0, Math.round((end.getTime() - at.getTime()) / 60000)) || null, club: c.clubs?.club_name ?? "", title: c.title, clubId: c.club_id, status });
          }
        }
      }
      // Slot watches (waiting list) — upcoming only.
      if (segment === "upcoming") {
        const { data: ws } = await (supabase as any).from("slot_watches").select("id, club_id, slot_date, start_time, duration_mins, status, clubs(club_name)")
          .eq("user_id", user.id).eq("status", "active").gte("slot_date", today).order("slot_date").order("start_time").limit(60);
        for (const w of (ws || []) as any[]) {
          const at = new Date(`${w.slot_date}T${w.start_time}`);
          if (at.getTime() < Date.now()) continue;
          out.push({ kind: "watch", id: w.id, at, dateKey: w.slot_date, time: String(w.start_time).slice(0, 5), durationMins: w.duration_mins ?? null,
            club: w.clubs?.club_name ?? "", clubId: w.club_id, status: { text: "We'll tell you if it frees up", tone: "amber" } });
        }
      }
      out.sort((a, b) => segment === "upcoming" ? a.at.getTime() - b.at.getTime() : b.at.getTime() - a.at.getTime());
      if (!cancelled) { setItems(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user, segment, today]);

  const cancelWatch = async (id: string) => {
    setItems((prev) => prev.filter((i) => !(i.kind === "watch" && i.id === id)));
    await (supabase as any).from("slot_watches").delete().eq("id", id);
  };

  const busyDays = useMemo(() => new Set(items.map((i) => i.dateKey)), [items]);
  const visible = useMemo(() => items.filter((i) => (type === "all" || i.kind === type) && (!day || i.dateKey === day)), [items, type, day]);
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    visible.forEach((i) => m.set(i.dateKey, [...(m.get(i.dateKey) ?? []), i]));
    return [...m.entries()];
  }, [visible]);

  const types: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "All" }, { key: "match", label: "Matches" },
    ...(TOURNAMENTS_ENABLED ? [{ key: "tournament" as const, label: "Tournaments" }] : []),
    { key: "lesson", label: "Lessons" },
  ];

  return (
    <div className="px-4 pt-4 pb-32 space-y-4">
      {/* Title + segment */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[26px] font-black italic uppercase leading-none">Activity</h1>
        <div className="flex rounded-full bg-muted p-0.5">
          {(["upcoming", "past"] as Segment[]).map((s) => (
            <button key={s} onClick={() => { setSegment(s); setDay(null); }}
              className={cn("px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-colors", segment === s ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Day strip */}
      {segment === "upcoming" && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide items-stretch">
          <DayChip active={day === null} onClick={() => setDay(null)}><span className="text-xs font-black uppercase">All</span></DayChip>
          {strip.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            return (
              <DayChip key={key} active={day === key} onClick={() => setDay(key)}>
                <span className="text-[10px] font-bold uppercase text-muted-foreground">{format(d, "EEE")}</span>
                <span className="font-mono text-base font-bold leading-tight">{format(d, "d")}</span>
                <span className={cn("w-1 h-1 rounded-full mt-0.5", busyDays.has(key) ? "bg-primary" : "bg-transparent")} />
              </DayChip>
            );
          })}
          <button onClick={() => { const el = dateInput.current; if (!el) return; if ("showPicker" in el) { try { (el as any).showPicker(); return; } catch { /* fall through */ } } el.click(); }}
            className="flex-shrink-0 self-center text-xs font-bold text-primary whitespace-nowrap px-1">
            {day && !strip.some((d) => format(d, "yyyy-MM-dd") === day) ? format(new Date(day + "T00:00:00"), "d MMM") : "Pick a date"}
          </button>
          <input ref={dateInput} type="date" className="sr-only" min={today} value={day ?? ""} onChange={(e) => setDay(e.target.value || null)} />
        </div>
      )}

      {/* Type chips */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 scrollbar-hide">
        {types.map((t) => (
          <button key={t.key} onClick={() => setType(t.key)}
            className={cn("flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold border transition-colors", type === t.key ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2 pt-1">{[1, 2, 3].map((i) => <div key={i} className="h-[76px] rounded-2xl bg-muted animate-pulse" />)}</div>
      ) : groups.length === 0 ? (
        <div className="py-14 flex flex-col items-center text-center gap-3">
          <CalendarDays className="w-10 h-10 text-muted-foreground/60" />
          <div className="font-display font-black italic uppercase text-lg">No activity yet</div>
          <button onClick={() => navigate("/courts")} className="rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-xs font-black uppercase tracking-wider active:scale-95">Find a court</button>
        </div>
      ) : (
        <div className="space-y-5 pt-1">
          {groups.map(([key, list]) => (
            <div key={key} className="space-y-2">
              <div className="text-[11px] font-black tracking-[0.14em] text-muted-foreground uppercase">{dayHeader(key)}</div>
              {list.map((it) => {
                const Icon = it.kind === "tournament" ? Trophy : it.kind === "lesson" ? GraduationCap : it.kind === "watch" ? Bell : CircleDot;
                const isWatch = it.kind === "watch";
                const Card: any = isWatch ? "div" : "button";
                const go = () => navigate(it.kind === "tournament" ? `/tournaments/${it.id}` : it.kind === "lesson" ? `/clubs/${it.clubId}` : `/matches/${it.id}`);
                return (
                  <Card key={`${it.kind}-${it.id}`} onClick={isWatch ? undefined : go}
                    className={cn("w-full rounded-2xl bg-card border border-border/60 px-3.5 py-3 flex items-center gap-3 text-left transition-transform", !isWatch && "active:scale-[0.99]")}>
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                      it.kind === "tournament" ? "bg-accent/25 text-accent-foreground" : it.kind === "lesson" || isWatch ? "bg-secondary/20 text-secondary" : "bg-primary/15 text-primary")}>
                      <Icon className="w-[18px] h-[18px]" />
                    </div>
                    <div className="flex-shrink-0 w-[58px]">
                      <div className="font-mono text-[22px] font-bold leading-none">{it.time}</div>
                      {it.durationMins ? <div className="font-mono text-[11px] text-muted-foreground mt-1">{fmtDur(it.durationMins)}</div> : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{it.title ?? it.club}</div>
                      {it.title && it.club ? <div className="text-xs text-muted-foreground truncate">{it.club}</div> : null}
                      <div className={cn("text-xs font-semibold mt-0.5", toneClass[it.status.tone])}>{it.status.text}</div>
                    </div>
                    {isWatch ? (
                      <button type="button" onClick={() => cancelWatch(it.id)} className="flex-shrink-0 text-xs font-bold text-muted-foreground px-2 py-1 rounded-full border border-border">Cancel</button>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DayChip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick}
    className={cn("flex-shrink-0 min-w-[46px] px-2 py-1.5 rounded-xl border flex flex-col items-center justify-center transition-colors",
      active ? "bg-primary text-primary-foreground border-primary [&_span]:text-primary-foreground" : "bg-card border-border/60")}>
    {children}
  </button>
);

export default Activity;
