/**
 * send-push — generic iOS push sender (APNs), callable from the database.
 *
 * POST { user_id, title, body, data? }  or  POST { items: [{ user_id, title, body, data? }, ...] }
 * Auth: header `x-cron-key` = internal_secrets.cron_collector_key (same key the collector crons use),
 *       or a service-role bearer token.
 *
 * Looks up profiles.push_token for each user and sends one APNs alert. A token Apple reports as
 * BadDeviceToken / Unregistered (400/410) is cleared from the profile so we stop retrying it.
 *
 * Secrets (already set for membership-renewal-reminders): APNS_PRIVATE_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID.
 * Optional: APNS_SANDBOX=1 to use api.sandbox.push.apple.com (Xcode/dev builds; TestFlight and App Store use production).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

type Item = { user_id: string; title: string; body: string; data?: Record<string, unknown> };

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function encodeJson(obj: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

let jwtCache: { token: string; iat: number } | null = null;
async function apnsJwt(teamId: string, keyId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (jwtCache && now - jwtCache.iat < 50 * 60) return jwtCache.token; // Apple accepts a token for up to 60 min
  const pemBody = privateKeyPem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const keyDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyDer.buffer, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = encodeJson({ alg: "ES256", kid: keyId });
  const payload = encodeJson({ iss: teamId, iat: now });
  const input = `${header}.${payload}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
  const token = `${input}.${base64url(new Uint8Array(sig))}`;
  jwtCache = { token, iat: now };
  return token;
}

async function sendApns(token: string, title: string, body: string, data: Record<string, unknown>): Promise<{ ok: boolean; status: number; reason?: string }> {
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID") ?? "com.xplay.app";
  if (!privateKey || !keyId || !teamId) return { ok: false, status: 0, reason: "apns_secrets_missing" };
  const host = Deno.env.get("APNS_SANDBOX") === "1" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  const jwt = await apnsJwt(teamId, keyId, privateKey);
  // APNs custom keys must be strings/JSON at the top level next to `aps`
  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) custom[k] = typeof v === "string" ? v : JSON.stringify(v);
  const res = await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({ aps: { alert: { title, body }, sound: "default", badge: 1 }, ...custom }),
  });
  if (res.ok) return { ok: true, status: res.status };
  let reason = "";
  try { reason = (await res.json())?.reason ?? ""; } catch { /* ignore */ }
  return { ok: false, status: res.status, reason };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  // ── auth: cron key or service role ──
  const cronKey = req.headers.get("x-cron-key");
  const auth = req.headers.get("authorization") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let allowed = serviceRole.length > 0 && auth === `Bearer ${serviceRole}`;
  if (!allowed && cronKey) {
    const { data } = await admin.from("internal_secrets").select("value").eq("key", "cron_collector_key").maybeSingle();
    allowed = !!data?.value && data.value === cronKey;
  }
  if (!allowed) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });

  let payload: any;
  try { payload = await req.json(); } catch { payload = {}; }
  const items: Item[] = Array.isArray(payload?.items) ? payload.items : payload?.user_id ? [payload] : [];
  if (!items.length) return new Response(JSON.stringify({ error: "no items" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });

  const userIds = [...new Set(items.map((i) => i.user_id))];
  const { data: profiles } = await admin.from("profiles").select("user_id, push_token").in("user_id", userIds);
  const tokenByUser = new Map<string, string | null>((profiles ?? []).map((p: any) => [p.user_id, p.push_token ?? null]));

  const results: any[] = [];
  let sent = 0, skipped = 0, failed = 0;
  for (const it of items) {
    const token = tokenByUser.get(it.user_id) ?? null;
    if (!token) { skipped++; results.push({ user_id: it.user_id, status: "no_token" }); continue; }
    const r = await sendApns(token, it.title ?? "XPLAY", it.body ?? "", it.data ?? {});
    if (r.ok) { sent++; results.push({ user_id: it.user_id, status: "sent" }); continue; }
    failed++;
    results.push({ user_id: it.user_id, status: "failed", http: r.status, reason: r.reason });
    if (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered" || r.reason === "DeviceTokenNotForTopic") {
      await admin.from("profiles").update({ push_token: null }).eq("user_id", it.user_id).eq("push_token", token);
    }
    console.error("[send-push] failed", it.user_id, r.status, r.reason);
  }

  return new Response(JSON.stringify({ sent, skipped, failed, results }), { headers: { ...corsHeaders, "content-type": "application/json" } });
});
