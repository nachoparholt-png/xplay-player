import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function generateShopifyDiscountCode(
  rewardName: string,
  shopifyProductId: string | null
): Promise<string | null> {
  const shopifyDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN");
  const shopifyToken = Deno.env.get("SHOPIFY_ACCESS_TOKEN");
  if (!shopifyDomain || !shopifyToken) return null;

  const code = `XPLAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  try {
    // Create price rule
    const priceRuleBody: any = {
      price_rule: {
        title: `XPLAY Reward: ${rewardName}`,
        target_type: "line_item",
        target_selection: shopifyProductId ? "entitled" : "all",
        allocation_method: "across",
        value_type: "percentage",
        value: "-100.0",
        customer_selection: "all",
        usage_limit: 1,
        once_per_customer: true,
        starts_at: new Date().toISOString(),
      },
    };

    if (shopifyProductId) {
      // Extract numeric ID from GraphQL ID if needed
      const numericId = shopifyProductId.replace(/^gid:\/\/shopify\/Product\//, "");
      priceRuleBody.price_rule.entitled_product_ids = [parseInt(numericId)];
    }

    const priceRuleRes = await fetch(
      `https://${shopifyDomain}/admin/api/2025-07/price_rules.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": shopifyToken,
        },
        body: JSON.stringify(priceRuleBody),
      }
    );

    if (!priceRuleRes.ok) {
      console.error("Failed to create price rule:", await priceRuleRes.text());
      return null;
    }

    const priceRuleData = await priceRuleRes.json();
    const priceRuleId = priceRuleData.price_rule.id;

    // Create discount code
    const discountRes = await fetch(
      `https://${shopifyDomain}/admin/api/2025-07/price_rules/${priceRuleId}/discount_codes.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": shopifyToken,
        },
        body: JSON.stringify({ discount_code: { code } }),
      }
    );

    if (!discountRes.ok) {
      console.error("Failed to create discount code:", await discountRes.text());
      return null;
    }

    return code;
  } catch (err) {
    console.error("Shopify discount code generation failed:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { reward_id } = await req.json();
    if (!reward_id) throw new Error("Missing reward_id");

    // Fetch reward
    const { data: reward, error: rewardError } = await supabase
      .from("rewards")
      .select("*")
      .eq("id", reward_id)
      .single();
    if (rewardError || !reward) throw new Error("Reward not found");

    if (reward.status !== "active") throw new Error("This reward is not available");

    // Check stock status
    if (reward.stock_status === "out_of_stock") throw new Error("This reward is out of stock");
    if (reward.stock_status === "coming_soon") throw new Error("This reward is coming soon");

    // Validate stock (non-code-based)
    if (!reward.code_required && reward.current_stock !== null && reward.current_stock <= 0) {
      throw new Error("This reward is out of stock");
    }

    if (reward.valid_until && new Date(reward.valid_until) < new Date()) {
      throw new Error("This reward has expired");
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("padel_park_points, lifetime_spent")
      .eq("user_id", user.id)
      .single();
    if (profileError || !profile) throw new Error("Profile not found");

    if (profile.padel_park_points < reward.points_cost) {
      throw new Error(`Not enough points. You need ${reward.points_cost - profile.padel_park_points} more.`);
    }

    // Check max redemptions per user
    if (reward.max_redemptions_per_user) {
      const { count } = await supabase
        .from("reward_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("reward_id", reward_id);
      if ((count || 0) >= reward.max_redemptions_per_user) {
        throw new Error("Maximum redemptions reached for this reward");
      }
    }

    // Fetch linked store info
    let storeData: any = null;
    if (reward.linked_store_id) {
      const { data: store } = await supabase
        .from("stores")
        .select("*")
        .eq("id", reward.linked_store_id)
        .single();
      storeData = store;
      if (storeData && storeData.store_status !== "active") {
        throw new Error("The linked store is currently inactive");
      }
    }

    // Fetch settings for code-based logic
    const { data: settingsData } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "enable_code_based_rewards",
        "code_assignment_method",
        "stock_availability_mode",
        "require_external_quantity_check",
      ]);
    const settings: Record<string, string> = {};
    (settingsData || []).forEach((s: any) => { settings[s.key] = s.value; });

    let assignedCode: any = null;
    let deliveryMessage: string | null = null;
    let shopifyDiscountCode: string | null = null;

    // Code-based reward logic
    if (reward.code_required && settings.enable_code_based_rewards !== "false") {
      // Check external quantity if required
      const stockMode = settings.stock_availability_mode || "use_code_inventory_only";
      if (
        (stockMode === "require_both_code_and_external_quantity" || stockMode === "use_external_quantity_only") &&
        reward.external_quantity !== null && reward.external_quantity <= 0
      ) {
        throw new Error("External store is out of stock");
      }

      // Find available code
      const assignmentMethod = settings.code_assignment_method || "fifo_import_order";
      let codeQuery = supabase
        .from("reward_codes")
        .select("*")
        .eq("reward_id", reward_id)
        .eq("code_status", "available")
        .limit(1);

      if (assignmentMethod === "earliest_expiry_first") {
        codeQuery = codeQuery.order("expiration_date", { ascending: true, nullsFirst: false });
      } else if (assignmentMethod === "manual_priority") {
        codeQuery = codeQuery.order("priority_order", { ascending: true });
      } else {
        codeQuery = codeQuery.order("imported_at", { ascending: true });
      }

      const { data: codes } = await codeQuery;
      if (!codes || codes.length === 0) {
        await supabase.from("rewards").update({ stock_status: "out_of_stock" }).eq("id", reward_id);
        throw new Error("No codes available for this reward");
      }

      assignedCode = codes[0];

      // Mark code as redeemed
      const { error: codeUpdateError } = await supabase
        .from("reward_codes")
        .update({
          code_status: "redeemed",
          redeemed_at: new Date().toISOString(),
          redeemed_by_user_id: user.id,
        })
        .eq("id", assignedCode.id)
        .eq("code_status", "available");

      if (codeUpdateError) {
        throw new Error("Failed to assign code — it may have been claimed by another user");
      }

      // Decrease external quantity if tracked
      if (reward.external_quantity !== null && reward.external_quantity > 0) {
        await supabase
          .from("rewards")
          .update({ external_quantity: reward.external_quantity - 1 })
          .eq("id", reward_id);
      }

      // Check remaining codes and update stock_status
      const { count: remainingCodes } = await supabase
        .from("reward_codes")
        .select("id", { count: "exact", head: true })
        .eq("reward_id", reward_id)
        .eq("code_status", "available");
      
      if ((remainingCodes || 0) <= 0) {
        await supabase.from("rewards").update({ stock_status: "out_of_stock" }).eq("id", reward_id);
      }

      const storeName = storeData?.store_name || reward.external_store_name;
      deliveryMessage = reward.redemption_instructions
        || storeData?.redemption_instructions
        || (storeName ? `Use this code at checkout on ${storeName}.` : "Use this code at checkout.");
    }

    // Generate Shopify discount code if the reward has no assigned code but is a Shopify-linked product
    if (!assignedCode) {
      // Try to look up a linked product in the products table
      const { data: linkedProduct } = await supabase
        .from("products")
        .select("shopify_product_id")
        .eq("id", reward_id)
        .maybeSingle();

      shopifyDiscountCode = await generateShopifyDiscountCode(
        reward.reward_name,
        linkedProduct?.shopify_product_id || null
      );

      if (shopifyDiscountCode) {
        deliveryMessage = `Your discount code: ${shopifyDiscountCode}. Use it at checkout for 100% off.`;
      }
    }

    // Deduct points
    const newBalance = profile.padel_park_points - reward.points_cost;
    const newSpent = (profile.lifetime_spent || 0) + reward.points_cost;

    const { error: profileUpdateError } = await supabase.from("profiles").update({
      padel_park_points: newBalance,
      lifetime_spent: newSpent,
    }).eq("user_id", user.id);

    if (profileUpdateError) {
      // Rollback code assignment if points deduction fails
      if (assignedCode) {
        await supabase.from("reward_codes").update({
          code_status: "available",
          redeemed_at: null,
          redeemed_by_user_id: null,
        }).eq("id", assignedCode.id);
      }
      throw new Error("Failed to deduct points");
    }

    // Create redemption record
    await supabase.from("reward_redemptions").insert({
      user_id: user.id,
      reward_id: reward_id,
      points_spent: reward.points_cost,
      redemption_status: "completed",
      reward_code_id: assignedCode?.id || null,
      linked_store_id: reward.linked_store_id || null,
      delivered_at: assignedCode || shopifyDiscountCode ? new Date().toISOString() : null,
      delivery_message: deliveryMessage,
    });

    // Create transaction record
    await supabase.from("points_transactions").insert({
      user_id: user.id,
      transaction_type: "lost",
      amount: -reward.points_cost,
      balance_before: profile.padel_park_points,
      balance_after: newBalance,
      reason: `Redeemed: ${reward.reward_name}`,
    });

    // Decrease stock if applicable (non-code-based)
    if (!reward.code_required && reward.current_stock !== null) {
      const newStock = reward.current_stock - 1;
      await supabase.from("rewards").update({
        current_stock: newStock,
        ...(newStock <= 0 ? { stock_status: "out_of_stock" } : {}),
      }).eq("id", reward_id);
    }

    // Create notification
    const codeDisplay = assignedCode?.unique_code || shopifyDiscountCode;
    const notifBody = codeDisplay
      ? `You redeemed "${reward.reward_name}". Your code: ${codeDisplay}`
      : `You redeemed "${reward.reward_name}" for ${reward.points_cost} PP.`;

    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Reward Redeemed! 🎉",
      body: notifBody,
      type: "reward",
      link: "/rewards",
    });

    return new Response(JSON.stringify({
      success: true,
      new_balance: newBalance,
      assigned_code: codeDisplay || null,
      delivery_message: deliveryMessage,
      reward_name: reward.reward_name,
      external_store_name: storeData?.store_name || reward.external_store_name || null,
      store_website_url: storeData?.website_url || null,
      redemption_instructions: reward.redemption_instructions || storeData?.redemption_instructions || null,
      expiration_date: assignedCode?.expiration_date || null,
      shopify_discount_code: shopifyDiscountCode,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
