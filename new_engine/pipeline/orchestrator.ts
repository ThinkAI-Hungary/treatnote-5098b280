// ============================================================
// TreatNote V2 — Pipeline Orchestrator
// Összekapcsolja az 5 stage-et egy teljes pipeline-ba
// ============================================================

import { transcribeAudio, textInput, type TranscribeResult } from './01-transcribe.js';
import { extractActions, type ExtractResult } from './02-extract.js';
import { validateAndFillDefaults, type ValidateResult } from './03-validate.js';
import { expandProtocols, type ExpandResult } from './04-expand.js';
import { runClinicalValidation, type ValidationReport } from './clinical-validation.js';
import { mapToClinicItems, type MapResult } from './05-map.js';
import { formatForRpa, type RpaOutput } from './06-format-rpa.js';
import { getDb } from '../db/client.js';

export interface PipelineInput {
  telephelyId: string;
  doctorId?: string;
  patientRef?: string;
  // Either audio or text
  audioBuffer?: Buffer;
  audioFilename?: string;
  text?: string;
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

  // Stage 1: Transcribe
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
  t0 = Date.now();
  const extraction = await extractActions(transcription.transcript);
  timing['02_extract'] = Date.now() - t0;

  // Stage 3: Validate
  t0 = Date.now();
  // Load clinic defaults if exist
  const db = getDb();
  const clinicRow = db.prepare('SELECT overrides FROM v2_clinic_defaults WHERE telephely_id = ?').get(input.telephelyId) as { overrides: string } | undefined;
  const clinicDefaults = clinicRow ? JSON.parse(clinicRow.overrides) : {};
  const validation = validateAndFillDefaults(extraction.protocols, clinicDefaults);
  timing['03_validate'] = Date.now() - t0;

  // Stage 4: Expand (scaling + multi-visit injection + Phase F ordering)
  t0 = Date.now();
  const expansion = expandProtocols(validation.protocols);
  timing['04_expand'] = Date.now() - t0;

  // Stage 4.5: Clinical Validation Passes (A-E)
  t0 = Date.now();
  const { items: validatedItems, report: clinicalValidation } = runClinicalValidation(expansion.items);
  timing['04.5_clinical_validation'] = Date.now() - t0;

  // Stage 5: Map (validated items → clinic dictionary)
  t0 = Date.now();
  const mapping = mapToClinicItems(validatedItems, input.telephelyId);
  timing['05_map'] = Date.now() - t0;

  // Stage 6: Format for RPA
  t0 = Date.now();
  const rpaOutput = formatForRpa(mapping.items);
  timing['06_format_rpa'] = Date.now() - t0;

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
