import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const MONTHLY_PRICE_ID = "price_1TABODDG9IVOU80sYHim2VsD";
// Yearly licenses are no longer supported. YEARLY_PRICE_ID kept as a constant only to
// allow graceful handling of any stray Stripe events, but is excluded from KNOWN_PRICES.
const YEARLY_PRICE_ID = "price_1SzFbZDG9IVOU80soy18oPwM";
const KNOWN_PRICES = [MONTHLY_PRICE_ID];

function priceToInterval(priceId: string | null | undefined): string {
  return priceId === YEARLY_PRICE_ID ? "yearly" : "monthly";
}

// ─── Számlázz.hu Integration Helpers ──────────────────────────

function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/** Fetch the current MNB (Hungarian National Bank) exchange rate for a currency to HUF. */
async function fetchMnbRate(currency: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${currency}&to=HUF`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.rates?.HUF ?? null;
  } catch {
    return null;
  }
}

/** Extract a tag value from simple XML response. */
function extractXmlTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return match ? match[1].trim() : "";
}

const MAX_SZAMLA_ATTEMPTS = 5;

async function generateSzamlazzHuInvoice(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice,
  customer: Stripe.Customer,
  companyId: string | null
) {
  const agentKey = Deno.env.get("SZAMLA_AGENT_KEY");
  if (!agentKey) {
    console.warn("SZAMLA_AGENT_KEY is missing, skipping Számlázz.hu integration.");
    return;
  }

  const stripeInvoiceId = invoice.id;

  // ── Idempotency check ───────────────────────────────────────
  const { data: existing } = await supabase
    .from("szamlazz_invoices")
    .select("id, status, attempt_count")
    .eq("stripe_invoice_id", stripeInvoiceId)
    .maybeSingle();

  if (existing?.status === "success") {
    console.log(`Számlázz.hu invoice already generated for ${stripeInvoiceId}, skipping.`);
    return;
  }

  if (existing && existing.attempt_count >= MAX_SZAMLA_ATTEMPTS) {
    console.error(`Számlázz.hu: max attempts (${MAX_SZAMLA_ATTEMPTS}) reached for ${stripeInvoiceId}. Manual intervention required.`);
    await supabase.from("szamlazz_invoices").update({
      status: "skipped",
      last_error: `Max ${MAX_SZAMLA_ATTEMPTS} attempts reached. Manual review required.`,
    }).eq("id", existing.id);
    return;
  }

  // ── Upsert pending record ────────────────────────────────────
  const newAttemptCount = (existing?.attempt_count ?? 0) + 1;
  let recordId: string;

  if (existing) {
    await supabase.from("szamlazz_invoices").update({
      status: "pending",
      attempt_count: newAttemptCount,
    }).eq("id", existing.id);
    recordId = existing.id;
  } else {
    const { data: inserted } = await supabase.from("szamlazz_invoices").insert({
      stripe_invoice_id: stripeInvoiceId,
      stripe_customer_id: customer.id,
      company_id: companyId,
      status: "pending",
      attempt_count: 1,
    }).select("id").single();
    recordId = inserted?.id;
  }

  // ── Guard: require complete address ─────────────────────────
  const address = customer.address || customer.shipping?.address;
  if (!address?.city || !address?.postal_code || !address?.line1) {
    console.warn(`Customer ${customer.id} missing complete address, skipping invoice.`);
    await supabase.from("szamlazz_invoices").update({
      status: "skipped",
      last_error: "Customer address incomplete.",
    }).eq("id", recordId);
    return;
  }

  const name = customer.name || "Unknown Customer";
  const email = customer.email;

  let taxIdStr = "";
  if (customer.tax_ids && customer.tax_ids.data.length > 0) {
    taxIdStr = customer.tax_ids.data[0].value;
  }

  const ccy = invoice.currency.toUpperCase();
  const isZeroDecimal = ["HUF", "JPY"].includes(ccy);
  const div = isZeroDecimal ? 1 : 100;

  // ── Exchange rate for non-HUF invoices ──────────────────────
  let exchangeRateXml = "";
  if (ccy !== "HUF") {
    const rate = await fetchMnbRate(ccy);
    if (!rate) {
      await supabase.from("szamlazz_invoices").update({
        status: "failed",
        last_error: `Could not fetch MNB exchange rate for ${ccy}.`,
      }).eq("id", recordId);
      return;
    }
    exchangeRateXml = `<arfolyamBank>MNB</arfolyamBank><arfolyam>${rate.toFixed(4)}</arfolyam>`;
  }

  const today = new Date().toISOString().split("T")[0];
  const paymentDate = new Date(invoice.created * 1000).toISOString().split("T")[0];

  // ── Build line items ─────────────────────────────────────────
  let itemsXml = "";
  for (const line of invoice.lines.data) {
    const grossPrice = line.amount / div;
    let taxAmount = 0;
    if (line.tax_amounts && line.tax_amounts.length > 0) {
      taxAmount = line.tax_amounts.reduce((sum, t) => sum + t.amount, 0) / div;
    }
    const netPrice = +(grossPrice - taxAmount).toFixed(2);
    const quantity = line.quantity || 1;
    const nettoEgysegar = +(netPrice / quantity).toFixed(2);
    const nettoErtek = +(nettoEgysegar * quantity).toFixed(2);
    const afaErtek = +(grossPrice - nettoErtek).toFixed(2);
    const bruttoErtek = +(nettoErtek + afaErtek).toFixed(2);

    let afakulcs = "AAM";
    if (taxAmount > 0) {
      const calculatedRate = Math.round((afaErtek / nettoErtek) * 100);
      afakulcs = calculatedRate.toString();
    }

    itemsXml += `
        <tetel>
            <megnevezes>${escapeXml(line.description || "Szolgáltatás")}</megnevezes>
            <mennyiseg>${quantity}</mennyiseg>
            <mennyisegiEgyseg>db</mennyisegiEgyseg>
            <nettoEgysegar>${nettoEgysegar.toFixed(2)}</nettoEgysegar>
            <afakulcs>${afakulcs}</afakulcs>
            <nettoErtek>${nettoErtek.toFixed(2)}</nettoErtek>
            <afaErtek>${afaErtek.toFixed(2)}</afaErtek>
            <bruttoErtek>${bruttoErtek.toFixed(2)}</bruttoErtek>
        </tetel>`;
  }

  // ── Build XML ────────────────────────────────────────────────
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">
    <beallitasok>
        <szamlaagentkulcs>${escapeXml(agentKey)}</szamlaagentkulcs>
        <eszamla>true</eszamla>
        <szamlaLetoltes>false</szamlaLetoltes>
        <valaszVerzio>2</valaszVerzio>
        <szamlaKulsoAzon>${escapeXml(stripeInvoiceId)}</szamlaKulsoAzon>
    </beallitasok>
    <fejlec>
        <keltDatum>${today}</keltDatum>
        <teljesitesDatum>${paymentDate}</teljesitesDatum>
        <fizetesiHataridoDatum>${paymentDate}</fizetesiHataridoDatum>
        <fizmod>Bankkártya</fizmod>
        <penznem>${ccy}</penznem>
        <szamlaNyelve>hu</szamlaNyelve>
        <megjegyzes>Stripe befizetés: ${escapeXml(stripeInvoiceId)}</megjegyzes>
        ${exchangeRateXml}
        <elolegszamla>false</elolegszamla>
        <vegszamla>false</vegszamla>
        <helyesbitoszamla>false</helyesbitoszamla>
        <dijbekero>false</dijbekero>
    </fejlec>
    <elado>
        <bank>Magyar Nemzeti Bank</bank>
        <bankszamlaszam>120428470211053700100008</bankszamlaszam>
    </elado>
    <vevo>
        <nev>${escapeXml(name)}</nev>
        <irsz>${escapeXml(address.postal_code)}</irsz>
        <telepules>${escapeXml(address.city)}</telepules>
        <cim>${escapeXml(address.line1)} ${escapeXml(address.line2 || "")}</cim>
        ${email ? `<email>${escapeXml(email)}</email>` : ""}
        <sendEmail>true</sendEmail>
        ${taxIdStr ? `<adoszam>${escapeXml(taxIdStr)}</adoszam>` : ""}
    </vevo>
    <tetelek>${itemsXml}</tetelek>
</xmlszamla>`;

  // ── Send to Számlázz.hu ──────────────────────────────────────
  try {
    const formData = new FormData();
    const blob = new Blob([xml], { type: "text/xml" });
    formData.append("action-xmlagentxmlfile", blob, "invoice.xml");

    const res = await fetch("https://www.szamlazz.hu/szamla/", {
      method: "POST",
      body: formData,
    });

    const responseText = await res.text();
    const errorCode = res.headers.get("szamlaagenterrorcode");

    if (errorCode && errorCode.trim() !== "") {
      console.error(`Számlázz.hu Error (${errorCode}): ${responseText}`);
      await supabase.from("szamlazz_invoices").update({
        status: "failed",
        last_error: `Error code ${errorCode}: ${responseText.slice(0, 500)}`,
        raw_response: responseText.slice(0, 2000),
        attempt_count: newAttemptCount,
      }).eq("id", recordId);
      return;
    }

    // Parse invoice number from valaszVerzio 2 XML response
    const invoiceNumber = extractXmlTag(responseText, "szamlaszam");

    await supabase.from("szamlazz_invoices").update({
      status: "success",
      szamlazz_invoice_number: invoiceNumber || null,
      raw_response: responseText.slice(0, 2000),
      attempt_count: newAttemptCount,
      last_error: null,
    }).eq("id", recordId);

    console.log(`Számlázz.hu invoice created: ${invoiceNumber || "(number not returned)"}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Failed to send invoice to Számlázz.hu:", errMsg);
    await supabase.from("szamlazz_invoices").update({
      status: "failed",
      last_error: errMsg.slice(0, 500),
      attempt_count: newAttemptCount,
    }).eq("id", recordId);
  }
}

// ─── Active subscriptions helper ──────────────────────────────
async function getReconciliationData(stripe: Stripe, customerId: string, telephelyId: string | null | undefined) {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all' });
  const activeSubs = subs.data.filter(s => ['active', 'past_due', 'trialing'].includes(s.status));

  let companyTotalSeats = 0;
  let latestPeriodEnd = new Date().toISOString();
  const telephelyParsedItems: { id: string; priceId: string; quantity: number; subscriptionId: string; periodEnd: string }[] = [];

  for (const s of activeSubs) {
    const subTelephelyId = s.metadata?.telephely_id || null;
    const targetTelephelyId = telephelyId || null;
    const isTargetTelephely = subTelephelyId === targetTelephelyId;

    if (isTargetTelephely) {
      const pEnd = new Date(s.current_period_end * 1000).toISOString();
      if (pEnd > latestPeriodEnd) latestPeriodEnd = pEnd;
    }

    const relevant = s.items.data.filter(i => KNOWN_PRICES.includes(i.price.id));
    for (const i of relevant) {
      const qty = i.quantity || 0;
      companyTotalSeats += qty;

      if (isTargetTelephely) {
        telephelyParsedItems.push({
          id: i.id,
          priceId: i.price.id,
          quantity: qty,
          subscriptionId: s.id,
          periodEnd: new Date(s.current_period_end * 1000).toISOString()
        });
      }
    }
  }
  return { companyTotalSeats, telephelyParsedItems, periodEnd: latestPeriodEnd };
}
// ─── License reconciliation helper ───────────────────────────
async function reconcileLicenses(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  telephelyId: string | null | undefined,
  items: { id: string; priceId: string; quantity: number; subscriptionId: string; periodEnd: string }[],
  fallbackSubscriptionId: string | null, // preserved for backwards compatibility but barely used
  fallbackExpiresAt: string | null
) {
  if (!telephelyId) {
    console.warn("reconcileLicenses skipped: No telephelyId provided in metadata.");
    return;
  }
  const { data: currentLicenses } = await supabase
    .from("licenses")
    .select("id, status, assigned_user_id, billing_interval, stripe_subscription_item_id, license_type")
    .eq("company_id", companyId)
    .eq("telephely_id", telephelyId)
    .in("status", ["available", "assigned"])
    .neq("license_type", "trial")  // Never touch trial licenses during Stripe reconciliation
    .order("created_at", { ascending: true });

  const current = currentLicenses || [];
  const activeItemIds = new Set(items.map((i: any) => i.id));

  // 1. Disable licenses belonging to deleted/missing subscription items
  const orphanedLicenses = current.filter((l: any) =>
    l.stripe_subscription_item_id && !activeItemIds.has(l.stripe_subscription_item_id)
  );

  for (const lic of orphanedLicenses) {
    await supabase.from("licenses").update({ status: "disabled", assigned_user_id: null }).eq("id", lic.id);
  }

  // 2. Pool available (DB) licenses
  const pool = current.filter((l: any) => !l.stripe_subscription_item_id || activeItemIds.has(l.stripe_subscription_item_id));

  // 3. Reconcile PER ITEM
  for (const item of items) {
    const interval = priceToInterval(item.priceId);

    const myLicenses = pool.filter((l: any) => l.stripe_subscription_item_id === item.id);
    let delta = item.quantity - myLicenses.length;

    if (delta > 0) {
      // 3A. First try to steal licenses that have NO stripe item ID
      const nullItems = pool.filter((l: any) => !l.stripe_subscription_item_id && l.billing_interval === interval);
      let stolenCount = 0;
      for (let i = 0; i < Math.min(delta, nullItems.length); i++) {
        const stolen = nullItems[i];
        await supabase.from("licenses").update({
          stripe_subscription_item_id: item.id,
          stripe_subscription_id: item.subscriptionId,
          expires_at: item.periodEnd
        }).eq("id", stolen.id);
        stolen.stripe_subscription_item_id = item.id; // local state update
        myLicenses.push(stolen);
        stolenCount++;
      }
      delta -= stolenCount;
    }

    if (delta > 0) {
      // 3B. If we still need licenses (e.g., brand new Checkout Session bought another monthly),
      // we must steal existing DB licenses of the same interval that were orphaned/ignored because
      // they belong to an OLD item ID that might have been cancelled or replaced.
      const mismatchedItems = pool.filter((l: any) =>
        l.stripe_subscription_item_id !== item.id &&
        l.billing_interval === interval
      );

      let reassignedCount = 0;
      for (let i = 0; i < Math.min(delta, mismatchedItems.length); i++) {
        const stolen = mismatchedItems[i];
        await supabase.from("licenses").update({
          stripe_subscription_item_id: item.id,
          stripe_subscription_id: item.subscriptionId,
          expires_at: item.periodEnd
        }).eq("id", stolen.id);
        stolen.stripe_subscription_item_id = item.id; // local state update
        myLicenses.push(stolen);
        reassignedCount++;
      }
      delta -= reassignedCount;
    }

    if (delta !== 0) {
      await applyDelta(supabase, companyId, telephelyId, delta, myLicenses, item.subscriptionId, item.id, item.periodEnd, interval);
    } else {
      if (myLicenses.length > 0) {
        const ids = myLicenses.map((l: any) => l.id);
        await supabase.from("licenses").update({
          expires_at: item.periodEnd,
          stripe_subscription_id: item.subscriptionId
        }).in("id", ids);
      }
    }
  }

  // 4. Any remaining NULL item_ids should be disabled, because they don't map to Stripe
  const remainingNulls = pool.filter((l: any) => !l.stripe_subscription_item_id);
  for (const lic of remainingNulls) {
    await supabase.from("licenses").update({ status: "disabled", assigned_user_id: null }).eq("id", lic.id);
  }
}

async function applyDelta(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  telephelyId: string | null | undefined,
  delta: number,
  current: any[],
  subscriptionId: string | null,
  subscriptionItemId: string | null,
  expiresAt: string | null,
  billingInterval: string
) {
  if (delta > 0) {
    // Create new licenses
    const newLicenses = Array.from({ length: delta }, () => ({
      company_id: companyId,
      telephely_id: telephelyId || null,
      status: "available",
      stripe_subscription_id: subscriptionId,
      stripe_subscription_item_id: subscriptionItemId,
      expires_at: expiresAt,
      billing_interval: billingInterval,
    }));
    await supabase.from("licenses").insert(newLicenses);

    // Auto-assign to unlicensed company members
    const { data: allLicenses } = await supabase
      .from("licenses")
      .select("assigned_user_id")
      .eq("company_id", companyId)
      .in("status", ["available", "assigned"]);

    const assignedUserIds = (allLicenses || [])
      .map((l: any) => l.assigned_user_id)
      .filter(Boolean);

    const { data: unlicensedUsers } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("company_id", companyId)
      .not("user_id", "in", `(${assignedUserIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)
      .order("created_at", { ascending: true })
      .limit(delta);

    if (unlicensedUsers && unlicensedUsers.length > 0) {
      // Get the newly created available licenses
      const { data: availableLicenses } = await supabase
        .from("licenses")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "available")
        .eq("billing_interval", billingInterval)
        .eq("stripe_subscription_item_id", subscriptionItemId)
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

    // Prioritize removing licenses that belong to this exact subscription item
    const itemLicenses = current.filter(l => l.stripe_subscription_item_id === subscriptionItemId);
    const unassignedItem = itemLicenses.filter(l => l.status === "available" && !l.assigned_user_id);
    const assignedItem = itemLicenses.filter(l => l.status === "assigned" && l.assigned_user_id).reverse();

    // Fallback if needed
    const unassignedAll = current.filter(l => l.status === "available" && !l.assigned_user_id);
    const assignedAll = current.filter(l => l.status === "assigned" && l.assigned_user_id).reverse();

    const poolUnassigned = unassignedItem.length >= toRemove ? unassignedItem : unassignedAll;
    const poolAssigned = assignedItem.length >= toRemove ? assignedItem : assignedAll;

    const fromUnassigned = poolUnassigned.slice(0, toRemove);
    for (const lic of fromUnassigned) {
      // Rather than 'disabled', we actually delete them if they represent pure quantity reductions from Stripe.
      // But TreatNote logic prefers 'disabled' and `assigned_user_id: null`
      await supabase.from("licenses").update({ status: "disabled", stripe_subscription_item_id: null, assigned_user_id: null }).eq("id", lic.id);
    }

    // If still need more, unassign newest assigned
    const remaining = toRemove - fromUnassigned.length;
    if (remaining > 0) {
      for (let i = 0; i < Math.min(remaining, poolAssigned.length); i++) {
        await supabase.from("licenses").update({ status: "disabled", stripe_subscription_item_id: null, assigned_user_id: null }).eq("id", poolAssigned[i].id);
      }
    }
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

          // Just update the company record — license creation is handled exclusively
          // by invoice.payment_succeeded to avoid the triple-reconcile race condition
          // (checkout.session.completed + customer.subscription.updated + invoice.payment_succeeded
          //  all fire near-simultaneously and would each create the same licenses).
          const telephelyId = subscription.metadata?.telephely_id || session.metadata?.telephely_id;
          const { companyTotalSeats: totalSeats, periodEnd } = await getReconciliationData(stripe, customerId, telephelyId);

          await supabase.from("companies").update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: subscription.status === "active" ? "active" : subscription.status,
            seats: totalSeats,
            current_period_end: periodEnd,
            cancel_at_period_end: subscription.cancel_at_period_end,
            livemode: event.livemode,
          }).eq("id", companyId);
          // NOTE: reconcileLicenses is intentionally NOT called here.
          // invoice.payment_succeeded is the single source of truth for license creation.
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const previousAttributes = (event.data as any).previous_attributes ?? {};
        const customerId = typeof subscription.customer === "string" ? subscription.customer : (subscription.customer as any)?.id;
        const telephelyId = subscription.metadata?.telephely_id;

        const { companyTotalSeats: totalSeats, telephelyParsedItems: parsedItems, periodEnd } = await getReconciliationData(stripe, customerId, telephelyId);

        const { error: updateError } = await supabase.from("companies").update({
          stripe_subscription_id: subscription.id,
          seats: totalSeats,
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

        // Only reconcile licenses when subscription item quantities actually changed
        // (e.g. admin used update-seats). Status-only transitions (incomplete → active)
        // are handled by invoice.payment_succeeded, so we must skip reconcile here
        // to avoid the double-create race condition.
        const itemsChanged = previousAttributes.items != null;
        if (itemsChanged) {
          const { data: comp } = await supabase.from("companies").select("id").eq("stripe_customer_id", customerId).maybeSingle();
          if (comp) {
            await reconcileLicenses(supabase, comp.id, telephelyId, parsedItems, subscription.id, periodEnd);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : (subscription.customer as any)?.id;
        const deletedSubId = subscription.id;

        // Check if the customer still has other active subscriptions before marking company as canceled
        const remainingSubs = await stripe.subscriptions.list({ customer: customerId, status: "active" });
        const stillActive = remainingSubs.data.filter((s: Stripe.Subscription) => s.id !== deletedSubId);

        if (stillActive.length === 0) {
          // No other active subscriptions — mark company as canceled
          await supabase.from("companies").update({
            subscription_status: "canceled",
            cancel_at_period_end: false,
          }).eq("stripe_customer_id", customerId);
        } else {
          console.log(`customer.subscription.deleted: sub ${deletedSubId} deleted but ${stillActive.length} other active sub(s) remain. Company stays active.`);
        }

        // Only expire licenses tied to THIS specific subscription — not all licenses for the customer
        const { data: comp } = await supabase.from("companies").select("id").eq("stripe_customer_id", customerId).maybeSingle();
        if (comp) {
          await supabase.from("licenses")
            .update({ status: "expired", assigned_user_id: null })
            .eq("company_id", comp.id)
            .eq("stripe_subscription_id", deletedSubId)
            .in("status", ["available", "assigned"]);
          console.log(`Expired licenses for company ${comp.id} tied to deleted subscription ${deletedSubId}`);
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
              const telephelyId = sub.metadata?.telephely_id;
              const relevantItems = sub.items.data.filter((i) => KNOWN_PRICES.includes(i.price.id));
              const { telephelyParsedItems: parsedItems } = await getReconciliationData(stripe, customerId, telephelyId);
              await reconcileLicenses(supabase, comp.id, telephelyId, parsedItems, subscriptionId, periodEnd);
            }
          } catch (e) {
            console.warn("Could not fetch subscription for period end refresh:", e);
          }
        }

        // --- Execute Számlázz.hu Integration ---
        if (invoice.amount_paid > 0) {
            try {
               const { data: companyRow } = await supabase
                 .from("companies")
                 .select("id")
                 .eq("stripe_customer_id", customerId)
                 .maybeSingle();
               const customerObj = await stripe.customers.retrieve(customerId, { expand: ['tax_ids'] });
               if (!customerObj.deleted) {
                  await generateSzamlazzHuInvoice(
                    supabase,
                    invoice,
                    customerObj as Stripe.Customer,
                    companyRow?.id ?? null
                  );
               }
            } catch (err) {
               console.error("Failed to execute Számlázz.hu integration routine:", err);
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
