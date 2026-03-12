import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONTHLY_PRICE_ID = "price_1TA9kXDG9IVOU80sve6uDycw";

/**
 * switch-license-interval
 *
 * Switches one or more licenses between monthly and yearly pricing.
 * Stripe prorates the difference automatically.
 *
 * Body:
 *   company_id  : string              (required)
 *   license_ids : string[]            (required)
 *   interval    : 'monthly' | 'yearly' (required — the TARGET interval)
 */
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

        const { company_id, license_ids, interval } = await req.json();
        if (!company_id || !license_ids?.length || !interval) return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (interval !== "monthly" && interval !== "yearly") return new Response(JSON.stringify({ error: "interval must be 'monthly' or 'yearly'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        if (interval === "yearly") return new Response(JSON.stringify({ error: "Yearly billing is not available yet" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const newPriceId = MONTHLY_PRICE_ID;

        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

        // Auth
        const { data: hasKlinikaAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "klinika_admin" });
        const { data: hasAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!hasKlinikaAdmin && !hasAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const { data: profile } = await serviceClient.from("profiles").select("company_id").eq("user_id", user.id).single();
        if (!profile || profile.company_id !== company_id) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        // Fetch licenses
        const { data: licenses, error: licErr } = await serviceClient
            .from("licenses")
            .select("id, stripe_subscription_item_id, billing_interval")
            .eq("company_id", company_id)
            .in("id", license_ids);

        if (licErr || !licenses?.length) return new Response(JSON.stringify({ error: "Licenses not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });
        const results: { id: string; action: string; error?: string }[] = [];

        for (const lic of licenses) {
            try {
                if (lic.billing_interval === interval) {
                    results.push({ id: lic.id, action: "no_change_needed" });
                    continue;
                }

                if (lic.stripe_subscription_item_id) {
                    // Update Stripe subscription item price — Stripe auto-prorates
                    await stripe.subscriptionItems.update(lic.stripe_subscription_item_id, {
                        price: newPriceId,
                        proration_behavior: "create_prorations",
                    });
                }

                // Update local record
                await serviceClient.from("licenses").update({
                    billing_interval: interval,
                    updated_at: new Date().toISOString(),
                }).eq("id", lic.id);

                results.push({ id: lic.id, action: `switched_to_${interval}` });
            } catch (e: any) {
                results.push({ id: lic.id, action: "error", error: e?.message });
            }
        }

        return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (err) {
        console.error("Error in switch-license-interval:", err);
        return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});
