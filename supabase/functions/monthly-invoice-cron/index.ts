import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Lekéri a company admin emailjét a profiles táblából */
async function getCompanyAdminEmail(
  supabase: ReturnType<typeof createClient>,
  companyId: string
): Promise<string | null> {
  // Először klinika_admin-t keresünk, ha nincs, az első tagot
  const { data } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  if (!data?.user_id) return null;

  const { data: authUser } = await supabase.auth.admin.getUserById(data.user_id);
  return authUser?.user?.email || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const processingPriceId = Deno.env.get("STRIPE_PROCESSING_PRICE_ID")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

    // Az előző hónap időszaka
    const now = new Date();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodLabel = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, "0")}`;

    console.log(`Generating invoices for period: ${periodLabel}`);

    // Összes aktív company lekérése (stripe_customer_id nélküliek is – auto-létrehozzuk)
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name, display_name, stripe_customer_id, last_invoice_period, last_invoice_stripe_id")
      .eq("is_active", true);

    if (companiesError) {
      console.error("Failed to fetch companies:", companiesError);
      return new Response(JSON.stringify({ error: "DB hiba" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: { company_id: string; status: string; count?: number; invoice_id?: string; error?: string }[] = [];

    for (const company of (companies || [])) {
      // Idempotency: ne állítsuk ki kétszer ugyanarra a hónapra
      if (company.last_invoice_period === periodLabel) {
        results.push({ company_id: company.id, status: "already_invoiced" });
        continue;
      }

      // Auto-létrehozzuk a Stripe Customer-t ha még nincs
      let customerId: string = company.stripe_customer_id;
      if (!customerId) {
        try {
          const adminEmail = await getCompanyAdminEmail(supabase, company.id);
          const customer = await stripe.customers.create({
            name: company.display_name || company.name,
            email: adminEmail || undefined,
            metadata: { company_id: company.id, company_name: company.name },
          });
          customerId = customer.id;
          await supabase.from("companies").update({ stripe_customer_id: customerId }).eq("id", company.id);
          console.log(`Created Stripe customer ${customerId} for company ${company.id}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ company_id: company.id, status: "customer_create_error", error: msg });
          continue;
        }
      }

      // Futásszám az előző hónapban
      const { count, error: countError } = await supabase
        .from("processing_usage")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company.id)
        .gte("created_at", prevMonthStart.toISOString())
        .lt("created_at", prevMonthEnd.toISOString());

      if (countError) {
        results.push({ company_id: company.id, status: "error", error: "count hiba: " + countError.message });
        continue;
      }

      if (!count || count === 0) {
        // Nincs felhasználás – nem számlázunk, de frissítjük a periódust
        await supabase.from("companies").update({ last_invoice_period: periodLabel }).eq("id", company.id);
        results.push({ company_id: company.id, status: "skipped_zero_usage", count: 0 });
        continue;
      }

      try {
        // Ha van korábbi kiállított számla, azt érvénytelenítjük (void), hogy ne halmozódjon
        if (company.last_invoice_stripe_id) {
          try {
            await stripe.invoices.voidInvoice(company.last_invoice_stripe_id);
            console.log(`Voided previous invoice ${company.last_invoice_stripe_id}`);
          } catch (voidErr) {
            console.warn(`Could not void invoice ${company.last_invoice_stripe_id}:`, voidErr);
          }
        }

        // Stripe Invoice létrehozás
        const invoice = await stripe.invoices.create({
          customer: customerId,
          currency: "eur",
          auto_advance: false,
          description: `TreatNote feldolgozások – ${periodLabel} (${count} futás × 1 EUR)`,
          metadata: {
            company_id: company.id,
            period: periodLabel,
            processing_count: String(count),
          },
        });

        // Invoice item hozzáadása
        await stripe.invoiceItems.create({
          customer: customerId,
          invoice: invoice.id,
          quantity: count,
          currency: "eur",
          unit_amount: 1 * 100, // 1 EUR in subunits (cents)
          description: `AI feldolgozások (${periodLabel}): ${count} db × 1 EUR`,
        });

        // Véglegesítés – Stripe automatikusan megpróbálja leterhelni a mentett kártyát
        const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, {
          auto_advance: true,
        });

        // DB frissítés
        await supabase.from("companies").update({
          last_invoice_period: periodLabel,
          last_invoice_stripe_id: finalizedInvoice.id,
          payment_status: "overdue", // fizetésig overdue státusz
        }).eq("id", company.id);

        results.push({ company_id: company.id, status: "invoiced", count, invoice_id: finalizedInvoice.id });
        console.log(`Invoice created for company ${company.id}: ${finalizedInvoice.id} (${count} runs)`);
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error(`Stripe error for company ${company.id}:`, msg);
        results.push({ company_id: company.id, status: "stripe_error", error: msg });
      }
    }

    return new Response(
      JSON.stringify({ success: true, period: periodLabel, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in monthly-invoice-cron:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Ismeretlen hiba" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
