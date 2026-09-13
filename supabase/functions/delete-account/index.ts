// delete-account — Apple 5.1.1(v) compliance + Privacy Policy §6/§7.
// Verifies the caller's JWT, anonymises/cleans their data via delete_user_account(),
// removes their avatar files, then deletes the auth user. Irreversible.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) throw new Error("Not authenticated");

    // Require explicit confirmation from the client
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "DELETE") throw new Error("Missing confirmation");

    // 1. Anonymise / clean public-schema data (atomic SQL function, service-role only)
    const { error: cleanupError } = await supabaseAdmin.rpc("delete_user_account", {
      _user_id: user.id,
    });
    if (cleanupError) throw new Error("Data cleanup failed: " + cleanupError.message);

    // 2. Remove avatar files (own folder)
    try {
      const { data: files } = await supabaseAdmin.storage.from("avatars").list(user.id);
      if (files && files.length > 0) {
        await supabaseAdmin.storage
          .from("avatars")
          .remove(files.map((f) => `${user.id}/${f.name}`));
      }
    } catch (storageErr) {
      // Non-fatal — log and continue; auth deletion is the critical step
      console.error("avatar cleanup failed:", storageErr);
    }

    // 3. Delete the auth user (signs them out everywhere)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error("Auth deletion failed: " + deleteError.message);

    console.log("Account deleted:", user.id);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("delete-account error:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
