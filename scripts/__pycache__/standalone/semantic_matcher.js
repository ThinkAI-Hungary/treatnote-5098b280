// ==========================================================
// SEMANTIC MATCHER - DEEP DEBUG EDITION (JAVÍTOTT)
// + ALAPSZABÁLY OVERRIDE + AKTÍV FILTER
// ==========================================================

// ============ CONFIG ============
const SUPABASE_URL = "https://bpjzgapmoyhtgryglcke.supabase.co";
const SUPABASE_API_KEY = "sb_secret_gRiwdPwnR3BcA6zo1a8XXQ_Z7bJr8Vn";
const OPENAI_API_KEY = "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";

const SIMILARITY_THRESHOLD = 0.60;
const HIGH_CONFIDENCE_THRESHOLD = 0.82;
const ALAPSZABALY_TOLERANCE = 0.04;
const EMBEDDING_MODEL = "text-embedding-3-large";

const DEBUG = true;
const debug_log = []; // Szöveges log
const detailed_report = []; // Strukturált, mély elemzés

// ============ HELPER FUNCTIONS ============

function log(msg, data) {
    if (!DEBUG) return;
    const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
    let dataStr = "";
    if (data !== undefined) {
        try {
            dataStr = typeof data === 'object' ? " | " + JSON.stringify(data).substring(0, 200) + "..." : " | " + String(data);
        } catch (e) { dataStr = " | [Circular/Complex Data]"; }
    }
    const entry = `[${timestamp}] ${msg}${dataStr}`;
    console.log(entry);
    debug_log.push(entry);
}

async function apiCall(name, options) {
    log(`>>> API CALL: ${name}`);
    try {
        const response = await this.helpers.httpRequest({ ...options, json: true });
        log(`<<< API OK: ${name}`, Array.isArray(response) ? `${response.length} items` : "Object");
        return response;
    } catch (error) {
        const errDetail = error.response ? JSON.stringify(error.response.data) : error.message;
        log(`!!! API ERROR: ${name}`, errDetail);
        return null;
    }
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
                visit_number: vNum,
                name: item.name,
                unit: item.unit || "db",
                scaling: item.scaling || "per_case",
                quantity: parseInt(item.quantity) || 1,
                target_tooth_type: item.target_tooth_type || "all"
            });
        }
    }
    return items.sort((a, b) => a.visit_number - b.visit_number);
}

// ============ MAIN LOGIC ============

const inputData = $input.first().json;
const tetelLista = inputData.tetel_lista || [];
// Telephely ID biztonságos kinyerése
let telephelyId = null;
try {
    telephelyId = $('Webhook1').first().json.body.telephely_id;
} catch (e) {
    log("WARN: Nem sikerült a Webhook1-ből kinyerni a telephely_id-t.");
}

log(`START: Semantic Matcher indul. Tételek száma: ${tetelLista.length}`);

// 1. Szövegek előkészítése
const kezelesTexts = [];
const kezelesMap = [];

for (let ti = 0; ti < tetelLista.length; ti++) {
    const tetel = tetelLista[ti];
    const eredetiSzoveg = tetel.eredeti_szoveg || "";
    const kezelesek = Array.isArray(tetel.kezelesek) ? tetel.kezelesek : [];

    for (let ki = 0; ki < kezelesek.length; ki++) {
        const k = kezelesek[ki];
        let rawText = typeof k === 'string' ? k : (k.kezeles_szoveg || k.name || String(k));

        if (rawText && rawText.trim()) {
            // Context enhancement
            let usedText = rawText.trim();
            if (eredetiSzoveg) {
                usedText = `${usedText} | Kontextus: ${eredetiSzoveg}`;
            }

            kezelesTexts.push(usedText);
            kezelesMap.push({
                id: `T${ti}_K${ki}`,
                tetelIndex: ti,
                kezelesIndex: ki,
                originalText: rawText.trim(),
                usedText: usedText
            });
        }
    }
}

if (kezelesTexts.length === 0) {
    return [{ json: { ...inputData, _debug: "Nincs feldolgozandó szöveg." } }];
}

// --- CONTEXT-AWARE RE-RANKING CONFIG ---
const COMPLEX_PROCEDURE_KW = ["sinuslift", "sinus", "csontpótlás", "arcüreg",
    "membrán", "augmentáció", "bone graft", "szinusz"];
const COMPLEXITY_PENALTY = 0.05;
// Collect all eredeti_szoveg as context signal
const allContext = tetelLista.map(t => (t.eredeti_szoveg || "")).join(" ").toLowerCase();

// 2. OpenAI Embedding Generálás
log(`EMBEDDING: ${kezelesTexts.length} db szöveg küldése OpenAI-nak...`);
const embeddingRes = await apiCall.call(this, "OpenAI_Embeddings", {
    method: "POST",
    url: "https://api.openai.com/v1/embeddings",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: { model: EMBEDDING_MODEL, input: kezelesTexts }
});

if (!embeddingRes || !embeddingRes.data) {
    throw new Error("OpenAI Embedding hiba - üres válasz.");
}

const embeddings = embeddingRes.data.map(d => d.embedding);
log("EMBEDDING: Sikeres generálás.");

// 3. Matching & Logic Processing
const ruleCache = new Map();
const updatedTetelLista = JSON.parse(JSON.stringify(tetelLista));
let matchedCount = 0;

// Helper: fetch rule details with caching
async function fetchRuleDetails(ruleId) {
    if (ruleCache.has(ruleId)) return ruleCache.get(ruleId);
    const ruleData = await apiCall.call(this, `GetRule_${ruleId}`, {
        method: "GET",
        url: `${SUPABASE_URL}/rest/v1/treatment_rules?id=eq.${ruleId}&select=*,rule_visits(*,rule_items(*))`,
        headers: { "apikey": SUPABASE_API_KEY, "Authorization": `Bearer ${SUPABASE_API_KEY}` }
    });
    if (ruleData && ruleData.length > 0) {
        ruleCache.set(ruleId, ruleData[0]);
        return ruleData[0];
    }
    return null;
}

for (let i = 0; i < kezelesMap.length; i++) {
    const mapItem = kezelesMap[i];
    const embedding = embeddings[i];

    // Részletes riport objektum ehhez a tételhez
    const itemReport = {
        id: mapItem.id,
        input_text: mapItem.originalText,
        context_text: mapItem.usedText,
        steps: []
    };

    log(`MATCHING [${i + 1}/${kezelesMap.length}]: "${mapItem.originalText}"`);

    // --- A) PRIMARY SEARCH (Klinika specifikus) ---
    let bestMatch = null;
    let matchSource = null;
    let decisionReason = "";

    let matches = await apiCall.call(this, `Primary_RPC`, {
        method: "POST",
        url: `${SUPABASE_URL}/rest/v1/rpc/match_treatment_embedding`,
        headers: { "apikey": SUPABASE_API_KEY, "Authorization": `Bearer ${SUPABASE_API_KEY}` },
        body: {
            query_embedding: `[${embedding.join(',')}]`,
            match_threshold: SIMILARITY_THRESHOLD,
            match_count: 5,
            p_clinic_id: telephelyId,
            p_source_types: ['semantic_description']
        }
    });

    if (matches && matches.length > 0) {
        // Fetch rule details for all candidates to check aktiv + alapszabaly
        let activeCandidates = [];
        for (const candidate of matches) {
            const ruleDetail = await fetchRuleDetails.call(this, candidate.treatment_rule_id);
            if (ruleDetail && ruleDetail.aktiv !== false) {
                activeCandidates.push({ ...candidate, _ruleDetail: ruleDetail });
            } else {
                log(`  -> Kiszűrve (aktiv=false): ${candidate.rule_name}`);
            }
        }

        if (activeCandidates.length > 0) {
            bestMatch = activeCandidates[0];
            matchSource = "primary";

            // --- CONTEXT-AWARE RE-RANKING ---
            const inputHasComplex = COMPLEX_PROCEDURE_KW.some(kw => allContext.includes(kw));
            if (!inputHasComplex && activeCandidates.length > 1) {
                let reranked = false;
                for (const candidate of activeCandidates) {
                    const nameL = (candidate.rule_name || "").toLowerCase();
                    if (COMPLEX_PROCEDURE_KW.some(kw => nameL.includes(kw))) {
                        candidate._originalSimilarity = candidate.similarity;
                        candidate.similarity -= COMPLEXITY_PENALTY;
                        reranked = true;
                        log(`  -> Re-rank: "${candidate.rule_name}" penalized -${COMPLEXITY_PENALTY}`);
                    }
                }
                if (reranked) {
                    activeCandidates.sort((a, b) => b.similarity - a.similarity);
                    bestMatch = activeCandidates[0];
                }
            }

            // --- ALAPSZABÁLY OVERRIDE ---
            const bestRule = bestMatch._ruleDetail;
            if (bestRule.alapszabaly === true && activeCandidates.length > 1) {
                const bestSim = bestMatch.similarity;
                log(`  -> Alapszabály match: ${bestMatch.rule_name} (sim=${bestSim}). Checking for custom override...`);

                for (let j = 1; j < activeCandidates.length; j++) {
                    const altCandidate = activeCandidates[j];
                    const altRule = altCandidate._ruleDetail;
                    const simDiff = bestSim - altCandidate.similarity;

                    if (altRule.alapszabaly === false && simDiff <= ALAPSZABALY_TOLERANCE) {
                        log(`  -> OVERRIDE: Custom rule "${altCandidate.rule_name}" (sim=${altCandidate.similarity}, diff=${simDiff.toFixed(4)}) preferred over alapszabály.`);
                        bestMatch = altCandidate;
                        decisionReason = `Custom rule override: "${altCandidate.rule_name}" (sim=${altCandidate.similarity.toFixed(4)}, diff=${simDiff.toFixed(4)}) preferred over alapszabály "${activeCandidates[0].rule_name}" (sim=${bestSim.toFixed(4)})`;
                        matchSource = "primary_custom_override";
                        break;
                    }
                }

                if (matchSource !== "primary_custom_override") {
                    decisionReason = `Alapszabály match (no close custom rule found): "${bestMatch.rule_name}" (sim=${bestMatch.similarity.toFixed(4)})`;
                }
            } else {
                decisionReason = `Primary találat (Sim: ${bestMatch.similarity.toFixed(4)}) > Küszöb (${SIMILARITY_THRESHOLD})`;
            }

            itemReport.steps.push({
                type: "primary_search",
                status: "HIT",
                candidate_name: bestMatch.rule_name,
                similarity: bestMatch.similarity,
                threshold: SIMILARITY_THRESHOLD,
                alapszabaly_override: matchSource === "primary_custom_override",
                all_candidates: activeCandidates.map(c => ({
                    name: c.rule_name,
                    similarity: c.similarity,
                    alapszabaly: c._ruleDetail?.alapszabaly || false
                }))
            });
            log(`  -> Primary Találat: ${bestMatch.rule_name} (${bestMatch.similarity})`);
        }
    }

    if (!bestMatch) {
        itemReport.steps.push({
            type: "primary_search",
            status: "MISS",
            reason: "Nincs találat vagy similarity < threshold"
        });
        log(`  -> Primary: Nincs megfelelő találat.`);

        // --- B) FALLBACK SEARCH (Szótár / Globális) ---
        log(`  -> Fallback indítása...`);

        let fallbackMatches = await apiCall.call(this, `Fallback_RPC`, {
            method: "POST",
            url: `${SUPABASE_URL}/rest/v1/rpc/match_szotar_embedding`,
            headers: { "apikey": SUPABASE_API_KEY, "Authorization": `Bearer ${SUPABASE_API_KEY}` },
            body: {
                query_embedding: `[${embedding.join(',')}]`,
                match_threshold: SIMILARITY_THRESHOLD,
                match_count: 1,
                p_telephely_id: telephelyId,
                p_source_types: ['name']
            }
        });

        if (fallbackMatches && fallbackMatches.length > 0) {
            const candidate = fallbackMatches[0];
            itemReport.steps.push({
                type: "fallback_search",
                status: "HIT",
                candidate_name: candidate.rule_name || "Szótár elem",
                similarity: candidate.similarity,
                threshold: SIMILARITY_THRESHOLD
            });

            bestMatch = candidate;
            matchSource = "fallback";
            decisionReason = `Fallback találat (Sim: ${candidate.similarity.toFixed(4)})`;
            log(`  -> Fallback Találat: ${candidate.rule_name} (${candidate.similarity})`);
        } else {
            itemReport.steps.push({
                type: "fallback_search",
                status: "MISS",
                reason: "Fallbackben sem volt elég erős találat."
            });
            decisionReason = "Nincs találat egyik adatbázisban sem.";
            log(`  -> Fallback: Nincs találat.`);
        }
    }

    // --- Eredmény beírása a JSON-ba ---
    const tetel = updatedTetelLista[mapItem.tetelIndex];
    let kezeles = tetel.kezelesek[mapItem.kezelesIndex];

    // Normalizálás objektummá ha string volt
    if (typeof kezeles === 'string') {
        kezeles = { kezeles_szoveg: kezeles };
        tetel.kezelesek[mapItem.kezelesIndex] = kezeles;
    }

    if (bestMatch) {
        const ruleId = bestMatch.treatment_rule_id;

        // Rule details already fetched and cached during matching
        const cachedRule = ruleCache.get(ruleId) || bestMatch._ruleDetail;

        kezeles.rule_id = ruleId;
        kezeles.rule_name = bestMatch.rule_name || cachedRule?.name;
        kezeles.rule_items = extractSortedRuleItems(cachedRule);
        kezeles.nincs_talalat = false;

        // Debug infók a kimeneti objektumba is
        kezeles.semantic_match = {
            matched: true,
            similarity: bestMatch.similarity,
            source: matchSource,
            decision: decisionReason,
            alapszabaly: cachedRule?.alapszabaly || false
        };

        itemReport.final_outcome = {
            status: "MATCHED",
            rule_name: kezeles.rule_name,
            rule_id: ruleId,
            alapszabaly: cachedRule?.alapszabaly || false
        };
        matchedCount++;
    } else {
        kezeles.nincs_talalat = true;
        kezeles.rule_items = [];
        kezeles.semantic_match = {
            matched: false,
            decision: decisionReason
        };

        itemReport.final_outcome = {
            status: "UNMATCHED",
            reason: decisionReason
        };
    }

    detailed_report.push(itemReport);
}

const stats = {
    total: kezelesMap.length,
    matched: matchedCount,
    match_rate: ((matchedCount / kezelesMap.length) * 100).toFixed(1) + "%"
};

log("DONE. Statisztika:", stats);

return [{
    json: {
        ...inputData,
        tetel_lista: updatedTetelLista,
        _execution_report: detailed_report,
        _semantic_match_stats: stats,
        _debug_log: debug_log
    }
}];
