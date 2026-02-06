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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { job_id, status, result, error: errorMessage } = body;

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "Missing job_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Callback] Updating job ${job_id} with status: ${status}`);

    // Update the job with the result
    const updateData: Record<string, unknown> = {
      status: status || 'completed',
      completed_at: new Date().toISOString(),
    };

    if (result) {
      updateData.result = result;
    }

    if (errorMessage) {
      updateData.error = errorMessage;
      updateData.status = 'error';
    }

    const { error: updateError } = await supabaseAdmin
      .from('voice_jobs')
      .update(updateData)
      .eq('id', job_id);

    if (updateError) {
      console.error(`[Callback] Failed to update job ${job_id}:`, updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update job", details: updateError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Callback] Job ${job_id} updated successfully`);

    return new Response(
      JSON.stringify({ success: true, job_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in voice-job-callback:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
