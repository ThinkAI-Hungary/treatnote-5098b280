import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const MONTHLY_PRICE_ID = "price_1Sz1XkDG9IVOU80stgzB49Nq";
const YEARLY_PRICE_ID = "price_1SzFbZDG9IVOU80soy18oPwM";
const KNOWN_PRICES = [MONTHLY_PRICE_ID, YEARLY_PRICE_ID];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let event: Stripe.Event;

  try {
    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotency check
  const { error: insertError } = await supabase
    .from("stripe_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
    });

  if (insertError) {
    if (insertError.code === "23505") {
      // Duplicate event, already processed
      console.log(`Duplicate event ${event.id}, skipping`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("Error inserting event:", insertError);
    // Non-duplicate DB error — let processing continue, don't block on idempotency table issues
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.company_id;
        if (!companyId) {
          console.error("No company_id in checkout session metadata");
          break;
        }

        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as any)?.id;

        const customerId = typeof session.customer === "string"
          ? session.customer
          : (session.customer as any)?.id;

        // Fetch subscription details to get item info
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const item = subscription.items.data.find(
            (i) => KNOWN_PRICES.includes(i.price.id)
          );

          const { error: updateError } = await supabase
            .from("companies")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              stripe_subscription_item_id: item?.id || null,
              subscription_status: subscription.status === "active" ? "active" : subscription.status,
              subscription_price_id: item?.price.id || null,
              seats: item?.quantity || 0,
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              livemode: event.livemode,
            })
            .eq("id", companyId);

          if (updateError) {
            console.error("Error updating company after checkout:", updateError);
            return new Response(JSON.stringify({ error: "DB update failed" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : (subscription.customer as any)?.id;

        const item = subscription.items.data.find(
          (i) => KNOWN_PRICES.includes(i.price.id)
        );

        const { error: updateError } = await supabase
          .from("companies")
          .update({
            stripe_subscription_id: subscription.id,
            stripe_subscription_item_id: item?.id || null,
            subscription_price_id: item?.price.id || null,
            seats: item?.quantity || 0,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            subscription_status: subscription.status,
            livemode: event.livemode,
          })
          .eq("stripe_customer_id", customerId);

        if (updateError) {
          console.error("Error updating subscription:", updateError);
          return new Response(JSON.stringify({ error: "DB update failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : (subscription.customer as any)?.id;

        const { error: updateError } = await supabase
          .from("companies")
          .update({
            subscription_status: "canceled",
            cancel_at_period_end: false,
          })
          .eq("stripe_customer_id", customerId);

        if (updateError) {
          console.error("Error canceling subscription:", updateError);
          return new Response(JSON.stringify({ error: "DB update failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string"
          ? invoice.customer
          : (invoice.customer as any)?.id;

        const { error: updateError } = await supabase
          .from("companies")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", customerId);

        if (updateError) {
          console.error("Error setting past_due:", updateError);
          return new Response(JSON.stringify({ error: "DB update failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string"
          ? invoice.customer
          : (invoice.customer as any)?.id;

        const subscriptionId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : (invoice.subscription as any)?.id;

        const updateData: Record<string, unknown> = {
          subscription_status: "active",
        };

        // Refresh period end from subscription if available
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            updateData.current_period_end = new Date(sub.current_period_end * 1000).toISOString();
          } catch (e) {
            console.warn("Could not fetch subscription for period end refresh:", e);
          }
        }

        const { error: updateError } = await supabase
          .from("companies")
          .update(updateData)
          .eq("stripe_customer_id", customerId);

        if (updateError) {
          console.error("Error setting active after payment:", updateError);
          return new Response(JSON.stringify({ error: "DB update failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error processing webhook event:", err);
    return new Response(JSON.stringify({ error: "Processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
