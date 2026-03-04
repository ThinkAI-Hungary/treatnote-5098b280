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

        // Verify the user
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

        const { payment_method_id } = await req.json();
        if (!payment_method_id) {
            return new Response(JSON.stringify({ error: "Missing payment_method_id" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

        // Verify the user has klinika_admin or admin role
        const { data: hasKlinikaAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "klinika_admin" });
        const { data: hasAdmin } = await serviceClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!hasKlinikaAdmin && !hasAdmin) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
                status: 403,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Retrieve the PM to verify it belongs to this user's company customer
        const { data: profile } = await serviceClient
            .from("profiles")
            .select("company_id")
            .eq("user_id", user.id)
            .single();

        if (!profile?.company_id) {
            return new Response(JSON.stringify({ error: "No company found" }), {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: company } = await serviceClient
            .from("companies")
            .select("stripe_customer_id")
            .eq("id", profile.company_id)
            .single();

        if (!company?.stripe_customer_id) {
            return new Response(JSON.stringify({ error: "No Stripe customer" }), {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Verify the PM actually belongs to this customer before detaching
        const pm = await stripe.paymentMethods.retrieve(payment_method_id);
        if (pm.customer !== company.stripe_customer_id) {
            return new Response(JSON.stringify({ error: "Payment method does not belong to this customer" }), {
                status: 403,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        await stripe.paymentMethods.detach(payment_method_id);

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err) {
        console.error("Error in delete-payment-method:", err);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
