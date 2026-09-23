// discover-playtomic-clubs — v1 (21 Sep 2026)
// READ-ONLY discovery: lists Playtomic padel tenants around given points. Writes nothing.
// Auth: x-cron-key (same secret as the collectors). Reuses the token the collector caches
// in internal_secrets.playtomic_token_cache; never logs in itself.
// Body: { points: [[lat,lng],...] (max 12), radius?: metres (max 50000), size?: (max 200) }
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const PT_BASE = "https://api.app.playtomic.io";
const PT_HEADERS = {
  Accept: "application/json",
  "X-Requested-With": "com.playtomic.app 6.13.0",
  "User-Agent": "iOS 18.3.1",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const secret = async (k: string) => (await admin.from("internal_secrets").select("value").eq("key", k).maybeSingle()).data?.value ?? null;
    const key = req.headers.get("x-cron-key");
    if (!key || key !== (await secret("cron_collector_key"))) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const points: [number, number][] = (body.points ?? []).slice(0, 12);
    const radius = Math.min(body.radius ?? 25000, 50000);
    const size = Math.min(body.size ?? 100, 200);
    if (!points.length) return json({ error: "points required" }, 400);

    const raw = await secret("playtomic_token_cache");
    const tok = raw ? JSON.parse(raw) : null;
    if (!tok?.access_token) return json({ error: "no cached token" }, 502);

    const seen = new Map<string, unknown>();
    const perPoint: unknown[] = [];
    let sampleKeys: string[] = [];
    for (const [lat, lng] of points) {
      const url = `${PT_BASE}/v1/tenants?coordinate=${lat}%2C${lng}&sport_id=PADEL&radius=${radius}&size=${size}`;
      const resp = await fetch(url, { headers: { ...PT_HEADERS, Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(15000) });
      if (!resp.ok) { perPoint.push({ lat, lng, status: resp.status, err: (await resp.text()).slice(0, 120) }); continue; }
      const data = await resp.json();
      const tenants = (Array.isArray(data) ? data : data?.tenants ?? []) as Record<string, any>[];
      perPoint.push({ lat, lng, status: 200, n: tenants.length });
      for (const t of tenants) {
        if (!sampleKeys.length) sampleKeys = Object.keys(t);
        const a = t.address ?? {};
        const padelCourts = (t.resources ?? []).filter((r: any) => (r.sport_id ?? "PADEL") === "PADEL").length;
        seen.set(t.tenant_id, {
          id: t.tenant_id, name: t.tenant_name, slug: t.slug ?? t.tenant_uid ?? null,
          street: a.street ?? null, city: a.city ?? null, postcode: a.postal_code ?? null, country: a.country ?? a.country_code ?? null,
          lat: a.coordinate?.lat ?? null, lng: a.coordinate?.lon ?? null, tz: a.timezone ?? null,
          courts: padelCourts, status: t.playtomic_status ?? t.tenant_status ?? null, online: t.booking_type ?? null,
        });
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return json({ perPoint, sampleKeys, count: seen.size, tenants: [...seen.values()] });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
