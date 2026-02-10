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
const MAX_SEATS = 500;

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

    // Verify user
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

    const { company_id, price_id, seats } = await req.json();

    // Validate inputs
    if (!company_id || !price_id || !seats) {
      return new Response(JSON.stringify({ error: "Missing required fields: company_id, price_id, seats" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VALID_PRICES.includes(price_id)) {
      return new Response(JSON.stringify({ error: "Invalid price_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof seats !== "number" || seats < 1 || seats > MAX_SEATS) {
      return new Response(JSON.stringify({ error: `Seats must be between 1 and ${MAX_SEATS}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify klinika_admin role + company ownership
    const { data: hasRole, error: roleError } = await serviceClient.rpc("has_role", {
      _user_id: userId,
      _role: "klinika_admin",
    });
    console.log("has_role check:", { userId, hasRole, roleError });
    if (!hasRole) {
      return new Response(JSON.stringify({ error: "Forbidden: klinika_admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("company_id")
      .eq("user_id", userId)
      .single();

    if (!profile || profile.company_id !== company_id) {
      return new Response(JSON.stringify({ error: "Forbidden: not admin of this company" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company
    const { data: company, error: companyError } = await serviceClient
      .from("companies")
      .select("id, name, stripe_customer_id, subscription_status")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already has active subscription
    if (company.subscription_status === "active") {
      return new Response(JSON.stringify({ error: "Company already has an active subscription. Use seat/plan management instead." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

    // Ensure Stripe Customer exists
    let stripeCustomerId = company.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: company.name,
        metadata: { company_id: company.id },
      });
      stripeCustomerId = customer.id;

      await serviceClient
        .from("companies")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", company_id);
    }

    // Determine success/cancel URLs
    const origin = req.headers.get("origin") || "https://treatnote.lovable.app";

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: price_id, quantity: seats }],
      metadata: {
        company_id,
        user_id: userId,
        price_id,
        seats: String(seats),
      },
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancel`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error creating checkout session:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
