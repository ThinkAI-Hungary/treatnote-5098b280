// ============================================================
// TreatNote V2 — Text-only test endpoint
// Runs the full V2 pipeline with text input (no audio needed)
// Creates a native_voice_jobs record so results show in the UI
// POST { text, telephelyId, userId }
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runPipeline } from '../_shared/v2-engine/orchestrator.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, telephelyId, userId } = await req.json();

    if (!text || !telephelyId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: text, telephelyId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // If userId provided, create a real job so it shows in the UI
    let jobId: string | null = null;
    if (userId) {
      // Look up company_id from profile (required by native_voice_jobs)
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', userId)
        .single();

      const { data: job, error: jobError } = await supabase
        .from('native_voice_jobs')
        .insert({
          user_id: userId,
          company_id: profile?.company_id || null,
          telephely_id: telephelyId,
          status: 'processing',
          mode: 'treatnote',
          progress_percent: 10,
          progress_message: 'V2 teszt pipeline futtatása...',
        })
        .select('id')
        .single();

      if (jobError) {
        console.error('[V2 Test] Job creation failed:', jobError.message);
      } else {
        jobId = job.id;
        console.log(`[V2 Test] Created job ${jobId}`);
      }
    }

    console.log(`[V2 Test] Running pipeline for telephely ${telephelyId}${jobId ? ` (job ${jobId})` : ' (no job)'}`);

    const result = await runPipeline({
      telephelyId,
      text,
      supabase,
      onProgress: jobId ? async (percent, message) => {
        await supabase.from('native_voice_jobs').update({ progress_percent: percent, progress_message: message }).eq('id', jobId);
      } : undefined,
    });

    // If we have a job, update it with results (same format as native-voice-webhook)
    if (jobId) {
      const finalResult = {
        vizitek: result.rpaOutput.vizitek,
        vizit_szam: new Set(result.rpaOutput.vizitek.map((v: any) => v.vizit)).size,
        v2: {
          sessionId: result.sessionId,
          transcript: result.transcript,
          extraction: {
            protocols: result.extraction.protocols,
            rawResponse: result.extraction.rawResponse,
            tokensUsed: result.extraction.tokensUsed,
          },
          validation: {
            protocols: result.validation.protocols,
            warnings: result.validation.warnings,
          },
          expansion: { items: result.expansion.items },
          clinicalValidation: result.clinicalValidation,
          mapping: {
            items: result.mapping.items,
            unmapped: result.mapping.unmapped,
          },
          timing: result.timing,
        },
        execution_report_human: {
          meta: { generator: 'v2-engine-test', version: '2.0.0' },
          pipeline_timing: result.timing,
          protocols_count: result.extraction.protocols.length,
          clinical_validation: result.clinicalValidation,
          unmapped_actions: result.mapping.unmapped,
        },
      };

      const totalMs = Object.values(result.timing).reduce((a: number, b: number) => a + b, 0);

      await supabase.from('native_voice_jobs').update({
        status: 'completed',
        result: finalResult,
        raw_audio_text: result.transcript,
        claude_cleaned_text: result.extraction.rawResponse,
        trace_info: {
          engine: 'v2-test',
          pipeline_stages: result.timing,
          total_duration_ms: totalMs,
          protocols_extracted: result.extraction.protocols.length,
          items_after_expand: result.expansion.items.length,
          unmapped_count: result.mapping.unmapped.length,
        },
        progress_percent: 100,
        progress_message: 'Kész! Teszt pipeline sikeresen lefutott.',
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
    }

    return new Response(
      JSON.stringify({
        jobId,
        sessionId: result.sessionId,
        transcript: result.transcript,
        protocolCount: result.extraction.protocols.length,
        vizitCount: new Set(result.rpaOutput.vizitek.map((v: any) => v.vizit)).size,
        itemCount: result.rpaOutput.vizitek.length,
        unmapped: result.mapping.unmapped,
        timing: result.timing,
        rpaOutput: result.rpaOutput,
        // Full debug data for pipeline diagnosis
        debug: {
          extraction: {
            protocols: result.extraction.protocols,
            tokensUsed: result.extraction.tokensUsed,
          },
          validation: {
            warnings: result.validation.warnings,
          },
          expansion: {
            items: result.expansion.items,
            itemCount: result.expansion.items.length,
          },
          clinicalValidation: result.clinicalValidation,
          mapping: {
            items: result.mapping.items,
            unmapped: result.mapping.unmapped,
          },
        },
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[V2 Test] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
