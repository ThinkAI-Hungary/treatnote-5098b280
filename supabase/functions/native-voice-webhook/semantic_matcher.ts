// ==========================================================
// SEMANTIC MATCHER - NATIVE SUPABASE EDITION
// ==========================================================

const SIMILARITY_THRESHOLD = 0.60;
const HIGH_CONFIDENCE_THRESHOLD = 0.82;
const ALAPSZABALY_TOLERANCE = 0.04;
const EMBEDDING_MODEL = "text-embedding-3-large";

export async function processSemanticMatching(tetelLista: any[], telephelyId: string, supabaseAdmin: any, openaiApiKey: string): Promise<{ updatedTetelLista: any[], detailed_report: any[] }> {
    const debug_log: string[] = [];
    const detailed_report: any[] = [];
    
    function szamBiztonsagos(x: any) {
        const n = (typeof x === "number") ? x : Number(x);
        return Number.isFinite(n) ? n : null;
    }

    function kerek4(x: any) {
        const n = szamBiztonsagos(x);
        if (n === null) return null;
        return Math.round(n * 10000) / 10000;
    }

    function lepesKikeres(item: any, type: string) {
        const steps = (item && Array.isArray(item.steps)) ? item.steps : [];
        for (let i = 0; i < steps.length; i++) {
            const s = steps[i];
            if (s && s.type === type) return s;
        }
        return null;
    }

    function formatHumanReport(item: any, index: number) {
        const primary = lepesKikeres(item, "primary_search");
        const fallback = lepesKikeres(item, "fallback_search");
        const finalOutcome = (item && item.final_outcome) ? item.final_outcome : {};
        const status = finalOutcome.status || "UNKNOWN";

        const primaryHit = primary && primary.status === "HIT";
        const fallbackHit = fallback && fallback.status === "HIT";
        const primaryOverride = primary ? Boolean(primary.alapszabaly_override) : false;

        let valasztasModja = "nincs_talalat";
        if (status === "MATCHED") {
            if (primaryOverride) valasztasModja = "primary_custom_override";
            else if (primaryHit) valasztasModja = "primary";
            else if (fallbackHit) valasztasModja = "fallback";
            else valasztasModja = "ismeretlen_match_ut";
        }

        const primaryCandidates = primary && Array.isArray(primary.all_candidates) 
            ? primary.all_candidates.map((c: any) => ({
                name: c.name ? String(c.name) : "",
                similarity: kerek4(c.similarity),
                alapszabaly: Boolean(c.alapszabaly)
              })).sort((a: any, b: any) => (b.similarity ?? -1) - (a.similarity ?? -1))
            : [];

        const primaryChosenName = primaryHit ? (primary.candidate_name || null) : null;
        const primaryChosenSim = primaryHit ? kerek4(primary.similarity) : null;
        const primaryThreshold = primary && primary.threshold != null ? kerek4(primary.threshold) : null;

        const fallbackChosenName = fallbackHit ? (fallback.candidate_name || null) : null;
        const fallbackChosenSim = fallbackHit ? kerek4(fallback.similarity) : null;
        const fallbackThreshold = fallback && fallback.threshold != null ? kerek4(fallback.threshold) : null;

        const miAlapjan = (() => {
            if (status !== "MATCHED") {
                const pr = (primary && primary.reason) ? ("Primary: " + primary.reason) : "Primary: MISS";
                const fb = (fallback && fallback.reason) ? ("Fallback: " + fallback.reason) : "Fallback: MISS";
                return pr + "; " + fb;
            }
            if (valasztasModja === "primary_custom_override") return (primaryChosenName ? ("Override, kiválasztva: " + primaryChosenName) : "Override") + (primaryChosenSim != null ? (" (sim=" + primaryChosenSim + ")") : "");
            if (valasztasModja === "primary") return (primaryChosenName ? ("Primary, kiválasztva: " + primaryChosenName) : "Primary") + (primaryChosenSim != null ? (" (sim=" + primaryChosenSim + ")") : "") + (primaryThreshold != null ? (", küszöb=" + primaryThreshold) : "");
            if (valasztasModja === "fallback") return (fallbackChosenName ? ("Fallback, kiválasztva: " + fallbackChosenName) : "Fallback") + (fallbackChosenSim != null ? (" (sim=" + fallbackChosenSim + ")") : "") + (fallbackThreshold != null ? (", küszöb=" + fallbackThreshold) : "");
            return "MATCHED (ismeretlen döntési út)";
        })();

        return {
            sorszam: index + 1,
            id: item ? (item.id || null) : null,
            input_text: item ? (item.input_text || null) : null,
            context_text: item ? (item.context_text || null) : null,
            eredmeny: {
                status: status,
                rule_name: finalOutcome.rule_name || null,
                rule_id: finalOutcome.rule_id || null,
                alapszabaly: (finalOutcome.alapszabaly == null) ? null : Boolean(finalOutcome.alapszabaly),
                valasztas_modja: valasztasModja,
                mi_alapjan: miAlapjan
            },
            keresek: {
                primary: {
                    status: primary ? (primary.status || "N/A") : "N/A",
                    threshold: primaryThreshold,
                    kivalasztott: primaryHit ? { name: primaryChosenName, similarity: primaryChosenSim, alapszabaly_override: primaryOverride } : null,
                    jeloltek: primaryCandidates.length ? primaryCandidates : null
                },
                fallback: {
                    status: fallback ? (fallback.status || "N/A") : "N/A",
                    threshold: fallbackThreshold,
                    kivalasztott: fallbackHit ? { name: fallbackChosenName, similarity: fallbackChosenSim } : null
                }
            }
        };
    }
    
    function log(msg: string, data?: any) {
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

    function extractSortedRuleItems(rule: any) {
        if (!rule || !rule.rule_visits) return [];
        const items: any[] = [];
        const visits = Array.isArray(rule.rule_visits_stdl) ? rule.rule_visits_stdl : [];
        for (const visit of visits) {
            const vNum = parseInt(visit.visit_number) || 1;
            const rItems = Array.isArray(visit.rule_items_stdl) ? visit.rule_items_stdl : [];
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

    log(`START: Semantic Matcher indul. Tételek száma: ${tetelLista.length}`);

    // 1. Szövegek előkészítése
    const kezelesTexts: string[] = [];
    const kezelesMap: any[] = [];

    for (let ti = 0; ti < tetelLista.length; ti++) {
        const tetel = tetelLista[ti];
        const eredetiSzoveg = tetel.eredeti_szoveg || "";
        const kezelesek = Array.isArray(tetel.kezelesek) ? tetel.kezelesek : [];

        for (let ki = 0; ki < kezelesek.length; ki++) {
            const k = kezelesek[ki];
            let rawText = typeof k === 'string' ? k : (k.kezeles_szoveg || k.name || String(k));

            if (rawText && rawText.trim()) {
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
        return tetelLista;
    }

    // --- CONTEXT-AWARE RE-RANKING CONFIG ---
    const COMPLEX_PROCEDURE_KW = ["sinuslift", "sinus", "csontpótlás", "arcüreg", "membrán", "augmentáció", "bone graft", "szinusz"];
    const COMPLEXITY_PENALTY = 0.05;
    const allContext = tetelLista.map(t => (t.eredeti_szoveg || "")).join(" ").toLowerCase();

    // 2. OpenAI Embedding Generálás
    log(`EMBEDDING: ${kezelesTexts.length} db szöveg küldése OpenAI-nak...`);
    const embeddingRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: kezelesTexts })
    });

    if (!embeddingRes.ok) {
        const errText = await embeddingRes.text();
        throw new Error(`OpenAI Embedding hiba: ${errText}`);
    }

    const embeddingData = await embeddingRes.json();
    const embeddings = embeddingData.data.map((d: any) => d.embedding);
    log("EMBEDDING: Sikeres generálás.");

    // 3. Matching & Logic Processing
    const ruleCache = new Map();
    const updatedTetelLista = JSON.parse(JSON.stringify(tetelLista));
    let matchedCount = 0;

    async function fetchRuleDetails(ruleId: string) {
        if (ruleCache.has(ruleId)) return ruleCache.get(ruleId);
        const { data: ruleData } = await supabaseAdmin
            .from('treatment_rules_stdl')
            .select('*, rule_visits_stdl(*, rule_items_stdl(*))')
            .eq('id', ruleId)
            .maybeSingle();
            
        if (ruleData) {
            ruleCache.set(ruleId, ruleData);
            return ruleData;
        }
        return null;
    }

    for (let i = 0; i < kezelesMap.length; i++) {
        const mapItem = kezelesMap[i];
        const embedding = embeddings[i];

        const itemReport: any = {
            id: mapItem.id,
            input_text: mapItem.originalText,
            context_text: mapItem.usedText,
            steps: []
        };

        log(`MATCHING [${i + 1}/${kezelesMap.length}]: "${mapItem.originalText}"`);

        let bestMatch = null;
        let matchSource = null;
        let decisionReason = "";

        const { data: matches } = await supabaseAdmin.rpc('match_treatment_embedding_stdl', {
            query_embedding: `[${embedding.join(',')}]`,
            match_threshold: SIMILARITY_THRESHOLD,
            match_count: 5,
            p_clinic_id: telephelyId,
            p_source_types: ['semantic_description']
        });

        if (matches && matches.length > 0) {
            let activeCandidates = [];
            for (const candidate of matches) {
                const ruleDetail = await fetchRuleDetails(candidate.treatment_rule_id);
                if (ruleDetail && ruleDetail.aktiv !== false) {
                    activeCandidates.push({ ...candidate, _ruleDetail: ruleDetail });
                } else {
                    log(`  -> Kiszűrve (aktiv=false): ${candidate.rule_name}`);
                }
            }

            if (activeCandidates.length > 0) {
                bestMatch = activeCandidates[0];
                matchSource = "primary";

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

            log(`  -> Fallback indítása...`);

            const { data: fallbackMatches } = await supabaseAdmin.rpc('match_szotar_embedding_stdl', {
                query_embedding: `[${embedding.join(',')}]`,
                match_threshold: SIMILARITY_THRESHOLD,
                match_count: 1,
                p_telephely_id: telephelyId,
                p_source_types: ['name']
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

        const tetel = updatedTetelLista[mapItem.tetelIndex];
        let kezeles = tetel.kezelesek[mapItem.kezelesIndex];

        if (typeof kezeles === 'string') {
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

    const humanized_report = detailed_report.map((item, i) => formatHumanReport(item, i));

    log("DONE. Statisztika:", stats);

    // Visszatérünk az updatelt listával és a riporttal
    return { updatedTetelLista, detailed_report: humanized_report };
}
