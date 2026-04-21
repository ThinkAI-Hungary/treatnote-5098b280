#!/usr/bin/env node
// ==========================================================
// FLOW SIMULATOR — End-to-end n8n "beiro" pipeline debugging
// ==========================================================
// Usage:
//   node flow_simulator.mjs                    # Run all test cases in mock mode
//   node flow_simulator.mjs --live             # Run all test cases with real APIs
//   node flow_simulator.mjs --case T03         # Run a single test case
//   node flow_simulator.mjs --text "szöveg"    # Run with arbitrary text
//   node flow_simulator.mjs --live --case T04  # Single case, real APIs
// ==========================================================

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { analyzeConsistency } from "./consistency_checker.mjs";
import { validateMedical } from "./medical_validator.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============ CLI ARGS ============
const args = process.argv.slice(2);
const LIVE_MODE = args.includes("--live");
const CASE_FILTER = args.includes("--case") ? args[args.indexOf("--case") + 1] : null;
const CUSTOM_TEXT = args.includes("--text") ? args[args.indexOf("--text") + 1] : null;
const VERBOSE = args.includes("--verbose") || args.includes("-v");
const TELEPHELY_ID = args.includes("--telephely") ? args[args.indexOf("--telephely") + 1] : null;
const TEST_FILE = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;
const CLI_ANTHROPIC_KEY = args.includes("--anthropic-key") ? args[args.indexOf("--anthropic-key") + 1] : null;
const REPORT_FILE = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;

// ============ RATE LIMITING ============
const RATE_LIMIT_MS = 1200; // ms between API calls to avoid throttling
async function rateLimit() {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
}

// ============ COLORS ============
const C = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    dim: "\x1b[2m",
    bold: "\x1b[1m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
};

function banner(text) {
    console.log(`\n${C.bold}${C.cyan}${"═".repeat(70)}${C.reset}`);
    console.log(`${C.bold}${C.cyan}  ${text}${C.reset}`);
    console.log(`${C.bold}${C.cyan}${"═".repeat(70)}${C.reset}\n`);
}

function section(text) {
    console.log(`\n${C.bold}${C.blue}── ${text} ${"─".repeat(Math.max(0, 60 - text.length))}${C.reset}`);
}

function ok(text) { console.log(`  ${C.green}✓${C.reset} ${text}`); }
function warn(text) { console.log(`  ${C.yellow}⚠${C.reset} ${text}`); }
function err(text) { console.log(`  ${C.red}✗${C.reset} ${text}`); }
function info(text) { console.log(`  ${C.dim}${text}${C.reset}`); }

// ============ API CREDENTIALS (from beiro.json) ============
const ANTHROPIC_API_KEY = "not-embedded"; // Will read from the flow file
const OPENAI_API_KEY_DEFAULT = "not-embedded";
const SUPABASE_URL = "https://bpjzgapmoyhtgryglcke.supabase.co";
const SUPABASE_API_KEY_DEFAULT = "not-embedded";

function loadCredentials() {
    try {
        const flow = JSON.parse(readFileSync(join(__dirname, "beiro.json"), "utf-8"));
        const nodes = flow.nodes || [];

        // Find semantic_matcher node for OpenAI + Supabase keys
        const semanticNode = nodes.find(n => n.name === "semantic_matcher");
        let openaiKey = OPENAI_API_KEY_DEFAULT;
        let supabaseKey = SUPABASE_API_KEY_DEFAULT;

        if (semanticNode) {
            const code = semanticNode.parameters?.jsCode || "";
            const openaiMatch = code.match(/OPENAI_API_KEY\s*=\s*"([^"]+)"/);
            const supabaseMatch = code.match(/SUPABASE_API_KEY\s*=\s*"([^"]+)"/);
            if (openaiMatch) openaiKey = openaiMatch[1];
            if (supabaseMatch) supabaseKey = supabaseMatch[1];
        }

        // Find Anthropic model node for the API key (it uses credential references)
        // We'll need user to provide it or read from env
        const anthropicKey = CLI_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || null;

        return { openaiKey, supabaseKey, anthropicKey };
    } catch (e) {
        warn(`Nem sikerült a beiro.json-ból kiolvasni a credential-eket: ${e.message}`);
        return {
            openaiKey: process.env.OPENAI_API_KEY || OPENAI_API_KEY_DEFAULT,
            supabaseKey: process.env.SUPABASE_API_KEY || SUPABASE_API_KEY_DEFAULT,
            anthropicKey: process.env.ANTHROPIC_API_KEY || null
        };
    }
}

// ============ LOAD SYSTEM PROMPT (from AI Agent node) ============

function loadSystemPrompt() {
    // Try loading from standalone prompt file first (includes latest fixes)
    const promptPath = join(__dirname, "n8n-code-nodes", "system_prompt.txt");
    try {
        const prompt = readFileSync(promptPath, "utf-8");
        if (prompt.trim().length > 0) return prompt;
    } catch (_) { /* file not found, fall back to beiro.json */ }

    const flow = JSON.parse(readFileSync(join(__dirname, "beiro.json"), "utf-8"));
    const agentNode = flow.nodes.find(n => n.name === "AI Agent");
    if (!agentNode) throw new Error("AI Agent node nem található a flow-ban.");
    return agentNode.parameters?.options?.systemMessage || "";
}

// ============ STEP 1: AI AGENT (Claude) ============

async function runAIAgent(inputText, credentials) {
    section("STEP 1: AI Agent (Claude Sonnet 4.5)");

    if (!LIVE_MODE) {
        info("MOCK mód — Claude hívás kihagyva, szimulált JSON-t használunk.");
        return generateMockAIOutput(inputText);
    }

    if (!credentials.anthropicKey) {
        warn("Nincs ANTHROPIC_API_KEY! Állítsd be: export ANTHROPIC_API_KEY=sk-...");
        warn("Fallback: mock output.");
        return generateMockAIOutput(inputText);
    }

    const systemPrompt = loadSystemPrompt()
        // Replace n8n expression placeholders
        .replace(/\{\{[^}]*\}\}/g, "");

    const userPrompt = `Dolgozd fel az alábbi szöveget:\n\n${inputText}`;

    info(`Prompt küldése Claude-nak (${inputText.length} karakter)...`);
    await rateLimit();

    try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": credentials.anthropicKey,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model: "claude-sonnet-4-5-20250929",
                max_tokens: 8000,
                system: systemPrompt,
                messages: [{ role: "user", content: userPrompt }]
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Claude API error ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const content = data.content?.[0]?.text || "";
        ok(`Claude válasz (${content.length} karakter)`);

        if (VERBOSE) {
            console.log(`\n${C.dim}--- Claude raw output ---${C.reset}`);
            console.log(content.substring(0, 2000) + (content.length > 2000 ? "\n..." : ""));
            console.log(`${C.dim}--- End Claude output ---${C.reset}\n`);
        }

        return content;
    } catch (e) {
        err(`Claude API hiba: ${e.message}`);
        warn("Fallback: mock output.");
        return generateMockAIOutput(inputText);
    }
}

// ============ STEP 2: JSON KISZEDŐ ============

function runJsonExtractor(aiOutput) {
    section("STEP 2: JSON kiszedő");

    if (typeof aiOutput === "object") {
        // Already parsed (mock mode)
        ok("Bemenet már JSON objektum.");
        return aiOutput;
    }

    // Replicate the json kiszedo logic
    try {
        // 1) Try ```json ... ``` fence
        const fenceRegex = /```json\s*([\s\S]*?)\s*```/i;
        const fenceMatch = aiOutput.match(fenceRegex);
        if (fenceMatch && fenceMatch[1]) {
            const parsed = JSON.parse(fenceMatch[1].trim());
            ok("JSON kódfence-ből kinyerve.");
            return parsed;
        }

        // 2) Fallback: first balanced { ... }
        const start = aiOutput.indexOf("{");
        if (start === -1) throw new Error("Nem található JSON kezdete.");

        let depth = 0;
        let inStr = false;
        let esc = false;

        for (let i = start; i < aiOutput.length; i++) {
            const ch = aiOutput[i];
            if (inStr) {
                if (esc) { esc = false; continue; }
                if (ch === "\\") { esc = true; continue; }
                if (ch === '"') { inStr = false; }
                continue;
            }
            if (ch === '"') { inStr = true; continue; }
            if (ch === "{") { depth++; continue; }
            if (ch === "}") {
                depth--;
                if (depth === 0) {
                    const extracted = aiOutput.slice(start, i + 1).trim();
                    const parsed = JSON.parse(extracted);
                    ok("JSON fallback módszerrel kinyerve.");
                    return parsed;
                }
            }
        }

        throw new Error("Nem található kiegyensúlyozott JSON objektum.");
    } catch (e) {
        err(`JSON kinyerés sikertelen: ${e.message}`);
        throw e;
    }
}

// ============ STEP 3: SEMANTIC MATCHER ============

async function runSemanticMatcher(tetelLista, credentials, originalInputText) {
    section("STEP 3: Semantic Matcher");

    const ALAPSZABALY_TOLERANCE = 0.07;

    // --- CONTEXT-AWARE RE-RANKING CONFIG ---
    // Keywords that indicate complex procedures. If the original dictation
    // does NOT contain any of these, we penalize candidate rules that do.
    const COMPLEX_PROCEDURE_KW = ["sinuslift", "sinus", "csontpótlás", "arcüreg",
        "membrán", "augmentáció", "bone graft", "szinusz"];
    const COMPLEXITY_PENALTY = 0.05;
    const inputLower = (originalInputText || "").toLowerCase();

    if (!LIVE_MODE) {
        info("MOCK mód — Semantic search kihagyva, nincs_talalat=true minden kezelésre.");
        return mockSemanticMatcher(tetelLista);
    }

    info(`${tetelLista.length} tétel feldolgozása...`);

    // Collect all treatment texts for embedding
    const kezelesTexts = [];
    const kezelesMap = [];

    for (let ti = 0; ti < tetelLista.length; ti++) {
        const tetel = tetelLista[ti];
        const eredetiSzoveg = tetel.eredeti_szoveg || "";
        const kezelesek = Array.isArray(tetel.kezelesek) ? tetel.kezelesek : [];

        for (let ki = 0; ki < kezelesek.length; ki++) {
            const k = kezelesek[ki];
            let rawText = typeof k === "string" ? k : (k.kezeles_szoveg || k.name || String(k));
            if (rawText && rawText.trim()) {
                let usedText = rawText.trim();
                if (eredetiSzoveg) usedText = `${usedText} | Kontextus: ${eredetiSzoveg}`;
                kezelesTexts.push(usedText);
                kezelesMap.push({ tetelIndex: ti, kezelesIndex: ki, originalText: rawText.trim(), usedText });
            }
        }
    }

    if (kezelesTexts.length === 0) {
        warn("Nincs feldolgozandó szöveg.");
        return { tetel_lista: tetelLista, _semantic_match_stats: { total: 0, matched: 0, match_rate: "0%" } };
    }

    // Generate embeddings via OpenAI
    info(`OpenAI embedding generálás (${kezelesTexts.length} szöveg)...`);
    await rateLimit();
    let embeddings;
    try {
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${credentials.openaiKey}`
            },
            body: JSON.stringify({ model: "text-embedding-3-large", input: kezelesTexts })
        });
        if (!embRes.ok) throw new Error(`OpenAI ${embRes.status}: ${await embRes.text()}`);
        const embData = await embRes.json();
        embeddings = embData.data.map(d => d.embedding);
        ok(`Embeddings generálva (${embeddings.length} db, dim=${embeddings[0].length})`);
    } catch (e) {
        err(`OpenAI embedding hiba: ${e.message}`);
        return mockSemanticMatcher(tetelLista);
    }

    // Helper: fetch rule details with caching
    async function fetchRuleDetails(ruleId) {
        if (ruleCache.has(ruleId)) return ruleCache.get(ruleId);
        try {
            const ruleRes = await fetch(
                `${SUPABASE_URL}/rest/v1/treatment_rules?id=eq.${ruleId}&select=*,rule_visits(*,rule_items(*))`,
                { headers: { "apikey": credentials.supabaseKey, "Authorization": `Bearer ${credentials.supabaseKey}` } }
            );
            if (ruleRes.ok) {
                const ruleData = await ruleRes.json();
                if (ruleData.length > 0) {
                    ruleCache.set(ruleId, ruleData[0]);
                    return ruleData[0];
                }
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    // Match each treatment against Supabase
    const updatedTetelLista = JSON.parse(JSON.stringify(tetelLista));
    const ruleCache = new Map();
    let matchedCount = 0;
    const executionReport = [];

    for (let i = 0; i < kezelesMap.length; i++) {
        const mapItem = kezelesMap[i];
        const embedding = embeddings[i];
        const itemReport = { id: `T${mapItem.tetelIndex}_K${mapItem.kezelesIndex}`, input_text: mapItem.originalText, steps: [] };

        info(`  [${i + 1}/${kezelesMap.length}] "${mapItem.originalText}"`);

        // Primary search
        let bestMatch = null;
        let matchSource = null;
        try {
            const primaryRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_treatment_embedding`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": credentials.supabaseKey,
                    "Authorization": `Bearer ${credentials.supabaseKey}`
                },
                body: JSON.stringify({
                    query_embedding: `[${embedding.join(",")}]`,
                    match_threshold: 0.60,
                    match_count: 5,
                    p_clinic_id: TELEPHELY_ID,
                    p_source_types: ["semantic_description"]
                })
            });

            if (primaryRes.ok) {
                const matches = await primaryRes.json();
                if (matches && matches.length > 0) {
                    // Fetch rule details for all candidates to check aktiv + alapszabaly
                    let activeCandidates = [];
                    for (const candidate of matches) {
                        const ruleDetail = await fetchRuleDetails(candidate.treatment_rule_id);
                        if (ruleDetail && ruleDetail.aktiv !== false) {
                            activeCandidates.push({ ...candidate, _ruleDetail: ruleDetail });
                        } else {
                            info(`    Kiszűrve (aktiv=false): ${candidate.rule_name}`);
                        }
                    }

                    if (activeCandidates.length > 0) {
                        // --- CONTEXT-AWARE RE-RANKING ---
                        // If the original dictation does NOT mention complex procedures,
                        // penalize candidates whose rule_name contains those terms.
                        const inputHasComplex = COMPLEX_PROCEDURE_KW.some(kw => inputLower.includes(kw));
                        if (!inputHasComplex && activeCandidates.length > 1) {
                            let reranked = false;
                            for (const candidate of activeCandidates) {
                                const nameL = (candidate.rule_name || "").toLowerCase();
                                if (COMPLEX_PROCEDURE_KW.some(kw => nameL.includes(kw))) {
                                    candidate._originalSimilarity = candidate.similarity;
                                    candidate.similarity -= COMPLEXITY_PENALTY;
                                    reranked = true;
                                    info(`    Re-rank: "${candidate.rule_name}" penalized -${COMPLEXITY_PENALTY} (no complex keywords in dictation)`);
                                }
                            }
                            if (reranked) {
                                activeCandidates.sort((a, b) => b.similarity - a.similarity);
                            }
                        }

                        bestMatch = activeCandidates[0];
                        matchSource = "primary";

                        // --- ALAPSZABÁLY OVERRIDE ---
                        const bestRule = bestMatch._ruleDetail;
                        if (bestRule.alapszabaly === true && activeCandidates.length > 1) {
                            const bestSim = bestMatch.similarity;
                            info(`    Alapszabály match: ${bestMatch.rule_name} (sim=${bestSim}). Checking for custom override...`);

                            for (let j = 1; j < activeCandidates.length; j++) {
                                const altCandidate = activeCandidates[j];
                                const altRule = altCandidate._ruleDetail;
                                const simDiff = bestSim - altCandidate.similarity;

                                if (altRule.alapszabaly === false && simDiff <= ALAPSZABALY_TOLERANCE) {
                                    ok(`    OVERRIDE: Custom rule "${altCandidate.rule_name}" (sim=${altCandidate.similarity.toFixed(4)}, diff=${simDiff.toFixed(4)}) preferred over alapszabály.`);
                                    bestMatch = altCandidate;
                                    matchSource = "primary_custom_override";
                                    break;
                                }
                            }
                        }

                        itemReport.steps.push({
                            type: "primary_search", status: "HIT",
                            candidate_name: bestMatch.rule_name,
                            similarity: bestMatch.similarity,
                            alapszabaly_override: matchSource === "primary_custom_override",
                            all_candidates: activeCandidates.map(c => ({
                                name: c.rule_name, sim: c.similarity,
                                alapszabaly: c._ruleDetail?.alapszabaly || false
                            }))
                        });
                        ok(`    Primary: ${bestMatch.rule_name} (sim=${bestMatch.similarity.toFixed(4)})`);
                    }
                }
            }
        } catch (e) {
            warn(`    Primary search error: ${e.message}`);
        }

        // Fallback if no primary match
        if (!bestMatch) {
            try {
                const fallbackRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_szotar_embedding`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "apikey": credentials.supabaseKey,
                        "Authorization": `Bearer ${credentials.supabaseKey}`
                    },
                    body: JSON.stringify({
                        query_embedding: `[${embedding.join(",")}]`,
                        match_threshold: 0.60,
                        match_count: 1,
                        p_telephely_id: TELEPHELY_ID,
                        p_source_types: ["name"]
                    })
                });

                if (fallbackRes.ok) {
                    const matches = await fallbackRes.json();
                    if (matches && matches.length > 0) {
                        bestMatch = matches[0];
                        matchSource = "fallback";
                        itemReport.steps.push({
                            type: "fallback_search", status: "HIT",
                            candidate_name: bestMatch.rule_name, similarity: bestMatch.similarity
                        });
                        ok(`    Fallback: ${bestMatch.rule_name} (sim=${bestMatch.similarity.toFixed(4)})`);
                    }
                }
            } catch (e) {
                warn(`    Fallback search error: ${e.message}`);
            }
        }

        // Apply match to the tetel
        const tetel = updatedTetelLista[mapItem.tetelIndex];
        let kezeles = tetel.kezelesek[mapItem.kezelesIndex];
        if (typeof kezeles === "string") {
            kezeles = { kezeles_szoveg: kezeles };
            tetel.kezelesek[mapItem.kezelesIndex] = kezeles;
        }

        if (bestMatch) {
            const ruleId = bestMatch.treatment_rule_id;
            const cachedRule = ruleCache.get(ruleId) || bestMatch._ruleDetail;

            kezeles.rule_id = ruleId;
            kezeles.rule_name = bestMatch.rule_name || cachedRule?.name;
            kezeles.rule_items = extractSortedRuleItems(cachedRule);
            kezeles.nincs_talalat = false;
            kezeles.semantic_match = {
                matched: true, similarity: bestMatch.similarity,
                source: matchSource,
                alapszabaly: cachedRule?.alapszabaly || false
            };
            matchedCount++;
        } else {
            kezeles.nincs_talalat = true;
            kezeles.rule_items = [];
            kezeles.semantic_match = { matched: false };
            warn(`    Nincs találat.`);
        }

        executionReport.push(itemReport);
    }

    const stats = { total: kezelesMap.length, matched: matchedCount, match_rate: ((matchedCount / kezelesMap.length) * 100).toFixed(1) + "%" };
    ok(`Semantic matching kész: ${stats.match_rate} (${matchedCount}/${kezelesMap.length})`);

    return {
        tetel_lista: updatedTetelLista,
        _execution_report: executionReport,
        _semantic_match_stats: stats
    };
}

function extractSortedRuleItems(rule) {
    if (!rule || !rule.rule_visits) return [];
    const items = [];
    const visits = Array.isArray(rule.rule_visits) ? rule.rule_visits : [];
    for (const visit of visits) {
        const vNum = parseInt(visit.visit_number) || 1;
        const rItems = Array.isArray(visit.rule_items) ? visit.rule_items : [];
        for (const item of rItems) {
            items.push({
                visit_number: vNum, name: item.name, unit: item.unit || "db",
                scaling: item.scaling || "per_case", quantity: parseInt(item.quantity) || 1,
                target_tooth_type: item.target_tooth_type || "all"
            });
        }
    }
    return items.sort((a, b) => a.visit_number - b.visit_number);
}

function mockSemanticMatcher(tetelLista) {
    const result = JSON.parse(JSON.stringify(tetelLista));
    for (const tetel of result) {
        if (Array.isArray(tetel.kezelesek)) {
            for (let i = 0; i < tetel.kezelesek.length; i++) {
                let k = tetel.kezelesek[i];
                if (typeof k === "string") {
                    k = { kezeles_szoveg: k };
                    tetel.kezelesek[i] = k;
                }
                k.nincs_talalat = true;
                k.rule_items = [];
                k.semantic_match = { matched: false, source: "mock" };
            }
        }
    }
    ok("Mock semantic matcher: minden kezelés nincs_talalat=true.");
    return { tetel_lista: result, _semantic_match_stats: { total: 0, matched: 0, match_rate: "MOCK" } };
}

// ============ STEP 4: SCALING PROCESSOR ============

function runScalingProcessor(tetelLista, inputText = "") {
    section("STEP 4: Scaling Processor");

    // --- Inline the scaling processor logic ---
    // (Extracted from beiro.json, adapted for standalone execution)

    const ARCH_TEETH = {
        FELSO_ALLCSONT: ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"],
        ALSO_ALLCSONT: ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"]
    };

    const FIXED_PILLAR_POSITIONS = {
        "all-on-4": {
            FELSO_ALLCSONT: ["14", "12", "22", "24"],
            ALSO_ALLCSONT: ["44", "42", "32", "34"]
        },
        "all-on-6": {
            FELSO_ALLCSONT: ["15", "13", "11", "21", "23", "25"],
            ALSO_ALLCSONT: ["45", "43", "41", "31", "33", "35"]
        }
    };

    const ARCH_REPRESENTATIVE_TOOTH = { FELSO_ALLCSONT: "11", ALSO_ALLCSONT: "41" };
    const EXTRACTION_KEYWORDS = ["extractio", "fogeltávolítás", "foghúzás", "húzás", "eltávolítás"];
    const IMPLANT_KEYWORDS = ["implant", "beültetés", "fogbeültetés", "multiunit", "adapter", "gyógyulási sapka", "healing", "felépítőfej", "abutment"];

    function normSzoveg(s) { return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase(); }
    function normHidtag(h) { if (!h) return null; const t = normSzoveg(h); if (!t) return null; return t.replace(/[\s\-]+/g, "_").replace(/_+/g, "_"); }
    function normTargetToothType(s) { if (!s) return null; const t = normSzoveg(s); if (!t || t === "all") return null; return t.replace(/[\s\-]+/g, "_").replace(/_+/g, "_"); }

    function fogObjNorm(x) {
        if (typeof x === "string" || typeof x === "number") return { fog: String(x).trim(), hidtag: null };
        if (x && typeof x === "object" && !Array.isArray(x)) {
            return { fog: String(x.fog ?? x.fogszam ?? x.value ?? "").trim(), hidtag: normHidtag(x.hidtag ?? x.hidTag ?? null) };
        }
        return { fog: "", hidtag: null };
    }

    function isArchId(fog) { return fog === "FELSO_ALLCSONT" || fog === "ALSO_ALLCSONT"; }

    function detectProtocol(kezelesekList, ruleName) {
        const allTexts = [normSzoveg(ruleName || ""), ...kezelesekList.map(k => normSzoveg(typeof k === "string" ? k : (k.kezeles_szoveg || k.name || "")))].join(" ");
        if (allTexts.includes("all-on-6") || allTexts.includes("allon6") || allTexts.includes("all on 6")) return "all-on-6";
        if (allTexts.includes("all-on-4") || allTexts.includes("allon4") || allTexts.includes("all on 4")) return "all-on-4";
        return null;
    }

    function isExtraction(name) { return EXTRACTION_KEYWORDS.some(kw => normSzoveg(name).includes(kw)); }
    function isImplantRelated(name) { return IMPLANT_KEYWORDS.some(kw => normSzoveg(name).includes(kw)); }

    function expandArch(archId, protocolType, itemName, scaling) {
        if (isExtraction(itemName)) return ARCH_TEETH[archId].map(fog => ({ fog, hidtag: null }));
        if (scaling === "per_tooth" && protocolType && isImplantRelated(itemName)) {
            const pos = FIXED_PILLAR_POSITIONS[protocolType]?.[archId];
            if (pos) return pos.map(fog => ({ fog, hidtag: "pillar_only" }));
        }
        if (scaling === "per_tooth") return [{ fog: ARCH_REPRESENTATIVE_TOOTH[archId], hidtag: null }];
        return [{ fog: ARCH_REPRESENTATIVE_TOOTH[archId], hidtag: null }];
    }

    function perCaseRepFog(index) { return String(11 + ((index % 4 + 4) % 4) * 10); }

    function hidtagKompatibilis(fogHidtag, itemTarget) {
        const nt = normTargetToothType(itemTarget);
        const nh = normHidtag(fogHidtag);
        if (!nt || !nh) return true;
        return nh === nt;
    }

    // ============ MULTI-SESSION DETECTION ============
    // When Claude splits the same treatment into multiple tétels (e.g. "1. ülés", "2. ülés"),
    // compute per-tétel visit offsets so they land in sequential visits.
    const tetelVisitOffsets = new Array(tetelLista.length).fill(0);
    {
        // Strategy 1: Detect "N. ülés" markers in eredeti_szoveg
        const ulesPattern = /(\d+)\.\s*ülés/i;
        let hasUlesMarkers = false;
        for (let ti = 0; ti < tetelLista.length; ti++) {
            const szoveg = tetelLista[ti].eredeti_szoveg || "";
            const match = szoveg.match(ulesPattern);
            if (match) {
                const ulesNum = parseInt(match[1]);
                if (ulesNum >= 1) {
                    tetelVisitOffsets[ti] = ulesNum - 1; // "1. ülés" → offset 0, "2. ülés" → offset 1
                    hasUlesMarkers = true;
                }
            }
        }

        // Strategy 2: If no ülés markers, detect duplicate rule_names
        // (same rule appearing in multiple tétels → each gets incremental offset)
        if (!hasUlesMarkers) {
            const ruleOccurrence = new Map(); // rule_name → count
            for (let ti = 0; ti < tetelLista.length; ti++) {
                const kezelesek = Array.isArray(tetelLista[ti].kezelesek) ? tetelLista[ti].kezelesek : [];
                for (const k of kezelesek) {
                    if (!k || typeof k !== "object") continue;
                    const ruleName = k.rule_name;
                    if (!ruleName) continue;
                    const count = ruleOccurrence.get(ruleName) || 0;
                    if (count > 0) {
                        tetelVisitOffsets[ti] = count; // 2nd occurrence → offset 1, 3rd → offset 2
                    }
                    ruleOccurrence.set(ruleName, count + 1);
                }
            }
        }

        if (VERBOSE) {
            const offsets = tetelVisitOffsets.filter(o => o > 0);
            if (offsets.length > 0) {
                info(`  Multi-session detected: ${offsets.length} tétel(ek) offset — [${tetelVisitOffsets.join(", ")}]`);
            }
        }
    }

    // Process
    const vizitek = {};
    let idCounter = 1;
    const perCaseGroups = new Map();

    for (let tetelIdx = 0; tetelIdx < tetelLista.length; tetelIdx++) {
        const tetel = tetelLista[tetelIdx];
        const visitOffset = tetelVisitOffsets[tetelIdx];
        const kategoria = tetel.kategoria || "egyeb";
        const rawFogak = Array.isArray(tetel.fogak) ? tetel.fogak.map(fogObjNorm).filter(f => f.fog) : [];
        const kezelesek = Array.isArray(tetel.kezelesek) ? tetel.kezelesek : [];
        const protocolType = detectProtocol(kezelesek, tetel.rule_name);

        for (const kezeles of kezelesek) {
            if (!kezeles || typeof kezeles !== "object") continue;

            const ruleItems = Array.isArray(kezeles.rule_items) ? kezeles.rule_items : [];
            const nincsTalalat = kezeles.nincs_talalat === true;

            if (nincsTalalat || ruleItems.length === 0) {
                const name = kezeles.rule_name || kezeles.kezeles_szoveg || "";
                const visitKey = `vizit_${1 + visitOffset}`;

                let expandedFogak = [];
                for (const f of rawFogak) {
                    if (isArchId(f.fog)) expandedFogak.push(...expandArch(f.fog, protocolType, name, "per_case"));
                    else expandedFogak.push(f);
                }

                if (!vizitek[visitKey]) vizitek[visitKey] = {};
                if (!vizitek[visitKey][kategoria]) vizitek[visitKey][kategoria] = [];

                vizitek[visitKey][kategoria].push({
                    __id: idCounter++,
                    fogak: expandedFogak.length > 0 ? expandedFogak : [{ fog: "11", hidtag: null }],
                    fogak_eredeti: rawFogak.map(f => ({ ...f })),
                    kezelesek: [{ name, quantity: 1, scaling: "per_case", talalat: false }]
                });
                continue;
            }

            for (const item of ruleItems) {
                const visitNum = (item.visit_number || 1) + visitOffset;
                const visitKey = `vizit_${visitNum}`;
                const itemName = item.name || "";
                const scaling = item.scaling || "per_case";
                const quantity = parseInt(item.quantity) || 1;
                const targetToothType = item.target_tooth_type || "all";

                let processedFogak = [];
                for (const f of rawFogak) {
                    if (isArchId(f.fog)) processedFogak.push(...expandArch(f.fog, protocolType, itemName, scaling));
                    else processedFogak.push({ ...f });
                }

                let filteredFogak = processedFogak.filter(f => hidtagKompatibilis(f.hidtag, targetToothType));
                if (filteredFogak.length === 0 && scaling === "per_tooth") continue;

                const normTarget = normTargetToothType(targetToothType);
                if (normTarget) filteredFogak = filteredFogak.map(f => ({ ...f, hidtag: f.hidtag || normTarget }));

                if (!vizitek[visitKey]) vizitek[visitKey] = {};
                if (!vizitek[visitKey][kategoria]) vizitek[visitKey][kategoria] = [];

                const entry = {
                    __id: idCounter++,
                    fogak: filteredFogak.map(f => ({ ...f })),
                    fogak_eredeti: rawFogak.map(f => ({ ...f })),
                    kezelesek: [{ name: itemName, quantity, scaling, target_tooth_type: targetToothType, talalat: true }]
                };

                vizitek[visitKey][kategoria].push(entry);

                if (scaling === "per_case") {
                    const key = normSzoveg(itemName);
                    if (!perCaseGroups.has(key)) perCaseGroups.set(key, { allowed: quantity, elemek: [] });
                    else perCaseGroups.get(key).allowed = Math.max(perCaseGroups.get(key).allowed, quantity);

                    const maxFog = filteredFogak.reduce((max, f) => {
                        const n = parseInt(f.fog);
                        return (!isNaN(n) && n > max) ? n : max;
                    }, -Infinity);

                    perCaseGroups.get(key).elemek.push({ id: entry.__id, maxFog: maxFog === -Infinity ? 0 : maxFog });
                }
            }
        }
    }

    // per_case limit
    const keepIds = new Set();
    const perCaseIdToFog = new Map();

    for (const [, data] of perCaseGroups.entries()) {
        const sorted = data.elemek.slice().sort((a, b) => b.maxFog !== a.maxFog ? b.maxFog - a.maxFog : a.id - b.id);
        const selected = sorted.slice(0, data.allowed);
        for (let i = 0; i < selected.length; i++) {
            keepIds.add(selected[i].id);
            perCaseIdToFog.set(selected[i].id, perCaseRepFog(i));
        }
    }

    for (const vizitKey of Object.keys(vizitek)) {
        for (const szak of Object.keys(vizitek[vizitKey])) {
            vizitek[vizitKey][szak] = vizitek[vizitKey][szak].filter(entry => {
                const k = entry.kezelesek?.[0];
                if (!k || k.scaling !== "per_case" || k.talalat === false) return true;
                if (keepIds.has(entry.__id)) {
                    const newFog = perCaseIdToFog.get(entry.__id);
                    if (newFog) entry.fogak = [{ fog: newFog, hidtag: null }];
                    return true;
                }
                return false;
            });
        }
    }

    // per_tooth dedupe
    for (const vizitKey of Object.keys(vizitek)) {
        for (const szak of Object.keys(vizitek[vizitKey])) {
            for (const entry of vizitek[vizitKey][szak]) {
                const k = entry.kezelesek?.[0];
                if (!k || k.scaling !== "per_tooth") continue;
                const seen = new Set();
                entry.fogak = (entry.fogak || []).filter(f => {
                    const key = `${f.fog}|${f.hidtag || ""}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            }
            vizitek[vizitKey][szak] = vizitek[vizitKey][szak].filter(e => (e.fogak?.length || 0) > 0 || e.kezelesek?.[0]?.scaling !== "per_tooth");
        }
    }

    // Flatten
    let flatVizitek = [];
    for (const vizitKey of Object.keys(vizitek).sort()) {
        const vizitNum = parseInt(vizitKey.split("_")[1]) || 1;
        for (const szak of Object.keys(vizitek[vizitKey])) {
            for (const entry of vizitek[vizitKey][szak]) {
                const k = entry.kezelesek?.[0];
                const name = k?.name || "";
                const fogLista = entry.fogak || [];
                if (fogLista.length === 0) {
                    flatVizitek.push({ vizit: vizitNum, szakterulet: szak, fog: "11", hidtag: null, name, quantity: k?.quantity || 1, scaling: k?.scaling || "per_case", talalat: k?.talalat ?? true });
                } else {
                    for (const fog of fogLista) {
                        flatVizitek.push({ vizit: vizitNum, szakterulet: szak, fog: fog.fog, hidtag: fog.hidtag, name, quantity: k?.quantity || 1, scaling: k?.scaling || "per_case", talalat: k?.talalat ?? true });
                    }
                }
            }
        }
    }

    // ============ PASS A: CROSS-ITEM DEDUPLICATION ============
    // When multiple rules match the same treatment area (e.g. All-on-6 + extractio),
    // both generate rows for the same tooth+treatmentType. Deduplicate by keeping first.
    {
        const EXTRACT_KW = ["extractio", "fogeltávolítás", "foghúzás", "húzás", "eltávolítás"];
        const IMPLANT_KW = ["implantáció", "fogbeültetés", "implantátum beül", "implant beül"];
        const MULTIUNIT_KW = ["multiunit", "adapter"];
        const HEALING_KW = ["gyógyulási sapka", "healing cap", "healing abutment"];
        const ABUTMENT_KW = ["abutment", "felépítő fej", "felépítmény"];
        const CROWN_KW = ["korona", "crown"];
        const BRIDGE_KW = ["híd", "bridge"];
        const XRAY_PANORAMA_KW = ["panoráma", "opg", "ortopantom"];
        const XRAY_CBCT_KW = ["cbct", "cone beam", "ct felvétel", "ct nagy"];
        const XRAY_PERIAPICAL_KW = ["periapicalis", "endoct", "pa digitális", "pa röntgen", "5cm x 5"];
        const XRAY_GENERAL_KW = ["röntgen", "x-ray"];
        const SURGPREP_KW = ["műtéti előkészítés", "surgical prep"];
        const SINUS_KW = ["sinus", "arcüreg", "szinusz", "sinuslift"];

        function treatmentCategory(name) {
            const n = normSzoveg(name);
            if (EXTRACT_KW.some(k => n.includes(k))) return "extraction";
            if (IMPLANT_KW.some(k => n.includes(k))) return "implant_insertion";
            if (MULTIUNIT_KW.some(k => n.includes(k))) return "multiunit";
            if (HEALING_KW.some(k => n.includes(k))) return "healing_cap";
            if (ABUTMENT_KW.some(k => n.includes(k))) return "abutment";
            if (SINUS_KW.some(k => n.includes(k))) return "sinus_lift";
            if (XRAY_CBCT_KW.some(k => n.includes(k))) return "xray_cbct";
            if (XRAY_PANORAMA_KW.some(k => n.includes(k))) return "xray_panorama";
            if (XRAY_PERIAPICAL_KW.some(k => n.includes(k))) return "xray_periapical";
            if (XRAY_GENERAL_KW.some(k => n.includes(k))) return "xray_general";
            if (SURGPREP_KW.some(k => n.includes(k))) return "surgical_prep";
            if (BRIDGE_KW.some(k => n.includes(k))) return "bridge";
            if (CROWN_KW.some(k => n.includes(k))) return "crown";
            return "other_" + n.substring(0, 40); // unique per unique treatment
        }

        const seen = new Set();
        const beforeCount = flatVizitek.length;
        flatVizitek = flatVizitek.filter(v => {
            const cat = treatmentCategory(v.name);
            // Only deduplicate known categories (not "other_*")
            if (cat.startsWith("other_")) return true;
            const key = `${v.vizit}|${v.fog}|${cat}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        if (VERBOSE && flatVizitek.length < beforeCount) {
            info(`  Pass A: removed ${beforeCount - flatVizitek.length} duplicate rows (cross-item dedup)`);
        }
    }

    // ============ PASS B: SEQUENCE VALIDATION ============
    // 1. Remove restorative work on extracted teeth (unless implant in between)
    // 2. Remove healing cap after crown delivery
    {
        // Build tooth timelines from flatVizitek
        const RESTORE_KW = ["korona", "crown", "tömés", "filling", "kompozit", "preparál",
            "héj", "veneer", "gyökérkezel", "trepanál", "lenyomat"];
        const EXTRACT_KW2 = ["extractio", "fogeltávolítás", "foghúzás", "húzás", "eltávolítás"];
        const IMPLANT_KW2 = ["implant"];
        const CROWN_KW2 = ["korona", "crown"];
        const HCAP_KW2 = ["gyógyulási sapka", "healing cap", "ínyformáz"];

        function isRestorative(n) { const s = normSzoveg(n); return RESTORE_KW.some(k => s.includes(k)); }
        function isExtractB(n) { const s = normSzoveg(n); return EXTRACT_KW2.some(k => s.includes(k)); }
        function hasImplantB(n) { const s = normSzoveg(n); return IMPLANT_KW2.some(k => s.includes(k)); }
        function isCrownB(n) { const s = normSzoveg(n); return CROWN_KW2.some(k => s.includes(k)); }
        function isHealCapB(n) { const s = normSzoveg(n); return HCAP_KW2.some(k => s.includes(k)); }

        // Index by tooth
        const toothRows = new Map();
        for (let i = 0; i < flatVizitek.length; i++) {
            const fog = flatVizitek[i].fog;
            if (!toothRows.has(fog)) toothRows.set(fog, []);
            toothRows.get(fog).push(i);
        }

        const removeIdx = new Set();

        for (const [fog, indices] of toothRows) {
            // Sort by vizit
            const sorted = indices.slice().sort((a, b) => flatVizitek[a].vizit - flatVizitek[b].vizit);

            let extracted = false;
            let implanted = false;
            let crownDeliveredVizit = null;

            for (const idx of sorted) {
                const row = flatVizitek[idx];
                const name = row.name;

                if (isExtractB(name)) {
                    extracted = true;
                    implanted = false; // reset
                }

                if (hasImplantB(name)) {
                    implanted = true;
                }

                // Rule 1: restorative on extracted tooth without implant
                if (extracted && !implanted && isRestorative(name) && !hasImplantB(name)) {
                    removeIdx.add(idx);
                }

                // Track crown delivery
                if (isCrownB(name)) {
                    if (crownDeliveredVizit === null) crownDeliveredVizit = row.vizit;
                }

                // Rule 2: healing cap after crown
                if (crownDeliveredVizit !== null && row.vizit > crownDeliveredVizit && isHealCapB(name)) {
                    removeIdx.add(idx);
                }
            }
        }

        if (removeIdx.size > 0) {
            const beforeCount = flatVizitek.length;
            flatVizitek = flatVizitek.filter((_, i) => !removeIdx.has(i));
            if (VERBOSE) {
                info(`  Pass B: removed ${beforeCount - flatVizitek.length} sequence-invalid rows`);
            }
        }
    }

    // ============ PASS C: POSITION & QUANTITY FILTERING ============
    {
        const SINUS_KW2 = ["sinus", "arcüreg", "szinusz", "sinuslift"];
        const XRAY_KW2_PANORAMA = ["panoráma", "opg", "ortopantom"];
        const XRAY_KW2_CBCT = ["cbct", "cone beam", "ct felvétel", "ct nagy"];
        const XRAY_KW2_PERIAPICAL = ["periapicalis", "endoct", "pa digitális", "pa röntgen", "5cm x 5"];
        const XRAY_KW2_GENERAL = ["röntgen", "x-ray"];
        const SURGPREP_KW2 = ["műtéti előkészítés", "surgical prep"];

        function isSinusC(n) { const s = normSzoveg(n); return SINUS_KW2.some(k => s.includes(k)); }
        function xraySubcatC(n) {
            const s = normSzoveg(n);
            if (XRAY_KW2_CBCT.some(k => s.includes(k))) return "cbct";
            if (XRAY_KW2_PANORAMA.some(k => s.includes(k))) return "panorama";
            if (XRAY_KW2_PERIAPICAL.some(k => s.includes(k))) return "periapical";
            if (XRAY_KW2_GENERAL.some(k => s.includes(k))) return "general";
            return null;
        }
        function isSurgPrepC(n) { const s = normSzoveg(n); return SURGPREP_KW2.some(k => s.includes(k)); }

        const removeIdx = new Set();

        // C1: Sinus lift only valid on upper positions 4-8 (FDI: 14-18, 24-28)
        for (let i = 0; i < flatVizitek.length; i++) {
            const v = flatVizitek[i];
            if (isSinusC(v.name)) {
                const fogNum = parseInt(v.fog);
                if (!isNaN(fogNum)) {
                    const pos = fogNum % 10;
                    const quad = Math.floor(fogNum / 10);
                    if (quad > 2 || pos < 4) {
                        removeIdx.add(i);
                    }
                }
            }
        }

        // C2: Max 2 x-ray rows per subcategory (panoráma, CBCT, periapical each get 2)
        const xrayCounts = {};
        for (let i = 0; i < flatVizitek.length; i++) {
            if (removeIdx.has(i)) continue;
            const subcat = xraySubcatC(flatVizitek[i].name);
            if (subcat) {
                xrayCounts[subcat] = (xrayCounts[subcat] || 0) + 1;
                if (xrayCounts[subcat] > 2) removeIdx.add(i);
            }
        }

        // C3: Max 2 surgical prep rows
        let surgPrepCount = 0;
        for (let i = 0; i < flatVizitek.length; i++) {
            if (removeIdx.has(i)) continue;
            if (isSurgPrepC(flatVizitek[i].name)) {
                surgPrepCount++;
                if (surgPrepCount > 2) removeIdx.add(i);
            }
        }

        if (removeIdx.size > 0) {
            const beforeCount = flatVizitek.length;
            flatVizitek = flatVizitek.filter((_, i) => !removeIdx.has(i));
            if (VERBOSE) {
                info(`  Pass C: removed ${beforeCount - flatVizitek.length} position/quantity-invalid rows`);
            }
        }
    }

    // ============ PASS D: BRAND CONSISTENCY FILTER ============
    // If the input text mentions a specific implant brand (Nobel, Alpha Bio, Straumann, etc.)
    // remove output rows that reference a DIFFERENT brand.
    // Safety: only filter brand-specific items (implants, abutments) — not prosthetics
    // that just happen to mention a brand name in their rule title.
    // Safety: never remove ALL rows — a wrong-brand match is better than empty output.
    {
        const BRAND_MAP = {
            "nobel": ["nobel", "nobel-biocare", "nobel biocare"],
            "alpha_bio": ["alpha bio", "alpha-bio", "alphabio"],
            "straumann": ["straumann"],
            "megagen": ["megagen"],
            "osstem": ["osstem"],
            "biomet": ["biomet", "zimmer", "zimvie"],
            "bredent": ["bredent"],
            "dentium": ["dentium"],
            "mis": ["mis implant", "mis "],
        };

        // Keywords indicating the row is a brand-specific implant item (worth filtering)
        const BRAND_SPECIFIC_KW = ["implantáció", "implantátum beül", "implant beül",
            "fogbeültetés", "fixture", "abutment", "felépítő fej", "felépítmény",
            "multiunit", "adapter", "gyógyulási sapka", "healing"];

        function isBrandSpecificItem(name) {
            const n = normSzoveg(name || "");
            return BRAND_SPECIFIC_KW.some(kw => n.includes(kw));
        }

        // Match beiro.json behavior: build input from eredeti_szoveg, not raw transcription
        let brandInputText = "";
        for (const tetel of tetelLista) {
            if (tetel.eredeti_szoveg) brandInputText += " " + tetel.eredeti_szoveg;
        }
        const inputLower = normSzoveg(brandInputText);
        const detectedBrands = [];
        for (const [brandKey, keywords] of Object.entries(BRAND_MAP)) {
            if (keywords.some(kw => inputLower.includes(kw))) {
                detectedBrands.push(brandKey);
            }
        }

        if (detectedBrands.length > 0) {
            const filtered = flatVizitek.filter(v => {
                const nameLower = normSzoveg(v.name || "");
                // Only apply brand filter to brand-specific items (implants, abutments)
                // Prosthetics like bridges/crowns that mention a brand in their rule name are kept
                if (!isBrandSpecificItem(nameLower)) return true;
                // Check if this row mentions a DIFFERENT brand
                for (const [brandKey, keywords] of Object.entries(BRAND_MAP)) {
                    if (detectedBrands.includes(brandKey)) continue; // this is a requested brand, keep
                    if (keywords.some(kw => nameLower.includes(kw))) {
                        return false; // wrong brand, remove
                    }
                }
                return true;
            });

            // Safety: never remove ALL rows — a wrong-brand match is better than empty output
            if (filtered.length > 0) {
                if (VERBOSE && filtered.length < flatVizitek.length) {
                    info(`  Pass D: removed ${flatVizitek.length - filtered.length} brand-mismatched rows (input brands: ${detectedBrands.join(", ")})`);
                }
                flatVizitek = filtered;
            } else if (VERBOSE) {
                warn(`  Pass D: brand filter would remove ALL rows — skipping filter (input brands: ${detectedBrands.join(", ")})`);
            }
        }
    }

    // ============ PASS E: CROSS-VISIT IMPLANT DEDUPLICATION ============
    // If the same tooth has an implant in multiple visits (e.g. from sinuslift combo rule
    // in visit 1 AND standalone implant rule in visit 3), keep only the FIRST occurrence.
    {
        const IMPLANT_INSERT_KW = ["implantáció", "implantátum beül", "implant beül",
            "fogbeültetés", "fixture", "implantátum műtéti"];

        function isImplantInsertion(name) {
            const n = normSzoveg(name || "");
            return IMPLANT_INSERT_KW.some(k => n.includes(k));
        }

        // Group by tooth: track which teeth already have an implant insertion
        const toothFirstImplantVizit = new Map(); // fog -> first vizit number
        // First pass: find the earliest implant vizit per tooth
        for (const v of flatVizitek) {
            if (isImplantInsertion(v.name)) {
                const existing = toothFirstImplantVizit.get(v.fog);
                if (existing === undefined || v.vizit < existing) {
                    toothFirstImplantVizit.set(v.fog, v.vizit);
                }
            }
        }

        const beforeCount = flatVizitek.length;
        flatVizitek = flatVizitek.filter(v => {
            if (!isImplantInsertion(v.name)) return true;
            // Keep only the first vizit's implant for this tooth
            return v.vizit === toothFirstImplantVizit.get(v.fog);
        });

        if (VERBOSE && flatVizitek.length < beforeCount) {
            info(`  Pass E: removed ${beforeCount - flatVizitek.length} duplicate implant rows (cross-visit dedup)`);
        }
    }

    // ============ PASS E2: CROSS-VISIT EXTRACTION DEDUPLICATION ============
    // If the same tooth has extraction in multiple visits (e.g. from combo rule in visit 1
    // AND explicit multi-session extraction tétel in visit 2), keep only one occurrence.
    // Keep the one from the LATER visit (the explicit multi-session split).
    {
        const EXTRACT_KW = ["extractio", "fogeltávolítás", "foghúzás"];

        function isExtraction(name) {
            const n = normSzoveg(name || "");
            return EXTRACT_KW.some(k => n.includes(k));
        }

        // Group by tooth: track which teeth have extraction in multiple visits
        const toothExtractVisits = new Map(); // fog -> [vizit numbers]
        for (const v of flatVizitek) {
            if (isExtraction(v.name)) {
                if (!toothExtractVisits.has(v.fog)) toothExtractVisits.set(v.fog, new Set());
                toothExtractVisits.get(v.fog).add(v.vizit);
            }
        }

        // Find teeth with extraction in multiple visits
        const duplicateTeeth = new Map();
        for (const [fog, visits] of toothExtractVisits) {
            if (visits.size > 1) {
                // Keep the latest visit (the explicit multi-session one)
                duplicateTeeth.set(fog, Math.max(...visits));
            }
        }

        if (duplicateTeeth.size > 0) {
            const beforeCount = flatVizitek.length;
            flatVizitek = flatVizitek.filter(v => {
                if (!isExtraction(v.name)) return true;
                const keepVizit = duplicateTeeth.get(v.fog);
                if (keepVizit === undefined) return true;
                return v.vizit === keepVizit;
            });

            if (VERBOSE && flatVizitek.length < beforeCount) {
                info(`  Pass E2: removed ${beforeCount - flatVizitek.length} duplicate extraction rows (cross-visit dedup, teeth: ${[...duplicateTeeth.keys()].join(",")})`);
            }
        }
    }

    // ============ PASS F: VISIT RESEQUENCING ============
    // Detects clinically incompatible procedure combinations in the same visit
    // and separates them into sequential visits.
    {
        // -- Phase classification keywords --
        const PHASE_KW = {
            DIAGNOSTIC: ["röntgen", "x-ray", "panoráma", "cbct", "ct felvétel", "konzultáció", "vizsgálat"],
            PARODONTOLOGY: ["parodont", "kürett", "depurálás", "fogkő", "tasakmélység", "scaling", "root planing"],
            EXTRACTION: ["extractio", "foghúzás", "fogeltávolítás", "húzás", "eltávolítás", "bölcsességfog"],
            BONE_AUGMENTATION: ["sinus", "arcüreg", "szinusz", "sinuslift", "csontpótlás", "bone graft", "augmentáció", "membrán"],
            IMPLANT_SURGICAL: ["implantáció", "implantátum beül", "implant beül", "fogbeültetés", "fixture"],
            IMPLANT_PROSTHETIC_PREP: ["gyógyulási sapka", "healing cap", "healing abutment", "abutment", "felépítő fej", "felépítmény", "multiunit", "implant felszabadít", "ínyformáz"],
            PROSTHETIC_PREP: ["lenyomat", "szken", "scan", "preparálás", "preparáció"],
            PROSTHETIC_DELIVERY: ["korona", "crown", "híd", "bridge", "héj", "veneer", "fogsor", "protézis"],
            CONSERVATIVE: ["tömés", "filling", "gyökérkezel", "trepanál", "kompozit", "endodont"],
            SUPPORT: ["műtéti előkészítés", "surgical prep", "sterili"],
        };

        // Phase priority (lower = should happen earlier)
        const PHASE_PRIORITY = {
            DIAGNOSTIC: 0, PARODONTOLOGY: 1, EXTRACTION: 2,
            BONE_AUGMENTATION: 3, IMPLANT_SURGICAL: 4,
            IMPLANT_PROSTHETIC_PREP: 5, PROSTHETIC_PREP: 6,
            PROSTHETIC_DELIVERY: 7, CONSERVATIVE: -1, SUPPORT: -1
        };

        // Surgical phases (incompatible with PARO in same visit)
        const SURGICAL_PHASES = new Set(["EXTRACTION", "BONE_AUGMENTATION", "IMPLANT_SURGICAL"]);

        function classifyPhase(name) {
            const n = normSzoveg(name || "");
            // Check in priority order (more specific first)
            for (const [phase, keywords] of Object.entries(PHASE_KW)) {
                if (keywords.some(kw => n.includes(kw))) return phase;
            }
            return "OTHER";
        }

        // Tag each row with its phase
        for (const v of flatVizitek) {
            v._phase = classifyPhase(v.name);
        }

        // Group by visit
        const visitMap = new Map(); // vizitNum -> [rows]
        for (const v of flatVizitek) {
            if (!visitMap.has(v.vizit)) visitMap.set(v.vizit, []);
            visitMap.get(v.vizit).push(v);
        }

        let splitCount = 0;

        for (const [vizitNum, rows] of visitMap) {
            const phases = new Set(rows.map(r => r._phase));

            // --- R1: PARODONTOLOGY + SURGICAL in same visit ---
            const hasParo = phases.has("PARODONTOLOGY");
            const hasSurgical = [...phases].some(p => SURGICAL_PHASES.has(p));

            if (hasParo && hasSurgical) {
                // Move paro items to their own sub-visit (before surgery)
                for (const r of rows) {
                    if (r._phase === "PARODONTOLOGY") {
                        r._offset = -0.5; // will be placed before the surgical visit
                        splitCount++;
                    }
                }
            }

            // NOTE: R2 (BONE_AUGMENTATION + IMPLANT_SURGICAL same tooth) intentionally omitted.
            // Combo rules (e.g. "Sinuslift + Nobel Implant") legitimately bundle these together.
            // Without rule IDs in the flat list, we can't distinguish combos from collisions.


            // --- R3: IMPLANT_SURGICAL + PROSTHETIC_DELIVERY on same tooth ---
            if (phases.has("IMPLANT_SURGICAL") && phases.has("PROSTHETIC_DELIVERY")) {
                const implantTeeth = new Set(rows.filter(r => r._phase === "IMPLANT_SURGICAL").map(r => r.fog));
                for (const r of rows) {
                    if (r._phase === "PROSTHETIC_DELIVERY" && implantTeeth.has(r.fog)) {
                        r._offset = 0.5; // will be placed after the implant visit
                        splitCount++;
                    }
                }
            }
        }

        // --- R4: EXTRACTION + PROSTHETIC on same tooth (cross-visit) ---
        // When a tooth has both extraction and prosthetic prep/delivery,
        // and the prosthetic visit is at or before the extraction visit,
        // bump the prosthetic work to after the latest phase for that tooth
        // (typically after implant insertion).
        {
            // Build per-tooth phase timelines
            const toothPhases = new Map(); // fog → [{vizit, phase, index}]
            for (let i = 0; i < flatVizitek.length; i++) {
                const v = flatVizitek[i];
                const fog = v.fog;
                if (!fog || fog === "FELSO_ALLCSONT" || fog === "ALSO_ALLCSONT") continue;
                if (!toothPhases.has(fog)) toothPhases.set(fog, []);
                toothPhases.get(fog).push({ vizit: v.vizit, phase: v._phase, index: i });
            }

            for (const [fog, entries] of toothPhases) {
                const extractionEntries = entries.filter(e => e.phase === "EXTRACTION");
                if (extractionEntries.length === 0) continue;

                const extractionVizit = Math.min(...extractionEntries.map(e => e.vizit));
                const implantEntries = entries.filter(e => e.phase === "IMPLANT_SURGICAL");
                const hasImplant = implantEntries.length > 0;

                // Find prosthetic work on this tooth that's at or before extraction
                const prostheticPhases = ["PROSTHETIC_PREP", "PROSTHETIC_DELIVERY"];
                const conflictingProsthetics = entries.filter(e => {
                    if (!prostheticPhases.includes(e.phase)) return false;
                    if (e.vizit > extractionVizit) return false;
                    // EXEMPTION: If this is PROSTHETIC_PREP and there's IMPLANT_SURGICAL
                    // in the same visit, the prep (e.g. scanning) is for the implant
                    // prosthesis, not the extracted tooth — keep it in place.
                    if (e.phase === "PROSTHETIC_PREP" && hasImplant) {
                        const implantInSameVizit = implantEntries.some(ie => ie.vizit === e.vizit);
                        if (implantInSameVizit) return false;
                    }
                    return true;
                });
                if (conflictingProsthetics.length > 0) {
                    // Determine the target visit: after implant if present, otherwise after extraction
                    let targetOffset;
                    if (hasImplant) {
                        const implantVizit = Math.max(...implantEntries.map(e => e.vizit));
                        // Offset to place after implant (implantVizit - current + 0.5)
                        targetOffset = (vizitNum) => implantVizit - vizitNum + 0.5;
                    } else {
                        // No implant yet — just push after extraction
                        targetOffset = (vizitNum) => extractionVizit - vizitNum + 0.5;
                    }

                    for (const entry of conflictingProsthetics) {
                        const v = flatVizitek[entry.index];
                        v._offset = targetOffset(v.vizit);
                        splitCount++;
                    }
                }
            }
        }

        if (splitCount > 0) {
            // Calculate effective visit order
            for (const v of flatVizitek) {
                v._effectiveVizit = v.vizit + (v._offset || 0);
            }

            // Sort by effective visit, then by phase priority
            flatVizitek.sort((a, b) => {
                if (a._effectiveVizit !== b._effectiveVizit) return a._effectiveVizit - b._effectiveVizit;
                const pa = PHASE_PRIORITY[a._phase] ?? 99;
                const pb = PHASE_PRIORITY[b._phase] ?? 99;
                return pa - pb;
            });

            // Renumber to sequential integers
            let currentVizit = 0;
            let lastEffective = null;
            for (const v of flatVizitek) {
                if (v._effectiveVizit !== lastEffective) {
                    currentVizit++;
                    lastEffective = v._effectiveVizit;
                }
                v.vizit = currentVizit;
            }

            if (VERBOSE) {
                info(`  Pass F: resequenced ${splitCount} items across visits (incompatible phase separation)`);
            }
        }

        // Clean up temporary properties
        for (const v of flatVizitek) {
            delete v._phase;
            delete v._offset;
            delete v._effectiveVizit;
        }
    }

    // ============ POST-PASS DEDUP ============
    // After all passes (especially Pass F renumbering), re-run same-visit/same-tooth
    // dedup to catch collisions created by visit reassignment.
    {
        const IMPLANT_INS_KW = ["implantáció", "fogbeültetés", "implantátum beül", "implant beül"];
        const EXTRACT_DKW = ["extractio", "fogeltávolítás", "foghúzás", "húzás", "eltávolítás"];
        const CROWN_DKW = ["korona", "crown"];
        const HEALING_DKW = ["gyógyulási sapka", "healing cap"];
        const ABUTMENT_DKW = ["abutment", "felépítő fej", "felépítmény", "multiunit"];

        function dedupCategory(name) {
            const n = normSzoveg(name);
            if (EXTRACT_DKW.some(k => n.includes(k))) return "extraction";
            if (IMPLANT_INS_KW.some(k => n.includes(k))) return "implant";
            if (HEALING_DKW.some(k => n.includes(k))) return "healing_cap";
            if (ABUTMENT_DKW.some(k => n.includes(k))) return "abutment";
            if (CROWN_DKW.some(k => n.includes(k))) return "crown";
            return null; // don't dedup unknown categories
        }

        const seen = new Set();
        const beforeCount = flatVizitek.length;
        flatVizitek = flatVizitek.filter(v => {
            const cat = dedupCategory(v.name);
            if (!cat) return true; // keep items we can't categorize
            const key = `${v.vizit}|${v.fog}|${cat}`;
            if (seen.has(key)) return false; // duplicate
            seen.add(key);
            return true;
        });

        if (VERBOSE && flatVizitek.length < beforeCount) {
            info(`  Post-pass dedup: removed ${beforeCount - flatVizitek.length} same-visit/tooth/category duplicates`);
        }
    }

    // Cleanup
    for (const vk of Object.keys(vizitek)) {
        for (const szak of Object.keys(vizitek[vk])) {
            for (const e of vizitek[vk][szak]) delete e.__id;
        }
    }

    ok(`Scaling kész: ${flatVizitek.length} vizit sor generálva.`);

    if (VERBOSE) {
        for (const v of flatVizitek) {
            info(`  Vizit ${v.vizit} | ${v.szakterulet} | Fog ${v.fog} | ${v.name} (${v.scaling})`);
        }
    }

    const kimenet = {
        vizitek: flatVizitek,
        meta: { tetel_szam: tetelLista.length, vizit_szam: flatVizitek.length }
    };
    const payload_json = JSON.stringify(kimenet);
    const payload_b64 = Buffer.from(payload_json, "utf8").toString("base64");

    return {
        ...kimenet,
        payload_json,
        payload_b64,
        eseteik_szurve: [kimenet]
    };
}

// ============ MOCK AI OUTPUT ============

function generateMockAIOutput(inputText) {
    // Parse the input text heuristically to produce a reasonable mock tetel_lista
    const lower = inputText.toLowerCase();
    const tetelLista = [];

    // Detect extraction patterns
    if (lower.includes("kihúz") || lower.includes("eltávolít") || lower.includes("kivétel") || lower.includes("húzni")) {
        const tetel = { kategoria: "szajsebeszet", fogak: [], kezelesek: ["extractio fogeltávolítás"], eredeti_szoveg: inputText };

        if (lower.includes("felül minden") || lower.includes("felső minden")) {
            tetel.fogak = [{ fog: "FELSO_ALLCSONT", hidtag: null }];
        } else if (lower.includes("alul minden") || lower.includes("alsó minden")) {
            tetel.fogak = [{ fog: "ALSO_ALLCSONT", hidtag: null }];
        } else {
            // Try to extract specific tooth numbers
            const toothMap = {
                "jobb felső egyes": "11", "bal felső egyes": "21", "jobb alsó egyes": "41", "bal alsó egyes": "31",
                "jobb felső kettes": "12", "bal felső kettes": "22", "jobb felső hármas": "13", "bal felső hármas": "23",
                "jobb felső négyes": "14", "bal felső négyes": "24", "jobb felső ötös": "15", "bal felső ötös": "25",
                "jobb felső hatos": "16", "bal felső hatos": "26", "jobb felső hetes": "17", "bal felső hetes": "27",
                "jobb felső nyolcas": "18", "bal felső nyolcas": "28",
                "jobb alsó kettes": "42", "bal alsó kettes": "32", "jobb alsó hármas": "43", "bal alsó hármas": "33",
                "jobb alsó négyes": "44", "bal alsó négyes": "34", "jobb alsó ötös": "45", "bal alsó ötös": "35",
                "jobb alsó hatos": "46", "bal alsó hatos": "36", "jobb alsó hetes": "47", "bal alsó hetes": "37",
                "jobb alsó nyolcas": "48", "bal alsó nyolcas": "38",
            };
            // FDI number patterns
            const fdiMatch = lower.match(/(\d{1,2})-(?:os|es|as|ös)/g);
            for (const [phrase, num] of Object.entries(toothMap)) {
                if (lower.includes(phrase)) tetel.fogak.push({ fog: num, hidtag: null });
            }
            // Also look for patterns like "felső négyes fogat bal"
            if (lower.includes("felső négyes") && lower.includes("bal")) tetel.fogak.push({ fog: "24", hidtag: null });
            if (lower.includes("felső hatos") && lower.includes("jobb")) tetel.fogak.push({ fog: "16", hidtag: null });
        }

        if (tetel.fogak.length > 0) tetelLista.push(tetel);
    }

    // Detect All-on-4/6
    if (lower.includes("all on") || lower.includes("all-on") || lower.includes("allon")) {
        const count = lower.includes("6") || lower.includes("six") ? 6 : 4;
        const arch = lower.includes("felül") || lower.includes("felső") ? "FELSO_ALLCSONT" : "ALSO_ALLCSONT";
        tetelLista.push({
            kategoria: "implantacio",
            fogak: [{ fog: arch, hidtag: null }],
            kezelesek: [`All-on-${count} csavarozott cirkon híd implantáció`],
            eredeti_szoveg: inputText
        });
    }

    // Detect direkt héj
    if (lower.includes("direkt héj") || lower.includes("héjat") || lower.includes("veneer")) {
        const teeth = [];
        if (lower.includes("bal alsó hármastól") && lower.includes("jobb alsó hármasig")) {
            teeth.push({ fog: "33", hidtag: null }, { fog: "32", hidtag: null }, { fog: "31", hidtag: null },
                { fog: "41", hidtag: null }, { fog: "42", hidtag: null }, { fog: "43", hidtag: null });
        }
        if (teeth.length > 0) {
            tetelLista.push({
                kategoria: "fogpotlastan",
                fogak: teeth,
                kezelesek: ["direkt héj veneer"],
                eredeti_szoveg: inputText
            });
        }
    }

    // Detect implant (non-All-on)
    if ((lower.includes("implant") || lower.includes("beültet")) && !lower.includes("all on") && !lower.includes("all-on")) {
        tetelLista.push({
            kategoria: "implantacio",
            fogak: [{ fog: "11", hidtag: null }],
            kezelesek: ["implantátum beültetés"],
            eredeti_szoveg: inputText
        });
    }

    // Detect korona
    if (lower.includes("korona") || lower.includes("koronát")) {
        const type = lower.includes("cirkon") ? "cirkon korona" : lower.includes("fémkerámia") ? "fémkerámia korona" : "korona";
        tetelLista.push({
            kategoria: "fogpotlastan",
            fogak: [{ fog: "11", hidtag: null }],
            kezelesek: [type],
            eredeti_szoveg: inputText
        });
    }

    // Detect gyökérkezelés
    if (lower.includes("gyökérkezel")) {
        tetelLista.push({
            kategoria: "konzervalo_fogaszat",
            fogak: [{ fog: "21", hidtag: null }],
            kezelesek: ["gyökérkezelés trepanálás"],
            eredeti_szoveg: inputText
        });
    }

    // Detect sinuslift
    if (lower.includes("sinus") || lower.includes("szinusz") || lower.includes("arcüregemelés")) {
        tetelLista.push({
            kategoria: "szajsebeszet",
            fogak: [{ fog: "16", hidtag: null }],
            kezelesek: ["sinuslift arcüregemelés"],
            eredeti_szoveg: inputText
        });
    }

    // Detect parodontológia
    if (lower.includes("parodontológia") || lower.includes("parodontológiai") || lower.includes("kürett")) {
        tetelLista.push({
            kategoria: "parodontologia",
            fogak: [{ fog: "11", hidtag: null }],
            kezelesek: ["parodontológiai kezelés"],
            eredeti_szoveg: inputText
        });
    }

    // Detect tömés
    if (lower.includes("tömés") || lower.includes("kompozit")) {
        tetelLista.push({
            kategoria: "konzervalo_fogaszat",
            fogak: [{ fog: "45", hidtag: null }],
            kezelesek: ["esztétikus kompozit tömés"],
            eredeti_szoveg: inputText
        });
    }

    // Detect onlay
    if (lower.includes("onlay") || lower.includes("öntött tömés")) {
        tetelLista.push({
            kategoria: "fogpotlastan",
            fogak: [{ fog: "46", hidtag: null }],
            kezelesek: ["porcelán onlay"],
            eredeti_szoveg: inputText
        });
    }

    if (tetelLista.length === 0) {
        tetelLista.push({
            kategoria: "egyeb",
            fogak: [{ fog: "11", hidtag: null }],
            kezelesek: ["ismeretlen kezelés"],
            eredeti_szoveg: inputText
        });
    }

    info(`Mock AI generált ${tetelLista.length} tételt.`);
    return { tetel_lista: tetelLista };
}

// ============ REPORT PRINTER ============

function printConsistencyReport(report, testCaseId) {
    section(`CONSISTENCY REPORT${testCaseId ? ` — ${testCaseId}` : ""}`);

    const printIssues = (label, issues) => {
        if (issues.length === 0) {
            ok(`${label}: Nincs probléma.`);
            return;
        }
        console.log(`\n  ${C.bold}${label}:${C.reset}`);
        for (const issue of issues) {
            if (issue.severity === "ERROR") err(issue.message);
            else warn(issue.message);
        }
    };

    printIssues("Strukturális ellenőrzés", report.structural_issues);
    printIssues("Elvárás ellenőrzés", report.expectation_issues);
    printIssues("Scaling ellenőrzés", report.scaling_issues);

    console.log("");
    const s = report.summary;
    if (s.passed) {
        console.log(`  ${C.bgGreen}${C.bold} ✓ PASSED ${C.reset} Minden ellenőrzés sikeres.`);
    } else {
        console.log(`  ${C.bgRed}${C.bold} ✗ ISSUES FOUND ${C.reset}  ${C.red}${s.errors} hiba${C.reset}, ${C.yellow}${s.warnings} figyelmeztetés${C.reset}`);
    }
}

// ============ MAIN ============

async function runTestCase(testCase, credentials) {
    banner(`Test: ${testCase.name} [${testCase.id}]`);
    console.log(`  ${C.dim}Input: "${testCase.input_text.substring(0, 100)}..."${C.reset}`);

    const caseResult = {
        id: testCase.id,
        name: testCase.name,
        input_text: testCase.input_text,
        status: null,
        error: null,
        steps: {}
    };

    // Step 1: AI Agent
    const aiOutput = await runAIAgent(testCase.input_text, credentials);
    caseResult.steps.ai_agent_raw = typeof aiOutput === "string" ? aiOutput.substring(0, 5000) : "[mock object]";

    // Step 2: JSON kiszedő
    let jsonData;
    try {
        jsonData = runJsonExtractor(aiOutput);
    } catch (e) {
        err(`JSON kinyerés sikertelen: ${e.message}`);
        caseResult.status = "FAIL";
        caseResult.error = "json_extraction_failed";
        return caseResult;
    }

    const tetelLista = jsonData.tetel_lista || [];
    info(`Tételek: ${tetelLista.length}`);
    caseResult.steps.tetel_lista = tetelLista;

    if (VERBOSE) {
        section("AI Agent Output (tetel_lista)");
        console.log(JSON.stringify(tetelLista, null, 2));
    }

    // Step 3: Semantic Matcher
    const semanticResult = await runSemanticMatcher(tetelLista, credentials, testCase.input_text);
    const matchedTetelLista = semanticResult.tetel_lista;
    caseResult.steps.semantic_matched_tetel_lista = matchedTetelLista;
    caseResult.steps.semantic_stats = semanticResult._semantic_match_stats;
    caseResult.steps.semantic_report = semanticResult._execution_report;

    // Step 4: Scaling Processor
    const scalingResult = runScalingProcessor(matchedTetelLista, testCase.input_text);
    caseResult.steps.scaling_output = scalingResult;

    // Step 5: Consistency check
    const report = analyzeConsistency(matchedTetelLista, scalingResult, testCase.expected);
    printConsistencyReport(report, testCase.id);
    caseResult.steps.consistency_report = report;

    // Step 6: Medical validation
    const medicalResult = validateMedical(testCase.input_text, matchedTetelLista, scalingResult);
    caseResult.steps.medical_validation = medicalResult;

    if (medicalResult.issues.length > 0) {
        section(`MEDICAL VALIDATION — ${testCase.id}`);
        for (const issue of medicalResult.issues) {
            if (issue.severity === "error") err(`[${issue.rule}] ${issue.message}`);
            else warn(`[${issue.rule}] ${issue.message}`);
        }
        console.log(`\n  ${C.bold}Medical: ${C.red}${medicalResult.summary.errors} hiba${C.reset}, ${C.yellow}${medicalResult.summary.warnings} figyelmeztetés${C.reset}`);
    } else {
        ok(`Medical validation: Nincs probléma.`);
    }

    // Print final output summary
    if (VERBOSE) {
        section("Final Scaling Output");
        console.log(JSON.stringify(scalingResult, null, 2));
    }

    // Status — fail only if structural issues or medical errors
    const hasMedicalErrors = medicalResult.summary.errors > 0;
    caseResult.status = (report.summary.passed && !hasMedicalErrors) ? "PASS" : "FAIL";
    caseResult.report = report;
    return caseResult;
}

async function main() {
    banner("N8N Beiro Flow Simulator");
    console.log(`  Mode: ${LIVE_MODE ? `${C.green}LIVE (real APIs)${C.reset}` : `${C.yellow}MOCK (no API calls)${C.reset}`}`);
    console.log(`  Case filter: ${CASE_FILTER || "all"}`);
    console.log(`  Verbose: ${VERBOSE}`);
    if (TELEPHELY_ID) console.log(`  Telephely ID: ${TELEPHELY_ID}`);
    if (TEST_FILE) console.log(`  Test file: ${TEST_FILE}`);

    const credentials = loadCredentials();

    if (LIVE_MODE && !credentials.anthropicKey) {
        err("LIVE mód-hoz ANTHROPIC_API_KEY szükséges!");
        err("Használat: --anthropic-key sk-ant-... VAGY export ANTHROPIC_API_KEY=sk-ant-...");
        process.exit(1);
    }

    let testCases;

    if (CUSTOM_TEXT) {
        testCases = [{
            id: "CUSTOM",
            name: "Custom input",
            input_text: CUSTOM_TEXT,
            expected: null
        }];
    } else {
        const testFilePath = TEST_FILE ? join(__dirname, TEST_FILE) : join(__dirname, "test_cases.json");
        const rawCases = JSON.parse(readFileSync(testFilePath, "utf-8"));
        testCases = CASE_FILTER ? rawCases.filter(tc => tc.id.includes(CASE_FILTER)) : rawCases;
    }

    if (testCases.length === 0) {
        err("Nincs futtatandó test case!");
        process.exit(1);
    }

    info(`${testCases.length} test case futtatása...`);
    const startTime = Date.now();

    const results = [];
    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        info(`\n  [${i + 1}/${testCases.length}] progress...`);
        const result = await runTestCase(tc, credentials);
        results.push(result);
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

    // Summary
    banner("ÖSSZESÍTÉS");
    const passed = results.filter(r => r.status === "PASS").length;
    const failed = results.filter(r => r.status === "FAIL").length;

    // Medical summary
    let totalMedErrors = 0, totalMedWarnings = 0, casesWithMedIssues = 0;
    for (const r of results) {
        const med = r.steps?.medical_validation?.summary;
        if (med) {
            totalMedErrors += med.errors || 0;
            totalMedWarnings += med.warnings || 0;
            if ((med.errors || 0) + (med.warnings || 0) > 0) casesWithMedIssues++;
        }
    }

    for (const r of results) {
        const med = r.steps?.medical_validation?.summary;
        const medInfo = med ? ` [med: ${med.errors}E/${med.warnings}W]` : "";
        if (r.status === "PASS") ok(`${r.id}: PASS${medInfo}`);
        else err(`${r.id}: FAIL${r.error ? ` (${r.error})` : ""}${medInfo}`);
    }

    console.log("");
    console.log(`  ${C.bold}Összesen: ${results.length} | ${C.green}Sikeres: ${passed}${C.reset} | ${C.red}Sikertelen: ${failed}${C.reset}`);
    console.log(`  ${C.dim}Futásidő: ${elapsedSec}s${C.reset}`);
    console.log(`\n  ${C.bold}Medical összesítés:${C.reset}`);
    console.log(`    Problémás esetek: ${casesWithMedIssues}/${results.length}`);
    console.log(`    ${C.red}🔴 Hibák: ${totalMedErrors}${C.reset}`);
    console.log(`    ${C.yellow}🟡 Figyelmeztetések: ${totalMedWarnings}${C.reset}`);

    // Save full report to JSON
    const reportPath = REPORT_FILE || join(__dirname, `report_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const fullReport = {
        run_timestamp: new Date().toISOString(),
        mode: LIVE_MODE ? "live" : "mock",
        telephely_id: TELEPHELY_ID,
        elapsed_seconds: parseFloat(elapsedSec),
        summary: { total: results.length, passed, failed },
        results: results
    };

    try {
        writeFileSync(reportPath, JSON.stringify(fullReport, null, 2), "utf-8");
        ok(`Részletes riport elmentve: ${reportPath}`);
    } catch (e) {
        err(`Riport mentés sikertelen: ${e.message}`);
    }

    if (failed > 0) process.exit(1);
}

main().catch(e => {
    console.error(`\n${C.red}FATAL ERROR: ${e.message}${C.reset}`);
    if (e.stack) console.error(C.dim + e.stack + C.reset);
    process.exit(2);
});
