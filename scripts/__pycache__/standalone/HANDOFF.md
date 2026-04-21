# TreatNote Pipeline — Developer Handoff Documentation

## Overview

This is a **dental dictation-to-treatment-plan pipeline** that converts a dentist's voice dictation into a structured, priced treatment plan. It currently runs as an n8n workflow but all core logic lives in standalone JavaScript files ready for server-side integration.

### What It Does (End-to-End)

```
Dentist speaks → Audio transcribed → Text enters pipeline:

┌─────────────┐    ┌──────────────┐    ┌────────────────┐    ┌──────────────┐
│ 1. AI Agent  │───▶│ 2. Semantic  │───▶│ 3. Scaling     │───▶│ 4. Output    │
│ (Claude LLM) │    │   Matcher    │    │   Processor    │    │  (Vizitek)   │
└─────────────┘    └──────────────┘    └────────────────┘    └──────────────┘
  Parse dictation    Match treatments    Expand rules into     Final visit
  into structured    to Supabase rules   per-tooth/per-visit   structure with
  JSON tétels        via embeddings      line items            quantities
```

---

## Pipeline Stages — Detailed

### Stage 1: AI Agent (Claude LLM)

**Purpose:** Parse Hungarian dental dictation into structured JSON `tetel_lista`.

**Input:** Raw dictation text (string)
**Output:** JSON with `tetel_lista` array

**Files:**
- [system_prompt.txt](file:///root/treatnote/n8n-scripts-debug/n8n-code-nodes/system_prompt.txt) — The full system prompt for Claude (Hungarian, ~9KB)

**External API:** Anthropic Claude API (`claude-sonnet-4-20250514`)
- Endpoint: `https://api.anthropic.com/v1/messages`
- Auth: `x-api-key` header
- Model: `claude-sonnet-4-20250514` (configurable)

**Output format:**
```json
{
  "tetel_lista": [
    {
      "kategoria": "szajsebeszet",
      "fogak": [{"fog": "46", "hidtag": null}],
      "kezelesek": ["fogeltávolítás extractio"],
      "eredeti_szoveg": "negyvenhatos fog kihúzása"
    }
  ]
}
```

**Key logic in system prompt:**
- Tooth number parsing (Hungarian words → FDI notation)
- Treatment categorization (szájsebészet, implantáció, konzervalo, fogpótlástan, etc.)
- Bridge tag handling (hidtag: null / pillar_only / pontic_only)
- Multi-session splitting ("két ülésben" → separate tétels with "1. ülés" / "2. ülés" markers)
- Semantic search optimization (expanding short phrases with synonyms)
- Correction handling ("bocsánat", "mégsem" → delete previous item)

---

### Stage 2: Semantic Matcher

**Purpose:** Match each treatment text from Stage 1 to the correct **treatment rule** in Supabase using vector similarity search (OpenAI embeddings).

**Input:** `tetel_lista` from Stage 1
**Output:** Same structure, enriched with `rule_id`, `rule_name`, `rule_items` for each kezelés

**Files:**
- [semantic_matcher.js](file:///root/treatnote/n8n-scripts-debug/n8n-code-nodes/semantic_matcher.js) — Production code (394 lines)
- In flow_simulator.mjs: `runSemanticMatcher()` function (lines 249-493) — equivalent standalone implementation

**External APIs:**
1. **OpenAI Embeddings API**
   - Endpoint: `https://api.openai.com/v1/embeddings`
   - Model: `text-embedding-3-large` (3072 dimensions)
   - Used to: Convert treatment text → embedding vector

2. **Supabase RPC — Primary search**
   - Endpoint: `POST {SUPABASE_URL}/rest/v1/rpc/match_treatment_embedding`
   - Parameters:
     ```json
     {
       "query_embedding": "[0.123, -0.456, ...]",
       "match_threshold": 0.60,
       "match_count": 5,
       "p_clinic_id": "uuid",
       "p_source_types": ["semantic_description"]
     }
     ```
   - Returns: Top 5 matching rules with `similarity`, `rule_name`, `treatment_rule_id`

3. **Supabase RPC — Fallback search (szótár)**
   - Endpoint: `POST {SUPABASE_URL}/rest/v1/rpc/match_szotar_embedding`
   - Same parameters but with `p_telephely_id` and `p_source_types: ["name"]`

4. **Supabase REST — Rule details**
   - Endpoint: `GET {SUPABASE_URL}/rest/v1/treatment_rules?id=eq.{ruleId}&select=*,rule_visits(*,rule_items(*))`
   - Returns: Full rule with visits and line items

**Key algorithms:**
- **Alapszabály override:** If the top match is a generic base rule (`alapszabaly=true`) and a clinic-specific custom rule is within 0.04 similarity, prefer the custom rule
- **Context-aware re-ranking:** If dictation doesn't mention sinuslift/csontpótlás/membrán, penalize candidate rules containing those terms by -0.05 similarity
- **Active filter:** Skip rules with `aktiv=false`

**Config constants:**
```javascript
SIMILARITY_THRESHOLD = 0.60    // Minimum similarity to accept
HIGH_CONFIDENCE_THRESHOLD = 0.82  // Skip fallback if above this
ALAPSZABALY_TOLERANCE = 0.04   // Max sim diff to prefer custom over base
COMPLEXITY_PENALTY = 0.05      // Penalty for complex rules when input is simple
```

---

### Stage 3: Scaling Processor

**Purpose:** Expand matched rules into concrete per-tooth, per-visit line items with quantities. This is the core business logic — it handles tooth counting, bridge topology, All-on-4/6 protocols, deduplication, and visit sequencing.

**Input:** `tetel_lista` with matched rules from Stage 2, plus original dictation text
**Output:** `{ vizitek: [...], meta: { tetel_szam, vizit_szam } }`

**Files:**
- [scaling_processor.js](file:///root/treatnote/n8n-scripts-debug/n8n-code-nodes/scaling_processor.js) — Production code (1029 lines)
- In flow_simulator.mjs: `runScalingProcessor()` function (lines 549-1555) — equivalent standalone implementation

**No external APIs required** — this is pure computation.

**Output format (each vizit row):**
```json
{
  "vizit": 1,
  "szakterulet": "implantacio",
  "fog": "26",
  "hidtag": "pillar_only",
  "name": "Fogbeültetés foganként NobelReplace CC TiUltra (Nobel-Biocare) 10 év garanciával",
  "quantity": 1,
  "scaling": "per_tooth",
  "talalat": true
}
```

**Key algorithms (Passes A-F):**

| Pass | Name | Purpose |
|------|------|---------|
| A | Deduplication | Remove duplicate rows within same visit (same tooth + same name) |
| B | Bridge topology | Assign bridge-specific items to pillar/pontic teeth correctly |
| C | All-on protocol | Handle FELSO_ALLCSONT / ALSO_ALLCSONT arch expansion with fixed pillar positions |
| D | Brand filter | Remove wrong-brand items (e.g. AlphaBio items when Nobel was specified) |
| E | Cross-visit implant dedup | If same tooth has implant in multiple visits, keep only first |
| E2 | Cross-visit extraction dedup | If same tooth has extraction in multiple visits, keep only latest |
| F | Visit resequencing | Separate clinically incompatible procedures (e.g. paro + surgery) into different visits |

**Multi-session support:** Detects "N. ülés" markers or duplicate rule names across tétels to assign sequential visits.

---

### Stage 4: Output (Optional — Consistency + Medical Validation)

These are **verification layers**, not required in production but useful for quality assurance.

**Files:**
- [consistency_checker.mjs](file:///root/treatnote/n8n-scripts-debug/consistency_checker.mjs) — Checks structural validity, expected treatments present, scaling correctness
- [medical_validator.mjs](file:///root/treatnote/n8n-scripts-debug/medical_validator.mjs) — Clinical rule checks (duplicate extraction, implant on non-extracted tooth, etc.)

---

## External Dependencies Summary

| Service | What For | Required |
|---------|----------|----------|
| **Anthropic Claude API** | Stage 1: Parse dictation | ✅ Yes |
| **OpenAI Embeddings API** | Stage 2: Generate embedding vectors | ✅ Yes |
| **Supabase (PostgreSQL + pgvector)** | Stage 2: Vector similarity search + rule storage | ✅ Yes |
| n8n | Was the orchestrator — **to be replaced** | ❌ No longer needed |

### Supabase Tables Used

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `treatment_rules` | Treatment rule definitions | `id`, `name`, `aktiv`, `alapszabaly`, `clinic_id` |
| `rule_visits` | Visit structure per rule | `treatment_rule_id`, `visit_number` |
| `rule_items` | Line items per visit | `rule_visit_id`, `name`, `unit`, `scaling`, `quantity`, `target_tooth_type` |
| `treatment_embeddings` | Vector embeddings for rules | `treatment_rule_id`, `embedding`, `source_type`, `source_text` |
| `szotar_embeddings` | Dictionary embeddings (fallback) | `embedding`, `name`, `telephely_id` |

### Supabase RPC Functions

| Function | Purpose |
|----------|---------|
| `match_treatment_embedding(query_embedding, match_threshold, match_count, p_clinic_id, p_source_types)` | Primary vector similarity search |
| `match_szotar_embedding(query_embedding, match_threshold, match_count, p_telephely_id, p_source_types)` | Fallback dictionary search |

---

## Integration Guide — Server-Side (Node.js)

### File Structure for Integration

```
your-server/
├── lib/
│   ├── treatnote/
│   │   ├── pipeline.js          # Orchestrator (replaces n8n + flow_simulator)
│   │   ├── ai-agent.js          # Stage 1: Claude call
│   │   ├── semantic-matcher.js  # Stage 2: Copy from semantic_matcher.js
│   │   ├── scaling-processor.js # Stage 3: Copy from scaling_processor.js
│   │   ├── system-prompt.txt    # System prompt for Claude
│   │   └── config.js            # API keys, thresholds
│   └── ...
```

### Minimal Integration (3 API calls per request)

```javascript
// pipeline.js — replaces n8n entirely
async function processsDictation(inputText, clinicId) {
  // Stage 1: Claude parses dictation
  const tetelLista = await callClaude(inputText, systemPrompt);
  
  // Stage 2: Semantic matcher finds rules
  const matchedTetels = await semanticMatch(tetelLista, clinicId);
  
  // Stage 3: Scaling processor expands to visit rows (pure JS, no API)
  const result = scaleToVisits(matchedTetels, inputText);
  
  return result; // { vizitek: [...], meta: {...} }
}
```

### API Keys Needed

```env
ANTHROPIC_API_KEY=sk-ant-...       # Claude API
OPENAI_API_KEY=sk-proj-...         # Embeddings
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_API_KEY=sb_secret_...     # Service role key
```

### What to Copy As-Is

| File | Lines | Copy to | Modifications needed |
|------|-------|---------|---------------------|
| `n8n-code-nodes/system_prompt.txt` | 215 | `system-prompt.txt` | None |
| `n8n-code-nodes/scaling_processor.js` | 1029 | `scaling-processor.js` | Remove n8n `$input`/`$()` references, export as module |
| `n8n-code-nodes/semantic_matcher.js` | 394 | `semantic-matcher.js` | Remove n8n `$input`/`apiCall.call(this,...)`, replace with `fetch()`, export as module |

### Key Adaptations

1. **semantic_matcher.js** uses n8n's `apiCall.call(this, ...)` helper — replace with standard `fetch()`
2. **scaling_processor.js** reads input via `$input.first().json` — replace with function parameter
3. Both files have hardcoded API keys — extract to env/config
4. **flow_simulator.mjs** already has all the logic ported to standalone `fetch()` calls — use it as the reference implementation

> [!IMPORTANT]
> **The easiest path:** Use `flow_simulator.mjs` as your starting point. It already works without n8n, uses standard `fetch()`, and has all the fixes (re-ranking, multi-session, Pass E2, R4 fix). Extract the 3 main functions (`runAIAgent`, `runSemanticMatcher`, `runScalingProcessor`) into separate modules.

---

## Testing

### Test Runner
```bash
# Run all tests with real APIs
node flow_simulator.mjs --live --file test_cases_batch8b.json --report output.json --verbose

# Run single test with custom text  
node flow_simulator.mjs --live --text "kihúzom a negyvenhatos fogat"

# Run specific test case
node flow_simulator.mjs --live --file test_cases.json --case T03
```

### Test Case Format
```json
[
  {
    "id": "TEST_01",
    "name": "Description",
    "input_text": "dentist dictation here...",
    "expected": {
      "treatments": ["extractio", "implantátum"],
      "tooth_count_min": 1,
      "must_include": ["extractio"],
      "must_not_include": []
    }
  }
]
```

### Available Test Files (with real dictation data)
- `test_cases_batch2.json` through `batch9` — batches of 5 real dictations each
- `test_allon6_feedback.json` — All-on-6 edge case with client feedback
- `test_record3_feedback.json` — Single implant + cirkon crown edge case

---

## Known Limitations & Edge Cases

1. **Non-deterministic rule matching:** Claude's output varies between runs, causing different embedding vectors → different rule matches. The re-ranking mitigates but doesn't eliminate this.
2. **All-on-6/4 false matches:** "Azonnali implantáció" for a single tooth can match All-on-6 rules. Fix proposed but not yet implemented: filter by tooth count.
3. **Biomimetikus kezelések:** No treatment_rule exists — matched via dictionary fallback only. Items appear but without a complete visit structure.
4. **Excessive tétel splitting:** Claude sometimes splits compound dictations (e.g., "extraction + implant + crown") into too many tétels, causing duplicate rule matches.
