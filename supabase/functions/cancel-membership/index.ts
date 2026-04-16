import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { membership_id } = await req.json();
    if (!membership_id) return new Response(JSON.stringify({ error: "Missing membership_id" }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await admin
      .from("club_memberships")
      .select("id, user_id, stripe_subscription_id, expires_at")
      .eq("id", membership_id)
      .maybeSingle();

    if (!membership) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
    if (membership.user_id !== user.id) return new Response(JSON.stringify({ error: "Not your membership" }), { status: 403, headers: corsHeaders });

    // ── If there's an active Stripe subscription, cancel at period end ──────
    if (membership.stripe_subscription_id) {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

      try {
        const sub = await stripe.subscriptions.update(membership.stripe_subscription_id, {
          cancel_at_period_end: true,
        });

        // cancels_at = when Stripe will actually end the subscription
        const cancelsAt = new Date(sub.cancel_at! * 1000).toISOString();

        await admin
          .from("club_memberships")
          .update({
            status: "cancelling",   // access remains active until cancels_at
            cancels_at: cancelsAt,
          })
          .eq("id", membership_id);

        return new Response(
          JSON.stringify({ success: true, cancels_at: cancelsAt }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (stripeErr: any) {
        // If subscription already cancelled in Stripe, just mark DB as cancelled
        if (stripeErr?.code === "resource_missing") {
          await admin
            .from("club_memberships")
            .update({ status: "cancelled", active: false, cancels_at: null })
            .eq("id", membership_id);
          return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw stripeErr;
      }
    }

    // ── No Stripe subscription (free tier or legacy) — cancel immediately ───
    await admin
      .from("club_memberships")
      .update({ status: "cancelled", active: false })
      .eq("id", membership_id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("cancel-membership error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
