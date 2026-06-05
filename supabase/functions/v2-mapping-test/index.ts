// ============================================================
// TreatNote V2 — Mapping Test Harness (Staged)
// Stage 1: embed → Stage 2: original LLM → Stage 3: improved LLM → Stage 4: compare
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ATOMIC_ACTIONS } from '../_shared/v2-engine/catalog/atomic-actions.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEST_TELEPHELY_ID = '79d8df9c-1795-4ef3-ba65-157c6635e9dd';

// ── Embedding utilities ──

async function getEmbeddings(texts: string[], model = 'text-embedding-3-large'): Promise<number[][]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY required');

  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    for (const item of data.data) all.push(item.embedding);
  }
  return all;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── LLM refinement (original: 1 action at a time) ──

async function llmRefineOne(
  action: { slug: string; nameHu: string; category: string; embeddingText: string },
  candidates: { name: string; id: string; similarity: number }[]
): Promise<{ bestId: string; bestName: string; confidence: number } | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;

  const candidateList = candidates.map((c, i) => `${i + 1}. "${c.name}" (sim: ${c.similarity.toFixed(3)})`).join('\n');
  const prompt = `Te egy magyar fogászati számlázási rendszer szakértője vagy.

FELADAT: Egy atomi klinikai beavatkozást kell a klinika szótárának legjobban illő tételéhez rendelned.

## ATOMI AKCIÓ:
- Azonosító: ${action.slug}
- Megnevezés: ${action.nameHu}
- Kategória: ${action.category}
- Leírás: ${action.embeddingText}

## SZABÁLYOK:
1. Az atomi akció egy KONKRÉT BEAVATKOZÁSI LÉPÉS, NEM a végtermék.
2. Ha a szótárban van pontos egyezés, MINDIG azt válaszd.
3. NE válassz végtermék-tételt ha a keresett akció csak egy lépés.
4. Ha EGYIK sem illik, válaszolj 0-val.

## JELÖLTEK:
${candidateList}

Válaszolj KIZÁRÓLAG JSON-ban: {"pick": <sorszám vagy 0>, "confidence": <0.0-1.0>}`;

  const modelsToTry = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307',
    'claude-3-opus-20240229'
  ];

  let lastError = "";
  for (const model of modelsToTry) {
    console.log(`Trying model: ${model}`);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
    });

    if (res.ok) {
      console.log(`SUCCESS with model: ${model}`);
      const data = await res.json() as any;
      const text = data.content?.[0]?.text || '';
      try {
        const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (parsed.pick === 0 || parsed.pick > candidates.length) return null;
        const chosen = candidates[parsed.pick - 1];
        return { bestId: chosen.id, bestName: chosen.name, confidence: parsed.confidence || 0.5 };
      } catch { return null; }
    } else {
      const errText = await res.text();
      console.warn(`Failed model ${model}: ${res.status} ${errText}`);
      lastError += ` [${model}: ${res.status} ${errText}]`;
    }
  }

  throw new Error(`All Anthropic models failed. Accumulated: ${lastError}`);
}

// ── LLM refinement (improved: batch 5 actions, with categories) ──

async function llmRefineBatch(
  actions: { slug: string; name: string; category: string; embeddingText: string; candidates: { name: string; id: string; similarity: number; szCategory?: string }[] }[]
): Promise<Map<string, { bestId: string; bestName: string; confidence: number }>> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return new Map();

  const actionBlocks = actions.map((a, idx) => {
    const cl = a.candidates.map((c, i) => `  ${i + 1}. "${c.name}"${c.szCategory ? ` [${c.szCategory}]` : ''} (sim: ${c.similarity.toFixed(3)})`).join('\n');
    return `### Akció ${idx + 1}: ${a.slug}\n- Név: ${a.name}\n- Kategória: ${a.category}\n- Leírás: ${a.embeddingText}\nJelöltek:\n${cl}`;
  }).join('\n\n');

  const prompt = `Te egy magyar fogászati számlázási rendszer szakértője vagy.

FELADAT: Több atomi klinikai beavatkozást kell egyszerre a klinika szótárának legjobban illő tételéhez rendelned.

## SZABÁLYOK:
1. Az atomi akció egy KONKRÉT BEAVATKOZÁSI LÉPÉS.
2. Ha pontos vagy közeli egyezés van a NÉVBEN, azt válaszd.
3. KERÜLD AZ ÜTKÖZÉST: ne rendeld ugyanazt a szótár-tételt két különböző akcióhoz, hacsak nem tényleg mindkettőre illik!
4. Ha EGYIK sem illik, adj 0-t.
5. A [kategória] zárójelben a szótár tétel kategóriája — ERŐSEN preferáld azokat a jelölteket, amelyek kategóriája megegyezik az akció kategóriájával.
6. ÉRZÉSTELENÍTÉS akció (anesztezia, érzéstelenítés) → KIZÁRÓLAG olyan szótár-tételt válassz, amelynek NEVE tartalmazza az "érzéstelenítés" szót. NE válassz kezelést ami érzéstelenítéssel jár!
7. Ha az akció ÁLTALÁNOS (pl. "implantátum beültetés"), a szótárban pedig márka-specifikus tételek vannak (Nobel, Straumann stb.), válaszd a leggyakrabban használt vagy legáltalánosabb megfogalmazásút.
8. Preferáld a RÖVIDEBB, SPECIFIKUSABB szótár tételt a hosszabb, összetett tétellel szemben, ha mindkettő illik.
9. LÉZER akció → válassz terápiás lézert, NE diagnosztikust (pl. Diagnodent nem lézerkezelés).

## AKCIÓK:
${actionBlocks}

Válaszolj KIZÁRÓLAG valid JSON tömbbel:
[{"action": "<slug>", "pick": <sorszám vagy 0>, "confidence": <0.0-1.0>}, ...]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) return new Map();
  const data = await res.json() as any;
  const text = data.content?.[0]?.text || '';
  const results = new Map<string, { bestId: string; bestName: string; confidence: number }>();
  try {
    const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]') as { action: string; pick: number; confidence: number }[];
    for (const item of parsed) {
      const ad = actions.find(a => a.slug === item.action);
      if (!ad || item.pick === 0 || item.pick > ad.candidates.length) continue;
      const chosen = ad.candidates[item.pick - 1];
      results.set(item.action, { bestId: chosen.id, bestName: chosen.name, confidence: item.confidence || 0.5 });
    }
  } catch { /* ignore */ }
  return results;
}

// ── Composite confidence ──

function compositeConfidence(embSim: number, llmConf: number, actionName: string, szName: string): number {
  const aw = actionName.toLowerCase().split(/\s+/);
  const sw = szName.toLowerCase().split(/\s+/);
  const hits = aw.filter(w => w.length >= 3 && sw.some(s => s.includes(w) || w.includes(s)));
  const nameOverlap = hits.length / Math.max(aw.length, 1);
  // Rebalanced: LLM confidence weighted highest, embedding sim secondary, name overlap as bonus
  return 0.3 * embSim + 0.45 * llmConf + 0.25 * nameOverlap;
}

interface SzItem { id: string; name: string; category?: string; }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const { operation, telephelyId = TEST_TELEPHELY_ID } = body;

    // ── dump-szotar ──
    if (operation === 'dump-szotar') {
      const { data, error } = await supabase.from('szotar_kezelesek').select('id, name, category').eq('telephely_id', telephelyId).order('name').limit(5000);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ telephelyId, count: data?.length || 0, items: data || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── stage1-embed: Generate embeddings, compute similarity scores, save to temp table ──
    if (operation === 'stage1-embed') {
      const { data: szotarItems, error: szErr } = await supabase.from('szotar_kezelesek').select('id, name, category').eq('telephely_id', telephelyId).limit(5000);
      if (szErr) throw new Error(szErr.message);
      if (!szotarItems?.length) throw new Error('No szótár items');

      console.log(`[Stage1] Embedding ${szotarItems.length} szótár items...`);
      const szotarTextsOrig = szotarItems.map((i: SzItem) => i.name);
      const szotarTextsEnriched = szotarItems.map((i: SzItem) => `${i.name}${i.category ? ` (${i.category})` : ''}`);

      const [szEmbOrig, szEmbEnriched] = await Promise.all([
        getEmbeddings(szotarTextsOrig),
        getEmbeddings(szotarTextsEnriched),
      ]);

      console.log(`[Stage1] Embedding ${ATOMIC_ACTIONS.length} atomic actions...`);
      const actionEmbs = await getEmbeddings(ATOMIC_ACTIONS.map(a => a.embeddingText));

      // Compute top-10 candidates for each action, for both original and enriched
      const scoreboard: Record<string, any> = {};

      for (let ai = 0; ai < ATOMIC_ACTIONS.length; ai++) {
        const action = ATOMIC_ACTIONS[ai];
        const aEmb = actionEmbs[ai];

        const origScored: { id: string; name: string; category: string; sim: number }[] = [];
        const enrichedScored: { id: string; name: string; category: string; sim: number }[] = [];

        for (let si = 0; si < szotarItems.length; si++) {
          const item = szotarItems[si] as SzItem;
          origScored.push({ id: item.id, name: item.name, category: item.category || '', sim: cosineSimilarity(aEmb, szEmbOrig[si]) });
          enrichedScored.push({ id: item.id, name: item.name, category: item.category || '', sim: cosineSimilarity(aEmb, szEmbEnriched[si]) });
        }

        origScored.sort((a, b) => b.sim - a.sim);
        enrichedScored.sort((a, b) => b.sim - a.sim);

        scoreboard[action.slug] = {
          actionName: action.nameHu,
          category: action.category,
          embeddingText: action.embeddingText,
          origTop10: origScored.slice(0, 10).filter(c => c.sim >= 0.35).map(c => ({ id: c.id, name: c.name, category: c.category, sim: +c.sim.toFixed(4) })),
          enrichedTop10: enrichedScored.slice(0, 10).filter(c => c.sim >= 0.35).map(c => ({ id: c.id, name: c.name, category: c.category, sim: +c.sim.toFixed(4) })),
        };
      }

      // Save to a JSON field in v2_clinic_defaults
      await supabase.from('v2_clinic_defaults').upsert({
        telephely_id: telephelyId,
        overrides: { mapping_test_scoreboard: scoreboard, mapping_test_at: new Date().toISOString() },
      }, { onConflict: 'telephely_id' });

      const withCandidates = Object.values(scoreboard).filter((s: any) => s.origTop10.length > 0).length;
      return new Response(JSON.stringify({
        success: true,
        actionsWithCandidates: withCandidates,
        totalActions: ATOMIC_ACTIONS.length,
        szotarCount: szotarItems.length,
        message: 'Embeddings computed and scoreboard saved. Run stage2-original next.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── stage2-original: Run original LLM refinement (one-by-one) ──
    if (operation === 'stage2-original') {
      const { data: defaults } = await supabase.from('v2_clinic_defaults').select('overrides').eq('telephely_id', telephelyId).maybeSingle();
      const scoreboard = defaults?.overrides?.mapping_test_scoreboard;
      if (!scoreboard) throw new Error('Run stage1-embed first');

      const results: Record<string, any> = {};
      let processed = 0;

      for (const action of ATOMIC_ACTIONS) {
        const sb = scoreboard[action.slug];
        if (!sb || sb.origTop10.length === 0) {
          results[action.slug] = { szotarName: null, szotarId: null, confidence: 0, method: 'no_match', embSim: 0 };
          processed++;
          continue;
        }

        const candidates = sb.origTop10.map((c: any) => ({ id: c.id, name: c.name, similarity: c.sim }));
        const llm = await llmRefineOne(action, candidates);

        if (llm) {
          results[action.slug] = { szotarName: llm.bestName, szotarId: llm.bestId, confidence: llm.confidence, method: 'llm', embSim: sb.origTop10.find((c: any) => c.id === llm.bestId)?.sim || 0 };
        } else {
          const top = sb.origTop10[0];
          results[action.slug] = { szotarName: top.name, szotarId: top.id, confidence: top.sim, method: 'embedding', embSim: top.sim };
        }
        processed++;
        if (processed % 10 === 0) console.log(`[Stage2-orig] ${processed}/${ATOMIC_ACTIONS.length}`);
      }

      // Save
      const existing = defaults?.overrides || {};
      await supabase.from('v2_clinic_defaults').upsert({
        telephely_id: telephelyId,
        overrides: { ...existing, mapping_test_original: results, mapping_test_original_at: new Date().toISOString() },
      }, { onConflict: 'telephely_id' });

      const mapped = Object.values(results).filter((r: any) => r.szotarName).length;
      const avgConf = +(Object.values(results).reduce((s: number, r: any) => s + r.confidence, 0) / Object.values(results).length).toFixed(3);

      return new Response(JSON.stringify({
        success: true,
        mapped,
        unmapped: ATOMIC_ACTIONS.length - mapped,
        avgConfidence: avgConf,
        message: 'Original pipeline done. Run stage3-improved next.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── stage3-improved: Enriched embeddings + 1-by-1 LLM (more accurate) + collision detection ──
    if (operation === 'stage3-improved') {
      const { data: defaults } = await supabase.from('v2_clinic_defaults').select('overrides').eq('telephely_id', telephelyId).maybeSingle();
      const scoreboard = defaults?.overrides?.mapping_test_scoreboard;
      if (!scoreboard) throw new Error('Run stage1-embed first');

      const results: Record<string, any> = {};
      let processed = 0;

      for (const action of ATOMIC_ACTIONS) {
        const sb = scoreboard[action.slug];
        // Use enriched embeddings (with category) instead of original
        const candidates = sb?.enrichedTop10 || [];
        
        if (candidates.length === 0) {
          results[action.slug] = { szotarName: null, szotarId: null, confidence: 0, method: 'no_match', embSim: 0 };
          processed++;
          continue;
        }

        const llmCandidates = candidates.map((c: any) => ({ id: c.id, name: c.name, similarity: c.sim }));
        const llm = await llmRefineOne(action, llmCandidates);

        if (llm) {
          const embSim = candidates.find((c: any) => c.id === llm.bestId)?.sim || 0;
          const comp = compositeConfidence(embSim, llm.confidence, action.nameHu, llm.bestName);
          results[action.slug] = { szotarName: llm.bestName, szotarId: llm.bestId, confidence: +comp.toFixed(3), llmConfidence: llm.confidence, method: 'enriched_llm', embSim };
        } else {
          const top = candidates[0];
          results[action.slug] = { szotarName: top.name, szotarId: top.id, confidence: +(top.sim * 0.6).toFixed(3), method: 'embedding_fallback', embSim: top.sim };
        }
        processed++;
        if (processed % 10 === 0) console.log(`[Stage3-improved] ${processed}/${ATOMIC_ACTIONS.length}`);
      }


      // Collision detection
      const usage = new Map<string, string[]>();
      for (const [slug, r] of Object.entries(results) as [string, any][]) {
        if (!r.szotarId) continue;
        usage.set(r.szotarId, [...(usage.get(r.szotarId) || []), slug]);
      }
      const collisions = [...usage.entries()].filter(([, slugs]) => slugs.length > 1).map(([id, slugs]) => ({
        szotarId: id,
        szotarName: (Object.values(results) as any[]).find(r => r.szotarId === id)?.szotarName,
        actions: slugs,
      }));

      // Save
      const existing = defaults?.overrides || {};
      await supabase.from('v2_clinic_defaults').upsert({
        telephely_id: telephelyId,
        overrides: { ...existing, mapping_test_improved: results, mapping_test_improved_at: new Date().toISOString(), mapping_test_collisions: collisions },
      }, { onConflict: 'telephely_id' });

      const mapped = Object.values(results).filter((r: any) => r.szotarName).length;
      const avgConf = +(Object.values(results).reduce((s: number, r: any) => s + r.confidence, 0) / Object.values(results).length).toFixed(3);

      return new Response(JSON.stringify({
        success: true,
        mapped,
        unmapped: ATOMIC_ACTIONS.length - mapped,
        avgConfidence: avgConf,
        collisions: collisions.length,
        collisionDetails: collisions,
        message: 'Improved pipeline done. Run stage4-compare for full comparison.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── stage4-compare: Generate comparison report ──
    if (operation === 'stage4-compare') {
      const { data: defaults } = await supabase.from('v2_clinic_defaults').select('overrides').eq('telephely_id', telephelyId).maybeSingle();
      const original = defaults?.overrides?.mapping_test_original;
      const improved = defaults?.overrides?.mapping_test_improved;
      const collisions = defaults?.overrides?.mapping_test_collisions || [];
      if (!original || !improved) throw new Error('Run stage2 and stage3 first');

      const comparison = ATOMIC_ACTIONS.map(a => {
        const o = original[a.slug] || {};
        const im = improved[a.slug] || {};
        return {
          slug: a.slug,
          name: a.nameHu,
          category: a.category,
          orig: { match: o.szotarName || '—', conf: o.confidence || 0, method: o.method || 'none' },
          impr: { match: im.szotarName || '—', conf: im.confidence || 0, method: im.method || 'none' },
          changed: o.szotarId !== im.szotarId,
          confDelta: +((im.confidence || 0) - (o.confidence || 0)).toFixed(3),
        };
      });

      const origMapped = comparison.filter(c => c.orig.match !== '—').length;
      const imprMapped = comparison.filter(c => c.impr.match !== '—').length;
      const changed = comparison.filter(c => c.changed);
      const confUp = comparison.filter(c => c.confDelta > 0.05);
      const confDown = comparison.filter(c => c.confDelta < -0.05);

      return new Response(JSON.stringify({
        summary: {
          originalMapped: origMapped,
          improvedMapped: imprMapped,
          totalActions: ATOMIC_ACTIONS.length,
          changedMappings: changed.length,
          confidenceImproved: confUp.length,
          confidenceDecreased: confDown.length,
          collisions: collisions.length,
          origAvgConf: +(comparison.reduce((s, c) => s + c.orig.conf, 0) / comparison.length).toFixed(3),
          imprAvgConf: +(comparison.reduce((s, c) => s + c.impr.conf, 0) / comparison.length).toFixed(3),
        },
        changedMappings: changed,
        collisions,
        fullComparison: comparison,
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Unknown operation. Use: dump-szotar, stage1-embed, stage2-original, stage3-improved, stage4-compare` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Test error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
