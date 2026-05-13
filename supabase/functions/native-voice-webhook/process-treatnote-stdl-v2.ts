// ============================================================
// TreatNote — Native Voice Webhook: Treatnote STDL Internal Processor
// V2 Engine Integration — STDL (Standalone) clinics
// ============================================================

import { runPipelineStdl, type PipelineOutputStdl } from '../_shared/v2-engine/orchestrator-stdl.ts';

export async function processTreatnoteStdlInternally(
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
    console.log(`[Native Job STDL ${jobId}] Starting V2 STDL engine pipeline...`);
    await appendTraceLog('V2 Pipeline STDL', 'processing', { engine: 'v2-stdl' });

    // Convert audio File to Uint8Array if present
    let audioUint8: Uint8Array | undefined;
    if (audioBuffer && !overrideTranscript) {
      const arrayBuf = await audioBuffer.arrayBuffer();
      audioUint8 = new Uint8Array(arrayBuf);
    }

    // Run the STDL V2 pipeline
    const result: PipelineOutputStdl = await runPipelineStdl({
      telephelyId: context.telephelyId,
      doctorId: context.userId,
      patientRef: context.paciensId || context.treatnotePatientId,
      audioBuffer: audioUint8,
      audioFilename: audioBuffer?.name || 'audio.webm',
      text: overrideTranscript || undefined,
      supabase: supabaseAdmin,
      onProgress: updateProgress,
    });

    await appendTraceLog('V2 Pipeline STDL', 'completed', {
      protocols_extracted: result.extraction.protocols.length,
      items_mapped: result.mapping.items.length,
      unmapped_actions: result.mapping.unmapped,
      clinical_validation: result.clinicalValidation,
      timing: result.timing,
      tokens_used: result.extraction.tokensUsed,
    });

    // Save to STDL database (patient_treatment_plans & patient_treatment_plan_items)
    const paciensId = context.paciensId || context.treatnotePatientId;
    if (paciensId && result.mapping.items.length > 0) {
      await updateProgress(95, 'Kezelési terv mentése (STDL)...');
      await appendTraceLog('STDL Save', 'processing', { paciensId, itemCount: result.mapping.items.length });

      try {
        // 1. Create Treatment Plan
        const { data: planData, error: planError } = await supabaseAdmin
          .from('patient_treatment_plans')
          .insert({
            patient_id: paciensId,
            user_id: context.userId,
            telephely_id: context.telephelyId,
            voice_job_id: jobId,
          })
          .select('id')
          .single();

        if (planError) throw planError;
        const planId = planData.id;

        // 2. Prepare items
        const planItems = result.mapping.items.map((item: any) => ({
          plan_id: planId,
          vizit: item.visitNum,
          szakterulet: item.clinicalPhase || 'konzervalo',
          fog: item.toothFdi ? String(item.toothFdi) : null,
          hidtag: item.parameters?.brand ? String(item.parameters.brand) : null,
          name: item.szotarKezelesName || item.actionName,
          quantity: item.quantity,
          scaling: item.scaling,
          treatment_item_id: item.szotarKezelesId || null,
          talalat: !!item.szotarKezelesId,
          status: 'planned',
          notes: JSON.stringify(item.parameters)
        }));

        // 3. Insert items
        const { error: itemsError } = await supabaseAdmin
          .from('patient_treatment_plan_items')
          .insert(planItems);

        if (itemsError) throw itemsError;

        await appendTraceLog('STDL Save', 'completed', { planId, savedItems: planItems.length });
      } catch (saveErr) {
        console.error(`[Native Job STDL ${jobId}] Error saving STDL plan:`, saveErr);
        await appendTraceLog('STDL Save', 'error', { error: saveErr instanceof Error ? saveErr.message : String(saveErr) });
      }
    }

    // Build the result in the format the frontend expects
    const finalResult = {
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
      execution_report_human: {
        meta: { generator: 'v2-engine-stdl', version: '2.0.0' },
        pipeline_timing: result.timing,
        protocols_count: result.extraction.protocols.length,
        clinical_validation: result.clinicalValidation,
        unmapped_actions: result.mapping.unmapped,
      },
    };

    const totalMs = Object.values(result.timing).reduce((a, b) => a + b, 0);
    const traceData = {
      engine: 'v2-stdl',
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
      patient_ref: paciensId,
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
        progress_message: 'Kész! STDL Kezelési terv sikeresen elmentve.',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (finalUpdateError) {
      throw new Error(`Final database update failed: ${finalUpdateError.message}`);
    }

    console.log(`[Native Job STDL ${jobId}] V2 pipeline completed! (${totalMs}ms, ${result.extraction.protocols.length} protocols)`);

  } catch (error) {
    console.error(`[Native Job STDL ${jobId}] V2 pipeline error:`, error);

    await appendTraceLog('V2 Pipeline STDL', 'error', {
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
