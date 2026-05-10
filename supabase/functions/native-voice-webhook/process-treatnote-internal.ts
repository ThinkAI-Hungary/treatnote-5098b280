// ============================================================
// TreatNote — Native Voice Webhook: Treatnote Internal Processor
// V2 Engine Integration — replaces legacy semantic matcher + scaling
// ============================================================

import { runPipeline, type PipelineOutput } from '../_shared/v2-engine/orchestrator.ts';

// ── RPA Server config ──
const RPA_SERVER_URL = Deno.env.get('RPA_SERVER_URL') || 'http://209.38.249.101:8900';
const RPA_SECRET = Deno.env.get('RPA_SECRET') || 'tn_rpa_2026_s3cur3_k3y';

// ── AES-256-GCM decryption (same as voice-recording-webhook) ──
async function decryptPassword(encryptedBase64: string, keyBase64: string): Promise<string> {
  const decoder = new TextDecoder();
  const keyData = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decryptedData = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return decoder.decode(decryptedData);
}

// ── Fetch Flexi credentials for a user + telephely ──
async function fetchFlexiCredentials(supabaseAdmin: any, userId: string, telephelyId: string) {
  const encryptionKey = Deno.env.get('FLEXI_ENCRYPTION_KEY') || '';

  // Get flexi_domain from telephely
  let flexiDomain = '';
  const { data: telephelyData } = await supabaseAdmin
    .from('telephely')
    .select('flexi_domain')
    .eq('id', telephelyId)
    .maybeSingle();
  if (telephelyData) flexiDomain = telephelyData.flexi_domain || '';

  // Get flexi_auth — exact telephely match first, then legacy null fallback
  let flexiData: { flexi_username: string | null; flexi_pw: string | null } | null = null;

  if (telephelyId) {
    const { data } = await supabaseAdmin
      .from('flexi_auth')
      .select('flexi_username, flexi_pw')
      .eq('user_id', userId)
      .eq('telephely_id', telephelyId)
      .maybeSingle();
    flexiData = data;
  }

  if (!flexiData) {
    const { data } = await supabaseAdmin
      .from('flexi_auth')
      .select('flexi_username, flexi_pw')
      .eq('user_id', userId)
      .is('telephely_id', null)
      .maybeSingle();
    flexiData = data;
  }

  let flexiUsername = '';
  let flexiPw = '';

  if (flexiData) {
    flexiUsername = flexiData.flexi_username || '';
    if (flexiData.flexi_pw && encryptionKey) {
      try {
        flexiPw = await decryptPassword(flexiData.flexi_pw, encryptionKey);
      } catch (e) {
        console.error(`[RPA] Failed to decrypt flexi password:`, e);
      }
    }
  }

  return { flexiDomain, flexiUsername, flexiPw };
}

// ── Trigger RPA on remote server ──
async function triggerRpa(
  jobId: string,
  vizitek: any[],
  flexiDomain: string,
  flexiUsername: string,
  flexiPw: string,
  paciensId: string,
  supabaseAdmin: any,
) {
  console.log(`[RPA Job ${jobId}] Triggering RPA: domain=${flexiDomain} paciens=${paciensId} vizitek=${vizitek.length}`);

  try {
    const rpaPayload = {
      vizitek,
      flexi_domain: flexiDomain,
      flexi_username: flexiUsername,
      flexi_pw: flexiPw,
      PaciensID: paciensId,
    };

    const response = await fetch(`${RPA_SERVER_URL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RPA-Key': RPA_SECRET,
      },
      body: JSON.stringify(rpaPayload),
      signal: AbortSignal.timeout(200_000), // 200s timeout (RPA can take 2-3 minutes)
    });

    const rpaResult = await response.json();
    console.log(`[RPA Job ${jobId}] RPA result: ok=${rpaResult.ok} step=${rpaResult.step} elapsed=${rpaResult.elapsed_seconds}s`);

    // Update the job with RPA result
    await supabaseAdmin
      .from('native_voice_jobs')
      .update({
        rpa_result: rpaResult,
        rpa_url: rpaResult.url || null,
        rpa_status: rpaResult.ok === 1 ? 'completed' : 'error',
      })
      .eq('id', jobId);

    if (rpaResult.ok !== 1) {
      console.error(`[RPA Job ${jobId}] RPA failed:`, rpaResult.error || rpaResult.step);
    }

    return rpaResult;
  } catch (error) {
    console.error(`[RPA Job ${jobId}] RPA trigger error:`, error);

    await supabaseAdmin
      .from('native_voice_jobs')
      .update({
        rpa_status: 'error',
        rpa_result: { error: error instanceof Error ? error.message : String(error) },
      })
      .eq('id', jobId);

    return null;
  }
}

// ── Main processor ──

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

    // Generate AI assessment (Verdikt)
    let assessment = null;
    try {
      const assessResponse = await supabaseAdmin.functions.invoke('v2-assess-result', {
        body: {
          inputText: result.transcript,
          rpaOutput: { vizitek: result.rpaOutput.vizitek },
          unmapped: result.mapping.unmapped,
          protocolCount: result.extraction.protocols.length,
          vizitCount: result.rpaOutput.vizitek.length,
          itemCount: result.rpaOutput.vizitek.length,
          debug: {
            extraction: result.extraction,
            validation: result.validation,
            expansion: result.expansion,
            clinicalValidation: result.clinicalValidation,
            mapping: result.mapping,
          },
        },
      });
      if (assessResponse.data) {
        assessment = assessResponse.data;
        finalResult.v2.assessment = assessment;
      }
    } catch (assessErr) {
      console.warn(`[Native Job ${jobId}] Failed to auto-generate assessment:`, assessErr);
    }

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

    // ── Trigger RPA (fire-and-forget after pipeline completion) ──
    // Only trigger if we have vizitek and a paciensId
    const paciensId = context.paciensId || '';
    if (result.rpaOutput.vizitek.length > 0 && paciensId && context.userId && context.telephelyId) {
      try {
        const { flexiDomain, flexiUsername, flexiPw } = await fetchFlexiCredentials(
          supabaseAdmin, context.userId, context.telephelyId
        );

        if (flexiDomain && flexiUsername && flexiPw) {
          await appendTraceLog('RPA Trigger', 'processing', {
            domain: flexiDomain,
            paciensId,
            vizitekCount: result.rpaOutput.vizitek.length,
          });

          const rpaResult = await triggerRpa(
            jobId,
            result.rpaOutput.vizitek,
            flexiDomain,
            flexiUsername,
            flexiPw,
            paciensId,
            supabaseAdmin,
          );

          await appendTraceLog('RPA Trigger', rpaResult?.ok === 1 ? 'completed' : 'error', {
            ok: rpaResult?.ok,
            step: rpaResult?.step,
            elapsed: rpaResult?.elapsed_seconds,
            url: rpaResult?.url,
          });
        } else {
          console.log(`[Native Job ${jobId}] RPA skipped — missing flexi credentials (domain=${!!flexiDomain} user=${!!flexiUsername} pw=${!!flexiPw})`);
          await appendTraceLog('RPA Trigger', 'completed', { skipped: true, reason: 'missing_flexi_credentials' });
        }
      } catch (rpaError) {
        // RPA errors should not fail the pipeline
        console.error(`[Native Job ${jobId}] RPA trigger error (non-fatal):`, rpaError);
        await appendTraceLog('RPA Trigger', 'error', {
          error: rpaError instanceof Error ? rpaError.message : String(rpaError),
        });
      }
    } else {
      console.log(`[Native Job ${jobId}] RPA skipped — no vizitek or paciensId`);
    }

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
