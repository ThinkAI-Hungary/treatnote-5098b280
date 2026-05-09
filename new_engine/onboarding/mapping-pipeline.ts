// ============================================================
// TreatNote V2 — Onboarding: Mapping Pipeline
// Kétlépcsős: embedding cosine similarity → LLM refinement
// ============================================================

import { randomUUID } from 'crypto';
import { getDb, closeDb, insertRow, queryAll } from '../db/client.js';
import { getSzotarByTelephely, type SzotarKezeles } from '../db/supabase.js';
import { ATOMIC_ACTIONS } from '../catalog/atomic-actions.js';
import { getEmbeddings, cosineSimilarity } from '../shared/embeddings.js';
import 'dotenv/config';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

// ---- Types ----

interface MappingCandidate {
  szotarItem: SzotarKezeles;
  similarity: number;
}

interface MappingResult {
  atomicActionSlug: string;
  atomicActionName: string;
  szotarKezelesId: string;
  szotarKezelesName: string;
  conditions: Record<string, unknown>;
  confidence: number;
  method: 'embedding' | 'llm_refined';
}

// ---- Step 1: Embedding-based matching ----

async function embeddingMatch(
  actionEmbeddings: Map<string, number[]>,
  szotarItems: SzotarKezeles[],
  szotarEmbeddings: Map<string, number[]>,
  topK: number = 5
): Promise<Map<string, MappingCandidate[]>> {
  const results = new Map<string, MappingCandidate[]>();

  for (const action of ATOMIC_ACTIONS) {
    const actionEmb = actionEmbeddings.get(action.slug);
    if (!actionEmb) continue;

    const scored: MappingCandidate[] = [];
    for (const item of szotarItems) {
      const itemEmb = szotarEmbeddings.get(item.id);
      if (!itemEmb) continue;
      const sim = cosineSimilarity(actionEmb, itemEmb);
      scored.push({ szotarItem: item, similarity: sim });
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    results.set(action.slug, scored.slice(0, topK));
  }

  return results;
}

// ---- Step 2: LLM refinement ----

async function llmRefine(
  actionSlug: string,
  actionName: string,
  actionCategory: string,
  actionEmbeddingText: string,
  candidates: MappingCandidate[]
): Promise<{ bestId: string; bestName: string; conditions: Record<string, unknown>; confidence: number } | null> {
  if (candidates.length === 0) return null;

  const candidateList = candidates
    .map((c, i) => `${i + 1}. "${c.szotarItem.name}" (kategória: ${c.szotarItem.category || '-'}, hasonlóság: ${c.similarity.toFixed(3)})`)
    .join('\n');

  const prompt = `Te egy magyar fogászati számlázási rendszer szakértője vagy.

FELADAT: Egy atomi klinikai beavatkozást kell a klinika szótárának legjobban illő tételéhez rendelned.

## ATOMI AKCIÓ (amit az orvos csinál):
- Azonosító: ${actionSlug}
- Megnevezés: ${actionName}
- Kategória: ${actionCategory}
- Leírás/kulcsszavak: ${actionEmbeddingText}

## FONTOS SZABÁLYOK:
1. Az atomi akció egy KONKRÉT BEAVATKOZÁSI LÉPÉS, NEM a végtermék. Pl.:
   - "korona preparáció" = a fog csiszolása/formázása → "Preparálás" a helyes, NEM a korona maga
   - "caries eltávolítás" = a szuvasodás eltávolítása, excaválás → nem a tömés
   - "gyökértömés" = a csatorna végleges lezárása → "gyökérkezelés gyökértöméssel"
2. Ha a szótárban van pontos, egyértelmű egyezés (pl. "Preparálás" ↔ "korona preparáció"), MINDIG azt válaszd.
3. NE válassz végtermék-tételt (korona, híd, fogpótlás) ha a keresett akció csak egy lépés a folyamatban.
4. Ha EGYIK jelölt sem illik a beavatkozáshoz, válaszolj 0-val.

## KLINIKA SZÓTÁR JELÖLTJEI:
${candidateList}

Válaszolj KIZÁRÓLAG JSON-ban, semmi más szöveget ne adj:
{"pick": <sorszám vagy 0>, "confidence": <0.0-1.0>, "conditions": {}}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error(`  LLM error for ${actionSlug}: ${res.status}`);
    return null;
  }

  const data = await res.json() as any;
  const text = data.content?.[0]?.text || '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const pick = parsed.pick as number;
    if (pick === 0 || pick > candidates.length) return null;

    const chosen = candidates[pick - 1];
    return {
      bestId: chosen.szotarItem.id,
      bestName: chosen.szotarItem.name,
      conditions: parsed.conditions || {},
      confidence: parsed.confidence || 0.5,
    };
  } catch {
    return null;
  }
}

// ---- Main Pipeline ----

export async function runMappingPipeline(
  telephelyId: string,
  options: { useLlm?: boolean; topK?: number; minSimilarity?: number } = {}
): Promise<MappingResult[]> {
  const { useLlm = true, topK = 10, minSimilarity = 0.35 } = options;

  console.log(`\n=== Onboarding mapping: ${telephelyId} ===\n`);

  // 1. Fetch szótár items
  console.log('1. Fetching szótár items from Supabase...');
  const szotarItems = await getSzotarByTelephely(telephelyId);
  console.log(`   ${szotarItems.length} items found`);

  if (szotarItems.length === 0) {
    console.error('   No items found for this telephely!');
    return [];
  }

  // 2. Generate embeddings for szótár items
  console.log('2. Generating embeddings for szótár items...');
  const szotarTexts = szotarItems.map(i => i.name);
  const szotarEmbVectors = await getEmbeddings(szotarTexts, 'text-embedding-3-large');
  const szotarEmbeddings = new Map<string, number[]>();
  szotarItems.forEach((item, i) => szotarEmbeddings.set(item.id, szotarEmbVectors[i]));
  console.log(`   ${szotarEmbVectors.length} embeddings generated`);

  // 3. Generate embeddings for atomic actions
  console.log('3. Generating embeddings for atomic actions...');
  const actionTexts = ATOMIC_ACTIONS.map(a => a.embeddingText);
  const actionEmbVectors = await getEmbeddings(actionTexts, 'text-embedding-3-large');
  const actionEmbeddings = new Map<string, number[]>();
  ATOMIC_ACTIONS.forEach((a, i) => actionEmbeddings.set(a.slug, actionEmbVectors[i]));
  console.log(`   ${actionEmbVectors.length} embeddings generated`);

  // 4. Embedding matching
  console.log('4. Running embedding match...');
  const candidates = await embeddingMatch(actionEmbeddings, szotarItems, szotarEmbeddings, topK);

  // 5. LLM refinement (optional)
  const results: MappingResult[] = [];

  for (const action of ATOMIC_ACTIONS) {
    const actionCandidates = candidates.get(action.slug) || [];
    // Apply negativeWords penalty
    const filtered = actionCandidates
      .map(c => {
        if ((action as any).negativeWords?.length) {
          const nameLower = c.szotarItem.name.toLowerCase();
          const hasNeg = (action as any).negativeWords.some((nw: string) => nameLower.includes(nw.toLowerCase()));
          if (hasNeg) return { ...c, similarity: c.similarity - 0.3 };
        }
        return c;
      })
      .filter(c => c.similarity >= minSimilarity);

    if (filtered.length === 0) {
      console.log(`   ⚠ ${action.slug}: no candidates above threshold`);
      continue;
    }

    if (useLlm) {
      process.stdout.write(`   🤖 ${action.slug}...`);
      const llmResult = await llmRefine(action.slug, action.nameHu, action.category, action.embeddingText, filtered);

      if (llmResult) {
        results.push({
          atomicActionSlug: action.slug,
          atomicActionName: action.nameHu,
          szotarKezelesId: llmResult.bestId,
          szotarKezelesName: llmResult.bestName,
          conditions: llmResult.conditions,
          confidence: llmResult.confidence,
          method: 'llm_refined',
        });
        console.log(` → "${llmResult.bestName}" (${llmResult.confidence.toFixed(2)})`);
      } else {
        // Fallback to top embedding match
        const top = filtered[0];
        results.push({
          atomicActionSlug: action.slug,
          atomicActionName: action.nameHu,
          szotarKezelesId: top.szotarItem.id,
          szotarKezelesName: top.szotarItem.name,
          conditions: {},
          confidence: top.similarity,
          method: 'embedding',
        });
        console.log(` → fallback: "${top.szotarItem.name}" (${top.similarity.toFixed(3)})`);
      }
    } else {
      // Pure embedding match
      const top = filtered[0];
      results.push({
        atomicActionSlug: action.slug,
        atomicActionName: action.nameHu,
        szotarKezelesId: top.szotarItem.id,
        szotarKezelesName: top.szotarItem.name,
        conditions: {},
        confidence: top.similarity,
        method: 'embedding',
      });
    }
  }

  // 6. Save to DB
  console.log(`\n5. Saving ${results.length} mappings to DB...`);
  const db = getDb();
  const tx = db.transaction(() => {
    // Clear old mappings for this telephely
    db.prepare('DELETE FROM v2_clinic_mappings WHERE telephely_id = ?').run(telephelyId);

    for (const r of results) {
      insertRow('v2_clinic_mappings', {
        id: randomUUID(),
        telephely_id: telephelyId,
        szotar_kezeles_id: r.szotarKezelesId,
        szotar_kezeles_name: r.szotarKezelesName,
        atomic_action_slug: r.atomicActionSlug,
        conditions: JSON.stringify(r.conditions),
        confidence: r.confidence,
        reviewed: 0,
      });
    }
  });
  tx();

  // Summary
  const high = results.filter(r => r.confidence >= 0.8).length;
  const med = results.filter(r => r.confidence >= 0.5 && r.confidence < 0.8).length;
  const low = results.filter(r => r.confidence < 0.5).length;

  console.log(`\n=== MAPPING SUMMARY ===`);
  console.log(`Total: ${results.length}/${ATOMIC_ACTIONS.length} actions mapped`);
  console.log(`  HIGH (≥0.8): ${high}`);
  console.log(`  MEDIUM (0.5-0.8): ${med}`);
  console.log(`  LOW (<0.5): ${low}`);

  return results;
}

// ---- CLI ----

if (process.argv[1]?.includes('mapping-pipeline')) {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
  const telephelyId = args[0] || process.env.TELEPHELY_ID || '79d8df9c-1795-4ef3-ba65-157c6635e9dd';
  const noLlm = flags.includes('--no-llm');

  runMappingPipeline(telephelyId, { useLlm: !noLlm })
    .then(results => {
      console.log(`\nDone. ${results.length} mappings saved.`);
      closeDb();
    })
    .catch(err => {
      console.error(err);
      closeDb();
      process.exit(1);
    });
}
