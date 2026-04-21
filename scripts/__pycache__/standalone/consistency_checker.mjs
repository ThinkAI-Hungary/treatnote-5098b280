// ==========================================================
// CONSISTENCY CHECKER — Compares AI-structured output vs input text expectations
// ==========================================================

// Hungarian dental notation helpers
const TOOTH_NAMES = {
    "11": "jobb felső 1", "12": "jobb felső 2", "13": "jobb felső 3", "14": "jobb felső 4",
    "15": "jobb felső 5", "16": "jobb felső 6", "17": "jobb felső 7", "18": "jobb felső 8",
    "21": "bal felső 1", "22": "bal felső 2", "23": "bal felső 3", "24": "bal felső 4",
    "25": "bal felső 5", "26": "bal felső 6", "27": "bal felső 7", "28": "bal felső 8",
    "31": "bal alsó 1", "32": "bal alsó 2", "33": "bal alsó 3", "34": "bal alsó 4",
    "35": "bal alsó 5", "36": "bal alsó 6", "37": "bal alsó 7", "38": "bal alsó 8",
    "41": "jobb alsó 1", "42": "jobb alsó 2", "43": "jobb alsó 3", "44": "jobb alsó 4",
    "45": "jobb alsó 5", "46": "jobb alsó 6", "47": "jobb alsó 7", "48": "jobb alsó 8"
};

const UPPER_TEETH = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER_TEETH = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

// Treatment type synonym groups for fuzzy matching
const TREATMENT_SYNONYMS = {
    extractio: ["extractio", "fogeltávolítás", "foghúzás", "húzás", "kihúzás", "kivétel", "bölcsességfog"],
    implantátum: ["implantátum", "implant", "beültetés", "implánt"],
    "cirkon korona": ["cirkon korona", "cirkónium korona", "zirconia"],
    "fémkerámia korona": ["fémkerámia korona", "fémkerámia", "metal-ceramic"],
    korona: ["korona", "crown"],
    híd: ["híd", "bridge", "hídtag", "pontic", "körhíd"],
    "direkt héj": ["direkt héj", "direct veneer", "direkt veneer", "héj"],
    "All-on-4": ["all-on-4", "allon4", "all on 4", "all on four"],
    "All-on-6": ["all-on-6", "allon6", "all on 6", "all on six"],
    sinuslift: ["sinuslift", "sinus lift", "arcüregemelés", "szinuszlift"],
    gyökérkezelés: ["gyökérkezelés", "root canal", "trepanálás"],
    "kompozit tömés": ["kompozit tömés", "tömés", "kompozit", "composite"],
    onlay: ["onlay", "öntött tömés", "inlay"],
    parodontológia: ["parodontológia", "parodontológiai", "kürett", "depurálás"]
};

function norm(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Check if a treatment type string matches a given canonical type (using synonyms).
 */
function matchesTreatmentType(actualText, expectedType) {
    const normalizedActual = norm(actualText);
    const normalizedExpected = norm(expectedType);

    // Direct substring match
    if (normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual)) {
        return true;
    }

    // Synonym group match
    for (const [canonical, synonyms] of Object.entries(TREATMENT_SYNONYMS)) {
        const canonicalNorm = norm(canonical);
        const expectedMatchesGroup = synonyms.some(s => norm(s) === normalizedExpected || normalizedExpected.includes(norm(s)));
        const actualMatchesGroup = synonyms.some(s => normalizedActual.includes(norm(s)));

        if (expectedMatchesGroup && actualMatchesGroup) return true;
    }

    return false;
}

/**
 * Stricter matching used for must_not_include checks.
 * Picks the MOST SPECIFIC synonym group (longest canonical key) that matches
 * the expected type, and checks the actual text ONLY against that group.
 * This prevents broad groups like "korona" from triggering when a specific
 * group like "cirkon korona" matches the expected type.
 */
function matchesTreatmentTypeStrict(actualText, expectedType) {
    const normalizedActual = norm(actualText);
    const normalizedExpected = norm(expectedType);

    // 1) Find the most specific synonym group matching the expected type
    let bestGroup = null;
    let bestCanonicalLen = -1;

    for (const [canonical, synonyms] of Object.entries(TREATMENT_SYNONYMS)) {
        const canonicalNorm = norm(canonical);
        // Check if expected type matches this group (exact synonym match or substring)
        const expectedMatchesGroup = synonyms.some(s => {
            const sn = norm(s);
            return sn === normalizedExpected || normalizedExpected.includes(sn) || sn.includes(normalizedExpected);
        });
        if (expectedMatchesGroup && canonicalNorm.length > bestCanonicalLen) {
            bestGroup = { canonical, synonyms };
            bestCanonicalLen = canonicalNorm.length;
        }
    }

    // 2) If we found a specific group, check actual ONLY against that group
    if (bestGroup) {
        return bestGroup.synonyms.some(s => normalizedActual.includes(norm(s)));
    }

    // 3) No synonym group matched — fall back to direct exact match only
    return normalizedActual.includes(normalizedExpected);
}

/**
 * Extract all teeth mentioned in a tetel_lista item.
 */
function extractTeeth(tetel) {
    const teeth = [];
    if (Array.isArray(tetel.fogak)) {
        for (const f of tetel.fogak) {
            const fog = typeof f === "string" ? f : (f.fog || f.fogszam || "");
            if (fog) teeth.push(String(fog).trim());
        }
    }
    return teeth;
}

/**
 * Extract all treatment names from a tetel_lista item.
 */
function extractTreatmentNames(tetel) {
    const names = [];
    if (Array.isArray(tetel.kezelesek)) {
        for (const k of tetel.kezelesek) {
            const name = typeof k === "string" ? k : (k.kezeles_szoveg || k.name || k.rule_name || "");
            if (name) names.push(name);
        }
    }
    return names;
}

/**
 * Check whether a specific arch is referenced in teeth list.
 */
function archInTeeth(teeth, arch) {
    if (arch === "FELSO_ALLCSONT") {
        return teeth.includes("FELSO_ALLCSONT") || teeth.some(t => UPPER_TEETH.includes(t));
    }
    if (arch === "ALSO_ALLCSONT") {
        return teeth.includes("ALSO_ALLCSONT") || teeth.some(t => LOWER_TEETH.includes(t));
    }
    return false;
}

// ============ STRUCTURAL CHECKS ============

function checkStructuralIssues(tetelLista) {
    const issues = [];

    // 1. Empty kezelesek
    for (let i = 0; i < tetelLista.length; i++) {
        const tetel = tetelLista[i];
        const treatments = extractTreatmentNames(tetel);
        if (treatments.length === 0) {
            issues.push({
                severity: "ERROR",
                check: "empty_treatments",
                message: `Tétel #${i}: kezelesek mező üres — nincs feldolgozható kezelés név.`,
                tetel_index: i
            });
        }
    }

    // 2. Empty fogak
    for (let i = 0; i < tetelLista.length; i++) {
        const teeth = extractTeeth(tetelLista[i]);
        if (teeth.length === 0) {
            issues.push({
                severity: "WARNING",
                check: "empty_teeth",
                message: `Tétel #${i}: Nincs fog megadva — a fog "11" lesz alapértelmezett.`,
                tetel_index: i
            });
        }
    }

    // 3. Duplicate teeth within a single tétel
    for (let i = 0; i < tetelLista.length; i++) {
        const teeth = extractTeeth(tetelLista[i]);
        const seen = new Set();
        for (const t of teeth) {
            if (seen.has(t)) {
                issues.push({
                    severity: "WARNING",
                    check: "duplicate_tooth",
                    message: `Tétel #${i}: Duplikált fog "${t}" ugyanabban a tételben.`,
                    tetel_index: i
                });
            }
            seen.add(t);
        }
    }

    // 4. Invalid tooth numbers
    for (let i = 0; i < tetelLista.length; i++) {
        const teeth = extractTeeth(tetelLista[i]);
        for (const t of teeth) {
            if (t !== "FELSO_ALLCSONT" && t !== "ALSO_ALLCSONT" && !TOOTH_NAMES[t]) {
                issues.push({
                    severity: "ERROR",
                    check: "invalid_tooth",
                    message: `Tétel #${i}: Érvénytelen fogszám "${t}".`,
                    tetel_index: i
                });
            }
        }
    }

    // 5. Hidtag consistency — pontic_only on extraction
    for (let i = 0; i < tetelLista.length; i++) {
        const tetel = tetelLista[i];
        const treatments = extractTreatmentNames(tetel);
        const isExtraction = treatments.some(t => matchesTreatmentType(t, "extractio"));

        if (isExtraction && Array.isArray(tetel.fogak)) {
            for (const f of tetel.fogak) {
                const hidtag = typeof f === "object" ? f.hidtag : null;
                if (hidtag === "pontic_only") {
                    issues.push({
                        severity: "ERROR",
                        check: "pontic_extraction",
                        message: `Tétel #${i}: Fog "${f.fog}" pontic_only hidtaggal van jelölve, de a kezelés extractio — extractiónál nincs hidtag.`,
                        tetel_index: i
                    });
                }
            }
        }
    }

    // 6. Category sanity
    const VALID_CATEGORIES = [
        "szajsebeszet", "implantacio", "konzervalo_fogaszat",
        "fogpotlastan", "dentalhigienia", "parodontologia",
        "vizsgalatok_es_modelezesek", "egyeb"
    ];
    for (let i = 0; i < tetelLista.length; i++) {
        const cat = tetelLista[i].kategoria;
        if (!cat || !VALID_CATEGORIES.includes(cat)) {
            issues.push({
                severity: "WARNING",
                check: "invalid_category",
                message: `Tétel #${i}: Ismeretlen kategória "${cat}".`,
                tetel_index: i
            });
        }
    }

    // 7. Category-treatment mismatch
    for (let i = 0; i < tetelLista.length; i++) {
        const tetel = tetelLista[i];
        const cat = tetel.kategoria;
        const treatments = extractTreatmentNames(tetel);

        for (const t of treatments) {
            if (cat === "szajsebeszet" && matchesTreatmentType(t, "korona")) {
                issues.push({ severity: "WARNING", check: "category_mismatch", message: `Tétel #${i}: Korona a "szajsebeszet" kategóriában — valószínűleg "fogpotlastan" kellene.`, tetel_index: i });
            }
            if (cat === "fogpotlastan" && matchesTreatmentType(t, "extractio")) {
                issues.push({ severity: "WARNING", check: "category_mismatch", message: `Tétel #${i}: Extractio a "fogpotlastan" kategóriában — valószínűleg "szajsebeszet" kellene.`, tetel_index: i });
            }
            if (cat === "konzervalo_fogaszat" && matchesTreatmentType(t, "implantátum")) {
                issues.push({ severity: "ERROR", check: "category_mismatch", message: `Tétel #${i}: Implantátum a "konzervalo_fogaszat" kategóriában — "implantacio" kellene.`, tetel_index: i });
            }
        }
    }

    return issues;
}

// ============ EXPECTATION CHECKS ============

function checkExpectations(tetelLista, expected) {
    const issues = [];

    // Flatten all treatments from all tételek
    const allTreatments = [];
    for (let i = 0; i < tetelLista.length; i++) {
        const tetel = tetelLista[i];
        const teeth = extractTeeth(tetel);
        const names = extractTreatmentNames(tetel);
        for (const name of names) {
            allTreatments.push({ name, teeth, tetel_index: i, kategoria: tetel.kategoria });
        }
    }

    // Check must_include
    if (expected.treatments_must_include) {
        for (const req of expected.treatments_must_include) {
            const matching = allTreatments.filter(t => matchesTreatmentType(t.name, req.type));

            if (matching.length === 0) {
                issues.push({
                    severity: "ERROR",
                    check: "missing_expected_treatment",
                    message: `HIÁNYZÓ kezelés: "${req.type}" elvárt volt, de nem található a kimenetben.` + (req.note ? ` (${req.note})` : ""),
                    expected: req
                });
                continue;
            }

            // Check tooth match if specified
            if (req.teeth) {
                const allFoundTeeth = matching.flatMap(m => m.teeth);
                const missingTeeth = req.teeth.filter(t => !allFoundTeeth.includes(t));
                if (missingTeeth.length > 0) {
                    issues.push({
                        severity: "WARNING",
                        check: "missing_teeth_for_treatment",
                        message: `"${req.type}": Hiányzó fogak: [${missingTeeth.join(", ")}]${req.note ? ` (${req.note})` : ""}. Talált fogak: [${allFoundTeeth.join(", ")}].`,
                        expected: req
                    });
                }
            }

            // Check arch match if specified
            if (req.arch) {
                const hasArch = matching.some(m => archInTeeth(m.teeth, req.arch));
                if (!hasArch) {
                    issues.push({
                        severity: "WARNING",
                        check: "wrong_arch",
                        message: `"${req.type}": Elvárt állcsont = ${req.arch}, de nincs ilyen fog a találatok közt.${req.note ? ` (${req.note})` : ""}`,
                        expected: req
                    });
                }
            }
        }
    }

    // Check must_not_include
    if (expected.treatments_must_not_include) {
        for (const req of expected.treatments_must_not_include) {
            const matching = allTreatments.filter(t => matchesTreatmentTypeStrict(t.name, req.type));

            if (matching.length > 0) {
                // If arch-specific exclusion, only flag if it's on the wrong arch
                if (req.arch) {
                    const onWrongArch = matching.filter(m => archInTeeth(m.teeth, req.arch));
                    if (onWrongArch.length > 0) {
                        issues.push({
                            severity: "ERROR",
                            check: "unexpected_treatment",
                            message: `EXTRA kezelés: "${req.type}" NEM kellene szerepelnie a(z) ${req.arch} állcsonton.${req.note ? ` (${req.note})` : ""}`,
                            found: onWrongArch.map(m => ({ name: m.name, teeth: m.teeth }))
                        });
                    }
                } else {
                    issues.push({
                        severity: "ERROR",
                        check: "unexpected_treatment",
                        message: `EXTRA kezelés: "${req.type}" NEM kellene szerepelnie a kimenetben.${req.note ? ` (${req.note})` : ""}`,
                        found: matching.map(m => ({ name: m.name, teeth: m.teeth }))
                    });
                }
            }
        }
    }

    return issues;
}

// ============ SCALING PROCESSOR CHECKS ============

function checkScalingOutput(scalingOutput, tetelLista) {
    const issues = [];

    if (!scalingOutput || !scalingOutput.vizitek) {
        issues.push({
            severity: "ERROR",
            check: "scaling_no_output",
            message: "Scaling processor nem adott eredményt."
        });
        return issues;
    }

    const vizitList = scalingOutput.vizitek;

    // 1. Check for empty output
    if (vizitList.length === 0) {
        issues.push({
            severity: "ERROR",
            check: "scaling_empty",
            message: "Scaling processor üres vizit listát adott vissza."
        });
    }

    // 2. Check all entries have valid tooth numbers
    for (let i = 0; i < vizitList.length; i++) {
        const v = vizitList[i];
        if (!v.fog || (!TOOTH_NAMES[v.fog] && v.fog !== "FELSO_ALLCSONT" && v.fog !== "ALSO_ALLCSONT")) {
            issues.push({
                severity: "WARNING",
                check: "scaling_invalid_tooth",
                message: `Scaling vizit #${i}: Érvénytelen fog "${v.fog}" a kezelésnél "${v.name}".`
            });
        }
    }

    // 3. Check for entries with no treatment name
    for (let i = 0; i < vizitList.length; i++) {
        if (!vizitList[i].name || vizitList[i].name.trim() === "") {
            issues.push({
                severity: "ERROR",
                check: "scaling_empty_name",
                message: `Scaling vizit #${i}: Üres kezelés név.`
            });
        }
    }

    // 4. Treatment count sanity — did we lose or gain treatments?
    const inputTreatmentCount = tetelLista.reduce((sum, t) => {
        const names = extractTreatmentNames(t);
        return sum + names.length;
    }, 0);

    const uniqueScalingNames = new Set(vizitList.map(v => norm(v.name)));

    if (uniqueScalingNames.size === 0 && inputTreatmentCount > 0) {
        issues.push({
            severity: "ERROR",
            check: "scaling_lost_all_treatments",
            message: `Scaling minden kezelést elvesztett! Bemenet: ${inputTreatmentCount} kezelés, kimenet: 0.`
        });
    }

    return issues;
}


// ============ FULL ANALYSIS ============

export function analyzeConsistency(tetelLista, scalingOutput, expected) {
    const report = {
        timestamp: new Date().toISOString(),
        structural_issues: checkStructuralIssues(tetelLista),
        expectation_issues: expected ? checkExpectations(tetelLista, expected) : [],
        scaling_issues: scalingOutput ? checkScalingOutput(scalingOutput, tetelLista) : [],
        summary: {}
    };

    const allIssues = [
        ...report.structural_issues,
        ...report.expectation_issues,
        ...report.scaling_issues
    ];

    report.summary = {
        total_issues: allIssues.length,
        errors: allIssues.filter(i => i.severity === "ERROR").length,
        warnings: allIssues.filter(i => i.severity === "WARNING").length,
        passed: allIssues.length === 0
    };

    return report;
}

export { matchesTreatmentType, extractTeeth, extractTreatmentNames, TREATMENT_SYNONYMS, TOOTH_NAMES };
