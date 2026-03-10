import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * cancel-license
 *
 * Cancels one or more individual licenses at period end (or immediately).
 * Each license must belong to the caller's company.
 *
 * Body:
 *   company_id  : string   (required)
 *   license_ids : string[] (required, at least one)
 *   immediately : boolean  (default false — cancel at period end)
 *   reactivate  : boolean  (default false — remove pending cancellation)
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

        const body = await req.json();
        const { company_id, immediately = false } = body;

        // Support two calling conventions:
        // NEW: { cancel_ids: string[], reactivate_ids: string[] }  — unified atomic call from executeTransaction
        // OLD: { license_ids: string[], reactivate: boolean }       — legacy per-license cancel
        const cancel_ids: string[] = body.cancel_ids ?? (body.reactivate ? [] : (body.license_ids ?? []));
        const reactivate_ids: string[] = body.reactivate_ids ?? (body.reactivate ? (body.license_ids ?? []) : []);

        if (!company_id || (cancel_ids.length === 0 && reactivate_ids.length === 0)) {
            return new Response(JSON.stringify({ error: "Missing company_id or no license IDs provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const allLicenseIds = [...new Set([...cancel_ids, ...reactivate_ids])];


        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

        // Auth check
        const { data: hasKlinikaAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "klinika_admin" });
        const { data: hasAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!hasKlinikaAdmin && !hasAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const { data: profile } = await serviceClient.from("profiles").select("company_id").eq("user_id", user.id).single();
        if (!profile || profile.company_id !== company_id) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        // Fetch the targeted licenses (must belong to this company)
        const { data: licenses, error: licErr } = await serviceClient
            .from("licenses")
            .select("id, stripe_subscription_item_id, stripe_subscription_id, status")
            .eq("company_id", company_id)
            .in("id", allLicenseIds);

        if (licErr || !licenses?.length) return new Response(JSON.stringify({ error: "Licenses not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

        const results: { id: string; action: string; error?: string }[] = [];

        // 1. Group licenses by stripe_subscription_item_id
        const itemGroups: Record<string, { subscription_id: string; cancel_ids: string[]; reactivate_ids: string[] }> = {};
        const localOnlyIds: string[] = [];

        for (const lic of licenses) {
            if (lic.stripe_subscription_item_id && lic.stripe_subscription_id) {
                if (!itemGroups[lic.stripe_subscription_item_id]) {
                    itemGroups[lic.stripe_subscription_item_id] = {
                        subscription_id: lic.stripe_subscription_id,
                        cancel_ids: [],
                        reactivate_ids: []
                    };
                }
                if (reactivate_ids.includes(lic.id)) {
                    itemGroups[lic.stripe_subscription_item_id].reactivate_ids.push(lic.id);
                } else if (cancel_ids.includes(lic.id)) {
                    itemGroups[lic.stripe_subscription_item_id].cancel_ids.push(lic.id);
                }
            } else {
                localOnlyIds.push(lic.id);
            }
        }

        // 2. Process Stripe Item Groups
        for (const [itemId, group] of Object.entries(itemGroups)) {
            try {
                if (group.reactivate_ids.length > 0) {
                    // Reactivating: clear cancel_at_period_end flag in DB
                    for (const lId of group.reactivate_ids) {
                        await serviceClient.from("licenses").update({
                            cancel_at_period_end: false,
                            updated_at: new Date().toISOString(),
                        }).eq("id", lId);
                        results.push({ id: lId, action: "reactivated" });
                    }
                }

                if (group.cancel_ids.length > 0) {
                    if (immediately) {
                        // ── Immediate cancellation ──────────────────────────────
                        // Reduce Stripe quantity now and disable licenses immediately.
                        const { data: activeLicenses } = await serviceClient
                            .from("licenses")
                            .select("id")
                            .eq("company_id", company_id)
                            .eq("stripe_subscription_item_id", itemId)
                            .in("status", ["available", "assigned"]);

                        const totalActive = activeLicenses?.length || 0;
                        const newQuantity = Math.max(0, totalActive - group.cancel_ids.length);

                        if (newQuantity <= 0) {
                            await stripe.subscriptionItems.del(itemId, { proration_behavior: "create_prorations" });
                        } else {
                            await stripe.subscriptionItems.update(itemId, {
                                quantity: newQuantity,
                                proration_behavior: "create_prorations"
                            });
                        }

                        for (const lId of group.cancel_ids) {
                            await serviceClient.from("licenses").update({
                                status: "disabled",
                                assigned_user_id: null,
                                cancel_at_period_end: false,
                                updated_at: new Date().toISOString(),
                            }).eq("id", lId);
                            results.push({ id: lId, action: "cancelled_immediately" });
                        }
                    } else {
                        // ── Period-end cancellation ─────────────────────────────
                        // Just mark the license — keep it active until billing period ends.
                        // Do NOT touch Stripe quantity yet.
                        for (const lId of group.cancel_ids) {
                            await serviceClient.from("licenses").update({
                                cancel_at_period_end: true,
                                updated_at: new Date().toISOString(),
                            }).eq("id", lId);
                            results.push({ id: lId, action: "marked_cancel_at_period_end" });
                        }
                    }
                }

            } catch (e: any) {
                console.error("Stripe item update failed:", e);
                const allGroupIds = [...group.cancel_ids, ...group.reactivate_ids];
                for (const lId of allGroupIds) {
                    results.push({ id: lId, action: "error", error: e?.message });
                }
            }
        }

        // 3. Process Local Only Licenses (no Stripe ID attached)
        for (const lId of localOnlyIds) {
            try {
                if (reactivate_ids.includes(lId)) {
                    await serviceClient.from("licenses").update({
                        cancel_at_period_end: false,
                        updated_at: new Date().toISOString(),
                    }).eq("id", lId);
                    results.push({ id: lId, action: "reactivated_local" });
                } else if (immediately) {
                    await serviceClient.from("licenses").update({
                        status: "disabled",
                        assigned_user_id: null,
                        cancel_at_period_end: false,
                        updated_at: new Date().toISOString(),
                    }).eq("id", lId);
                    results.push({ id: lId, action: "cancelled_immediately_local" });
                } else {
                    await serviceClient.from("licenses").update({
                        cancel_at_period_end: true,
                        updated_at: new Date().toISOString(),
                    }).eq("id", lId);
                    results.push({ id: lId, action: "marked_cancel_at_period_end_local" });
                }
            } catch (e: any) {
                results.push({ id: lId, action: "error", error: e?.message });
            }
        }

        return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (err) {
        console.error("Error in cancel-license:", err);
        return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});
