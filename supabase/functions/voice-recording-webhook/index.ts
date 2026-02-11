import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Clean up stale jobs (processing for more than 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    const { data: staleJobs } = await supabaseAdmin
      .from('voice_jobs')
      .delete()
      .eq('status', 'processing')
      .lt('created_at', tenMinutesAgo)
      .select('id');
    
    if (staleJobs && staleJobs.length > 0) {
      console.log(`Cleaned up ${staleJobs.length} stale jobs`);
    }

    // Check if user already has a processing job (that's not stale)
    if (userId) {
      const { data: activeJob } = await supabaseAdmin
        .from('voice_jobs')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'processing')
        .maybeSingle();

      if (activeJob) {
        return new Response(
          JSON.stringify({ 
            error: "Már fut egy feldolgozás. Kérjük, várjon amíg befejeződik.",
            active_job_id: activeJob.id 
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

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

    // Get webhook URL based on mode
    let webhookUrl: string | undefined;
    
    if (mode === "voxis") {
      webhookUrl = Deno.env.get("N8N_VOXIS_WEBHOOK_URL");
    } else if (mode === "treatnote") {
      webhookUrl = Deno.env.get("N8N_TREATNOTE_WEBHOOK_URL");
    } else if (mode === "ambulans") {
      webhookUrl = Deno.env.get("TREATNOTE_AMBULANSLAP");
    }

    if (!webhookUrl) {
      // Mark job as error if no webhook URL
      await supabaseAdmin
        .from('voice_jobs')
        .update({ status: 'error', error: `No webhook URL configured for mode: ${mode}`, completed_at: new Date().toISOString() })
        .eq('id', jobId);
      
      return new Response(
        JSON.stringify({ error: `No webhook URL configured for mode: ${mode}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build FormData for n8n
    const webhookFormData = new FormData();
    webhookFormData.append("data", audio, finalFilename);
    webhookFormData.append("mode", mode);
    webhookFormData.append("timestamp", timestamp || new Date().toISOString());
    webhookFormData.append("user_id", userId);
    webhookFormData.append("company_id", companyId);
    webhookFormData.append("telephely_id", telephelyId);
    webhookFormData.append("flexi_domain", flexiDomain);
    webhookFormData.append("flexi_username", flexiUsername);
    webhookFormData.append("flexi_pw", decryptedFlexiPw);
    webhookFormData.append("szabalyok", JSON.stringify(szabalyokData));
    webhookFormData.append("PaciensID", paciensId);
    
    if (mode === "treatnote" && treatmentRulesData.length > 0) {
      webhookFormData.append("treatment_rules", JSON.stringify(treatmentRulesData));
    }

    console.log(`[Job ${jobId}] Sending audio to webhook: ${webhookUrl}`);
    
    // Process webhook in the background using EdgeRuntime.waitUntil
    // This allows the edge function to return immediately without timing out
    const backgroundProcessing = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300000); // 5 min timeout
        
        const response = await fetch(webhookUrl, {
          method: "POST",
          body: webhookFormData,
          signal: controller.signal,
        });
        
        clearTimeout(timeout);

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
      } catch (webhookError) {
        console.error(`[Job ${jobId}] Webhook error:`, webhookError);
        
        const errorMessage = webhookError instanceof Error ? webhookError.message : 'Unknown webhook error';
        await supabaseAdmin
          .from('voice_jobs')
          .update({
            status: 'error',
            error: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      }
    })();

    // Use EdgeRuntime.waitUntil to process in background
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundProcessing);
    } else {
      // Fallback: await directly (shouldn't happen in production)
      await backgroundProcessing;
    }

    // Return immediately to frontend
    return new Response(
      JSON.stringify({ 
        success: true, 
        job_id: jobId,
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
