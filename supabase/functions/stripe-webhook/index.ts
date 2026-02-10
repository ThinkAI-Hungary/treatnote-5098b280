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

function priceToInterval(priceId: string | null | undefined): string {
  return priceId === YEARLY_PRICE_ID ? "yearly" : "monthly";
}
// ─── License reconciliation helper ───────────────────────────
async function reconcileLicenses(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  targetSeats: number,
  subscriptionId: string | null,
  subscriptionItemId: string | null,
  expiresAt: string | null,
  billingInterval: string = "monthly",
) {
  // Get current licenses
  const { data: currentLicenses } = await supabase
    .from("licenses")
    .select("id, status, assigned_user_id")
    .eq("company_id", companyId)
    .in("status", ["available", "assigned"])
    .order("created_at", { ascending: true });

  const current = currentLicenses || [];
  const currentCount = current.length;
  const delta = targetSeats - currentCount;

  if (delta > 0) {
    // Create new licenses
    const newLicenses = Array.from({ length: delta }, () => ({
      company_id: companyId,
      status: "available",
      stripe_subscription_id: subscriptionId,
      stripe_subscription_item_id: subscriptionItemId,
      expires_at: expiresAt,
      billing_interval: billingInterval,
    }));
    await supabase.from("licenses").insert(newLicenses);

    // Auto-assign to unlicensed company members
    const { data: unlicensedUsers } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("company_id", companyId)
      .not("user_id", "in", `(${current.filter(l => l.assigned_user_id).map(l => l.assigned_user_id).join(",") || "00000000-0000-0000-0000-000000000000"})`)
      .order("created_at", { ascending: true })
      .limit(delta);

    if (unlicensedUsers && unlicensedUsers.length > 0) {
      // Get the newly created available licenses
      const { data: availableLicenses } = await supabase
        .from("licenses")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "available")
        .is("assigned_user_id", null)
        .order("created_at", { ascending: true })
        .limit(unlicensedUsers.length);

      if (availableLicenses) {
        for (let i = 0; i < Math.min(unlicensedUsers.length, availableLicenses.length); i++) {
          await supabase
            .from("licenses")
            .update({ assigned_user_id: unlicensedUsers[i].user_id, status: "assigned" })
            .eq("id", availableLicenses[i].id);
        }
      }
    }
  } else if (delta < 0) {
    // Need to remove |delta| licenses
    const toRemove = Math.abs(delta);
    // First disable unassigned
    const unassigned = current.filter(l => l.status === "available" && !l.assigned_user_id);
    const fromUnassigned = unassigned.slice(0, toRemove);
    for (const lic of fromUnassigned) {
      await supabase.from("licenses").update({ status: "disabled" }).eq("id", lic.id);
    }
    // If still need more, unassign newest assigned
    const remaining = toRemove - fromUnassigned.length;
    if (remaining > 0) {
      const assigned = current.filter(l => l.status === "assigned" && l.assigned_user_id).reverse();
      for (let i = 0; i < Math.min(remaining, assigned.length); i++) {
        await supabase.from("licenses").update({ status: "disabled", assigned_user_id: null }).eq("id", assigned[i].id);
      }
    }
  }

  // Update expires_at for all active licenses
  if (expiresAt) {
    await supabase
      .from("licenses")
      .update({ expires_at: expiresAt, stripe_subscription_id: subscriptionId, stripe_subscription_item_id: subscriptionItemId })
      .eq("company_id", companyId)
      .in("status", ["available", "assigned"]);
  }
}

// ─── Main handler ────────────────────────────────────────────
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
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
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
    .insert({ event_id: event.id, event_type: event.type, livemode: event.livemode });

  if (insertError) {
    if (insertError.code === "23505") {
      console.log(`Duplicate event ${event.id}, skipping`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("Error inserting event:", insertError);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.company_id;
        if (!companyId) { console.error("No company_id in checkout metadata"); break; }

        const subscriptionId = typeof session.subscription === "string" ? session.subscription : (session.subscription as any)?.id;
        const customerId = typeof session.customer === "string" ? session.customer : (session.customer as any)?.id;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const item = subscription.items.data.find((i) => KNOWN_PRICES.includes(i.price.id));
          const seats = item?.quantity || 0;
          const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

          await supabase.from("companies").update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_subscription_item_id: item?.id || null,
            subscription_status: subscription.status === "active" ? "active" : subscription.status,
            subscription_price_id: item?.price.id || null,
            seats,
            current_period_end: periodEnd,
            cancel_at_period_end: subscription.cancel_at_period_end,
            livemode: event.livemode,
          }).eq("id", companyId);

          // Reconcile licenses
          await reconcileLicenses(supabase, companyId, seats, subscriptionId, item?.id || null, periodEnd, priceToInterval(item?.price.id));
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : (subscription.customer as any)?.id;
        const item = subscription.items.data.find((i) => KNOWN_PRICES.includes(i.price.id));
        const seats = item?.quantity || 0;
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        const { error: updateError } = await supabase.from("companies").update({
          stripe_subscription_id: subscription.id,
          stripe_subscription_item_id: item?.id || null,
          subscription_price_id: item?.price.id || null,
          seats,
          current_period_end: periodEnd,
          cancel_at_period_end: subscription.cancel_at_period_end,
          subscription_status: subscription.status,
          livemode: event.livemode,
        }).eq("stripe_customer_id", customerId);

        if (updateError) {
          console.error("Error updating subscription:", updateError);
          return new Response(JSON.stringify({ error: "DB update failed" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get company_id for license reconciliation
        const { data: comp } = await supabase.from("companies").select("id").eq("stripe_customer_id", customerId).maybeSingle();
        if (comp) {
          await reconcileLicenses(supabase, comp.id, seats, subscription.id, item?.id || null, periodEnd, priceToInterval(item?.price.id));
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : (subscription.customer as any)?.id;

        await supabase.from("companies").update({
          subscription_status: "canceled",
          cancel_at_period_end: false,
        }).eq("stripe_customer_id", customerId);

        // Expire all licenses
        const { data: comp } = await supabase.from("companies").select("id").eq("stripe_customer_id", customerId).maybeSingle();
        if (comp) {
          await supabase.from("licenses").update({ status: "expired", assigned_user_id: null }).eq("company_id", comp.id).in("status", ["available", "assigned"]);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as any)?.id;
        await supabase.from("companies").update({ subscription_status: "past_due" }).eq("stripe_customer_id", customerId);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as any)?.id;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription as any)?.id;

        const updateData: Record<string, unknown> = { subscription_status: "active" };

        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
            updateData.current_period_end = periodEnd;

            // Reconcile licenses on successful payment
            const { data: comp } = await supabase.from("companies").select("id").eq("stripe_customer_id", customerId).maybeSingle();
            if (comp) {
              const item = sub.items.data.find((i) => KNOWN_PRICES.includes(i.price.id));
              await reconcileLicenses(supabase, comp.id, item?.quantity || 0, subscriptionId, item?.id || null, periodEnd, priceToInterval(item?.price.id));
            }
          } catch (e) {
            console.warn("Could not fetch subscription for period end refresh:", e);
          }
        }

        await supabase.from("companies").update(updateData).eq("stripe_customer_id", customerId);
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
