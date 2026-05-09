#!/usr/bin/env node
// ============================================================
// TreatNote V2 — Stress Test
// Runs ALL complexity × category combinations + edge cases
//
// Usage:
//   node stress-test.mjs              # full suite (15 AI-generated + 12 edge cases)
//   node stress-test.mjs --fast       # edge cases only (no AI generation, faster)
//   node stress-test.mjs --parallel 3 # 3 concurrent runs (careful with rate limits)
// ============================================================

const BASE = 'https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw';
const TELEPHELY_ID = '79d8df9c-1795-4ef3-ba65-157c6635e9dd';
const HEADERS = { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' };

const args = process.argv.slice(2);
const FAST = args.includes('--fast');
const parallelIdx = args.indexOf('--parallel');
const PARALLEL = parallelIdx !== -1 && args[parallelIdx + 1] ? parseInt(args[parallelIdx + 1]) : 1;

// ── Colors ──
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', white: '\x1b[37m',
  bgGreen: '\x1b[42m', bgYellow: '\x1b[43m', bgRed: '\x1b[41m',
};

// ── Edge cases: handcrafted dictations that test specific pipeline behaviors ──
const EDGE_CASES = [
  // Template expansion
  { name: 'Gyökérkezelés template', text: 'A 14-es fogon gyökérkezelést végeztem, 3 csatornát tártam fel, gyógyszeres zárás történt.', expect: 'template expansion with canal count' },
  { name: 'Egyszeri gyökérkezelés + gyökértömés', text: 'A 46-os fogon 4 csatornás gyökérkezelést és gyökértömést végeztem egy ülésben.', expect: 'complete endo in one visit' },
  { name: 'Korona prep template', text: 'A 21-es fogon cirkónium korona preparációt végeztem, digitális lenyomatot vettem és ideiglenes koronát ragasztottam.', expect: 'cirkon_korona_elso_ules template' },

  // Multi-treatment
  { name: 'Két különböző tömés', text: 'A 36-os fogon háromfelszínű kompozit tömést készítettem, a 46-os fogon egyfelszínű tömést végeztem.', expect: '2 separate protocols, same visit' },
  { name: '3 fog, 3 kezelés', text: 'A 14-es fogon infiltrációs érzéstelenítés után egyfelszínű kompozit tömés készült. A 36-os fogon háromfelszínű MOD tömés. A 46-os fogon csatornafeltárás és gyógyszeres zárás 3 csatornán.', expect: '3 protocols in single visit' },

  // Phase separation
  { name: 'Extractio + implant (fázis szétválasztás)', text: 'A 36-os fogat eltávolítottam sebészeti feltárásból, socket prezervációt végeztem csontpótlással. Majd a 36-os régióba implantátumot ültetek Nobel Biocare rendszerrel.', expect: 'extractio and implant should be separate visits' },
  { name: 'Diagnosztika + sebészet', text: 'Panoráma röntgent készítettem, CBCT-t csináltam a 36-os régióról, majd a 48-as bölcsességfogat sebészeti feltárásból eltávolítottam.', expect: 'diagnostic and surgical in separate protocols' },

  // Scaling
  { name: 'Több felszín scaling', text: 'A 15-ös fogon kétfelszínű MO kompozit tömést végeztem.', expect: 'correct surface count = 2' },
  { name: 'Per-canal scaling', text: 'A 26-os fogon 4 csatornás gyökérkezelést végeztem.', expect: 'canal_count = 4' },

  // Clinical validation edge cases
  { name: 'Sinus lift alsó fogra (kell tiltani)', text: 'A 36-os régióban nyílt sinus liftet végeztem csontpótlással.', expect: 'Pass C should reject: sinus lift on lower jaw' },
  { name: 'Extractio + tömés ugyanarra (kell tiltani)', text: 'A 14-es fogat elhúztam, majd a 14-es fogon kompozit tömést végeztem.', expect: 'Pass B should reject: filling after extraction' },

  // Empty/edge
  { name: 'Minimális input', text: 'Tömés.', expect: 'should still extract something, even minimal' },
];

// ── AI-generated complexity × category matrix ──
const COMPLEXITIES = ['simple', 'medium', 'complex'];
const CATEGORIES = ['random', 'konzervalo', 'sebeszet', 'implantacio', 'fogpotlastan'];

async function callFn(fn, body) {
  const res = await fetch(`${BASE}/${fn}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${fn} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function runTest(label, text, expectation) {
  const t0 = Date.now();
  try {
    const result = await callFn('v2-test-text', { text, telephelyId: TELEPHELY_ID });
    const pipelineMs = Date.now() - t0;

    const assessment = await callFn('v2-assess-result', {
      inputText: text, rpaOutput: result.rpaOutput, unmapped: result.unmapped,
      protocolCount: result.protocolCount, vizitCount: result.vizitCount,
      itemCount: result.itemCount, debug: result.debug,
    });

    return {
      label, text, expectation,
      score: assessment.score, verdict: assessment.verdict,
      summary: assessment.summary, findings: assessment.findings,
      protocolCount: result.protocolCount, vizitCount: result.vizitCount,
      itemCount: result.itemCount, unmapped: result.unmapped || [],
      pipelineMs, totalMs: Date.now() - t0,
      error: null,
    };
  } catch (err) {
    return {
      label, text, expectation,
      score: 0, verdict: 'ERROR', summary: err.message, findings: [],
      protocolCount: 0, vizitCount: 0, itemCount: 0, unmapped: [],
      pipelineMs: Date.now() - t0, totalMs: Date.now() - t0,
      error: err.message,
    };
  }
}

// Run with concurrency limit
async function runBatch(tasks, concurrency) {
  const results = [];
  const queue = [...tasks];
  const active = [];

  while (queue.length > 0 || active.length > 0) {
    while (active.length < concurrency && queue.length > 0) {
      const task = queue.shift();
      const promise = task().then(r => { active.splice(active.indexOf(promise), 1); results.push(r); return r; });
      active.push(promise);
    }
    if (active.length > 0) await Promise.race(active);
  }
  return results;
}

(async () => {
  console.log(`\n${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║        TreatNote V2 — STRESS TEST                          ║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════════╝${c.reset}`);
  console.log(`${c.dim}Mode: ${FAST ? 'FAST (edge cases only)' : 'FULL (AI-generated + edge cases)'}${c.reset}`);
  console.log(`${c.dim}Concurrency: ${PARALLEL}${c.reset}\n`);

  const tasks = [];

  // ── Phase 1: Edge cases ──
  console.log(`${c.bold}Phase 1: Edge Cases (${EDGE_CASES.length} tests)${c.reset}`);
  for (const ec of EDGE_CASES) {
    tasks.push(() => {
      process.stdout.write(`  ${c.dim}⏳ ${ec.name}...${c.reset}`);
      return runTest(ec.name, ec.text, ec.expect).then(r => {
        const icon = r.verdict === 'PASS' ? `${c.green}✓` : r.verdict === 'WARN' ? `${c.yellow}⚠` : `${c.red}✗`;
        process.stdout.write(`\r  ${icon} ${ec.name}${c.reset} — ${r.score}/100 (${(r.totalMs/1000).toFixed(1)}s)\n`);
        return r;
      });
    });
  }

  // ── Phase 2: AI-generated matrix ──
  if (!FAST) {
    console.log(`\n${c.bold}Phase 2: AI-Generated Matrix (${COMPLEXITIES.length * CATEGORIES.length} tests)${c.reset}`);
    for (const complexity of COMPLEXITIES) {
      for (const category of CATEGORIES) {
        const label = `AI: ${complexity}/${category}`;
        tasks.push(async () => {
          process.stdout.write(`  ${c.dim}⏳ ${label} (generating)...${c.reset}`);
          try {
            const genResult = await callFn('v2-generate-dictation', {
              complexity, category: category === 'random' ? undefined : category,
            });
            process.stdout.write(`\r  ${c.dim}⏳ ${label} (running)...          ${c.reset}`);
            const r = await runTest(label, genResult.text, `${complexity} ${category}`);
            const icon = r.verdict === 'PASS' ? `${c.green}✓` : r.verdict === 'WARN' ? `${c.yellow}⚠` : `${c.red}✗`;
            process.stdout.write(`\r  ${icon} ${label}${c.reset} — ${r.score}/100 (${(r.totalMs/1000).toFixed(1)}s)\n`);
            return r;
          } catch (err) {
            process.stdout.write(`\r  ${c.red}✗ ${label}${c.reset} — ERROR: ${err.message}\n`);
            return { label, score: 0, verdict: 'ERROR', error: err.message, findings: [], unmapped: [], pipelineMs: 0, totalMs: 0 };
          }
        });
      }
    }
  }

  // Run all
  const startTime = Date.now();
  const results = await runBatch(tasks, PARALLEL);
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  // ══════════════════════════════════════════════
  // REPORT
  // ══════════════════════════════════════════════
  console.log(`\n${c.cyan}${'═'.repeat(65)}${c.reset}`);
  console.log(`${c.bold}STRESS TEST REPORT${c.reset}  ${c.dim}(${results.length} tests, ${totalTime}s total)${c.reset}`);
  console.log(`${c.cyan}${'═'.repeat(65)}${c.reset}`);

  // Aggregate stats
  const scores = results.map(r => r.score);
  const avg = (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1);
  const pass = results.filter(r => r.verdict === 'PASS').length;
  const warn = results.filter(r => r.verdict === 'WARN').length;
  const fail = results.filter(r => r.verdict === 'FAIL' || r.verdict === 'ERROR').length;
  const allUnmapped = [...new Set(results.flatMap(r => r.unmapped || []))];

  console.log(`\n  ${c.bold}Átlag score:${c.reset}      ${avg}/100`);
  console.log(`  ${c.bold}Verdiktek:${c.reset}        ${c.green}PASS ${pass}${c.reset}  ${c.yellow}WARN ${warn}${c.reset}  ${c.red}FAIL ${fail}${c.reset}`);
  console.log(`  ${c.bold}Score tartomány:${c.reset}  ${Math.min(...scores)} — ${Math.max(...scores)}`);
  console.log(`  ${c.bold}Átlag pipeline:${c.reset}   ${(results.reduce((a,r) => a+r.pipelineMs, 0) / results.length / 1000).toFixed(1)}s`);

  // Most common findings
  const findingCounts = {};
  for (const r of results) {
    for (const f of (r.findings || [])) {
      const key = `${f.type}|${f.stage}`;
      findingCounts[key] = (findingCounts[key] || 0) + 1;
    }
  }
  const topFindings = Object.entries(findingCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);

  if (topFindings.length > 0) {
    console.log(`\n  ${c.bold}Leggyakoribb megállapítások:${c.reset}`);
    for (const [key, count] of topFindings) {
      const [type, stage] = key.split('|');
      console.log(`    ${String(count).padStart(3)}× ${type} ${c.dim}[${stage}]${c.reset}`);
    }
  }

  // Unmapped actions
  if (allUnmapped.length > 0) {
    console.log(`\n  ${c.bold}${c.yellow}Unmapped akciók (szótár hiányosságok):${c.reset}`);
    for (const slug of allUnmapped.sort()) {
      console.log(`    ${c.yellow}→${c.reset} ${slug}`);
    }
  }

  // Failures
  const failures = results.filter(r => r.verdict === 'FAIL' || r.verdict === 'ERROR');
  if (failures.length > 0) {
    console.log(`\n  ${c.bold}${c.red}SIKERTELEN TESZTEK:${c.reset}`);
    for (const f of failures) {
      console.log(`    ${c.red}✗${c.reset} ${f.label}: ${f.summary || f.error}`);
    }
  }

  // Low-scoring tests
  const lowScoring = results.filter(r => r.score < 70 && r.verdict !== 'ERROR').sort((a,b) => a.score - b.score);
  if (lowScoring.length > 0) {
    console.log(`\n  ${c.bold}${c.yellow}ALACSONY PONTSZÁMÚ (<70):${c.reset}`);
    for (const r of lowScoring) {
      console.log(`    ${c.yellow}${r.score}${c.reset}/100 ${r.label}`);
      console.log(`    ${c.dim}${r.text.slice(0, 100)}...${c.reset}`);
      for (const f of (r.findings || []).filter(f => f.severity === 'critical')) {
        console.log(`      ${c.red}✗ ${f.type} [${f.stage}]: ${f.description}${c.reset}`);
      }
    }
  }

  console.log(`\n${c.cyan}${'═'.repeat(65)}${c.reset}\n`);

  // Exit code: 1 if any FAIL
  process.exit(fail > 0 ? 1 : 0);
})();
