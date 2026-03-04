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

        const url = new URL(req.url);
        const company_id = url.searchParams.get("company_id") || (await req.json().catch(() => ({}))).company_id;
        if (!company_id) return new Response(JSON.stringify({ error: "Missing company_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

        const { data: hasKlinikaAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "klinika_admin" });
        const { data: hasAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!hasKlinikaAdmin && !hasAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const { data: profile } = await serviceClient.from("profiles").select("company_id").eq("user_id", user.id).single();
        if (!profile || profile.company_id !== company_id) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const { data: company } = await serviceClient.from("companies").select("stripe_customer_id").eq("id", company_id).single();
        if (!(company as any)?.stripe_customer_id) return new Response(JSON.stringify({ invoices: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

        const invoiceList = await stripe.invoices.list({
            customer: (company as any).stripe_customer_id,
            limit: 24,
        });

        const invoices = invoiceList.data.map((inv) => ({
            id: inv.id,
            number: inv.number,
            amount_paid: inv.amount_paid,
            amount_due: inv.amount_due,
            currency: inv.currency,
            status: inv.status,
            created: inv.created,
            period_start: inv.period_start,
            period_end: inv.period_end,
            invoice_pdf: inv.invoice_pdf,
            hosted_invoice_url: inv.hosted_invoice_url,
            description: inv.description,
        }));

        return new Response(JSON.stringify({ invoices }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (err) {
        console.error("Error in list-invoices:", err);
        return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});
