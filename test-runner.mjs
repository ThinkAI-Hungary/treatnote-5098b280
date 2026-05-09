#!/usr/bin/env node
// ============================================================
// TreatNote V2 — CLI Test Runner
// Runs generate → pipeline → assess without the UI
//
// Usage:
//   node test-runner.mjs                          # 1 run, medium complexity, random category
//   node test-runner.mjs --runs 5                 # 5 runs
//   node test-runner.mjs --complexity complex      # complex dictation
//   node test-runner.mjs --category sebeszet       # surgery focus
//   node test-runner.mjs --text "A 36-os fogon..." # custom text (skip generate)
//   node test-runner.mjs --runs 10 --complexity complex --category implantacio
// ============================================================

const BASE = 'https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw';
const TELEPHELY_ID = '79d8df9c-1795-4ef3-ba65-157c6635e9dd';

const HEADERS = {
  'Authorization': `Bearer ${ANON_KEY}`,
  'apikey': ANON_KEY,
  'Content-Type': 'application/json',
};

// ── Parse args ──
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}
const RUNS = parseInt(getArg('runs', '1'));
const COMPLEXITY = getArg('complexity', 'medium');
const CATEGORY = getArg('category', 'random');
const CUSTOM_TEXT = getArg('text', null);

// ── Colors ──
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', white: '\x1b[37m',
  bgGreen: '\x1b[42m', bgYellow: '\x1b[43m', bgRed: '\x1b[41m',
};

function verdictColor(v) {
  return v === 'PASS' ? `${c.bgGreen}${c.bold} ${v} ${c.reset}` :
         v === 'WARN' ? `${c.bgYellow}${c.bold} ${v} ${c.reset}` :
         `${c.bgRed}${c.bold} ${v} ${c.reset}`;
}

function severityIcon(s) {
  return s === 'critical' ? `${c.red}✗${c.reset}` :
         s === 'warning'  ? `${c.yellow}⚠${c.reset}` :
         `${c.green}✓${c.reset}`;
}

// ── API calls ──
async function generate(complexity, category) {
  const res = await fetch(`${BASE}/v2-generate-dictation`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ complexity, category: category === 'random' ? undefined : category }),
  });
  if (!res.ok) throw new Error(`Generate failed: ${res.status}`);
  return (await res.json()).text;
}

async function runPipeline(text) {
  const res = await fetch(`${BASE}/v2-test-text`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ text, telephelyId: TELEPHELY_ID }),
  });
  if (!res.ok) throw new Error(`Pipeline failed: ${res.status}`);
  return await res.json();
}

async function assess(inputText, data) {
  const res = await fetch(`${BASE}/v2-assess-result`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({
      inputText,
      rpaOutput: data.rpaOutput,
      unmapped: data.unmapped,
      protocolCount: data.protocolCount,
      vizitCount: data.vizitCount,
      itemCount: data.itemCount,
      debug: data.debug,
    }),
  });
  if (!res.ok) throw new Error(`Assess failed: ${res.status}`);
  return await res.json();
}

// ── Main ──
async function runOne(i) {
  console.log(`\n${c.cyan}${'═'.repeat(70)}${c.reset}`);
  console.log(`${c.bold}RUN ${i + 1}/${RUNS}${c.reset}  ${c.dim}complexity=${COMPLEXITY} category=${CATEGORY}${c.reset}`);
  console.log(`${c.cyan}${'═'.repeat(70)}${c.reset}`);

  // Step 1: Generate or use custom text
  let text;
  if (CUSTOM_TEXT) {
    text = CUSTOM_TEXT;
    console.log(`${c.dim}Using custom text${c.reset}`);
  } else {
    process.stdout.write(`${c.dim}Generating dictation...${c.reset}`);
    text = await generate(COMPLEXITY, CATEGORY);
    console.log(` ${c.green}done${c.reset}`);
  }

  console.log(`\n${c.bold}📝 Diktálás:${c.reset}`);
  console.log(`${c.white}${text}${c.reset}\n`);

  // Step 2: Run pipeline
  process.stdout.write(`${c.dim}Running pipeline...${c.reset}`);
  const t0 = Date.now();
  const result = await runPipeline(text);
  const pipelineMs = Date.now() - t0;
  console.log(` ${c.green}done${c.reset} ${c.dim}(${(pipelineMs/1000).toFixed(1)}s)${c.reset}`);

  // Print timing
  console.log(`\n${c.bold}⏱ Időzítés:${c.reset}`);
  for (const [stage, ms] of Object.entries(result.timing || {})) {
    const bar = '█'.repeat(Math.max(1, Math.round(ms / 100)));
    console.log(`  ${c.dim}${stage.padEnd(25)}${c.reset} ${String(ms).padStart(6)}ms ${c.cyan}${bar}${c.reset}`);
  }

  // Print RPA output
  console.log(`\n${c.bold}📋 RPA kimenet${c.reset} (${result.itemCount} tétel, ${result.vizitCount} vizit):`);
  for (const v of (result.rpaOutput?.vizitek || [])) {
    console.log(`  Vizit ${v.vizit} | fog ${String(v.fog || '—').padEnd(4)} | ${v.name || v.kezeles || '?'}`);
  }

  // Print unmapped
  if (result.unmapped?.length > 0) {
    console.log(`\n${c.yellow}⚠ Unmapped:${c.reset} ${result.unmapped.join(', ')}`);
  }

  // Step 3: Assess
  process.stdout.write(`\n${c.dim}Running AI assessment...${c.reset}`);
  const assessment = await assess(text, result);
  console.log(` ${c.green}done${c.reset}`);

  // Print assessment
  console.log(`\n${c.bold}🧠 AI Értékelés:${c.reset}  ${verdictColor(assessment.verdict)}  Score: ${c.bold}${assessment.score}${c.reset}/100`);
  console.log(`${c.white}${assessment.summary}${c.reset}`);

  if (assessment.findings?.length > 0) {
    console.log(`\n${c.bold}Megállapítások:${c.reset}`);
    for (const f of assessment.findings) {
      const stageTag = f.stage ? `${c.dim}[${f.stage}]${c.reset}` : '';
      console.log(`  ${severityIcon(f.severity)} ${c.bold}${f.type}${c.reset} ${stageTag}`);
      console.log(`    ${c.white}${f.description}${c.reset}`);
    }
  }

  return { score: assessment.score, verdict: assessment.verdict, unmapped: result.unmapped?.length || 0, pipelineMs };
}

// ── Run all ──
(async () => {
  console.log(`${c.bold}${c.cyan}TreatNote V2 — CLI Test Runner${c.reset}`);
  console.log(`${c.dim}Runs: ${RUNS} | Complexity: ${COMPLEXITY} | Category: ${CATEGORY} | Telephely: ${TELEPHELY_ID.slice(0,8)}...${c.reset}`);

  const results = [];
  for (let i = 0; i < RUNS; i++) {
    try {
      results.push(await runOne(i));
    } catch (err) {
      console.error(`\n${c.red}ERROR: ${err.message}${c.reset}`);
      results.push({ score: 0, verdict: 'ERROR', unmapped: 0, pipelineMs: 0 });
    }
  }

  // Summary
  if (RUNS > 1) {
    console.log(`\n${c.cyan}${'═'.repeat(70)}${c.reset}`);
    console.log(`${c.bold}ÖSSZESÍTÉS (${RUNS} futtatás)${c.reset}`);
    console.log(`${c.cyan}${'═'.repeat(70)}${c.reset}`);

    const scores = results.map(r => r.score);
    const avgScore = (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1);
    const pass = results.filter(r => r.verdict === 'PASS').length;
    const warn = results.filter(r => r.verdict === 'WARN').length;
    const fail = results.filter(r => r.verdict === 'FAIL' || r.verdict === 'ERROR').length;
    const avgMs = (results.reduce((a,r) => a+r.pipelineMs, 0) / results.length / 1000).toFixed(1);
    const totalUnmapped = results.reduce((a,r) => a+r.unmapped, 0);

    console.log(`  Átlag score:     ${c.bold}${avgScore}${c.reset}/100`);
    console.log(`  PASS/WARN/FAIL:  ${c.green}${pass}${c.reset} / ${c.yellow}${warn}${c.reset} / ${c.red}${fail}${c.reset}`);
    console.log(`  Átlag pipeline:  ${avgMs}s`);
    console.log(`  Össz. unmapped:  ${totalUnmapped}`);
    console.log(`  Min score:       ${Math.min(...scores)}`);
    console.log(`  Max score:       ${Math.max(...scores)}`);
  }
})();
