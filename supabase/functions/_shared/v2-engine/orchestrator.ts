// ============================================================
// TreatNote V2 — Pipeline Orchestrator (Edge Function version)
// Összekapcsolja a 7 stage-et egy teljes pipeline-ba
// ============================================================

import { transcribeAudio, textInput, type TranscribeResult } from './01-transcribe.ts';
import { extractActions, type ExtractResult } from './02-extract.ts';
import { validateAndFillDefaults, type ValidateResult } from './03-validate.ts';
import { expandProtocols, type ExpandResult } from './04-expand.ts';
import { runClinicalValidation, type ValidationReport } from './clinical-validation.ts';
import { mapToClinicItems, type MapResult } from './05-map.ts';
import { formatForRpa, type RpaOutput } from './06-format-rpa.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface PipelineInput {
  telephelyId: string;
  doctorId?: string;
  patientRef?: string;
  // Either audio or text
  audioBuffer?: Uint8Array;
  audioFilename?: string;
  text?: string;
  // Supabase client (injected by caller)
  supabase: SupabaseClient;
  // Optional progress callback
  onProgress?: (percent: number, message: string) => Promise<void>;
}

export interface PipelineOutput {
  sessionId: string;
  transcript: string;
  extraction: ExtractResult;
  validation: ValidateResult;
  expansion: ExpandResult;
  clinicalValidation: ValidationReport;
  mapping: MapResult;
  rpaOutput: RpaOutput;
  timing: Record<string, number>;
}

/** Run the full V2 pipeline */
export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const timing: Record<string, number> = {};
  let t0: number;
  const progress = input.onProgress || (async () => {});

  // Stage 1: Transcribe
  await progress(5, 'Hangfelvétel feldolgozása...');
  t0 = Date.now();
  let transcription: TranscribeResult;
  if (input.audioBuffer) {
    transcription = await transcribeAudio(input.audioBuffer, input.audioFilename);
  } else if (input.text) {
    transcription = textInput(input.text);
  } else {
    throw new Error('Either audioBuffer or text is required');
  }
  timing['01_transcribe'] = Date.now() - t0;

  // Stage 2: Extract
  await progress(25, 'Klinikai akciók kinyerése (AI)...');
  t0 = Date.now();
  const extraction = await extractActions(transcription.transcript);
  timing['02_extract'] = Date.now() - t0;

  // Stage 3: Validate
  await progress(50, 'Paraméterek validálása...');
  t0 = Date.now();
  // Load clinic defaults from Supabase
  const { data: clinicRow } = await input.supabase
    .from('v2_clinic_defaults')
    .select('overrides')
    .eq('telephely_id', input.telephelyId)
    .maybeSingle();
  const clinicDefaults = clinicRow?.overrides || {};
  const validation = validateAndFillDefaults(extraction.protocols, clinicDefaults as Record<string, unknown>);
  timing['03_validate'] = Date.now() - t0;

  // Stage 4: Expand (scaling + multi-visit injection + Phase F ordering)
  await progress(60, 'Vizit-bontás és skálázás...');
  t0 = Date.now();
  const expansion = expandProtocols(validation.protocols);
  timing['04_expand'] = Date.now() - t0;

  // Stage 4.5: Clinical Validation Passes (A-E)
  await progress(70, 'Klinikai validáció (A-E)...');
  t0 = Date.now();
  const { items: validatedItems, report: clinicalValidation } = runClinicalValidation(expansion.items);
  timing['04.5_clinical_validation'] = Date.now() - t0;

  // Stage 5: Map (validated items → clinic dictionary)
  await progress(80, 'Szótár mapping...');
  t0 = Date.now();
  const mapping = await mapToClinicItems(validatedItems, input.telephelyId, input.supabase);
  timing['05_map'] = Date.now() - t0;

  // Stage 6: Format for RPA
  await progress(90, 'RPA kimenet formázása...');
  t0 = Date.now();
  const rpaOutput = formatForRpa(mapping.items);
  timing['06_format_rpa'] = Date.now() - t0;

  await progress(95, 'Eredmények mentése...');

  return {
    sessionId: crypto.randomUUID(),
    transcript: transcription.transcript,
    extraction,
    validation,
    expansion,
    clinicalValidation,
    mapping,
    rpaOutput,
    timing,
  };
}

// Re-export types for convenience
export type { TranscribeResult } from './01-transcribe.ts';
export type { ExtractResult } from './02-extract.ts';
export type { ValidateResult, ValidationWarning } from './03-validate.ts';
export type { ExpandResult, ExpandedItem } from './04-expand.ts';
export type { ValidationReport } from './clinical-validation.ts';
export type { MapResult, MappedItem } from './05-map.ts';
export type { RpaOutput, RpaVisitItem } from './06-format-rpa.ts';
