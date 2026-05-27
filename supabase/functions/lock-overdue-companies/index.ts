import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Azok a company-k, akiknek payment_status = 'overdue' ÉS még nincs lezárva
    const { data: overdueCompanies, error } = await supabase
      .from("companies")
      .select("id, name, last_invoice_period")
      .eq("payment_status", "overdue")
      .eq("is_locked", false)
      .eq("is_active", true);

    if (error) {
      console.error("DB error:", error);
      return new Response(JSON.stringify({ error: "DB hiba" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!overdueCompanies || overdueCompanies.length === 0) {
      return new Response(
        JSON.stringify({ success: true, locked_count: 0, message: "Nincs zárolható company" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ids = overdueCompanies.map((c) => c.id);
    const { error: updateError } = await supabase
      .from("companies")
      .update({ is_locked: true })
      .in("id", ids);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: "Zárolás sikertelen" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Locked ${ids.length} companies for non-payment:`, ids);

    return new Response(
      JSON.stringify({ success: true, locked_count: ids.length, locked_companies: overdueCompanies.map((c) => ({ id: c.id, name: c.name, period: c.last_invoice_period })) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in lock-overdue-companies:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Ismeretlen hiba" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
