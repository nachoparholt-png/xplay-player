// collect-playtomic-availability — v7 (12 Sep 2026)
// Playtomic retired api.playtomic.io (403 from 26 Jul, NXDOMAIN by Sep). Live host is
// api.app.playtomic.io and every read now needs a customer bearer token:
//   POST /v3/auth/login {email,password,requested_user_roles:["ROLE_CUSTOMER"]}
//   POST /v3/auth/token {refresh_token}
// Credentials live in public.internal_secrets (playtomic_email / playtomic_password);
// the token is cached in internal_secrets.playtomic_token_cache (JSON).
// collect now returns HTTP 502 when clubs > 0 and 0 slots were written, so the
// outage is visible to edge-log / QA monitoring instead of a silent 200.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PT_BASE = "https://api.app.playtomic.io";
const PT_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-Requested-With": "com.playtomic.app 6.13.0",
  "User-Agent": "iOS 18.3.1",
};
const norm = (s: string) => s.toLowerCase().replace(/padel|club|the|london/g, "").replace(/[^a-z0-9]/g, "");

type TokenCache = { access_token: string; refresh_token?: string; access_token_expiration?: string; refresh_token_expiration?: string };

async function readSecret(admin: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await admin.from("internal_secrets").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function writeSecret(admin: SupabaseClient, key: string, value: string) {
  await admin.from("internal_secrets").upsert({ key, value }, { onConflict: "key" });
}

async function ptLogin(admin: SupabaseClient): Promise<TokenCache> {
  const email = await readSecret(admin, "playtomic_email");
  const password = await readSecret(admin, "playtomic_password");
  if (!email || !password) throw new Error("Playtomic credentials missing: set internal_secrets.playtomic_email / playtomic_password");
  const resp = await fetch(`${PT_BASE}/v3/auth/login`, {
    method: "POST", headers: PT_HEADERS, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ email, password, requested_user_roles: ["ROLE_CUSTOMER"] }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Playtomic login ${resp.status}: ${text.slice(0, 200)}`);
  const tok = JSON.parse(text) as TokenCache;
  if (!tok.access_token) throw new Error(`Playtomic login: no access_token in response ${text.slice(0, 200)}`);
  await writeSecret(admin, "playtomic_token_cache", JSON.stringify(tok));
  return tok;
}

async function ptRefresh(admin: SupabaseClient, cached: TokenCache): Promise<TokenCache | null> {
  if (!cached.refresh_token) return null;
  try {
    const resp = await fetch(`${PT_BASE}/v3/auth/token`, {
      method: "POST", headers: PT_HEADERS, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ refresh_token: cached.refresh_token }),
    });
    if (!resp.ok) return null;
    const tok = (await resp.json()) as TokenCache;
    if (!tok.access_token) return null;
    await writeSecret(admin, "playtomic_token_cache", JSON.stringify(tok));
    return tok;
  } catch { return null; }
}

/** Returns a usable access token: cached if not near expiry, else refresh, else login. */
async function ptToken(admin: SupabaseClient, force = false): Promise<string> {
  const raw = force ? null : await readSecret(admin, "playtomic_token_cache");
  if (raw) {
    try {
      const cached = JSON.parse(raw) as TokenCache;
      const exp = cached.access_token_expiration ? Date.parse(cached.access_token_expiration) : 0;
      if (exp - Date.now() > 5 * 60 * 1000) return cached.access_token;
      const refreshed = await ptRefresh(admin, cached);
      if (refreshed) return refreshed.access_token;
    } catch { /* fall through to login */ }
  }
  return (await ptLogin(admin)).access_token;
}

/** Authenticated GET with one automatic re-login on 401. */
async function ptFetch(admin: SupabaseClient, url: string): Promise<unknown> {
  let token = await ptToken(admin);
  let resp = await fetch(url, { headers: { ...PT_HEADERS, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (resp.status === 401) {
    token = await ptToken(admin, true);
    resp = await fetch(url, { headers: { ...PT_HEADERS, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  }
  if (!resp.ok) throw new Error(`Playtomic ${resp.status} for ${url}: ${(await resp.text()).slice(0, 160)}`);
  return resp.json();
}

function dayWindows(days: number): { min: string; max: string }[] {
  const out: { min: string; max: string }[] = [];
  for (let i = 0; i < days; i++) {
    const ymd = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    out.push({ min: `${ymd}T00:00:00`, max: `${ymd}T23:59:59` });
  }
  return out;
}

type Avail = { resource_id: string; start_date: string; slots: { start_time: string; duration: number; price: string }[] }[];

/** Availability for one tenant/day. Tries local_start_* (what v5 used) then start_* (mobile app naming). */
async function ptAvailability(admin: SupabaseClient, tenantId: string, w: { min: string; max: string }): Promise<Avail> {
  const q = `sport_id=PADEL&tenant_id=${tenantId}`;
  try {
    return (await ptFetch(admin, `${PT_BASE}/v1/availability?${q}&local_start_min=${w.min}&local_start_max=${w.max}`)) as Avail;
  } catch (e) {
    if (!/Playtomic 400/.test(String(e))) throw e;
    return (await ptFetch(admin, `${PT_BASE}/v1/availability?${q}&start_min=${w.min}&start_max=${w.max}`)) as Avail;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "");
  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? "collect";

    let isAdmin = false;
    const cronKey = req.headers.get("x-cron-key");
    if (cronKey) {
      const secret = await readSecret(supabaseAdmin, "cron_collector_key");
      if (!secret || secret !== cronKey) throw new Error("Not authenticated");
      isAdmin = true;
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authError || !user) throw new Error("Not authenticated");
      const { data: profile } = await supabaseAdmin.from("profiles").select("app_role").eq("user_id", user.id).single();
      isAdmin = profile?.app_role === "admin";
      if (!body.club_id && !isAdmin) throw new Error("Admin only");
    }

    const { data: killSwitch } = await supabaseAdmin.from("app_settings").select("value").eq("key", "availability_playtomic_enabled").maybeSingle();
    if (killSwitch && killSwitch.value === "false") return json({ skipped: true, reason: "kill switch off" });

    // Diagnosis: verify login + one availability call for a tenant, never persists slots.
    if (mode === "probe_avail") {
      const tid = body.tenant_id;
      if (!tid) throw new Error("tenant_id required");
      const out: Record<string, unknown> = {};
      try { const tok = await ptToken(supabaseAdmin, body.force_login === true); out.login = "ok"; out.token_prefix = tok.slice(0, 12); }
      catch (e) { out.login = `FAIL: ${e instanceof Error ? e.message : String(e)}`; return json({ mode, ...out }); }
      const w = dayWindows(2)[1];
      try {
        const avail = await ptAvailability(supabaseAdmin, tid, w);
        out.availability = { courts: avail?.length ?? 0, slots: (avail ?? []).reduce((n, c) => n + (c.slots?.length ?? 0), 0), sample: JSON.stringify(avail ?? []).slice(0, 300) };
      } catch (e) { out.availability = `FAIL: ${e instanceof Error ? e.message : String(e)}`; }
      return json({ mode, window: w, ...out });
    }

    if (mode === "map") {
      const { data: clubs = [] } = await supabaseAdmin.from("clubs").select("id, club_name, latitude, longitude")
        .eq("source", "directory").is("external_tenant_id", null).not("latitude", "is", null).limit(30);
      let mapped = 0; const misses: string[] = [];
      for (const club of clubs ?? []) {
        try {
          const raw = await ptFetch(supabaseAdmin, `${PT_BASE}/v1/tenants?coordinate=${club.latitude}%2C${club.longitude}&sport_id=PADEL&radius=2500&size=10`);
          const tenants = (Array.isArray(raw) ? raw : (raw as Record<string, unknown>)?.tenants ?? []) as { tenant_id: string; tenant_name: string }[];
          const hit = tenants?.find((t) => { const a = norm(t.tenant_name ?? ""); const b = norm(club.club_name); return a && b && (a.includes(b) || b.includes(a)); });
          if (hit) {
            await supabaseAdmin.from("clubs").update({ external_provider: "playtomic", external_tenant_id: hit.tenant_id }).eq("id", club.id);
            mapped++;
          } else {
            const names = (tenants ?? []).map((t) => t.tenant_name).filter(Boolean).slice(0, 6);
            misses.push(`${club.club_name} [no name match · nearby: ${names.length ? names.join(" | ") : "NONE"}]`);
          }
          await new Promise((r) => setTimeout(r, 800));
        } catch (err) { misses.push(`${club.club_name} [ERROR: ${err instanceof Error ? err.message : String(err)}]`); }
      }
      return json({ mode, candidates: clubs?.length ?? 0, mapped, misses });
    }

    if (mode === "collect") {
      const days = Math.min(body.days ?? 2, 7);
      let query = supabaseAdmin.from("clubs").select("id, club_name, external_tenant_id")
        .eq("external_provider", "playtomic").not("external_tenant_id", "is", null);
      if (body.club_id) query = query.eq("id", body.club_id);
      const { data: clubs = [] } = await query.limit(body.club_id ? 1 : 40);

      // Fail fast (and loudly) if we cannot authenticate at all — do not wipe existing rows.
      try { await ptToken(supabaseAdmin); }
      catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("collect-playtomic-availability auth failure:", message);
        return json({ mode, clubs: clubs?.length ?? 0, slots: 0, errors: [message] }, 502);
      }

      let slotsUpserted = 0; let clubsOk = 0; const errors: string[] = [];
      for (const club of clubs ?? []) {
        try {
          const rows: Record<string, unknown>[] = [];
          for (const w of dayWindows(days)) {
            const avail = await ptAvailability(supabaseAdmin, club.external_tenant_id, w);
            for (const courtDay of avail ?? []) {
              for (const s of courtDay.slots ?? []) {
                const priceMatch = /([\d.]+)\s*([A-Z]{3})?/.exec(s.price ?? "");
                rows.push({
                  club_id: club.id, provider: "playtomic", court_label: courtDay.resource_id,
                  starts_at: `${courtDay.start_date}T${s.start_time}Z`, duration_mins: s.duration,
                  price_cents: priceMatch ? Math.round(parseFloat(priceMatch[1]) * 100) : null,
                  currency: priceMatch?.[2] ?? "GBP",
                  booking_url: `https://playtomic.com/tenant/${club.external_tenant_id}`,
                  fetched_at: new Date().toISOString(),
                });
              }
            }
            await new Promise((r) => setTimeout(r, 400));
          }
          // Only replace this club's rows once the fetch succeeded — a failed refetch keeps the previous snapshot.
          await supabaseAdmin.from("external_court_slots").delete().eq("club_id", club.id).eq("provider", "playtomic");
          if (rows.length > 0) {
            const { error } = await supabaseAdmin.from("external_court_slots").upsert(rows, { onConflict: "club_id,provider,court_label,starts_at,duration_mins", ignoreDuplicates: true });
            if (error) throw new Error(error.message);
          }
          slotsUpserted += rows.length; clubsOk++;
          if (!body.club_id) await new Promise((r) => setTimeout(r, 600));
        } catch (err) { errors.push(`${club.club_name}: ${err instanceof Error ? err.message : String(err)}`); }
      }
      const total = clubs?.length ?? 0;
      const result = { mode, clubs: total, clubs_ok: clubsOk, slots: slotsUpserted, errors };
      // Loud failure: every mapped club errored, or nothing was written at all.
      if (total > 0 && (clubsOk === 0 || (slotsUpserted === 0 && errors.length > 0))) {
        console.error("collect-playtomic-availability wrote 0 slots:", JSON.stringify(result).slice(0, 500));
        return json(result, 502);
      }
      if (total > 0 && slotsUpserted === 0) console.warn("collect-playtomic-availability: fetch ok but 0 slots for all clubs (fully booked?)");
      return json(result);
    }

    throw new Error(`Unknown mode: ${mode}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("collect-playtomic-availability error:", message);
    return json({ error: message }, 400);
  }
});
