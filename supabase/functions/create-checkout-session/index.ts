import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONTHLY_PRICE_ID = "price_1TABODDG9IVOU80sYHim2VsD";
const VALID_PRICES = [MONTHLY_PRICE_ID];
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

    const { company_id, telephely_id, price_id, seats, items, embedded = false } = await req.json();

    // Validate inputs
    if (!company_id) {
      return new Response(JSON.stringify({ error: "Missing required fields: company_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process items (support legacy single item or multiple items)
    const normalizedItems: { price_id: string; seats: number }[] = [];
    if (items && Array.isArray(items)) {
      normalizedItems.push(...items);
    } else if (price_id && seats) {
      normalizedItems.push({ price_id, seats });
    }

    if (normalizedItems.length === 0) {
      return new Response(JSON.stringify({ error: "Missing required fields: items or price_id/seats" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeLineItems = [];
    for (const item of normalizedItems) {
      if (!VALID_PRICES.includes(item.price_id)) {
        return new Response(JSON.stringify({ error: `Invalid price_id: ${item.price_id}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof item.seats !== "number" || item.seats < 1 || item.seats > MAX_SEATS) {
        return new Response(JSON.stringify({ error: `Seats for ${item.price_id} must be between 1 and ${MAX_SEATS}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      stripeLineItems.push({ price: item.price_id, quantity: item.seats });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify klinika_admin role + company ownership
    const { data: hasKlinikaAdmin } = await serviceClient.rpc("has_role", {
      _user_id: userId,
      _role: "klinika_admin",
    });

    if (!hasKlinikaAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: ONLY klinika_admin role is permitted for billing" }), {
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
      .select("id, name, stripe_customer_id, stripe_subscription_id, subscription_status")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (telephely_id) {
      const { data: telephely, error: telephelyError } = await serviceClient
        .from("telephely")
        .select("id")
        .eq("id", telephely_id)
        .eq("company_id", company_id)
        .single();

      if (telephelyError || !telephely) {
        return new Response(JSON.stringify({ error: "Invalid telephely_id for this company" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Missing required fields: telephely_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

    // ── Duplicate subscription guard ──────────────────────────────────────────
    // If the company already has an active subscription, updating the quantity
    // on the existing item is much safer than creating a NEW subscription
    // (which would cause double-counting of licenses in the webhook).
    const activeStatuses = ["active", "past_due", "trialing"];
    if (
      company.stripe_subscription_id &&
      activeStatuses.includes(company.subscription_status ?? "")
    ) {
      try {
        const existingSub = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
        if (activeStatuses.includes(existingSub.status)) {
          // Only handle single-item requests in the update path
          if (normalizedItems.length === 1) {
            const requestedPriceId = normalizedItems[0].price_id;
            const requestedSeats = normalizedItems[0].seats;

            // Find matching item on the existing subscription
            const matchingItem = existingSub.items.data.find(
              (i) => i.price.id === requestedPriceId
            );

            if (matchingItem) {
              // Same price already subscribed — update the quantity in-place
              await stripe.subscriptionItems.update(matchingItem.id, {
                quantity: requestedSeats,
                proration_behavior: "create_prorations",
              });
              return new Response(JSON.stringify({ updated: true, seats: requestedSeats }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            } else {
              // Different price than what's already subscribed.
              // Fall through to create a NEW embedded checkout session — this creates a separate
              // subscription for the different billing interval. The reconciliation logic in
              // getReconciliationData aggregates ALL active subscriptions per customer, so
              // having a yearly sub + a monthly sub works correctly.
              // (Using subscriptionItems.create here bypasses Stripe Checkout and the proration
              // invoice may not fire invoice.payment_succeeded reliably, causing licenses to never appear.)
            }
          }
        }
      } catch (stripeErr) {
        // If we can't retrieve the subscription (e.g. it was deleted in Stripe
        // but DB not yet synced), fall through and create a new checkout session.
        console.warn("Could not retrieve existing subscription, proceeding with new checkout:", stripeErr);
      }
    }

    // Ensure Stripe Customer exists
    let stripeCustomerId = company.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: company.name,
        email: user.email,
        metadata: { company_id: company.id },
      });
      stripeCustomerId = customer.id;

      await serviceClient
        .from("companies")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", company_id);
    } else {
      // Auto-sync the Stripe Customer email to the current admin executing the checkout
      if (user.email) {
        await stripe.customers.update(stripeCustomerId, {
          email: user.email,
        });
      }
    }

    // Determine success/cancel URLs
    const origin = req.headers.get("origin") || "https://treatnote.lovable.app";

    if (embedded) {
      // Embedded checkout — returns client_secret, user stays on page
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: stripeLineItems,
        ui_mode: "embedded",
        return_url: `${origin}/klinika-admin?tab=elofizetes&checkout=success`,
        metadata: {
          company_id,
          telephely_id,
          user_id: userId,
          items: JSON.stringify(normalizedItems),
        },
        subscription_data: {
          metadata: {
            telephely_id,
            company_id,
          }
        },
      });

      return new Response(JSON.stringify({ client_secret: session.client_secret }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Standard redirect checkout (fallback / legacy)
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: stripeLineItems,
      metadata: {
        company_id,
        telephely_id,
        user_id: userId,
        items: JSON.stringify(normalizedItems),
      },
      subscription_data: {
        metadata: {
          telephely_id,
          company_id,
        }
      },
      success_url: `${origin}/klinika-admin?tab=elofizetes&checkout=success`,
      cancel_url: `${origin}/klinika-admin?tab=elofizetes`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Error creating checkout session:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
