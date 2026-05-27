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

    const { job_id, company_id, job_type } = await req.json();

    if (!job_id || !company_id || !job_type) {
      return new Response(
        JSON.stringify({ error: "Hiányzó mezők: job_id, company_id, job_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["ambulans", "voxis", "treatnote"].includes(job_type)) {
      return new Response(
        JSON.stringify({ error: "Érvénytelen job_type. Lehetséges értékek: ambulans, voxis, treatnote" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotency: ne számoljuk kétszer ugyanazt a job-ot
    const { data: existing } = await supabase
      .from("processing_usage")
      .select("id")
      .eq("job_id", job_id)
      .maybeSingle();

    if (existing) {
      // Már rögzítve van, visszaadjuk a havi számot
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count } = await supabase
        .from("processing_usage")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company_id)
        .gte("created_at", monthStart);

      return new Response(
        JSON.stringify({ success: true, already_recorded: true, monthly_count: count ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rögzítjük a feldolgozást
    const { error: insertError } = await supabase
      .from("processing_usage")
      .insert({ company_id, job_id, job_type });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Adatbázis hiba: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Havi összesítés visszaadása
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count } = await supabase
      .from("processing_usage")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company_id)
      .gte("created_at", monthStart);

    return new Response(
      JSON.stringify({ success: true, monthly_count: count ?? 1 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in record-processing-usage:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Ismeretlen hiba" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
