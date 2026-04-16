/**
 * membership-renewal-reminders
 *
 * Scheduled edge function (run daily via pg_cron).
 * Sends in-app + iOS push notifications to members whose memberships are expiring soon.
 *
 * Reminder windows:
 *   - 7 days before expiry  → "Your membership expires in 7 days"
 *   - 3 days before expiry  → "Your membership expires in 3 days"
 *   - 1 day before expiry   → "Your membership expires tomorrow"
 *   - On expiry day         → "Your membership has expired"
 *
 * Deduplication: each type is only sent once per membership.
 *
 * Required Supabase secrets for push:
 *   APNS_PRIVATE_KEY  — Contents of the .p8 key (full PEM or just base64 body)
 *   APNS_KEY_ID       — 10-char key ID from Apple Developer portal
 *   APNS_TEAM_ID      — 10-char Apple Team ID
 *   APNS_BUNDLE_ID    — e.g. com.xplay.app
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

interface NotificationResult {
  membership_id: string;
  user_id: string;
  club_name: string;
  tier_name: string;
  type: string;
  push_sent: boolean;
}

// ─── APNs JWT helper ──────────────────────────────────────────────────────────

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function encodeJson(obj: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function createApnsJwt(teamId: string, keyId: string, privateKeyPem: string): Promise<string> {
  // Strip PEM headers if present
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const keyDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyDer.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const header = encodeJson({ alg: "ES256", kid: keyId });
  const payload = encodeJson({ iss: teamId, iat: Math.floor(Date.now() / 1000) });
  const signingInput = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

async function sendApnsPush(
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> {
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID") ?? "com.xplay.app";

  if (!privateKey || !keyId || !teamId) {
    console.warn("[APNs] Secrets not configured — skipping push");
    return false;
  }

  try {
    const jwt = await createApnsJwt(teamId, keyId, privateKey);

    const apnsUrl = `https://api.push.apple.com/3/device/${pushToken}`;
    const res = await fetch(apnsUrl, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: {
          alert: { title, body },
          badge: 1,
          sound: "default",
        },
        ...data,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[APNs] Push failed (${res.status}):`, errBody);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[APNs] Push error:", err);
    return false;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const results: NotificationResult[] = [];

    // Fetch all active memberships expiring in the next 8 days
    const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    const { data: memberships, error: memErr } = await supabase
      .from("club_memberships")
      .select(`
        id, user_id, expires_at, club_id, tier_id,
        clubs:club_id (club_name),
        membership_tiers:tier_id (name)
      `)
      .eq("active", true)
      .not("expires_at", "is", null)
      .lte("expires_at", eightDaysFromNow.toISOString())
      .gte("expires_at", now.toISOString());

    if (memErr) throw memErr;

    // Also fetch memberships that expired in the last 24h
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const { data: expiredToday } = await supabase
      .from("club_memberships")
      .select(`
        id, user_id, expires_at, club_id, tier_id,
        clubs:club_id (club_name),
        membership_tiers:tier_id (name)
      `)
      .eq("active", true)
      .not("expires_at", "is", null)
      .lt("expires_at", now.toISOString())
      .gte("expires_at", yesterday.toISOString());

    const allMemberships = [...(memberships || []), ...(expiredToday || [])];

    for (const mem of allMemberships) {
      const expiresAt = new Date(mem.expires_at);
      const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      const clubName = (mem.clubs as any)?.club_name ?? "your club";
      const tierName = (mem.membership_tiers as any)?.name ?? "membership";

      let notificationType: string | null = null;
      let title = "";
      let body = "";

      if (daysUntilExpiry < 0) {
        notificationType = "membership_expired";
        title = "Membership Expired 🔴";
        body = `Your ${tierName} membership at ${clubName} has expired. Renew now to keep your benefits.`;
      } else if (daysUntilExpiry <= 1) {
        notificationType = "membership_expiry_1day";
        title = "Membership Expires Tomorrow ⚠️";
        body = `Your ${tierName} at ${clubName} expires tomorrow. Renew now to avoid losing your benefits.`;
      } else if (daysUntilExpiry <= 3) {
        notificationType = "membership_expiry_3days";
        title = "Membership Expires in 3 Days";
        body = `Your ${tierName} at ${clubName} expires in 3 days. Don't lose your court discounts and booking priority.`;
      } else if (daysUntilExpiry <= 7) {
        notificationType = "membership_expiry_7days";
        title = "Membership Expires in 7 Days";
        body = `Your ${tierName} at ${clubName} expires in a week. Renew early to keep your member benefits.`;
      }

      if (!notificationType) continue;

      // Deduplication
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", mem.user_id)
        .eq("type", notificationType)
        .eq("data->>membership_id", mem.id)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Insert in-app notification
      const { error: insertErr } = await supabase.from("notifications").insert({
        user_id: mem.user_id,
        type: notificationType,
        title,
        body,
        link: `/clubs/${mem.club_id}`,
        data: { membership_id: mem.id, tier_name: tierName, club_name: clubName },
        target_app: "player",
      });

      if (insertErr) {
        console.error("Failed to insert notification:", insertErr);
        continue;
      }

      // Send iOS push if device token is available
      let pushSent = false;
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("push_token")
        .eq("user_id", mem.user_id)
        .single();

      if (profileRow?.push_token) {
        pushSent = await sendApnsPush(
          profileRow.push_token,
          title,
          body,
          { route: `/clubs/${mem.club_id}`, membership_id: mem.id }
        );
      }

      results.push({
        membership_id: mem.id,
        user_id: mem.user_id,
        club_name: clubName,
        tier_name: tierName,
        type: notificationType,
        push_sent: pushSent,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        memberships_checked: allMemberships.length,
        notifications_sent: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("membership-renewal-reminders error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
