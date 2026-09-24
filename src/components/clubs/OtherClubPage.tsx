/**
 * OtherClubPage — light page for a club that is NOT hosted by XPLAY (clubs.source = 'directory').
 * CL5 (with availability) / CL6 (info only).
 *
 * Says plainly, once, that XPLAY can't secure the court; shows live availability from the club's
 * own booking system; deep-links the booking; keeps the XPLAY part (organise a match, earn points)
 * in lime. No tabs — memberships / shop / events only exist for XPLAY Clubs.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Info, MapPin, RefreshCw, Users, Zap, Building2, Check } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { AVAILABILITY_ENABLED } from "@/lib/featureFlags";
import { isMembersOnly, providerLabel } from "./clubTier";
import ClaimClubSheet from "./ClaimClubSheet";

interface Slot {
  id: string;
  provider: string | null;
  starts_at: string;
  price_cents: number | null;
  booking_url: string | null;
  fetched_at: string;
}

interface MatchRow {
  id: string;
  match_date: string;
  match_time: string;
  format: string | null;
  level_min: number | null;
  level_max: number | null;
  max_players: number | null;
  court_booking_status: string | null;
  _players: number;
}

const STALE_MS = 30 * 60 * 1000;

const openExternal = async (url: string) => {
  try { await Browser.open({ url }); } catch { window.open(url, "_blank", "noopener"); }
};

const OtherClubPage = ({ club, onBack }: { club: any; onBack: () => void }) => {
  const navigate = useNavigate();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [claimOpen, setClaimOpen] = useState(false);

  const currency = club.currency_symbol ?? "£";
  // David Lloyd & co: members-only, no availability feed — never call the collectors.
  const membersOnly = isMembersOnly(club.external_provider);

  const fetchSlots = useCallback(async () => {
    const { data } = await supabase
      .from("external_court_slots")
      .select("id, provider, starts_at, price_cents, booking_url, fetched_at")
      .eq("club_id", club.id)
      .gte("starts_at", new Date().toISOString())
      .lte("starts_at", new Date(Date.now() + 48 * 3600 * 1000).toISOString())
      .order("starts_at")
      .order("price_cents")
      .limit(200);
    return (data as Slot[]) || [];
  }, [club.id]);

  // Availability — cache-aside, same contract as ExternalAvailability (fails soft)
  useEffect(() => {
    if (!AVAILABILITY_ENABLED || membersOnly) { setLoadingSlots(false); return; }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      let data = await fetchSlots();
      const stale = data.length === 0 || Date.now() - new Date(data[0].fetched_at).getTime() > STALE_MS;
      if (!cancelled) { setSlots(data); setLoadingSlots(false); }
      if (stale) {
        if (!cancelled) setRefreshing(true);
        try {
          await Promise.allSettled([
            supabase.functions.invoke("collect-playtomic-availability", { body: { mode: "collect", club_id: club.id, days: 2 } }),
            supabase.functions.invoke("collect-padelmates-availability", { body: { mode: "collect", club_id: club.id, days: 2 } }),
          ]);
          data = await fetchSlots();
          if (!cancelled) setSlots(data);
        } catch { /* keep what we had */ }
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [club.id, fetchSlots, membersOnly]);

  // XPLAY matches at this club (matches.club is free text = club name)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("matches")
        .select("id, match_date, match_time, format, level_min, level_max, max_players, court_booking_status")
        .eq("club", club.club_name)
        .in("status", ["open", "almost_full"])
        .gte("match_date", today)
        .order("match_date")
        .order("match_time")
        .limit(3);
      const rows = (data as any[]) || [];
      if (rows.length === 0) { if (!cancelled) setMatches([]); return; }
      const { data: players } = await supabase.from("match_players").select("match_id").in("match_id", rows.map((r) => r.id));
      const counts: Record<string, number> = {};
      (players || []).forEach((p: any) => { counts[p.match_id] = (counts[p.match_id] || 0) + 1; });
      if (!cancelled) setMatches(rows.map((r) => ({ ...r, _players: counts[r.id] || 0 })));
    })();
    return () => { cancelled = true; };
  }, [club.club_name]);

  // Group slots by day, one chip per start time (cheapest court)
  const byDay = new Map<string, Map<string, Slot>>();
  for (const s of slots) {
    const d = new Date(s.starts_at);
    const day = format(d, "yyyy-MM-dd");
    const time = format(d, "HH:mm");
    if (!byDay.has(day)) byDay.set(day, new Map());
    const m = byDay.get(day)!;
    if (!m.has(time)) m.set(time, s);
  }
  const hasSlots = byDay.size > 0;

  const via = providerLabel(slots[0]?.provider ?? club.external_provider);
  const bookingUrl = slots.find((s) => s.booking_url)?.booking_url ?? null;
  const website: string | null = club.website ?? null;
  const address = [club.address_line_1, club.city, club.postcode].filter(Boolean).join(", ") || club.location || "";
  const mapsUrl =
    club.latitude != null && club.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${club.latitude},${club.longitude}${club.google_place_id ? `&query_place_id=${club.google_place_id}` : ""}`
      : null;
  const bookSystem = membersOnly ? "the David Lloyd Clubs app" : via ?? "the club's system";

  const dayLabel = (day: string) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const tomorrow = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");
    if (day === today) return "Today";
    if (day === tomorrow) return "Tomorrow";
    return format(new Date(day + "T00:00:00"), "EEE d MMM");
  };

  const organise = () =>
    navigate("/matches/create", { state: { prefillClubId: club.id, prefillClubName: club.club_name } });

  return (
    <div className="bg-background pb-4">
      {/* Header */}
      <header className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-sm font-bold text-foreground truncate">Club</span>
      </header>

      <div className="px-4 space-y-5">
        {/* Identity */}
        <section className="space-y-2">
          <h1 className="font-display font-bold text-2xl leading-tight text-foreground">{club.club_name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {membersOnly ? (
              <>
                <span className="inline-flex items-center rounded-full border border-outline-variant bg-surface-container-high text-foreground px-2.5 py-1 text-[11px] font-semibold">
                  {via}
                </span>
                <span className="inline-flex items-center rounded-full border border-outline-variant bg-surface-container-high text-foreground px-2.5 py-1 text-[11px] font-semibold">
                  Members only
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-high text-foreground px-2.5 py-1 text-[11px] font-semibold">
                {via ? <ExternalLink className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                {via ? `via ${via}` : "Info only"}
              </span>
            )}
          </div>
          {address && (
            mapsUrl ? (
              <button type="button" onClick={() => openExternal(mapsUrl)} className="flex items-start gap-1.5 text-left text-sm text-foreground/85">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="underline underline-offset-2 decoration-foreground/40">{address}</span>
              </button>
            ) : (
              <p className="flex items-start gap-1.5 text-sm text-foreground/85">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" /> {address}
              </p>
            )
          )}
        </section>

        {/* The one plain notice — a fact, not an error (neutral, never amber) */}
        <section className="rounded-2xl border border-outline-variant bg-surface-container-high p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-foreground flex-shrink-0 mt-0.5" />
          {membersOnly ? (
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-bold">This club is for David Lloyd members.</span> Members book padel courts in the
              David Lloyd Clubs app, up to 9 days ahead. Everyone can organise or join an XPLAY match here and earn points.
            </p>
          ) : (
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-bold">This club isn't on XPLAY yet.</span> You book and pay on {bookSystem}, so we
              can't secure the court for you.
            </p>
          )}
        </section>

        {/* Availability — not rendered for members-only clubs (no feed, nothing to show) */}
        {!membersOnly && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-black italic uppercase text-base text-foreground tracking-tight">Next 48 hours</h2>
            {hasSlots && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground/80">
                <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
                updated {formatDistanceToNowStrict(new Date(slots[0].fetched_at))} ago
              </span>
            )}
          </div>

          {loadingSlots ? (
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 w-[72px] rounded-xl bg-card animate-pulse" />)}
            </div>
          ) : hasSlots ? (
            <>
              {[...byDay.entries()].slice(0, 2).map(([day, times]) => (
                <div key={day} className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/75">{dayLabel(day)}</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                    {[...times.values()].slice(0, 14).map((s) => (
                      <div key={s.id} className="flex-shrink-0 w-[72px] rounded-xl border border-outline-variant bg-card py-2 text-center">
                        <span className="block font-mono text-sm font-bold text-foreground">{format(new Date(s.starts_at), "HH:mm")}</span>
                        {s.price_cents != null && (
                          <span className="block font-mono text-[11px] text-foreground/80">{currency}{Math.round(s.price_cents / 100)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-foreground/75">Indicative prices · confirm at booking</p>
            </>
          ) : (
            <p className="text-sm text-foreground/85">
              {refreshing ? "Checking the club's booking system…" : "Live availability isn't available for this club."}
            </p>
          )}
        </section>
        )}

        {/* Actions: external path keeps primary weight but stays neutral; lime marks the XPLAY action */}
        {membersOnly ? (
        <section className="space-y-2.5">
          <button
            type="button"
            onClick={organise}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground py-3.5 text-xs font-display font-black uppercase tracking-widest active:scale-[0.98] transition-transform"
          >
            <Users className="w-4 h-4" /> Organise a match here
          </button>
          {website && (
            <button
              type="button"
              onClick={() => openExternal(website)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-surface-bright text-foreground py-3 text-sm font-bold active:scale-[0.98] transition-transform"
            >
              Padel at {club.club_name} <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </section>
        ) : (
        <section className="space-y-2.5">
          {(bookingUrl || website) && (
            <button
              type="button"
              onClick={() => openExternal((bookingUrl || website)!)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-surface-bright text-foreground py-3.5 text-sm font-bold active:scale-[0.98] transition-transform"
            >
              {bookingUrl ? `Book on ${bookSystem}` : "Visit club website"} <ExternalLink className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={organise}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-primary text-primary py-3 text-xs font-display font-black uppercase tracking-widest active:scale-[0.98] transition-transform"
          >
            <Users className="w-4 h-4" /> Organise a match here
          </button>
        </section>
        )}

        {/* Matches here */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-black italic uppercase text-base text-foreground tracking-tight">XPLAY matches here</h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-secondary">
              <Zap className="w-3 h-3" /> Earn points for playing
            </span>
          </div>
          <p className="text-xs text-foreground/80">The match lives in XPLAY. The court is booked by the organiser on {bookSystem}.</p>

          {matches.length === 0 ? (
            <p className="text-sm text-foreground/85 rounded-2xl bg-card border border-border/60 p-4">
              No open matches here yet. Be the first to organise one.
            </p>
          ) : (
            matches.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/matches/${m.id}`)}
                className="w-full flex items-center gap-3 rounded-2xl bg-card border border-border/60 p-3.5 text-left"
              >
                <div className="flex-shrink-0 text-center w-12">
                  <p className="font-mono text-sm font-bold text-foreground">{m.match_time?.slice(0, 5)}</p>
                  <p className="text-[10px] font-black uppercase tracking-wider text-foreground/75">
                    {format(new Date(m.match_date + "T00:00:00"), "EEE d")}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate capitalize">
                    {m.format || "Match"}
                    {m.level_min != null && m.level_max != null && (
                      <span className="font-mono font-normal text-foreground/80"> · {Number(m.level_min).toFixed(1)}–{Number(m.level_max).toFixed(1)}</span>
                    )}
                  </p>
                  <p className="font-mono text-[11px] text-foreground/80">{m._players} of {m.max_players ?? 4} in</p>
                </div>
                {m.court_booking_status === "booked" ? (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-win/20 border border-win/50 text-foreground px-2 py-1 text-[9px] font-black uppercase tracking-wider">
                    <Check className="w-3 h-3 text-win" /> Court booked
                  </span>
                ) : (
                  <span className="flex-shrink-0 rounded-full bg-secondary/20 border border-secondary/50 text-foreground px-2 py-1 text-[9px] font-black uppercase tracking-wider">
                    Court not booked yet
                  </span>
                )}
              </button>
            ))
          )}
        </section>

        {/* Claim */}
        <section className="rounded-2xl border border-dashed border-outline-variant p-4 space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/70">For club owners</p>
          <h3 className="font-display font-bold text-base text-foreground">Run this club? Get it on XPLAY</h3>
          <p className="text-sm text-foreground/85">
            Players are already organising matches at {club.club_name}. Booking, memberships and tournaments in one
            place, 0% fee on court bookings.
          </p>
          <button
            type="button"
            onClick={() => setClaimOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-primary text-primary px-4 py-2 text-xs font-bold"
          >
            <Building2 className="w-3.5 h-3.5" /> Claim this club
          </button>
        </section>
      </div>

      <ClaimClubSheet open={claimOpen} onOpenChange={setClaimOpen} clubId={club.id} clubName={club.club_name} />
    </div>
  );
};

export default OtherClubPage;
