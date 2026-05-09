#!/usr/bin/env node
// ============================================================
// V2 Onboarding Runner — Direct Supabase REST (no Edge Function timeout)
// Usage: node run-onboarding.mjs <telephelyId>
// ============================================================

const SUPABASE_URL = 'https://bpjzgapmoyhtgryglcke.supabase.co';
const SUPABASE_KEY = 'sb_secret_gRiwdPwnR3BcA6zo1a8XXQ_Z7bJr8Vn';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!OPENAI_API_KEY) { console.error('Set OPENAI_API_KEY'); process.exit(1); }
if (!ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }

const telephelyId = process.argv[2] || 'e10596bd-f542-4ad4-ab6b-cdfe94fa06ef';

// ── Supabase helpers ──
async function supaGet(table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supaDelete(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase DELETE ${res.status}: ${await res.text()}`);
}

async function supaInsert(table, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(`Supabase INSERT ${res.status}: ${await res.text()}`);
}

// ── Embeddings ──
async function getEmbeddings(texts) {
  const all = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-large', input: batch })
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const item of data.data) all.push(item.embedding);
  }
  return all;
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── LLM Refinement ──
async function llmRefine(slug, name, category, embText, candidates) {
  const list = candidates.map((c,i) => `${i+1}. "${c.name}" (hasonlóság: ${c.sim.toFixed(3)})`).join('\n');
  const prompt = `Te egy magyar fogászati számlázási rendszer szakértője vagy.\n\nFELADAT: Egy atomi klinikai beavatkozást kell a klinika szótárának legjobban illő tételéhez rendelned.\n\n## ATOMI AKCIÓ:\n- Azonosító: ${slug}\n- Megnevezés: ${name}\n- Kategória: ${category}\n- Leírás: ${embText}\n\n## SZABÁLYOK:\n1. Az atomi akció egy KONKRÉT BEAVATKOZÁSI LÉPÉS, NEM a végtermék.\n2. Ha pontos egyezés van, MINDIG azt válaszd.\n3. NE válassz végtermék-tételt ha a keresett akció csak egy lépés.\n4. Ha EGYIK sem illik, válaszolj 0-val.\n\n## JELÖLTEK:\n${list}\n\nVálaszolj KIZÁRÓLAG JSON-ban:\n{"pick": <sorszám vagy 0>, "confidence": <0.0-1.0>, "conditions": {}}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]);
    if (p.pick === 0 || p.pick > candidates.length) return null;
    const chosen = candidates[p.pick - 1];
    return { id: chosen.id, name: chosen.name, conditions: p.conditions || {}, confidence: p.confidence || 0.5 };
  } catch { return null; }
}

// ── Atomic Actions (inline minimal catalog) ──
// Import from the engine source
const catalogPath = new URL('./new_engine/catalog/actions-konzervalo.ts', `file://${process.cwd()}/`);

// We'll just load action slugs + embeddingText from the catalog files directly
// Since this is .mjs running on Node, we can't import .ts - so inline the catalog
async function loadCatalog() {
  // Read catalog files and extract action data using regex
  const { readFileSync } = await import('fs');
  const files = [
    'new_engine/catalog/actions-konzervalo.ts',
    'new_engine/catalog/actions-fogpotlastan.ts', 
    'new_engine/catalog/actions-surgical.ts',
    'new_engine/catalog/actions-diagnostic-kozos.ts',
  ];
  const actions = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    // Extract slug, nameHu, category, embeddingText from each action object
    const regex = /\{\s*slug:\s*'([^']+)',\s*nameHu:\s*'([^']+)',\s*category:\s*'([^']+)',[\s\S]*?embeddingText:\s*'([^']+)'/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      actions.push({ slug: match[1], nameHu: match[2], category: match[3], embeddingText: match[4] });
    }
  }
  return actions;
}

// ── Main ──
async function main() {
  console.log(`\n=== V2 Onboarding: ${telephelyId} ===\n`);

  // 1. Load catalog
  console.log('1. Loading atomic actions catalog...');
  const actions = await loadCatalog();
  console.log(`   ${actions.length} actions loaded`);

  // 2. Fetch szótár
  console.log('2. Fetching szótár items...');
  const szotarItems = await supaGet('szotar_kezelesek', `telephely_id=eq.${telephelyId}&select=id,name,category&limit=5000`);
  console.log(`   ${szotarItems.length} items found`);
  if (szotarItems.length === 0) { console.error('No szótár items!'); process.exit(1); }

  // 3. Embed szótár
  console.log('3. Embedding szótár items...');
  const szEmbeddings = await getEmbeddings(szotarItems.map(i => i.name));
  console.log(`   ${szEmbeddings.length} embeddings generated`);

  // 4. Embed actions
  console.log('4. Embedding atomic actions...');
  const actEmbeddings = await getEmbeddings(actions.map(a => a.embeddingText));
  console.log(`   ${actEmbeddings.length} embeddings generated`);

  // 5. Match + refine
  console.log('5. Matching + LLM refinement...\n');
  const results = [];
  for (let ai = 0; ai < actions.length; ai++) {
    const action = actions[ai];
    const actEmb = actEmbeddings[ai];

    // Score
    const scored = szotarItems.map((item, si) => ({ id: item.id, name: item.name, sim: cosineSim(actEmb, szEmbeddings[si]) }));
    scored.sort((a, b) => b.sim - a.sim);
    const top = scored.slice(0, 10).filter(c => c.sim >= 0.35);

    if (top.length === 0) {
      process.stdout.write(`   ⚠ ${action.slug}: no candidates\n`);
      continue;
    }

    // LLM refine
    process.stdout.write(`   🤖 ${action.slug}...`);
    const llm = await llmRefine(action.slug, action.nameHu, action.category, action.embeddingText, top);

    if (llm) {
      results.push({
        telephely_id: telephelyId,
        atomic_action_slug: action.slug,
        szotar_kezeles_id: llm.id,
        szotar_kezeles_name: llm.name,
        conditions: llm.conditions,
        confidence: llm.confidence,
        reviewed: false,
      });
      console.log(` → "${llm.name}" (${llm.confidence.toFixed(2)})`);
    } else {
      results.push({
        telephely_id: telephelyId,
        atomic_action_slug: action.slug,
        szotar_kezeles_id: top[0].id,
        szotar_kezeles_name: top[0].name,
        conditions: {},
        confidence: top[0].sim,
        reviewed: false,
      });
      console.log(` → fallback: "${top[0].name}" (${top[0].sim.toFixed(3)})`);
    }
  }

  // 6. Save
  console.log(`\n6. Saving ${results.length} mappings...`);
  await supaDelete('v2_clinic_mappings', `telephely_id=eq.${telephelyId}`);
  if (results.length > 0) {
    // Insert in batches of 50
    for (let i = 0; i < results.length; i += 50) {
      await supaInsert('v2_clinic_mappings', results.slice(i, i + 50));
    }
  }

  const high = results.filter(r => r.confidence >= 0.8).length;
  const med = results.filter(r => r.confidence >= 0.5 && r.confidence < 0.8).length;
  const low = results.filter(r => r.confidence < 0.5).length;
  console.log(`\n=== DONE ===`);
  console.log(`Total: ${results.length}/${actions.length} mapped`);
  console.log(`  HIGH (≥0.8): ${high}`);
  console.log(`  MEDIUM (0.5-0.8): ${med}`);
  console.log(`  LOW (<0.5): ${low}`);
}

main().catch(err => { console.error(err); process.exit(1); });
