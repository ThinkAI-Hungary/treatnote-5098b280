import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AES-256-GCM decryption using Web Crypto API
async function decryptPassword(encryptedBase64: string, keyBase64: string): Promise<string> {
  const decoder = new TextDecoder();
  const keyData = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );
  return decoder.decode(decryptedData);
}

interface WebhookPayload {
  audio: File;
  mode: string;
  timestamp: string;
  filename: string;
  userId: string;
  companyId: string;
  telephelyId: string;
  paciensId: string;
  flexiDomain: string;
  flexiUsername: string;
  decryptedFlexiPw: string;
  szabalyokData: Array<{fogalom: string | null; file_name: string; raw_json: unknown}>;
  treatmentRulesData: unknown[];
  durationSeconds: number;
}

async function processWebhookInBackground(
  payload: WebhookPayload,
  jobId: string,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Get webhook URL based on mode
    let webhookUrl: string | undefined;
    
    if (payload.mode === "voxis") {
      webhookUrl = Deno.env.get("N8N_VOXIS_WEBHOOK_URL");
    } else if (payload.mode === "treatnote") {
      webhookUrl = Deno.env.get("N8N_TREATNOTE_WEBHOOK_URL");
    } else if (payload.mode === "ambulans") {
      webhookUrl = Deno.env.get("TREATNOTE_AMBULANSLAP");
    }

    if (!webhookUrl) {
      throw new Error(`No webhook URL configured for mode: ${payload.mode}`);
    }

    // Build FormData for n8n
    const webhookFormData = new FormData();
    webhookFormData.append("data", payload.audio, payload.filename);
    webhookFormData.append("mode", payload.mode);
    webhookFormData.append("timestamp", payload.timestamp);
    webhookFormData.append("user_id", payload.userId);
    webhookFormData.append("company_id", payload.companyId);
    webhookFormData.append("telephely_id", payload.telephelyId);
    webhookFormData.append("flexi_domain", payload.flexiDomain);
    webhookFormData.append("flexi_username", payload.flexiUsername);
    webhookFormData.append("flexi_pw", payload.decryptedFlexiPw);
    webhookFormData.append("szabalyok", JSON.stringify(payload.szabalyokData));
    webhookFormData.append("PaciensID", payload.paciensId);
    
    if (payload.mode === "treatnote" && payload.treatmentRulesData.length > 0) {
      webhookFormData.append("treatment_rules", JSON.stringify(payload.treatmentRulesData));
    }

    console.log(`[Job ${jobId}] Sending audio to webhook: ${webhookUrl}`);
    
    const response = await fetch(webhookUrl, {
      method: "POST",
      body: webhookFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook failed: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    console.log(`[Job ${jobId}] Webhook response (first 500 chars):`, responseText.substring(0, 500));
    
    let resultData: unknown;
    try {
      resultData = JSON.parse(responseText);
    } catch {
      resultData = { szoveges_lista: responseText };
    }

    // Update job with success
    await supabaseAdmin
      .from('voice_jobs')
      .update({
        status: 'completed',
        result: resultData,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    console.log(`[Job ${jobId}] Completed successfully`);
  } catch (error) {
    console.error(`[Job ${jobId}] Error:`, error);
    
    // Update job with error
    await supabaseAdmin
      .from('voice_jobs')
      .update({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const encryptionKey = Deno.env.get('FLEXI_ENCRYPTION_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const formData = await req.formData();
    const audio = formData.get("audio") as File;
    const mode = formData.get("mode") as string;
    const timestamp = formData.get("timestamp") as string;
    const filename = formData.get("filename") as string;
    const userId = formData.get("user_id") as string;
    const companyId = formData.get("company_id") as string;
    const telephelyId = formData.get("telephely_id") as string;
    const paciensId = formData.get("PaciensID") as string;

    if (!audio || !mode) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: audio and mode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch flexi credentials
    let flexiUsername = "";
    let decryptedFlexiPw = "";
    
    if (userId) {
      const { data: flexiData } = await supabaseAdmin
        .from('flexi_auth')
        .select('flexi_username, flexi_pw')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (flexiData) {
        flexiUsername = flexiData.flexi_username || "";
        if (flexiData.flexi_pw && encryptionKey) {
          try {
            decryptedFlexiPw = await decryptPassword(flexiData.flexi_pw, encryptionKey);
          } catch (decryptError) {
            console.error("Failed to decrypt Flexi password:", decryptError);
          }
        }
      }
    }

    // Fetch szabályok and flexi_domain
    let szabalyokData: Array<{fogalom: string | null; file_name: string; raw_json: unknown}> = [];
    let flexiDomain = "";
    let treatmentRulesData: unknown[] = [];

    if (companyId && telephelyId) {
      // Fetch telephely to get flexi_domain
      const { data: telephelyData } = await supabaseAdmin
        .from('telephely')
        .select('flexi_domain')
        .eq('id', telephelyId)
        .maybeSingle();
      
      if (telephelyData) {
        flexiDomain = telephelyData.flexi_domain || "";
      }
      
      const { data: szabalyok } = await supabaseAdmin
        .from('feltoltott_pdf')
        .select(`
          id,
          file_name,
          fogalom,
          pdf_extractions (
            raw_json,
            status
          )
        `)
        .eq('company_id', companyId)
        .eq('telephely_id', telephelyId)
        .eq('webhook_status', 'feldolgozva');

      if (szabalyok) {
        szabalyokData = szabalyok.map((pdf: any) => ({
          fogalom: pdf.fogalom,
          file_name: pdf.file_name,
          raw_json: pdf.pdf_extractions?.[0]?.raw_json || null
        }));
      }

      // Fetch treatment_rules for TreatNote mode
      if (mode === "treatnote") {
        const { data: rules } = await supabaseAdmin
          .from('treatment_rules')
          .select(`
            id,
            name,
            category,
            trigger_words,
            rule_visits (
              id,
              visit_number,
              display_order,
              duration_days,
              healing_months,
              rule_items (
                id,
                name,
                quantity,
                unit,
                scaling,
                target_tooth_type,
                display_order
              )
            )
          `)
          .eq('clinic_id', telephelyId);

        if (rules) {
          treatmentRulesData = rules;
        }
      }
    }

    const finalFilename = filename || audio.name;
    
    // Estimate duration from audio size (rough estimate: ~16KB/s for webm)
    const estimatedDuration = Math.round(audio.size / 16000);

    // Create job record
    const { data: jobData, error: jobError } = await supabaseAdmin
      .from('voice_jobs')
      .insert({
        user_id: userId,
        company_id: companyId || null,
        telephely_id: telephelyId || null,
        mode,
        paciens_id: paciensId || null,
        status: 'processing',
        audio_filename: finalFilename,
        duration_seconds: estimatedDuration,
      })
      .select('id')
      .single();

    if (jobError || !jobData) {
      console.error("Failed to create job:", jobError);
      return new Response(
        JSON.stringify({ error: "Failed to create job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jobId = jobData.id;
    console.log(`Created job ${jobId} for mode: ${mode}, user: ${userId}`);

    // Process webhook in background using EdgeRuntime.waitUntil
    const payload: WebhookPayload = {
      audio,
      mode,
      timestamp: timestamp || new Date().toISOString(),
      filename: finalFilename,
      userId,
      companyId,
      telephelyId,
      paciensId,
      flexiDomain,
      flexiUsername,
      decryptedFlexiPw,
      szabalyokData,
      treatmentRulesData,
      durationSeconds: estimatedDuration,
    };

    EdgeRuntime.waitUntil(
      processWebhookInBackground(payload, jobId, supabaseUrl, supabaseServiceKey)
    );

    // Return immediately with job_id
    return new Response(
      JSON.stringify({ 
        success: true, 
        job_id: jobId,
        message: "Voice recording job created, processing in background" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in voice-recording-webhook function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
