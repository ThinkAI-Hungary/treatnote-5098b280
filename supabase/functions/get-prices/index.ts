import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONTHLY_PRICE_ID = "price_1TA9kXDG9IVOU80sve6uDycw";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

    const [monthlyPrice, yearlyPrice] = await Promise.all([
      stripe.prices.retrieve(MONTHLY_PRICE_ID),
      stripe.prices.retrieve(YEARLY_PRICE_ID),
    ]);

    return new Response(JSON.stringify({
      monthly: {
        price_id: monthlyPrice.id,
        unit_amount: monthlyPrice.unit_amount,
        currency: monthlyPrice.currency,
        interval: monthlyPrice.recurring?.interval,
      },
      yearly: {
        price_id: yearlyPrice.id,
        unit_amount: yearlyPrice.unit_amount,
        currency: yearlyPrice.currency,
        interval: yearlyPrice.recurring?.interval,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error fetching prices:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch pricing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
