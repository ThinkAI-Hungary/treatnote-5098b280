// ==========================================================
// SCALING PROCESSOR - Treatnote flow (WITH ARCH PROTOCOL SUPPORT)
// ==========================================================
// SUPPORTS:
// - Regular per_tooth / per_case scaling
// - All-on-4 / All-on-6 fixed protocols
// - FELSO_ALLCSONT / ALSO_ALLCSONT arch identifiers
// ==========================================================

// ============ CONFIG ============
const DEBUG = true;

// ============ ARCH PROTOCOL DEFINITIONS ============

const ARCH_TEETH = {
    // All teeth in upper arch (for extractions)
    FELSO_ALLCSONT: ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"],
    // All teeth in lower arch (for extractions)
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

// Representative teeth for per_case items on arch
const ARCH_REPRESENTATIVE_TOOTH = {
    FELSO_ALLCSONT: "11",
    ALSO_ALLCSONT: "41"
};

// Keywords to detect extraction treatments
const EXTRACTION_KEYWORDS = ["extractio", "fogeltávolítás", "foghúzás", "húzás", "eltávolítás"];

// Keywords to detect implant treatments (per_tooth items that use fixed positions)
const IMPLANT_KEYWORDS = ["implant", "beültetés", "fogbeültetés", "multiunit", "adapter", "gyógyulási sapka", "healing", "felépítőfej", "abutment"];

// ============ HELPER FUNCTIONS ============

function debug(msg, data) {
    if (!DEBUG) return;
    const dataStr = data !== undefined ? JSON.stringify(data).substring(0, 300) : '';
    console.log(`[SCALING] ${msg} ${dataStr}`);
}

function normalizalSzoveg(s) {
    if (s === null || typeof s === "undefined") return "";
    return String(s).replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizalHidtag(h) {
    if (h === null || h === undefined) return null;
    const t = normalizalSzoveg(h);
    if (!t) return null;
    return t.replace(/[\s\-]+/g, "_").replace(/_+/g, "_");
}

function normalizalTargetToothType(s) {
    if (s === null || typeof s === "undefined") return null;
    const t = normalizalSzoveg(s);
    if (!t || t === "all") return null;
    return t.replace(/[\s\-]+/g, "_").replace(/_+/g, "_");
}

function fogObjektumNormalizal(x) {
    if (typeof x === "string" || typeof x === "number") {
        return { fog: String(x).trim(), hidtag: null };
    }
    if (x && typeof x === "object" && !Array.isArray(x)) {
        const fogErtek = x.fog ?? x.fogszam ?? x.value ?? "";
        const hidtagErtek = x.hidtag ?? x.hidTag ?? null;
        return { fog: String(fogErtek).trim(), hidtag: normalizalHidtag(hidtagErtek) };
    }
    return { fog: "", hidtag: null };
}

// ============ ARCH PROTOCOL DETECTION ============

function isArchIdentifier(fog) {
    return fog === "FELSO_ALLCSONT" || fog === "ALSO_ALLCSONT";
}

function detectProtocolType(kezelesekList, ruleName) {
    // Check in rule name and treatment texts for All-on-4 or All-on-6
    const allTexts = [
        normalizalSzoveg(ruleName || ""),
        ...kezelesekList.map(k => normalizalSzoveg(typeof k === "string" ? k : (k.kezeles_szoveg || k.name || "")))
    ].join(" ");

    if (allTexts.includes("all-on-6") || allTexts.includes("allon6") || allTexts.includes("all on 6")) {
        return "all-on-6";
    }
    if (allTexts.includes("all-on-4") || allTexts.includes("allon4") || allTexts.includes("all on 4")) {
        return "all-on-4";
    }
    return null;
}

function isExtractionTreatment(itemName) {
    const normalized = normalizalSzoveg(itemName);
    return EXTRACTION_KEYWORDS.some(kw => normalized.includes(kw));
}

function isImplantRelatedTreatment(itemName) {
    const normalized = normalizalSzoveg(itemName);
    return IMPLANT_KEYWORDS.some(kw => normalized.includes(kw));
}

// ============ EXPAND ARCH TO TEETH ============

function expandArchToTeeth(archId, protocolType, itemName, scaling) {
    // Case 1: Extraction → all teeth in arch
    if (isExtractionTreatment(itemName)) {
        debug(`Expanding ${archId} for extraction → all arch teeth`);
        return ARCH_TEETH[archId].map(fog => ({ fog, hidtag: null }));
    }

    // Case 2: per_tooth + implant-related + has protocol → fixed pillar positions
    if (scaling === "per_tooth" && protocolType && isImplantRelatedTreatment(itemName)) {
        const positions = FIXED_PILLAR_POSITIONS[protocolType]?.[archId];
        if (positions) {
            debug(`Expanding ${archId} for ${protocolType} implant → fixed positions`, positions);
            return positions.map(fog => ({ fog, hidtag: "pillar_only" }));
        }
    }

    // Case 3: per_tooth without protocol match → can't expand, use representative
    if (scaling === "per_tooth") {
        debug(`Warning: per_tooth on arch without protocol match, using representative tooth`);
        return [{ fog: ARCH_REPRESENTATIVE_TOOTH[archId], hidtag: null }];
    }

    // Case 4: per_case → representative tooth
    debug(`Using representative tooth for per_case on ${archId}`);
    return [{ fog: ARCH_REPRESENTATIVE_TOOTH[archId], hidtag: null }];
}

// ============ PER_CASE REPRESENTATIVE TOOTH ============
function perCaseReprezentativFog(index) {
    return "szájüreg";
}

// ============ HIDTAG FILTER ============
function hidtagKompatibilis(fogHidtag, itemTargetToothType) {
    const normalizedTarget = normalizalTargetToothType(itemTargetToothType);
    const normalizedHidtag = normalizalHidtag(fogHidtag);

    if (normalizedTarget === null) return true;
    if (normalizedHidtag === null) return true;

    return normalizedHidtag === normalizedTarget;
}

// ============ MAIN PROCESSING ============

export function processScaling(tetelLista: any[]): any {
debug(`Processing ${tetelLista.length} tételek`);

// ============ MULTI-SESSION DETECTION ============
// When the AI splits the same treatment into multiple tétels (e.g. "1. ülés", "2. ülés"),
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
                tetelVisitOffsets[ti] = ulesNum - 1;
                hasUlesMarkers = true;
            }
        }
    }

    // Strategy 2: If no ülés markers, detect duplicate rule_names
    if (!hasUlesMarkers) {
        const ruleOccurrence = new Map();
        for (let ti = 0; ti < tetelLista.length; ti++) {
            const kezelesek = Array.isArray(tetelLista[ti].kezelesek) ? tetelLista[ti].kezelesek : [];
            for (const k of kezelesek) {
                if (!k || typeof k !== "object") continue;
                const ruleName = k.rule_name;
                if (!ruleName) continue;
                const count = ruleOccurrence.get(ruleName) || 0;
                if (count > 0) {
                    tetelVisitOffsets[ti] = count;
                }
                ruleOccurrence.set(ruleName, count + 1);
            }
        }
    }

    const offsets = tetelVisitOffsets.filter(o => o > 0);
    if (offsets.length > 0) {
        debug(`Multi-session detected: ${offsets.length} tétel(ek) offset — [${tetelVisitOffsets.join(", ")}]`);
    }
}

// ============ 1. STRUKTÚRA ELŐKÉSZÍTÉSE ============

const vizitek = {};
let globalisIdSzamlalo = 1;
const perCaseCsoportok = new Map();

for (let tetelIdx = 0; tetelIdx < tetelLista.length; tetelIdx++) {
    const tetel = tetelLista[tetelIdx];
    const visitOffset = tetelVisitOffsets[tetelIdx];
    const kategoria = tetel.kategoria || "egyeb";
    const rawFogak = Array.isArray(tetel.fogak) ? tetel.fogak.map(fogObjektumNormalizal).filter(f => f.fog) : [];
    const kezelesek = Array.isArray(tetel.kezelesek) ? tetel.kezelesek : [];

    // Detect protocol type for this tétel
    const protocolType = detectProtocolType(kezelesek, tetel.rule_name);
    if (protocolType) {
        debug(`Detected protocol: ${protocolType} for tétel`, { kategoria, fogak: rawFogak });
    }

    for (const kezeles of kezelesek) {
        if (!kezeles || typeof kezeles !== "object") continue;

        const ruleItems = Array.isArray(kezeles.rule_items) ? kezeles.rule_items : [];
        const nincsTalalat = kezeles.nincs_talalat === true;

        // If no match or no rule_items, use fallback
        if (nincsTalalat || ruleItems.length === 0) {
            const name = kezeles.rule_name || kezeles.kezeles_szoveg || "";
            const visitKey = `vizit_${1 + visitOffset}`;

            // Expand arch identifiers for fallback too
            let expandedFogak = [];
            for (const f of rawFogak) {
                if (isArchIdentifier(f.fog)) {
                    expandedFogak.push(...expandArchToTeeth(f.fog, protocolType, name, "per_case"));
                } else {
                    expandedFogak.push(f);
                }
            }

            if (!vizitek[visitKey]) vizitek[visitKey] = {};
            if (!vizitek[visitKey][kategoria]) vizitek[visitKey][kategoria] = [];

            vizitek[visitKey][kategoria].push({
                __id: globalisIdSzamlalo++,
                eredeti_szoveg: tetel.eredeti_szoveg,
                fogak: expandedFogak.length > 0 ? expandedFogak : [{ fog: "11", hidtag: null }],
                fogak_eredeti: rawFogak.map(f => ({ ...f })),
                kezelesek: [{
                    name,
                    quantity: 1,
                    scaling: "per_case",
                    talalat: false
                }]
            });
            continue;
        }

        // Process rule_items
        for (const item of ruleItems) {
            const visitNum = (item.visit_number || 1) + visitOffset;
            const visitKey = `vizit_${visitNum}`;
            const itemName = item.name || "";
            const scaling = item.scaling || "per_case";
            const quantity = parseInt(item.quantity) || 1;
            const targetToothType = item.target_tooth_type || "all";

            // ============ ARCH EXPANSION LOGIC ============
            let processedFogak = [];

            for (const f of rawFogak) {
                if (isArchIdentifier(f.fog)) {
                    // Expand arch identifier based on context
                    const expanded = expandArchToTeeth(f.fog, protocolType, itemName, scaling);
                    processedFogak.push(...expanded);
                } else {
                    processedFogak.push({ ...f });
                }
            }

            // Apply hidtag filtering
            let filteredFogak = processedFogak.filter(f => hidtagKompatibilis(f.hidtag, targetToothType));

            // If no compatible teeth and per_tooth, skip
            if (filteredFogak.length === 0 && scaling === "per_tooth") {
                debug(`Skipping "${itemName}" - no compatible teeth for ${targetToothType}`);
                continue;
            }

            // Auto-fill hidtag if target specifies it
            const normalizedTarget = normalizalTargetToothType(targetToothType);
            if (normalizedTarget) {
                filteredFogak = filteredFogak.map(f => ({
                    ...f,
                    hidtag: f.hidtag || normalizedTarget
                }));
            }

            if (!vizitek[visitKey]) vizitek[visitKey] = {};
            if (!vizitek[visitKey][kategoria]) vizitek[visitKey][kategoria] = [];

            const bejegyzes = {
                __id: globalisIdSzamlalo++,
                eredeti_szoveg: tetel.eredeti_szoveg,
                fogak: filteredFogak.map(f => ({ ...f })),
                fogak_eredeti: rawFogak.map(f => ({ ...f })),
                kezelesek: [{
                    name: itemName,
                    quantity,
                    scaling,
                    target_tooth_type: targetToothType,
                    talalat: true
                }]
            };

            vizitek[visitKey][kategoria].push(bejegyzes);

            // per_case tracking
            if (scaling === "per_case") {
                const kulcs = normalizalSzoveg(itemName);
                if (!perCaseCsoportok.has(kulcs)) {
                    perCaseCsoportok.set(kulcs, { allowed: quantity, elemek: [] });
                } else {
                    const existing = perCaseCsoportok.get(kulcs);
                    existing.allowed = Math.max(existing.allowed, quantity);
                }

                const maxFog = filteredFogak.reduce((max, f) => {
                    const n = parseInt(f.fog);
                    return (!isNaN(n) && n > max) ? n : max;
                }, -Infinity);

                perCaseCsoportok.get(kulcs).elemek.push({
                    id: bejegyzes.__id,
                    maxFog: maxFog === -Infinity ? 0 : maxFog
                });
            }
        }
    }
}

// ============ 2. PER_CASE LIMIT ============

const megtartandoIds = new Set();
const perCaseIdToFog = new Map();

for (const [kulcs, adat] of perCaseCsoportok.entries()) {
    const rendezett = adat.elemek.slice().sort((a, b) => {
        if (b.maxFog !== a.maxFog) return b.maxFog - a.maxFog;
        return a.id - b.id;
    });

    const kivalasztott = rendezett.slice(0, adat.allowed);

    for (let i = 0; i < kivalasztott.length; i++) {
        megtartandoIds.add(kivalasztott[i].id);
        perCaseIdToFog.set(kivalasztott[i].id, perCaseReprezentativFog(i));
    }
}

// Filter per_case items
for (const vizitKey of Object.keys(vizitek)) {
    const vizit = vizitek[vizitKey];

    for (const szakterulet of Object.keys(vizit)) {
        const lista = vizit[szakterulet];
        const ujLista = [];

        for (const bejegyzes of lista) {
            const kezeles = bejegyzes.kezelesek?.[0];
            if (!kezeles) {
                ujLista.push(bejegyzes);
                continue;
            }

            if (kezeles.scaling !== "per_case") {
                ujLista.push(bejegyzes);
                continue;
            }

            if (kezeles.talalat === false) {
                ujLista.push(bejegyzes);
                continue;
            }

            if (megtartandoIds.has(bejegyzes.__id)) {
                const ujFog = perCaseIdToFog.get(bejegyzes.__id);
                if (ujFog && bejegyzes.fogak && bejegyzes.fogak.length > 0) {
                    bejegyzes.fogak = [{ fog: ujFog, hidtag: null }];
                }
                ujLista.push(bejegyzes);
            }
        }

        vizit[szakterulet] = ujLista;
    }
}

// ============ 3. PER_TOOTH DEDUPE ============

for (const vizitKey of Object.keys(vizitek)) {
    const vizit = vizitek[vizitKey];

    for (const szakterulet of Object.keys(vizit)) {
        const lista = vizit[szakterulet];
        const ujLista = [];

        for (const bejegyzes of lista) {
            const kezeles = bejegyzes.kezelesek?.[0];
            if (!kezeles || kezeles.scaling !== "per_tooth") {
                ujLista.push(bejegyzes);
                continue;
            }

            const latott = new Set();
            const maradoFogak = [];

            for (const f of (bejegyzes.fogak || [])) {
                const kulcs = `${f.fog}|${f.hidtag || ''}`;
                if (!latott.has(kulcs)) {
                    latott.add(kulcs);
                    maradoFogak.push(f);
                }
            }

            if (maradoFogak.length > 0) {
                bejegyzes.fogak = maradoFogak;
                ujLista.push(bejegyzes);
            }
        }

        vizit[szakterulet] = ujLista;
    }
}

// ============ 4. FLAT VISIT LIST ============

let laposVizitek = [];

for (const vizitKey of Object.keys(vizitek).sort()) {
    const vizit = vizitek[vizitKey];
    const vizitSzam = parseInt(vizitKey.split("_")[1]) || 1;

    for (const szakterulet of Object.keys(vizit)) {
        for (const bejegyzes of vizit[szakterulet]) {
            const kezeles = bejegyzes.kezelesek?.[0];
            const itemName = kezeles?.name || "";

            const fogLista = bejegyzes.fogak || [];

            if (fogLista.length === 0) {
                laposVizitek.push({
                    vizit: vizitSzam,
                    szakterulet,
                    fog: null,
                    hidtag: null,
                    name: itemName,
                    quantity: kezeles?.quantity || 1,
                    scaling: kezeles?.scaling || "per_case",
                    talalat: kezeles?.talalat ?? true,
                    eredeti_szoveg: bejegyzes.eredeti_szoveg
                });
            } else {
                for (const fog of fogLista) {
                    laposVizitek.push({
                        vizit: vizitSzam,
                        szakterulet,
                        fog: fog.fog,
                        hidtag: fog.hidtag,
                        name: itemName,
                        quantity: kezeles?.quantity || 1,
                        scaling: kezeles?.scaling || "per_case",
                        talalat: kezeles?.talalat ?? true,
                        eredeti_szoveg: bejegyzes.eredeti_szoveg
                    });
                }
            }
        }
    }
}



// ============ PASS A: CROSS-ITEM DEDUPLICATION ============
{
    const EXTRACT_KW = ["extractio", "fogeltávolítás", "foghúzás", "húzás", "eltávolítás"];
    const IMPLANT_KW = ["implantáció", "fogbeültetés", "implantátum beül", "implant beül"];
    const MULTIUNIT_KW = ["multiunit", "adapter"];
    const HEALING_KW = ["gyógyulási sapka", "healing cap", "healing abutment"];
    const ABUTMENT_KW2 = ["abutment", "felépítő fej", "felépítmény"];
    const CROWN_KW = ["korona", "crown"];
    const BRIDGE_KW = ["híd", "bridge"];
    const XRAY_PANORAMA_KW = ["panoráma", "opg", "ortopantom"];
    const XRAY_CBCT_KW = ["cbct", "cone beam", "ct felvétel", "ct nagy"];
    const XRAY_PERIAPICAL_KW = ["periapicalis", "endoct", "pa digitális", "pa röntgen", "5cm x 5"];
    const XRAY_GENERAL_KW = ["röntgen", "x-ray"];
    const SURGPREP_KW = ["műtéti előkészítés", "surgical prep"];
    const SINUS_KW = ["sinus", "arcüreg", "szinusz", "sinuslift"];

    function treatmentCategory(name) {
        const n = normalizalSzoveg(name);
        if (EXTRACT_KW.some(k => n.includes(k))) return "extraction";
        if (IMPLANT_KW.some(k => n.includes(k))) return "implant_insertion";
        if (MULTIUNIT_KW.some(k => n.includes(k))) return "multiunit";
        if (HEALING_KW.some(k => n.includes(k))) return "healing_cap";
        if (ABUTMENT_KW2.some(k => n.includes(k))) return "abutment";
        if (SINUS_KW.some(k => n.includes(k))) return "sinus_lift";
        if (XRAY_CBCT_KW.some(k => n.includes(k))) return "xray_cbct";
        if (XRAY_PANORAMA_KW.some(k => n.includes(k))) return "xray_panorama";
        if (XRAY_PERIAPICAL_KW.some(k => n.includes(k))) return "xray_periapical";
        if (XRAY_GENERAL_KW.some(k => n.includes(k))) return "xray_general";
        if (SURGPREP_KW.some(k => n.includes(k))) return "surgical_prep";
        if (BRIDGE_KW.some(k => n.includes(k))) return "bridge";
        if (CROWN_KW.some(k => n.includes(k))) return "crown";
        return "other_" + n.substring(0, 40);
    }

    const seen = new Set();
    const beforeCount = laposVizitek.length;
    laposVizitek = laposVizitek.filter(v => {
        const cat = treatmentCategory(v.name);
        if (cat.startsWith("other_")) return true;
        const key = `${v.vizit}|${v.fog}|${cat}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    if (DEBUG && laposVizitek.length < beforeCount) {
        debug(`Pass A: removed ${beforeCount - laposVizitek.length} duplicate rows`);
    }
}

// ============ PASS B: SEQUENCE VALIDATION ============
{
    const RESTORE_KW = ["korona", "crown", "tömés", "filling", "kompozit", "preparál",
        "héj", "veneer", "gyökérkezel", "trepanál", "lenyomat"];
    const EXTRACT_KW2 = ["extractio", "fogeltávolítás", "foghúzás", "húzás", "eltávolítás"];
    const IMPLANT_KW2 = ["implant"];
    const CROWN_KW2 = ["korona", "crown"];
    const HCAP_KW2 = ["gyógyulási sapka", "healing cap", "ínyformáz"];

    function isRestorative(n) { return RESTORE_KW.some(k => normalizalSzoveg(n).includes(k)); }
    function isExtractB(n) { return EXTRACT_KW2.some(k => normalizalSzoveg(n).includes(k)); }
    function hasImplantB(n) { return IMPLANT_KW2.some(k => normalizalSzoveg(n).includes(k)); }
    function isCrownB(n) { return CROWN_KW2.some(k => normalizalSzoveg(n).includes(k)); }
    function isHealCapB(n) { return HCAP_KW2.some(k => normalizalSzoveg(n).includes(k)); }

    const toothRows = new Map();
    for (let i = 0; i < laposVizitek.length; i++) {
        const fog = laposVizitek[i].fog;
        if (!toothRows.has(fog)) toothRows.set(fog, []);
        toothRows.get(fog).push(i);
    }

    const removeIdx = new Set();

    for (const [fog, indices] of toothRows) {
        const sorted = indices.slice().sort((a, b) => laposVizitek[a].vizit - laposVizitek[b].vizit);
        let extracted = false;
        let implanted = false;
        let crownDeliveredVizit = null;

        for (const idx of sorted) {
            const row = laposVizitek[idx];
            const name = row.name;
            if (isExtractB(name)) { extracted = true; implanted = false; }
            if (hasImplantB(name)) { implanted = true; }
            if (extracted && !implanted && isRestorative(name) && !hasImplantB(name)) {
                removeIdx.add(idx);
            }
            if (isCrownB(name)) {
                if (crownDeliveredVizit === null) crownDeliveredVizit = row.vizit;
            }
            if (crownDeliveredVizit !== null && row.vizit > crownDeliveredVizit && isHealCapB(name)) {
                removeIdx.add(idx);
            }
        }
    }

    if (removeIdx.size > 0) {
        const beforeCount = laposVizitek.length;
        laposVizitek = laposVizitek.filter((_, i) => !removeIdx.has(i));
        if (DEBUG) debug(`Pass B: removed ${beforeCount - laposVizitek.length} sequence-invalid rows`);
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

    function isSinusC(n) { return SINUS_KW2.some(k => normalizalSzoveg(n).includes(k)); }
    function xraySubcatC(n) {
        const s = normalizalSzoveg(n);
        if (XRAY_KW2_CBCT.some(k => s.includes(k))) return "cbct";
        if (XRAY_KW2_PANORAMA.some(k => s.includes(k))) return "panorama";
        if (XRAY_KW2_PERIAPICAL.some(k => s.includes(k))) return "periapical";
        if (XRAY_KW2_GENERAL.some(k => s.includes(k))) return "general";
        return null;
    }
    function isSurgPrepC(n) { return SURGPREP_KW2.some(k => normalizalSzoveg(n).includes(k)); }

    const removeIdx = new Set();

    for (let i = 0; i < laposVizitek.length; i++) {
        const v = laposVizitek[i];
        if (isSinusC(v.name)) {
            const fogNum = parseInt(v.fog);
            if (!isNaN(fogNum)) {
                const pos = fogNum % 10;
                const quad = Math.floor(fogNum / 10);
                if (quad > 2 || pos < 4) removeIdx.add(i);
            }
        }
    }

    // Max 2 x-ray rows per subcategory (panoráma, CBCT, periapical each get 2)
    const xrayCounts = {};
    for (let i = 0; i < laposVizitek.length; i++) {
        if (removeIdx.has(i)) continue;
        const subcat = xraySubcatC(laposVizitek[i].name);
        if (subcat) {
            xrayCounts[subcat] = (xrayCounts[subcat] || 0) + 1;
            if (xrayCounts[subcat] > 2) removeIdx.add(i);
        }
    }

    let surgPrepCount = 0;
    for (let i = 0; i < laposVizitek.length; i++) {
        if (removeIdx.has(i)) continue;
        if (isSurgPrepC(laposVizitek[i].name)) {
            surgPrepCount++;
            if (surgPrepCount > 2) removeIdx.add(i);
        }
    }

    if (removeIdx.size > 0) {
        const beforeCount = laposVizitek.length;
        laposVizitek = laposVizitek.filter((_, i) => !removeIdx.has(i));
        if (DEBUG) debug(`Pass C: removed ${beforeCount - laposVizitek.length} position/quantity-invalid rows`);
    }
}


// ============ PASS D: BRAND CONSISTENCY FILTER ============
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
        const n = normalizalSzoveg(name || "");
        return BRAND_SPECIFIC_KW.some(kw => n.includes(kw));
    }

    let inputText = "";
    for (const tetel of tetelLista) {
        if (tetel.eredeti_szoveg) inputText += " " + tetel.eredeti_szoveg;
    }

    const inputLower = normalizalSzoveg(inputText);
    const detectedBrands = [];
    for (const [brandKey, keywords] of Object.entries(BRAND_MAP)) {
        if (keywords.some(kw => inputLower.includes(kw))) {
            detectedBrands.push(brandKey);
        }
    }

    if (detectedBrands.length > 0) {
        const filtered = laposVizitek.filter(v => {
            const nameLower = normalizalSzoveg(v.name || "");
            // Only apply brand filter to brand-specific items (implants, abutments)
            if (!isBrandSpecificItem(nameLower)) return true;
            for (const [brandKey, keywords] of Object.entries(BRAND_MAP)) {
                if (detectedBrands.includes(brandKey)) continue;
                if (keywords.some(kw => nameLower.includes(kw))) {
                    return false;
                }
            }
            return true;
        });

        // Safety: never remove ALL rows
        if (filtered.length > 0) {
            if (DEBUG && filtered.length < laposVizitek.length) {
                debug(`Pass D: removed ${laposVizitek.length - filtered.length} brand-mismatched rows (input brands: ${detectedBrands.join(", ")})`);
            }
            laposVizitek = filtered;
        } else if (DEBUG) {
            debug(`Pass D: brand filter would remove ALL rows — skipping filter (input brands: ${detectedBrands.join(", ")})`);
        }
    }
}

// ============ PASS E: CROSS-VISIT IMPLANT DEDUPLICATION ============
{
    const IMPLANT_INSERT_KW = ["implantáció", "implantátum beül", "implant beül",
        "fogbeültetés", "fixture", "implantátum műtéti"];

    function isImplantInsertion(name) {
        const n = normalizalSzoveg(name || "");
        return IMPLANT_INSERT_KW.some(k => n.includes(k));
    }

    const toothFirstImplantVizit = new Map();
    for (const v of laposVizitek) {
        if (isImplantInsertion(v.name)) {
            const existing = toothFirstImplantVizit.get(v.fog);
            if (existing === undefined || v.vizit < existing) {
                toothFirstImplantVizit.set(v.fog, v.vizit);
            }
        }
    }

    const beforeCount = laposVizitek.length;
    laposVizitek = laposVizitek.filter(v => {
        if (!isImplantInsertion(v.name)) return true;
        return v.vizit === toothFirstImplantVizit.get(v.fog);
    });

    if (DEBUG && laposVizitek.length < beforeCount) {
        debug(`Pass E: removed ${beforeCount - laposVizitek.length} duplicate implant rows (cross-visit dedup)`);
    }
}

// ============ PASS E2: CROSS-VISIT EXTRACTION DEDUPLICATION ============
// If the same tooth has extraction in multiple visits (e.g. from combo rule in visit 1
// AND explicit multi-session extraction tétel in visit 2), keep only one occurrence.
{
    const EXTRACT_KW = ["extractio", "fogeltávolítás", "foghúzás"];

    function isExtraction(name) {
        const n = normalizalSzoveg(name || "");
        return EXTRACT_KW.some(k => n.includes(k));
    }

    const toothExtractVisits = new Map();
    for (const v of laposVizitek) {
        if (isExtraction(v.name)) {
            if (!toothExtractVisits.has(v.fog)) toothExtractVisits.set(v.fog, new Set());
            toothExtractVisits.get(v.fog).add(v.vizit);
        }
    }

    const duplicateTeeth = new Map();
    for (const [fog, visits] of toothExtractVisits) {
        if (visits.size > 1) {
            duplicateTeeth.set(fog, Math.max(...visits));
        }
    }

    if (duplicateTeeth.size > 0) {
        const beforeCount = laposVizitek.length;
        laposVizitek = laposVizitek.filter(v => {
            if (!isExtraction(v.name)) return true;
            const keepVizit = duplicateTeeth.get(v.fog);
            if (keepVizit === undefined) return true;
            return v.vizit === keepVizit;
        });

        if (DEBUG && laposVizitek.length < beforeCount) {
            debug(`Pass E2: removed ${beforeCount - laposVizitek.length} duplicate extraction rows (cross-visit dedup, teeth: ${[...duplicateTeeth.keys()].join(",")})`);
        }
    }
}


// ============ PASS F: VISIT RESEQUENCING ============
{
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

    const PHASE_PRIORITY = {
        DIAGNOSTIC: 0, PARODONTOLOGY: 1, EXTRACTION: 2,
        BONE_AUGMENTATION: 3, IMPLANT_SURGICAL: 4,
        IMPLANT_PROSTHETIC_PREP: 5, PROSTHETIC_PREP: 6,
        PROSTHETIC_DELIVERY: 7, CONSERVATIVE: -1, SUPPORT: -1
    };

    const SURGICAL_PHASES = new Set(["EXTRACTION", "BONE_AUGMENTATION", "IMPLANT_SURGICAL"]);

    function classifyPhase(name) {
        const n = normalizalSzoveg(name || "");
        for (const [phase, keywords] of Object.entries(PHASE_KW)) {
            if (keywords.some(kw => n.includes(kw))) return phase;
        }
        return "OTHER";
    }

    for (const v of laposVizitek) { v._phase = classifyPhase(v.name); }

    const visitMap = new Map();
    for (const v of laposVizitek) {
        if (!visitMap.has(v.vizit)) visitMap.set(v.vizit, []);
        visitMap.get(v.vizit).push(v);
    }

    let splitCount = 0;

    for (const [vizitNum, rows] of visitMap) {
        const phases = new Set(rows.map(r => r._phase));

        // R1: PARODONTOLOGY + SURGICAL in same visit
        const hasParo = phases.has("PARODONTOLOGY");
        const hasSurgical = [...phases].some(p => SURGICAL_PHASES.has(p));
        if (hasParo && hasSurgical) {
            for (const r of rows) {
                if (r._phase === "PARODONTOLOGY") {
                    r._offset = -0.5;
                    splitCount++;
                }
            }
        }

        // R3: IMPLANT_SURGICAL + PROSTHETIC_DELIVERY on same tooth
        if (phases.has("IMPLANT_SURGICAL") && phases.has("PROSTHETIC_DELIVERY")) {
            const implantTeeth = new Set(rows.filter(r => r._phase === "IMPLANT_SURGICAL").map(r => r.fog));
            for (const r of rows) {
                if (r._phase === "PROSTHETIC_DELIVERY" && implantTeeth.has(r.fog)) {
                    r._offset = 0.5;
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
        for (let i = 0; i < laposVizitek.length; i++) {
            const v = laposVizitek[i];
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
                    targetOffset = (vizitNum) => implantVizit - vizitNum + 0.5;
                } else {
                    targetOffset = (vizitNum) => extractionVizit - vizitNum + 0.5;
                }

                for (const entry of conflictingProsthetics) {
                    const v = laposVizitek[entry.index];
                    v._offset = targetOffset(v.vizit);
                    splitCount++;
                }
            }
        }
    }

    if (splitCount > 0) {
        for (const v of laposVizitek) {
            v._effectiveVizit = v.vizit + (v._offset || 0);
        }

        laposVizitek.sort((a, b) => {
            if (a._effectiveVizit !== b._effectiveVizit) return a._effectiveVizit - b._effectiveVizit;
            const pa = PHASE_PRIORITY[a._phase] ?? 99;
            const pb = PHASE_PRIORITY[b._phase] ?? 99;
            return pa - pb;
        });

        let currentVizit = 0;
        let lastEffective = null;
        for (const v of laposVizitek) {
            if (v._effectiveVizit !== lastEffective) {
                currentVizit++;
                lastEffective = v._effectiveVizit;
            }
            v.vizit = currentVizit;
        }

        if (DEBUG) {
            debug(`Pass F: resequenced ${splitCount} items across visits (incompatible phase separation)`);
        }
    }

    for (const v of laposVizitek) {
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
        const n = normalizalSzoveg(name);
        if (EXTRACT_DKW.some(k => n.includes(k))) return "extraction";
        if (IMPLANT_INS_KW.some(k => n.includes(k))) return "implant";
        if (HEALING_DKW.some(k => n.includes(k))) return "healing_cap";
        if (ABUTMENT_DKW.some(k => n.includes(k))) return "abutment";
        if (CROWN_DKW.some(k => n.includes(k))) return "crown";
        return null;
    }

    const seen = new Set();
    const beforeCount = laposVizitek.length;
    laposVizitek = laposVizitek.filter(v => {
        const cat = dedupCategory(v.name);
        if (!cat) return true;
        const key = `${v.vizit}|${v.fog}|${cat}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (DEBUG && laposVizitek.length < beforeCount) {
        debug(`Post-pass dedup: removed ${beforeCount - laposVizitek.length} same-visit/tooth/category duplicates`);
    }
}

// ============ 5. CLEANUP ============

for (const vizitKey of Object.keys(vizitek)) {
    const vizit = vizitek[vizitKey];
    for (const szakterulet of Object.keys(vizit)) {
        for (const bejegyzes of vizit[szakterulet]) {
            delete bejegyzes.__id;
        }
    }
}

// ============ 6. OUTPUT ============

const kimenet = {
    vizitek: laposVizitek,
    meta: {
        tetel_szam: tetelLista.length,
        vizit_szam: laposVizitek.length
    }
};

debug(`Output: ${laposVizitek.length} vizitek`);

return kimenet;
}