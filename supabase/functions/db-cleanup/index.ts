import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const MONTHLY_PRICE_ID = "price_1TABODDG9IVOU80sYHim2VsD";

serve(async () => {
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-12-18.acacia" });
    const results: Record<string, unknown>[] = [];

    // Get all companies that have a stripe_customer_id
    const { data: companies } = await supabase
        .from("companies")
        .select("id, stripe_customer_id")
        .not("stripe_customer_id", "is", null);

    for (const company of companies ?? []) {
        const customerId = company.stripe_customer_id;
        const companyId = company.id;

        // Find active monthly Stripe subscriptions for this customer
        const subs = await stripe.subscriptions.list({ customer: customerId, status: "active" });
        for (const sub of subs.data) {
            for (const item of sub.items.data) {
                if (item.price.id !== MONTHLY_PRICE_ID) continue;

                const quantity = item.quantity || 0;
                const telephelyId = sub.metadata?.telephely_id || null;
                const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

                // Find expired/disabled monthly licenses for this company+telephely
                let q = supabase
                    .from("licenses")
                    .select("id, status, assigned_user_id")
                    .eq("company_id", companyId)
                    .eq("billing_interval", "monthly")
                    .eq("license_type", "paid")
                    .in("status", ["expired", "disabled"]);

                if (telephelyId) {
                    q = q.eq("telephely_id", telephelyId);
                }

                const { data: expiredLicenses } = await q.limit(quantity);

                const toRestore = expiredLicenses ?? [];
                for (const lic of toRestore) {
                    const newStatus = lic.assigned_user_id ? "assigned" : "available";
                    await supabase.from("licenses").update({
                        status: newStatus,
                        expires_at: periodEnd,
                        stripe_subscription_id: sub.id,
                        stripe_subscription_item_id: item.id,
                        updated_at: new Date().toISOString(),
                    }).eq("id", lic.id);
                }

                results.push({
                    company_id: companyId,
                    telephely_id: telephelyId,
                    subscription_id: sub.id,
                    quantity,
                    restored: toRestore.length,
                    restoredIds: toRestore.map(l => l.id),
                });
            }
        }
    }

    return new Response(JSON.stringify(results, null, 2), {
        headers: { "Content-Type": "application/json" },
    });
});
