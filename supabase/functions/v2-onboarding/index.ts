// ============================================================
// TreatNote V2 — Onboarding Edge Function
// Operations: run-mapping, seed-variants, check-granularity
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ATOMIC_ACTIONS } from '../_shared/v2-engine/catalog/atomic-actions.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Embedding utilities ──

async function getEmbeddings(texts: string[], model = 'text-embedding-3-large'): Promise<number[][]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY required');

  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    for (const item of data.data) {
      all.push(item.embedding);
    }
  }
  return all;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── LLM Refinement ──

async function llmRefine(
  actionSlug: string, actionName: string, actionCategory: string, actionEmbeddingText: string,
  candidates: { name: string; id: string; similarity: number }[]
): Promise<{ bestId: string; bestName: string; conditions: Record<string, unknown>; confidence: number } | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;

  const candidateList = candidates
    .map((c, i) => `${i + 1}. "${c.name}" (hasonlóság: ${c.similarity.toFixed(3)})`)
    .join('\n');

  const prompt = `Te egy magyar fogászati számlázási rendszer szakértője vagy.

FELADAT: Egy atomi klinikai beavatkozást kell a klinika szótárának legjobban illő tételéhez rendelned.

## ATOMI AKCIÓ:
- Azonosító: ${actionSlug}
- Megnevezés: ${actionName}
- Kategória: ${actionCategory}
- Leírás: ${actionEmbeddingText}

## SZABÁLYOK:
1. Az atomi akció egy KONKRÉT BEAVATKOZÁSI LÉPÉS, NEM a végtermék.
2. Ha a szótárban van pontos egyezés, MINDIG azt válaszd.
3. NE válassz végtermék-tételt ha a keresett akció csak egy lépés.
4. Ha EGYIK sem illik, válaszolj 0-val.

## JELÖLTEK:
${candidateList}

Válaszolj KIZÁRÓLAG JSON-ban:
{"pick": <sorszám vagy 0>, "confidence": <0.0-1.0>, "conditions": {}}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) return null;
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
      bestId: chosen.id,
      bestName: chosen.name,
      conditions: parsed.conditions || {},
      confidence: parsed.confidence || 0.5,
    };
  } catch {
    return null;
  }
}

// ── Main Operations ──

interface SzotarItem {
  id: string;
  name: string;
  category?: string;
}

async function runMappingPipeline(telephelyId: string, supabase: any): Promise<any> {
  // 1. Fetch szótár items
  const { data: szotarItems, error: szError } = await supabase
    .from('szotar_kezelesek')
    .select('id, name, category')
    .eq('telephely_id', telephelyId)
    .limit(5000);

  if (szError) throw new Error(`Failed to fetch szótár: ${szError.message}`);
  if (!szotarItems?.length) throw new Error('No szótár items found for this telephely');

  // 2. Generate embeddings for szótár items
  const szotarTexts = szotarItems.map((i: SzotarItem) => i.name);
  const szotarEmbVectors = await getEmbeddings(szotarTexts);
  const szotarEmbeddings = new Map<string, number[]>();
  szotarItems.forEach((item: SzotarItem, i: number) => szotarEmbeddings.set(item.id, szotarEmbVectors[i]));

  // 3. Generate embeddings for atomic actions
  const actionTexts = ATOMIC_ACTIONS.map(a => a.embeddingText);
  const actionEmbVectors = await getEmbeddings(actionTexts);
  const actionEmbeddings = new Map<string, number[]>();
  ATOMIC_ACTIONS.forEach((a, i) => actionEmbeddings.set(a.slug, actionEmbVectors[i]));

  // 4. Embedding matching + LLM refinement
  const results: any[] = [];
  const topK = 10;
  const minSimilarity = 0.35;

  for (const action of ATOMIC_ACTIONS) {
    const actionEmb = actionEmbeddings.get(action.slug);
    if (!actionEmb) continue;

    // Score all szótár items
    const scored: { szotarItem: SzotarItem; similarity: number }[] = [];
    for (const item of szotarItems as SzotarItem[]) {
      const itemEmb = szotarEmbeddings.get(item.id);
      if (!itemEmb) continue;
      const sim = cosineSimilarity(actionEmb, itemEmb);
      scored.push({ szotarItem: item, similarity: sim });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    const filtered = scored.slice(0, topK).filter(c => c.similarity >= minSimilarity);

    if (filtered.length === 0) continue;

    // LLM refinement
    const candidates = filtered.map(c => ({ id: c.szotarItem.id, name: c.szotarItem.name, similarity: c.similarity }));
    const llmResult = await llmRefine(action.slug, action.nameHu, action.category, action.embeddingText, candidates);

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
    } else {
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

  // 5. Save to Supabase
  // Clear old mappings
  await supabase.from('v2_clinic_mappings').delete().eq('telephely_id', telephelyId);

  // Insert new mappings
  const rows = results.map(r => ({
    telephely_id: telephelyId,
    szotar_kezeles_id: r.szotarKezelesId,
    szotar_kezeles_name: r.szotarKezelesName,
    atomic_action_slug: r.atomicActionSlug,
    conditions: r.conditions,
    confidence: r.confidence,
    reviewed: false,
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('v2_clinic_mappings').insert(rows);
    if (insertError) throw new Error(`Failed to save mappings: ${insertError.message}`);
  }

  const high = results.filter(r => r.confidence >= 0.8).length;
  const med = results.filter(r => r.confidence >= 0.5 && r.confidence < 0.8).length;
  const low = results.filter(r => r.confidence < 0.5).length;

  return {
    total: results.length,
    totalActions: ATOMIC_ACTIONS.length,
    high,
    medium: med,
    low,
    mappings: results,
  };
}

// ── Condition Variant Rules (ported from new_engine/onboarding/condition-variants.ts) ──

interface VariantRule {
  atomicActionSlug: string;
  conditionKey: string;
  variants: { value: unknown; searchTerms: string[]; negativeTerms?: string[] }[];
}

const VARIANT_RULES: VariantRule[] = [
  // ENDODONTIA
  {
    atomicActionSlug: 'gyokerkezeles_csatornankent',
    conditionKey: 'canal_count',
    variants: [
      { value: 1, searchTerms: ['gyökérkezelés 1 csatorna', 'mikroszkópos gyökérkezelés 1 csatorna'] },
      { value: 2, searchTerms: ['gyökérkezelés 2 csatorna', 'mikroszkópos gyökérkezelés 2 csatorna'] },
      { value: 3, searchTerms: ['gyökérkezelés 3 csatorna', 'mikroszkópos gyökérkezelés 3 csatorna'] },
      { value: 4, searchTerms: ['gyökérkezelés 4 csatorna', 'mikroszkópos gyökérkezelés 4 csatorna'] },
    ],
  },
  {
    atomicActionSlug: 'csatorna_feltaras',
    conditionKey: 'canal_count',
    variants: [
      { value: 1, searchTerms: ['gyökérkezelés 1 csatorna első kezelés', 'csatornafeltárás 1 csatorna'] },
      { value: 2, searchTerms: ['gyökérkezelés 2 csatorna első kezelés', 'csatornafeltárás 2 csatorna'] },
      { value: 3, searchTerms: ['gyökérkezelés 3 csatorna első kezelés', 'csatornafeltárás 3 csatorna'] },
      { value: 4, searchTerms: ['gyökérkezelés 4 csatorna első kezelés', 'csatornafeltárás 4 csatorna'] },
    ],
  },
  {
    atomicActionSlug: 'gyokertomes',
    conditionKey: 'tooth_region',
    variants: [
      { value: 'front', searchTerms: ['gyökérkezelés gyökértöméssel front fogon', 'gyökértömés front fog'] },
      { value: 'premolar', searchTerms: ['gyökérkezelés gyökértöméssel kisőrlő fogon', 'gyökértömés kisőrlő'] },
      { value: 'molar', searchTerms: ['gyökérkezelés gyökértöméssel nagyőrlő fogon Dental Excellence', 'gyökértömés nagyőrlő'], negativeTerms: ['4 csatorna'] },
      { value: 'molar_4ch', searchTerms: ['gyökérkezelés gyökértöméssel nagyőrlő fogon 4 csatorna esetén'] },
    ],
  },
  {
    atomicActionSlug: 'gyokertomes_eltavolitas',
    conditionKey: 'canal_count',
    variants: [
      { value: 1, searchTerms: ['régi gyökértömés eltávolítása frontfog', 'gyökértömés eltávolítás front'] },
      { value: 2, searchTerms: ['régi gyökértömés eltávolítása kisőrlő', 'gyökértömés eltávolítás kisőrlő csatornánként'] },
      { value: 3, searchTerms: ['régi gyökértömés eltávolítása nagyőrlő csatornánként', 'gyökértömés eltávolítás nagyőrlő'] },
      { value: 4, searchTerms: ['régi gyökértömés eltávolítása nagyőrlő csatornánként', 'gyökértömés eltávolítás nagyőrlő'] },
    ],
  },
  // TÖMÉS
  {
    atomicActionSlug: 'kompozit_tomes_1_felszin',
    conditionKey: 'tooth_region',
    variants: [
      { value: 'front', searchTerms: ['frontfog 1 felszínű tömés', 'frontfog tömés egy felszín'] },
      { value: 'premolar', searchTerms: ['kisőrlő tömés 1 felszínű', 'kisőrlő tömés egy felszín'] },
      { value: 'molar', searchTerms: ['nagyőrlő tömés 1 felszínű', 'nagyőrlő tömés egy felszín'] },
    ],
  },
  {
    atomicActionSlug: 'kompozit_tomes_tobb_felszin',
    conditionKey: 'tooth_region',
    variants: [
      { value: 'front', searchTerms: ['frontfog 3 felszínű tömés', 'frontfog tömés több felszín'] },
      { value: 'premolar', searchTerms: ['kisőrlő tömés 2 vagy több felszínű', 'kisőrlő tömés több felszín'] },
      { value: 'molar', searchTerms: ['nagyőrlő direkt restauráció 2 vagy több felszínű tömés', 'nagyőrlő tömés két vagy több felszín'] },
    ],
  },
  // IMPLANTÁCIÓ
  {
    atomicActionSlug: 'implantatum_beultes',
    conditionKey: 'brand',
    variants: [
      { value: 'nobel', searchTerms: ['fogbeültetés NobelActive TiUltra Nobel-Biocare', 'Nobel implantátum beültetés'] },
      { value: 'straumann', searchTerms: ['Straumann implantátum beültetés fogbeültetés'] },
      { value: 'alpha_bio', searchTerms: ['AlphaBio implantátum beültetés fogbeültetés'] },
      { value: 'dentium', searchTerms: ['Dentium SuperLine implantátum beültetés fogbeültetés'] },
    ],
  },
  {
    atomicActionSlug: 'abutment',
    conditionKey: 'brand',
    variants: [
      { value: 'nobel', searchTerms: ['felépítő fej Nobel-Biocare implantátumhoz', 'Nobel felépítő fej'] },
      { value: 'alpha_bio', searchTerms: ['felépítő fej Alpha Bio implantátumhoz'] },
      { value: 'dentium', searchTerms: ['felépítő fej Dentium implantátumhoz'] },
      { value: 'standard', searchTerms: ['felépítőfej implantátumra'] },
    ],
  },
  // KORONA
  {
    atomicActionSlug: 'fem_keramia_korona',
    conditionKey: 'type',
    variants: [
      { value: 'standard', searchTerms: ['fém kerámia korona'] },
      { value: 'dental_excellence', searchTerms: ['fém kerámia korona Dental Excellence'] },
    ],
  },
  {
    atomicActionSlug: 'cirkon_korona',
    conditionKey: 'type',
    variants: [
      { value: 'full_kontur', searchTerms: ['cirkon korona fémmentes korona', 'fémmentes cirkon korona'] },
      { value: 'veneered', searchTerms: ['cirkon korona Empress E-max fémmentes korona hídtag'] },
    ],
  },
  {
    atomicActionSlug: 'emax_korona',
    conditionKey: 'type',
    variants: [
      { value: 'standard', searchTerms: ['E-max koronák préskerámia'] },
      { value: 'hej', searchTerms: ['E-max porcelán héj'] },
    ],
  },
  {
    atomicActionSlug: 'implant_korona',
    conditionKey: 'material',
    variants: [
      { value: 'fem_keramia', searchTerms: ['átmenőcsavaros rögzítésű fém kerámia korona implantátumhoz'] },
      { value: 'cirkon', searchTerms: ['átmenőcsavaros cirkon korona implantátumokba', 'cirkon fémmentes korona implantátumon'] },
    ],
  },
  {
    atomicActionSlug: 'veneer_hej',
    conditionKey: 'material',
    variants: [
      { value: 'emax', searchTerms: ['E-max porcelán héj', 'E-max héjak'] },
      { value: 'kompozit', searchTerms: ['direkt héj foganként', 'Renamel direkt héjak'] },
    ],
  },
  // CSONTPÓTLÁS
  {
    atomicActionSlug: 'csontpotlas',
    conditionKey: 'material',
    variants: [
      { value: 'bio_oss', searchTerms: ['Bio-oss csontpótló anyag gramm Geistlich', 'Bio-Oss csontpótlás'] },
      { value: 'cerabone', searchTerms: ['Cerabone csontpótló anyag gramm Botiss'] },
      { value: 'xenogain', searchTerms: ['Creos csontpótló Xenogain'] },
      { value: 'ethoss', searchTerms: ['Ethoss csontpótló anyag'] },
    ],
  },
  {
    atomicActionSlug: 'membran',
    conditionKey: 'brand',
    variants: [
      { value: 'biogide', searchTerms: ['BioGide membrán mérettől függően'] },
      { value: 'creos', searchTerms: ['Creos membrán Xenoprotect'] },
      { value: 'jason', searchTerms: ['Jason membrán mérettől függően'] },
      { value: 'cytoplast', searchTerms: ['Cytoplast titán merevítésű nem felszívódó biomembrán'] },
    ],
  },
  // LENYOMAT
  {
    atomicActionSlug: 'lenyomatvetel',
    conditionKey: 'method',
    variants: [
      { value: 'digital', searchTerms: ['Digitális lenyomat állcsontonként'] },
      { value: 'alginat', searchTerms: ['alginát lenyomatvétel', 'Tanulmányi lenyomat állcsontonként alginát lenyomatanyagból'] },
      { value: 'szilikon', searchTerms: ['Lenyomati díj precíziós szilikon lenyomattal állcsontonként'] },
      { value: 'egyeni_kanal', searchTerms: ['Lenyomati díj egyéni kanállal állcsontonként'] },
    ],
  },
  {
    atomicActionSlug: 'gyogyulasi_sapka',
    conditionKey: 'brand',
    variants: [
      { value: 'nobel', searchTerms: ['Gyógyulási sapka multiunit fejre Nobel'] },
      { value: 'standard', searchTerms: ['Sapka ideiglenes célból'] },
    ],
  },
  {
    atomicActionSlug: 'socket_prezervacio',
    conditionKey: 'tooth_region',
    variants: [
      { value: 'front', searchTerms: ['Csontpótlás egy fog húzási helyének feltöltésére front és premoláris fog esetén'] },
      { value: 'molar', searchTerms: ['Csontpótlás egy fog húzási helyének feltöltésére moláris fog esetén'] },
    ],
  },
];

/** Seed condition-based variant mappings */
async function seedVariants(telephelyId: string, supabase: any): Promise<any> {
  // 1. Fetch szótár items
  const { data: szotarItems, error: szError } = await supabase
    .from('szotar_kezelesek')
    .select('id, name, category')
    .eq('telephely_id', telephelyId)
    .limit(5000);

  if (szError) throw new Error(`Failed to fetch szótár: ${szError.message}`);
  if (!szotarItems?.length) throw new Error('No szótár items found');

  // 2. Generate embeddings for szótár items
  const szotarTexts = szotarItems.map((i: SzotarItem) => i.name);
  const szotarEmbVectors = await getEmbeddings(szotarTexts);
  const szotarEmbeddings = new Map<string, number[]>();
  szotarItems.forEach((item: SzotarItem, i: number) => szotarEmbeddings.set(item.id, szotarEmbVectors[i]));

  let totalInserted = 0;
  const details: { slug: string; condition: string; value: unknown; match: string; similarity: number }[] = [];

  for (const rule of VARIANT_RULES) {
    // Remove old condition-specific mappings for this action
    await supabase
      .from('v2_clinic_mappings')
      .delete()
      .eq('telephely_id', telephelyId)
      .eq('atomic_action_slug', rule.atomicActionSlug)
      .neq('conditions', {});

    for (const variant of rule.variants) {
      // Embed search terms
      const searchEmbeddings = await getEmbeddings(variant.searchTerms);

      // Find best szótár match
      let bestItem: SzotarItem | null = null;
      let bestSim = 0;

      for (const szItem of szotarItems as SzotarItem[]) {
        // Skip items matching negativeTerms
        if (variant.negativeTerms?.length) {
          const nameLower = szItem.name.toLowerCase();
          if (variant.negativeTerms.some(nt => nameLower.includes(nt.toLowerCase()))) continue;
        }
        const szEmb = szotarEmbeddings.get(szItem.id)!;
        for (const searchEmb of searchEmbeddings) {
          const sim = cosineSimilarity(searchEmb, szEmb);
          if (sim > bestSim) {
            bestSim = sim;
            bestItem = szItem;
          }
        }
      }

      if (bestItem && bestSim > 0.5) {
        const conditions = { [rule.conditionKey]: variant.value };
        await supabase.from('v2_clinic_mappings').insert({
          telephely_id: telephelyId,
          szotar_kezeles_id: bestItem.id,
          szotar_kezeles_name: bestItem.name,
          atomic_action_slug: rule.atomicActionSlug,
          conditions,
          confidence: bestSim,
          reviewed: false,
        });
        details.push({ slug: rule.atomicActionSlug, condition: rule.conditionKey, value: variant.value, match: bestItem.name, similarity: bestSim });
        totalInserted++;
        console.log(`  ${rule.atomicActionSlug} ${rule.conditionKey}=${variant.value} → "${bestItem.name}" (${bestSim.toFixed(3)})`);
      }
    }
  }

  return { totalInserted, rules: VARIANT_RULES.length, details };
}

async function checkGranularity(telephelyId: string, supabase: any): Promise<any> {
  const { data: items, error } = await supabase
    .from('szotar_kezelesek')
    .select('id, name, category')
    .eq('telephely_id', telephelyId)
    .limit(5000);

  if (error) throw new Error(`Failed to fetch szótár: ${error.message}`);

  const BUNDLE_SIGNALS = [
    /\ball.?on.?\d/i,
    /teljes.*(kezelés|rehabilitáció|ellátás)/i,
    /csomag/i,
    /komplett/i,
    /\+.*\+/,
    /tartalmaz/i,
    /mindent tartalmaz/i,
  ];

  const treatmentKeywords = [
    'korona', 'lenyomat', 'tömés', 'gyökérkezelés', 'extractio',
    'implant', 'csontpótlás', 'membrán', 'kürett', 'depurálás',
  ];

  const issues: any[] = [];
  for (const item of items || []) {
    for (const signal of BUNDLE_SIGNALS) {
      if (signal.test(item.name)) {
        issues.push({ item, reason: `Bundle-gyanú: "${item.name}"`, severity: 'warning' });
        break;
      }
    }
    const matches = treatmentKeywords.filter(kw => item.name.toLowerCase().includes(kw.toLowerCase()));
    if (matches.length >= 3) {
      issues.push({ item, reason: `Több kezelés egy tételben: ${matches.join(', ')}`, severity: 'error' });
    }
  }

  return { count: issues.length, issues };
}

// ── HTTP Handler ──

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { operation, telephelyId } = body;

    if (!telephelyId) {
      return new Response(JSON.stringify({ error: 'telephelyId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    switch (operation) {
      case 'run-mapping': {
        // Run in background to avoid 150s timeout
        // The mapping pipeline does 60+ LLM calls and takes 3-5 minutes
        const backgroundTask = (async () => {
          try {
            console.log(`[V2 Onboarding] Starting mapping for ${telephelyId}`);
            const result = await runMappingPipeline(telephelyId, supabase);
            console.log(`[V2 Onboarding] Base mapping completed: ${result.total} mappings saved`);
            
            // Auto-seed condition variants after base mapping
            console.log(`[V2 Onboarding] Starting variant seeding...`);
            const variantResult = await seedVariants(telephelyId, supabase);
            console.log(`[V2 Onboarding] Variants completed: ${variantResult.totalInserted} variants seeded`);
            
            // Save completion status
            await supabase.from('v2_clinic_defaults').upsert({
              telephely_id: telephelyId,
              overrides: {
                onboarding_status: 'completed',
                onboarding_completed_at: new Date().toISOString(),
                mapping_stats: { total: result.total, high: result.high, medium: result.medium, low: result.low },
              },
            }, { onConflict: 'telephely_id' });
          } catch (error) {
            console.error(`[V2 Onboarding] Error:`, error);
            await supabase.from('v2_clinic_defaults').upsert({
              telephely_id: telephelyId,
              overrides: {
                onboarding_status: 'error',
                onboarding_error: error instanceof Error ? error.message : String(error),
                onboarding_failed_at: new Date().toISOString(),
              },
            }, { onConflict: 'telephely_id' });
          }
        })();

        // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
        EdgeRuntime.waitUntil(backgroundTask);

        // Save "in progress" status
        await supabase.from('v2_clinic_defaults').upsert({
          telephely_id: telephelyId,
          overrides: {
            onboarding_status: 'running',
            onboarding_started_at: new Date().toISOString(),
          },
        }, { onConflict: 'telephely_id' });

        return new Response(JSON.stringify({
          success: true,
          status: 'started',
          message: 'Mapping pipeline started in background. Check v2_clinic_defaults for progress.',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'check-granularity': {
        // This is fast, run synchronously
        const result = await checkGranularity(telephelyId, supabase);
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'seed-variants': {
        // Run variant seeding in background (many embedding calls)
        const variantTask = (async () => {
          try {
            console.log(`[V2 Onboarding] Starting variant seeding for ${telephelyId}`);
            const result = await seedVariants(telephelyId, supabase);
            console.log(`[V2 Onboarding] Variants completed: ${result.totalInserted} inserted`);
          } catch (error) {
            console.error(`[V2 Onboarding] Variant seeding error:`, error);
          }
        })();

        // @ts-ignore
        EdgeRuntime.waitUntil(variantTask);

        return new Response(JSON.stringify({
          success: true,
          status: 'started',
          message: `Variant seeding started for ${VARIANT_RULES.length} actions. Takes ~2 minutes.`,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'check-status': {
        // Check onboarding progress
        const { data } = await supabase
          .from('v2_clinic_defaults')
          .select('overrides')
          .eq('telephely_id', telephelyId)
          .maybeSingle();

        const { data: mappingCount } = await supabase
          .from('v2_clinic_mappings')
          .select('id', { count: 'exact', head: true })
          .eq('telephely_id', telephelyId);

        return new Response(JSON.stringify({
          success: true,
          status: data?.overrides?.onboarding_status || 'not_started',
          mappings_count: mappingCount?.length || 0,
          details: data?.overrides || {},
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown operation: ${operation}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error) {
    console.error('V2 Onboarding error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

