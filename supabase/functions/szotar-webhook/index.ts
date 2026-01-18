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
    // Primary webhook URL for Szótár generation
    const webhookUrl = "https://n8n.thinkaimedical.hu/webhook/03341c53-31f6-4ada-85fc-465984a62c62";
    const encryptionKey = Deno.env.get("FLEXI_ENCRYPTION_KEY");


    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { telephely_id, company_id, user_id, regenerate } = await req.json();

    if (!telephely_id || !company_id || !user_id) {
      throw new Error("Missing required fields: telephely_id, company_id, user_id");
    }

    // Fetch telephely data including probapaciens_neve and flexi_domain
    const { data: telephelyData, error: telephelyError } = await supabase
      .from('telephely')
      .select('probapaciens_neve, flexi_domain')
      .eq('id', telephely_id)
      .maybeSingle();
    
    if (telephelyError) {
      console.error('Error fetching telephely:', telephelyError);
    }

    const probapaciens_neve = telephelyData?.probapaciens_neve || null;
    const flexi_domain = telephelyData?.flexi_domain || null;

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

    // Decrypt password using AES-GCM (same as encryption in flexi-connect)
    let decryptedPassword: string | null = null;
    if (flexiAuth?.flexi_pw && encryptionKey) {
      try {
        // Decode the base64 encrypted data (IV + ciphertext + auth tag)
        const combined = Uint8Array.from(atob(flexiAuth.flexi_pw), c => c.charCodeAt(0));
        
        // First 12 bytes are IV (as used in AES-GCM encryption)
        const iv = combined.slice(0, 12);
        const encryptedData = combined.slice(12);
        
        // Decode the base64 key
        const keyData = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));
        
        // Import the key for AES-GCM decryption
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyData,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
        
        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          encryptedData
        );
        
        decryptedPassword = new TextDecoder().decode(decrypted);
        console.log('Password decrypted successfully');
      } catch (decryptError) {
        console.error('Error decrypting password:', decryptError);
        // Don't fall back to plain text - encryption is required
        decryptedPassword = null;
      }
    } else if (flexiAuth?.flexi_pw) {
      // No encryption key configured
      console.error('FLEXI_ENCRYPTION_KEY not configured');
      decryptedPassword = null;
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
      probapaciens_neve,
      flexi_domain,
      flexi_email: flexiAuth?.flexi_username || null,
      flexi_password: decryptedPassword,
      treatment_rules: rules || [],
      szabalyok_pdf: pdfData || [],
      callback_url: `${supabaseUrl}/functions/v1/szotar-callback`,
    };

    console.log('Sending payload to n8n webhook:', JSON.stringify(payload, null, 2));

    // Send to webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webhook error:', errorText);
      throw new Error(`Webhook failed: ${errorText}`);
    }

    const data = await response.json();
    console.log('Webhook response:', data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook triggered successfully',
        data
      }),
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
