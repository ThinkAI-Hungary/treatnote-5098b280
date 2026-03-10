import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONTHLY_PRICE_ID = "price_1T8u7qDG9IVOU80s98QkFIo6";
const YEARLY_PRICE_ID = "price_1SzFbZDG9IVOU80soy18oPwM";

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

        const url = new URL(req.url);
        let company_id = url.searchParams.get("company_id");
        let telephely_id = url.searchParams.get("telephely_id");
        if (!company_id || !telephely_id) {
            try {
                const body = await req.json();
                company_id = company_id || body.company_id;
                telephely_id = telephely_id || body.telephely_id;
            } catch (_) { }
        }
        if (!company_id) return new Response(JSON.stringify({ error: "Missing company_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

        const { data: hasKlinikaAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "klinika_admin" });
        const { data: hasAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!hasKlinikaAdmin && !hasAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const { data: profile } = await serviceClient.from("profiles").select("company_id, current_telephely_id").eq("user_id", user.id).single();
        if (!profile || profile.company_id !== company_id) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        // Resolve telephely_id: use the one from the request, fall back to profile's current_telephely_id
        const resolvedTelephelyId: string | null = telephely_id || profile.current_telephely_id || null;

        const { data: company } = await serviceClient
            .from("companies")
            .select("id, name, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_price_id, seats, current_period_end, cancel_at_period_end, stripe_subscription_item_id")
            .eq("id", company_id)
            .single();

        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

        // Fetch prices in parallel
        const [monthlyPrice, yearlyPrice] = await Promise.all([
            stripe.prices.retrieve(MONTHLY_PRICE_ID),
            stripe.prices.retrieve(YEARLY_PRICE_ID),
        ]);

        const prices = {
            monthly: { price_id: monthlyPrice.id, unit_amount: monthlyPrice.unit_amount, currency: monthlyPrice.currency },
            yearly: { price_id: yearlyPrice.id, unit_amount: yearlyPrice.unit_amount, currency: yearlyPrice.currency },
        };

        const customerId = (company as any)?.stripe_customer_id;

        // Payment methods and upcoming invoice only if customer exists
        let paymentMethods: any[] = [];
        let upcomingInvoice: any = null;
        let defaultPaymentMethodId: string | null = null;

        if (customerId) {
            try {
                const [pmList, customer, upcoming] = await Promise.allSettled([
                    stripe.paymentMethods.list({ customer: customerId, type: "card" }),
                    stripe.customers.retrieve(customerId),
                    stripe.invoices.retrieveUpcoming({ customer: customerId }).catch(() => null),
                ]);

                if (pmList.status === "fulfilled") {
                    const cust = customer.status === "fulfilled" ? customer.value as Stripe.Customer : null;
                    defaultPaymentMethodId = (cust && !('deleted' in cust))
                        ? (typeof cust.invoice_settings?.default_payment_method === "string"
                            ? cust.invoice_settings.default_payment_method
                            : (cust.invoice_settings?.default_payment_method as any)?.id || null)
                        : null;

                    // Deduplicate by card fingerprint — keep the default (or newest) per fingerprint,
                    // detach the rest so they stop accumulating in Stripe.
                    const seen = new Map<string, Stripe.PaymentMethod>();
                    const toDetach: string[] = [];

                    for (const pm of pmList.value.data) {
                        const fingerprint = pm.card?.fingerprint ?? pm.id;
                        if (seen.has(fingerprint)) {
                            const existing = seen.get(fingerprint)!;
                            // Prefer the default one; otherwise keep whichever came first (Stripe returns newest first)
                            if (pm.id === defaultPaymentMethodId) {
                                toDetach.push(existing.id);
                                seen.set(fingerprint, pm);
                            } else {
                                toDetach.push(pm.id);
                            }
                        } else {
                            seen.set(fingerprint, pm);
                        }
                    }

                    // Fire-and-forget detach of stale duplicates
                    for (const pmId of toDetach) {
                        stripe.paymentMethods.detach(pmId).catch((e) =>
                            console.warn("Could not detach duplicate PM", pmId, e)
                        );
                    }

                    paymentMethods = Array.from(seen.values()).map((pm) => ({
                        id: pm.id,
                        brand: pm.card?.brand,
                        last4: pm.card?.last4,
                        exp_month: pm.card?.exp_month,
                        exp_year: pm.card?.exp_year,
                        is_default: pm.id === defaultPaymentMethodId,
                    }));

                    // Auto-set default: if exactly one card exists and it's not already the default, set it now.
                    if (paymentMethods.length === 1 && !paymentMethods[0].is_default) {
                        stripe.customers.update(customerId, {
                            invoice_settings: { default_payment_method: paymentMethods[0].id },
                        }).catch((e: unknown) => console.warn("Could not auto-set default PM", e));
                        paymentMethods[0].is_default = true;
                    }
                }


                if (upcoming.status === "fulfilled" && upcoming.value) {
                    const inv = upcoming.value as Stripe.UpcomingInvoice;
                    upcomingInvoice = {
                        amount_due: inv.amount_due,
                        currency: inv.currency,
                        period_end: inv.period_end,
                        lines: inv.lines.data.slice(0, 5).map((l) => ({
                            description: l.description,
                            amount: l.amount,
                            period: l.period,
                        })),
                    };
                }
            } catch (e) {
                console.warn("Non-fatal Stripe fetch error:", e);
            }
        }

        const result = {
            subscription: {
                status: (company as any)?.subscription_status,
                price_id: (company as any)?.subscription_price_id,
                seats: (company as any)?.seats,
                current_period_end: (company as any)?.current_period_end,
                cancel_at_period_end: (company as any)?.cancel_at_period_end,
                telephely_id: resolvedTelephelyId,
            },
            payment_methods: paymentMethods,
            upcoming_invoice: upcomingInvoice,
            prices,
        };

        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (err) {
        console.error("Error in get-billing-details:", err);
        return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});
