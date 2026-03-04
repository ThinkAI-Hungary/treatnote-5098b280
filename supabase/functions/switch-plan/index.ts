import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONTHLY_PRICE_ID = "price_1Sz1XkDG9IVOU80stgzB49Nq";
const YEARLY_PRICE_ID = "price_1SzFbZDG9IVOU80soy18oPwM";
const VALID_PRICES = [MONTHLY_PRICE_ID, YEARLY_PRICE_ID];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const body = await req.json();
    const { company_id, new_price_id, license_ids, interval } = body;

    if (!company_id) {
      return new Response(JSON.stringify({ error: "Missing company_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: hasKlinikaAdmin } = await serviceClient.rpc("has_role", { _user_id: userId, _role: "klinika_admin" });
    const { data: hasAdmin } = await serviceClient.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!hasKlinikaAdmin && !hasAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: klinika_admin or admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await serviceClient.from("profiles").select("company_id").eq("user_id", userId).single();
    if (!profile || profile.company_id !== company_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

    // ── Mode A: Per-license interval switch (license_ids + interval provided) ──
    if (license_ids?.length && interval) {
      const newPriceId = interval === "yearly" ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;
      if (!VALID_PRICES.includes(newPriceId)) {
        return new Response(JSON.stringify({ error: "Invalid interval" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: licenses } = await serviceClient
        .from("licenses")
        .select("id, stripe_subscription_item_id, stripe_subscription_id, billing_interval")
        .eq("company_id", company_id)
        .in("id", license_ids);

      const toSwitch = (licenses || []).filter(l => l.billing_interval !== interval && l.stripe_subscription_item_id && l.stripe_subscription_id);

      if (toSwitch.length === 0) {
        return new Response(JSON.stringify({ success: true, results: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Group by subscription
      const subGroups: Record<string, { sourceItems: Record<string, string[]>; count: number }> = {};

      for (const lic of toSwitch) {
        if (!subGroups[lic.stripe_subscription_id]) {
          subGroups[lic.stripe_subscription_id] = { sourceItems: {}, count: 0 };
        }
        // @ts-ignore
        if (!subGroups[lic.stripe_subscription_id].sourceItems[lic.stripe_subscription_item_id]) {
          // @ts-ignore
          subGroups[lic.stripe_subscription_id].sourceItems[lic.stripe_subscription_item_id] = [];
        }
        // @ts-ignore
        subGroups[lic.stripe_subscription_id].sourceItems[lic.stripe_subscription_item_id].push(lic.id);
        subGroups[lic.stripe_subscription_id].count++;
      }

      const results: { id: string; action: string; error?: string }[] = [];

      for (const [subId, groupData] of Object.entries(subGroups)) {
        try {
          // 1. Reduce quantities on source items
          for (const [sourceItemId, lIds] of Object.entries(groupData.sourceItems)) {
            const { data: activeLicenses } = await serviceClient
              .from("licenses")
              .select("id")
              .eq("company_id", company_id)
              .eq("stripe_subscription_item_id", sourceItemId)
              .in("status", ["available", "assigned"]);

            const totalActive = activeLicenses?.length || 0;
            const newSourceQty = Math.max(0, totalActive - lIds.length);

            if (newSourceQty <= 0) {
              await stripe.subscriptionItems.del(sourceItemId, { proration_behavior: "create_prorations" });
            } else {
              await stripe.subscriptionItems.update(sourceItemId, {
                quantity: newSourceQty,
                proration_behavior: "create_prorations"
              });
            }
          }

          // 2. Increase quantity on target item
          const subscription = await stripe.subscriptions.retrieve(subId);
          const targetItem = subscription.items.data.find(i => i.price.id === newPriceId);

          let newTargetItemId = "";

          if (targetItem) {
            await stripe.subscriptionItems.update(targetItem.id, {
              quantity: (targetItem.quantity || 0) + groupData.count,
              proration_behavior: "create_prorations"
            });
            newTargetItemId = targetItem.id;
          } else {
            const createdItem = await stripe.subscriptionItems.create({
              subscription: subId,
              price: newPriceId,
              quantity: groupData.count,
              proration_behavior: "create_prorations"
            });
            newTargetItemId = createdItem.id;
          }

          // 3. Update DB
          const allLidsInSub = Object.values(groupData.sourceItems).flat();
          for (const lId of allLidsInSub) {
            await serviceClient.from("licenses").update({
              billing_interval: interval,
              stripe_subscription_item_id: newTargetItemId,
              updated_at: new Date().toISOString(),
            }).eq("id", lId);
            results.push({ id: lId, action: `switched_to_${interval}` });
          }

        } catch (e: any) {
          console.error("Stripe switch failed:", e);
          const allLidsInSub = Object.values(groupData.sourceItems).flat();
          for (const lId of allLidsInSub) {
            results.push({ id: lId, action: "error", error: e?.message });
          }
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Mode B: Whole-subscription plan switch (original behaviour) ──
    if (!VALID_PRICES.includes(new_price_id)) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await serviceClient
      .from("companies")
      .select("stripe_subscription_item_id, subscription_status, subscription_price_id")
      .eq("id", company_id)
      .single();

    if (!company || !company.stripe_subscription_item_id || company.subscription_status !== "active") {
      return new Response(JSON.stringify({ error: "No active subscription found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (company.subscription_price_id === new_price_id) {
      return new Response(JSON.stringify({ error: "Already on this plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await stripe.subscriptionItems.update(company.stripe_subscription_item_id, {
      price: new_price_id,
      proration_behavior: "create_prorations",
    });

    return new Response(JSON.stringify({ success: true, new_price_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error switching plan:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
