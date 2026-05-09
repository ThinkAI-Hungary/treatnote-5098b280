// ============================================================
// TreatNote V2 — Express Server
// ============================================================

import express from 'express';
import 'dotenv/config';
import { runPipeline, type PipelineOutput } from './pipeline/orchestrator.js';
import { runMappingPipeline } from './onboarding/mapping-pipeline.js';
import { checkGranularity } from './onboarding/granularity-check.js';
import { getDb, closeDb } from './db/client.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = parseInt(process.env.PORT || '3210');

// ---- Health ----
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// ---- Pipeline: text input ----
app.post('/api/v2/process', async (req, res) => {
  try {
    const { telephelyId, text, doctorId, patientRef } = req.body;

    if (!telephelyId || !text) {
      return res.status(400).json({ error: 'telephelyId and text are required' });
    }

    const result = await runPipeline({ telephelyId, text, doctorId, patientRef });
    res.json(formatOutput(result));
  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---- Pipeline: audio input ----
app.post('/api/v2/process-audio', express.raw({ type: 'audio/*', limit: '25mb' }), async (req, res) => {
  try {
    const telephelyId = req.headers['x-telephely-id'] as string;
    if (!telephelyId) {
      return res.status(400).json({ error: 'x-telephely-id header is required' });
    }

    const result = await runPipeline({
      telephelyId,
      audioBuffer: req.body,
      audioFilename: 'recording.webm',
    });
    res.json(formatOutput(result));
  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---- Onboarding ----
app.post('/api/v2/onboarding/map', async (req, res) => {
  try {
    const { telephelyId, useLlm = true } = req.body;
    if (!telephelyId) {
      return res.status(400).json({ error: 'telephelyId required' });
    }

    const results = await runMappingPipeline(telephelyId, { useLlm });
    res.json({ count: results.length, mappings: results });
  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/v2/onboarding/check-granularity', async (req, res) => {
  try {
    const { telephelyId } = req.body;
    if (!telephelyId) {
      return res.status(400).json({ error: 'telephelyId required' });
    }

    const issues = await checkGranularity(telephelyId);
    res.json({ count: issues.length, issues });
  } catch (err) {
    console.error('Granularity check error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---- Catalog ----
app.get('/api/v2/catalog/actions', (_req, res) => {
  const db = getDb();
  const actions = db.prepare('SELECT slug, name_hu, category, parameter_schema FROM v2_atomic_actions ORDER BY category, slug').all();
  res.json(actions);
});

app.get('/api/v2/catalog/templates', (_req, res) => {
  const db = getDb();
  const templates = db.prepare('SELECT slug, name_hu, triggers, atomic_actions FROM v2_protocol_templates ORDER BY slug').all();
  res.json(templates);
});

// ---- Mappings ----
app.get('/api/v2/mappings/:telephelyId', (req, res) => {
  const db = getDb();
  const mappings = db.prepare(
    'SELECT atomic_action_slug, szotar_kezeles_name, confidence, reviewed FROM v2_clinic_mappings WHERE telephely_id = ? ORDER BY confidence DESC'
  ).all(req.params.telephelyId);
  res.json(mappings);
});

// ---- Format output ----
function formatOutput(result: PipelineOutput) {
  return {
    sessionId: result.sessionId,
    transcript: result.transcript,
    protocols: result.extraction.protocols.length,
    items: result.mapping.items.map(item => ({
      fog: item.toothFdi,
      akció: item.actionName,
      szótár_tétel: item.szotarKezelesName,
      mennyiség: item.quantity,
      scaling: item.scaling,
      confidence: item.confidence,
    })),
    unmapped: result.mapping.unmapped,
    warnings: result.validation.warnings,
    timing: result.timing,
    tokensUsed: result.extraction.tokensUsed,
  };
}

// ---- Start ----
app.listen(PORT, () => {
  console.log(`\n🦷 TreatNote V2 Engine running on http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     POST /api/v2/process          — text pipeline`);
  console.log(`     POST /api/v2/process-audio     — audio pipeline`);
  console.log(`     POST /api/v2/onboarding/map    — run onboarding`);
  console.log(`     GET  /api/v2/catalog/actions    — list actions`);
  console.log(`     GET  /api/v2/catalog/templates  — list templates`);
  console.log(`     GET  /api/v2/mappings/:id       — get mappings\n`);
});

// Cleanup
process.on('SIGTERM', () => { closeDb(); process.exit(0); });
process.on('SIGINT', () => { closeDb(); process.exit(0); });
