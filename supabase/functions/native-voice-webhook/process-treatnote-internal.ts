// ============================================================
// TreatNote — Native Voice Webhook: Treatnote Internal Processor
// V2 Engine Integration — replaces legacy semantic matcher + scaling
// ============================================================

import { runPipeline, type PipelineOutput } from '../_shared/v2-engine/orchestrator.ts';

export async function processTreatnoteInternally(
  jobId: string,
  audioBuffer: File | null,
  supabaseAdmin: any,
  apiKeys: any,
  context: any,
  overrideTranscript?: string
) {
  const traceLogs: any[] = [];

  const appendTraceLog = async (node: string, status: 'processing' | 'completed' | 'error', details?: any) => {
    const entry = { timestamp: new Date().toISOString(), node, status, details };
    traceLogs.push(entry);
    await supabaseAdmin
      .from('native_voice_jobs')
      .update({ trace_logs: traceLogs })
      .eq('id', jobId);
  };

  const updateProgress = async (percent: number, message: string) => {
    await supabaseAdmin
      .from('native_voice_jobs')
      .update({ progress_percent: percent, progress_message: message })
      .eq('id', jobId);
  };

  try {
    console.log(`[Native Job ${jobId}] Starting V2 engine pipeline...`);
    await appendTraceLog('V2 Pipeline', 'processing', { engine: 'v2' });

    // Convert audio File to Uint8Array if present
    let audioUint8: Uint8Array | undefined;
    if (audioBuffer && !overrideTranscript) {
      const arrayBuf = await audioBuffer.arrayBuffer();
      audioUint8 = new Uint8Array(arrayBuf);
    }

    // Run the V2 pipeline
    const result: PipelineOutput = await runPipeline({
      telephelyId: context.telephelyId,
      doctorId: context.userId,
      patientRef: context.paciensId || context.treatnotePatientId,
      audioBuffer: audioUint8,
      audioFilename: audioBuffer?.name || 'audio.webm',
      text: overrideTranscript || undefined,
      supabase: supabaseAdmin,
      onProgress: updateProgress,
    });

    await appendTraceLog('V2 Pipeline', 'completed', {
      protocols_extracted: result.extraction.protocols.length,
      items_mapped: result.mapping.items.length,
      unmapped_actions: result.mapping.unmapped,
      clinical_validation: result.clinicalValidation,
      timing: result.timing,
      tokens_used: result.extraction.tokensUsed,
    });

    // Build the result in the format the frontend expects
    // The vizitek[] array is backward-compatible with treatnote.py
    const finalResult = {
      // RPA output — treatnote.py compatible
      vizitek: result.rpaOutput.vizitek,
      vizit_szam: new Set(result.rpaOutput.vizitek.map(v => v.vizit)).size,

      // V2 debug data — for the redesigned VerdiktDisplay
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
        expansion: {
          items: result.expansion.items,
        },
        clinicalValidation: result.clinicalValidation,
        mapping: {
          items: result.mapping.items,
          unmapped: result.mapping.unmapped,
        },
        timing: result.timing,
      },

      // Legacy compatibility: execution_report_human for VerdiktDisplay
      execution_report_human: {
        meta: { generator: 'v2-engine', version: '2.0.0' },
        pipeline_timing: result.timing,
        protocols_count: result.extraction.protocols.length,
        clinical_validation: result.clinicalValidation,
        unmapped_actions: result.mapping.unmapped,
      },
    };

    // Build comprehensive trace data
    const totalMs = Object.values(result.timing).reduce((a, b) => a + b, 0);
    const traceData = {
      engine: 'v2',
      pipeline_stages: result.timing,
      total_duration_ms: totalMs,
      protocols_extracted: result.extraction.protocols.length,
      items_after_expand: result.expansion.items.length,
      items_after_validation: result.mapping.items.length,
      unmapped_count: result.mapping.unmapped.length,
      tokens_used: result.extraction.tokensUsed,
    };

    // Save session to v2_sessions for audit trail
    await supabaseAdmin.from('v2_sessions').insert({
      telephely_id: context.telephelyId,
      doctor_id: context.userId,
      patient_ref: context.paciensId || context.treatnotePatientId,
      transcript: result.transcript,
      llm_raw_response: result.extraction.rawResponse,
      pipeline_output: finalResult.v2,
      clinical_validation_report: result.clinicalValidation,
      timing: result.timing,
      tokens_used: result.extraction.tokensUsed,
    });

    // Update job successfully
    const { error: finalUpdateError } = await supabaseAdmin
      .from('native_voice_jobs')
      .update({
        status: 'completed',
        result: finalResult,
        raw_audio_text: result.transcript,
        claude_cleaned_text: result.extraction.rawResponse,
        trace_info: traceData,
        progress_percent: 100,
        progress_message: 'Kész! Kezelési terv sikeresen összeállítva.',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (finalUpdateError) {
      throw new Error(`Final database update failed: ${finalUpdateError.message}`);
    }

    console.log(`[Native Job ${jobId}] V2 pipeline completed! (${totalMs}ms, ${result.extraction.protocols.length} protocols, ${result.rpaOutput.vizitek.length} vizitek)`);

  } catch (error) {
    console.error(`[Native Job ${jobId}] V2 pipeline error:`, error);

    await appendTraceLog('V2 Pipeline', 'error', {
      error: error instanceof Error ? error.message : String(error),
    });

    await supabaseAdmin
      .from('native_voice_jobs')
      .update({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        progress_percent: 0,
        progress_message: 'Hiba történt a feldolgozás során.',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }
}
