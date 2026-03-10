import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

        const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await userClient.auth.getUser(token);
        if (userError || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const { company_id, immediately = false, reactivate = false } = await req.json();
        if (!company_id) return new Response(JSON.stringify({ error: "Missing company_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

        // Authorization check
        const { data: hasKlinikaAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "klinika_admin" });
        const { data: hasAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!hasKlinikaAdmin && !hasAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const { data: profile } = await serviceClient.from("profiles").select("company_id").eq("user_id", user.id).single();
        if (!profile || profile.company_id !== company_id) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const { data: company } = await serviceClient
            .from("companies")
            .select("stripe_subscription_id: stripe_subscription_id, subscription_status")
            .eq("id", company_id)
            .single();

        // Get subscription ID
        const { data: companyFull } = await serviceClient
            .from("companies")
            .select("*")
            .eq("id", company_id)
            .single();

        const subscriptionId = (companyFull as any)?.stripe_subscription_id;
        if (!subscriptionId) return new Response(JSON.stringify({ error: "No active subscription" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

        if (reactivate) {
            // Remove scheduled cancellation
            await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
            // Immediately sync DB so frontend refresh() sees the new value before the webhook fires
            await serviceClient.from("companies").update({ cancel_at_period_end: false }).eq("id", company_id);
            return new Response(JSON.stringify({ success: true, action: "reactivated" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (immediately) {
            // Cancel immediately in Stripe
            await stripe.subscriptions.cancel(subscriptionId);
            // Immediately expire all active licenses + mark company cancelled.
            // This ensures the frontend re-query (triggered by notifyLicenseDataChanged)
            // sees the expired state right away — before the Stripe webhook arrives.
            await Promise.all([
                serviceClient.from("companies")
                    .update({ subscription_status: "canceled", cancel_at_period_end: false })
                    .eq("id", company_id),
                serviceClient.from("licenses")
                    .update({ status: "expired", assigned_user_id: null })
                    .eq("company_id", company_id)
                    .in("status", ["available", "assigned"]),
            ]);
            return new Response(JSON.stringify({ success: true, action: "cancelled_immediately" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Cancel at period end
        await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
        // Immediately sync DB so frontend refresh() sees the new value before the webhook fires
        await serviceClient.from("companies").update({ cancel_at_period_end: true }).eq("id", company_id);
        return new Response(JSON.stringify({ success: true, action: "cancel_at_period_end" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (err) {
        console.error("Error in cancel-subscription:", err);
        return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});
