import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookUrl = Deno.env.get("N8N_SZOTAR_VALIDATOR_WEBHOOK_URL");

    if (!webhookUrl) {
      throw new Error("Webhook URL not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { telephely_id, company_id, user_id, regenerate } = await req.json();

    if (!telephely_id || !company_id || !user_id) {
      throw new Error("Missing required fields: telephely_id, company_id, user_id");
    }

    // Check if szotar already exists
    const { data: existingSzotar } = await supabase
      .from('szotar')
      .select('id')
      .eq('telephely_id', telephely_id)
      .maybeSingle();
    
    const szotar_exists = !!existingSzotar;

    // Fetch flexi credentials for the user
    const { data: flexiAuth, error: flexiError } = await supabase
      .from('flexi_auth')
      .select('flexi_username, flexi_pw')
      .eq('user_id', user_id)
      .maybeSingle();

    if (flexiError) {
      console.error('Error fetching flexi auth:', flexiError);
    }

    // Fetch treatment_rules and related data for this telephely
    const { data: rules, error: rulesError } = await supabase
      .from('treatment_rules')
      .select(`
        id,
        name,
        category,
        trigger_words,
        rule_visits (
          id,
          visit_number,
          duration_days,
          healing_months,
          rule_items (
            id,
            name,
            quantity,
            unit,
            scaling,
            target_tooth_type
          )
        )
      `)
      .eq('clinic_id', telephely_id);

    if (rulesError) {
      console.error('Error fetching rules:', rulesError);
      throw new Error('Failed to fetch treatment rules');
    }

    // Fetch szabályok PDF data
    const { data: pdfData, error: pdfError } = await supabase
      .from('feltoltott_pdf')
      .select('id, file_name, fogalom')
      .eq('company_id', company_id)
      .eq('telephely_id', telephely_id);

    if (pdfError) {
      console.error('Error fetching PDF data:', pdfError);
    }

    // Prepare payload for n8n
    const payload = {
      telephely_id,
      company_id,
      user_id,
      regenerate,
      szotar_exists,
      flexi_credentials: flexiAuth ? {
        username: flexiAuth.flexi_username,
        password: flexiAuth.flexi_pw,
      } : null,
      treatment_rules: rules || [],
      szabalyok_pdf: pdfData || [],
      callback_url: `${supabaseUrl}/functions/v1/szotar-callback`,
    };

    console.log('Sending payload to n8n:', JSON.stringify(payload, null, 2));

    // Send to n8n webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('Webhook error:', errorText);
      throw new Error(`Webhook returned ${webhookResponse.status}: ${errorText}`);
    }

    const responseData = await webhookResponse.json();
    console.log('Webhook response:', responseData);

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook triggered successfully' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
