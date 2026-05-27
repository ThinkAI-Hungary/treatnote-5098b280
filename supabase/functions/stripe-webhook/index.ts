import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

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
    console.error(`Számlázz.hu: max attempts (${MAX_SZAMLA_ATTEMPTS}) reached for ${stripeInvoiceId}.`);
    await supabase.from("szamlazz_invoices").update({
      status: "skipped",
      last_error: `Max ${MAX_SZAMLA_ATTEMPTS} attempts reached. Manual review required.`,
    }).eq("id", existing.id);
    return;
  }

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

      // ── Checkout session completed (for one-off fallback payments) ──────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.type === "invoice_payment" || session.metadata?.company_id) {
          const companyId = session.metadata.company_id;
          await supabase.from("companies").update({
            payment_status: "ok",
            is_locked: false,
          }).eq("id", companyId);
          console.log(`Checkout session completed for company ${companyId} – marked as ok`);
        }
        break;
      }

      // ── Sikeres fizetés: felold + Számlázz.hu ───────────────────────────
      case "invoice.payment_succeeded":
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as any)?.id;

        // Fiók feloldása és payment_status visszaállítása
        await supabase.from("companies").update({
          payment_status: "ok",
          is_locked: false,
        }).eq("stripe_customer_id", customerId);

        // Számlázz.hu integráció
        if ((invoice as any).amount_paid > 0) {
          try {
            const { data: companyRow } = await supabase
              .from("companies")
              .select("id")
              .eq("stripe_customer_id", customerId)
              .maybeSingle();
            const customerObj = await stripe.customers.retrieve(customerId, { expand: ["tax_ids"] });
            if (!customerObj.deleted) {
              await generateSzamlazzHuInvoice(
                supabase,
                invoice,
                customerObj as Stripe.Customer,
                companyRow?.id ?? null
              );
            }
          } catch (err) {
            console.error("Failed to execute Számlázz.hu integration:", err);
          }
        }
        break;
      }

      // ── Sikertelen fizetés: overdue státusz ─────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as any)?.id;
        await supabase.from("companies").update({
          payment_status: "overdue",
        }).eq("stripe_customer_id", customerId);
        console.log(`Payment failed for customer ${customerId} – marked as overdue`);
        break;
      }

      // ── Előfizetés törölve ───────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : (subscription.customer as any)?.id;
        await supabase.from("companies").update({
          subscription_status: "canceled",
          cancel_at_period_end: false,
        }).eq("stripe_customer_id", customerId);
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
