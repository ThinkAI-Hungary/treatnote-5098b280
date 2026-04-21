#!/usr/bin/env node
// ==========================================================
// MEDICAL VALIDATOR — Detects clinical/logical impossibilities
// ==========================================================
// Checks the scaling processor output for medical inconsistencies:
//  1. Same tooth extracted multiple times
//  2. Restorative work on extracted teeth (crown/filling on pulled tooth)
//  3. Wrong treatment sequence (implant before bone graft heals)
//  4. Duplicate treatments on same tooth in same visit
//  5. Excessive quantities (too many x-rays, surgical preps)
//  6. Brand mismatches (Alpha Bio abutment on Nobel implant)
//  7. Impossible procedures (crown before abutment, healing cap after crown)
//  8. Parallel parodontology + surgery (should be sequential)
// ==========================================================

// ============ TREATMENT CLASSIFICATION ============

const EXTRACTION_PATTERNS = [
    "foghúzás", "extractio", "fogeltávolítás", "fog eltávolít", "húzás",
    "bölcsességfog", "gyökér eltávolít", "műtéti eltáv"
];

const IMPLANT_PATTERNS = [
    "implant", "beültet", "implantáció", "implantátum"
];

const CROWN_PATTERNS = [
    "korona", "crown", "cirkon korona", "fémkerámia korona", "ideiglenes korona"
];

const BRIDGE_PATTERNS = [
    "híd", "bridge", "hídtag", "pillér"
];

const FILLING_PATTERNS = [
    "tömés", "filling", "kompozit", "amalgám"
];

const ROOT_CANAL_PATTERNS = [
    "gyökérkezelés", "trepanálás", "endodonti", "root canal"
];

const VENEER_PATTERNS = [
    "héj", "veneer", "héjkerámia", "laminált"
];

const PREPARATION_PATTERNS = [
    "preparálás", "preparáció", "csiszolás", "lenyomat"
];

const SINUS_LIFT_PATTERNS = [
    "sinus", "arcüreg", "szinusz", "sinuslift"
];

const BONE_GRAFT_PATTERNS = [
    "csontpótlás", "bone graft", "augmentáció", "csont augm"
];

const HEALING_CAP_PATTERNS = [
    "gyógyulási sapka", "healing cap", "healing abutment", "ínyformáz"
];

const ABUTMENT_PATTERNS = [
    "abutment", "felépítő fej", "felépítmény", "multiunit"
];

const XRAY_PATTERNS = [
    "röntgen", "x-ray", "panoráma", "cbct", "ct felvétel"
];

const SURGICAL_PREP_PATTERNS = [
    "műtéti előkészítés", "surgical prep", "sterili"
];

const DIGITAL_IMPRESSION_PATTERNS = [
    "digitális lenyomat", "intraoral scan", "szkennel"
];

const PARODONTOLOGY_PATTERNS = [
    "parodont", "kürett", "depurálás", "fogkő", "tasakmélység"
];

const PROSTHETIC_DELIVERY_PATTERNS = [
    "átadás", "cementez", "ragaszt", "csavaroz", "rögzít"
];

// ============ BRAND DETECTION ============

const BRAND_NOBEL = ["nobel", "replace", "active", "branemark", "nobelbiocare"];
const BRAND_ALPHA_BIO = ["alpha bio", "alpha-bio", "alphabio", "neo", "ice", "spiralfit"];
const BRAND_STRAUMANN = ["straumann", "bone level", "tissue level", "roxolid"];

// ============ HELPERS ============

function norm(s) {
    return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function matches(text, patterns) {
    const t = norm(text);
    return patterns.some(p => t.includes(p));
}

function detectBrand(text) {
    const t = norm(text);
    if (BRAND_NOBEL.some(b => t.includes(b))) return "Nobel";
    if (BRAND_ALPHA_BIO.some(b => t.includes(b))) return "Alpha Bio";
    if (BRAND_STRAUMANN.some(b => t.includes(b))) return "Straumann";
    return null;
}

function isExtraction(name) { return matches(name, EXTRACTION_PATTERNS); }
function isImplant(name) { return matches(name, IMPLANT_PATTERNS); }
function isCrown(name) { return matches(name, CROWN_PATTERNS); }
function isBridge(name) { return matches(name, BRIDGE_PATTERNS); }
function isFilling(name) { return matches(name, FILLING_PATTERNS); }
function isRootCanal(name) { return matches(name, ROOT_CANAL_PATTERNS); }
function isVeneer(name) { return matches(name, VENEER_PATTERNS); }
function isPreparation(name) { return matches(name, PREPARATION_PATTERNS); }
function isSinusLift(name) { return matches(name, SINUS_LIFT_PATTERNS); }
function isBoneGraft(name) { return matches(name, BONE_GRAFT_PATTERNS); }
function isHealingCap(name) { return matches(name, HEALING_CAP_PATTERNS); }
function isAbutment(name) { return matches(name, ABUTMENT_PATTERNS); }
function isXray(name) { return matches(name, XRAY_PATTERNS); }
function isSurgicalPrep(name) { return matches(name, SURGICAL_PREP_PATTERNS); }
function isDigitalImpression(name) { return matches(name, DIGITAL_IMPRESSION_PATTERNS); }
function isParodontology(name) { return matches(name, PARODONTOLOGY_PATTERNS); }
function isProstheticDelivery(name) { return matches(name, PROSTHETIC_DELIVERY_PATTERNS); }

// Check if treatment REQUIRES the tooth to still exist (not extracted)
function requiresExistingTooth(name) {
    return isCrown(name) || isFilling(name) || isRootCanal(name) || isVeneer(name) || isPreparation(name);
}

// Check if treatment is restorative (crown/bridge/veneer as final step on implant is OK)
function isImplantProsthetic(name) {
    const t = norm(name);
    return (isCrown(name) || isBridge(name)) && (t.includes("implant") || t.includes("csavaroz"));
}

// ============ MAIN VALIDATION ============

export function validateMedical(inputText, tetelLista, scalingOutput) {
    const issues = [];
    const vizitek = scalingOutput?.vizitek || [];

    if (vizitek.length === 0) {
        issues.push({ severity: "error", rule: "empty_output", message: "Nincs vizit sor a kimenetben." });
        return { issues, summary: buildSummary(issues) };
    }

    // ── 1. Build per-tooth timeline ──
    const toothTimeline = new Map(); // fog → [{vizit, name, scaling, ...}]
    for (const v of vizitek) {
        const fog = String(v.fog || "");
        if (!fog || fog === "FELSO_ALLCSONT" || fog === "ALSO_ALLCSONT") continue;
        if (!toothTimeline.has(fog)) toothTimeline.set(fog, []);
        toothTimeline.get(fog).push({
            vizit: v.vizit,
            name: v.name || "",
            scaling: v.scaling,
            hidtag: v.hidtag,
            szakterulet: v.szakterulet
        });
    }

    // ── 2. Check: same tooth extracted multiple times ──
    for (const [fog, events] of toothTimeline) {
        const extractions = events.filter(e => isExtraction(e.name));
        if (extractions.length > 1) {
            issues.push({
                severity: "error",
                rule: "duplicate_extraction",
                tooth: fog,
                message: `Fog ${fog}: ${extractions.length}x eltávolítva (vizit: ${extractions.map(e => e.vizit).join(", ")}). Egy fogat csak egyszer lehet kihúzni.`,
                details: extractions
            });
        }
    }

    // ── 3. Check: restorative work on extracted tooth ──
    for (const [fog, events] of toothTimeline) {
        const sortedEvents = events.slice().sort((a, b) => a.vizit - b.vizit);

        // Pre-scan: find extraction visit and implant visit for this tooth
        let extractionVizit = null;
        let implantVizit = null;
        for (const ev of sortedEvents) {
            if (isExtraction(ev.name) && extractionVizit === null) {
                extractionVizit = ev.vizit;
            }
            if (isImplant(ev.name) && implantVizit === null) {
                implantVizit = ev.vizit;
            }
        }

        if (extractionVizit === null) continue; // no extraction, no issue

        // Check each restorative event
        for (const ev of sortedEvents) {
            if (!requiresExistingTooth(ev.name) || isImplantProsthetic(ev.name)) continue;

            // After extraction: restorative work is only OK if there's an implant
            // placed at or before this visit
            if (ev.vizit >= extractionVizit) {
                const hasImplantBefore = implantVizit !== null && implantVizit <= ev.vizit;
                if (!hasImplantBefore) {
                    issues.push({
                        severity: "error",
                        rule: "treatment_on_extracted_tooth",
                        tooth: fog,
                        message: `Fog ${fog}: "${ev.name}" (vizit ${ev.vizit}) lehetetlen — a fog már ki lett húzva (vizit ${extractionVizit}).`,
                    });
                }
            }
        }
    }

    // ── 4. Check: implant + bone graft/sinus lift in same visit ──
    const vizitGroups = new Map(); // vizitNum → [events]
    for (const v of vizitek) {
        const key = v.vizit;
        if (!vizitGroups.has(key)) vizitGroups.set(key, []);
        vizitGroups.get(key).push(v);
    }

    for (const [vizitNum, events] of vizitGroups) {
        const hasBoneGraft = events.some(e => isBoneGraft(e.name));
        const hasSinusLift = events.some(e => isSinusLift(e.name));
        const implantEvents = events.filter(e => isImplant(e.name) && !isBoneGraft(e.name) && !isSinusLift(e.name));

        // Sinus lift / bone graft rules with implant should only apply if the item's rule
        // name doesn't bundle them (e.g. "Sinuslift és Nobel Implantátum" is a single rule)
        if ((hasBoneGraft || hasSinusLift) && implantEvents.length > 0) {
            // Check if they're on the SAME tooth
            const graftTeeth = new Set(events.filter(e => isBoneGraft(e.name) || isSinusLift(e.name)).map(e => e.fog));
            const implantTeeth = new Set(implantEvents.map(e => e.fog));
            const overlap = [...graftTeeth].filter(t => implantTeeth.has(t));

            // Only flag if the sinus lift/bone graft rule is NOT the same combined rule as the implant
            // (Many rules bundle sinus lift + implant as a single treatment plan)
            const graftRuleNames = new Set(events.filter(e => isBoneGraft(e.name) || isSinusLift(e.name)).map(e => norm(e.name)));
            const implantInGraftRule = [...graftRuleNames].some(n => n.includes("implant"));

            if (overlap.length > 0 && !implantInGraftRule) {
                issues.push({
                    severity: "warning",
                    rule: "implant_same_visit_as_graft",
                    message: `Vizit ${vizitNum}: Csontpótlás/sinuslift és implantátum beültetés UGYANABBAN az ülésben, fog: ${overlap.join(", ")}. Gyógyulási idő szükséges (3-6 hónap).`,
                });
            }
        }
    }

    // ── 5. Check: duplicate treatment on same tooth in same visit ──
    for (const [vizitNum, events] of vizitGroups) {
        const toothTreatMap = new Map(); // "fog|normName" → count
        for (const ev of events) {
            const key = `${ev.fog}|${norm(ev.name)}`;
            toothTreatMap.set(key, (toothTreatMap.get(key) || 0) + 1);
        }
        for (const [key, count] of toothTreatMap) {
            if (count > 1) {
                const [fog, name] = key.split("|");
                issues.push({
                    severity: "warning",
                    rule: "duplicate_treatment_same_visit",
                    tooth: fog,
                    message: `Vizit ${vizitNum}, fog ${fog}: "${name}" ${count}x szerepel. Dupla kezelés ugyanazon a fogon.`,
                });
            }
        }
    }

    // ── 6. Check: excessive x-rays ──
    const xrayEvents = vizitek.filter(v => isXray(v.name));
    if (xrayEvents.length > 2) {
        issues.push({
            severity: "warning",
            rule: "excessive_xrays",
            message: `${xrayEvents.length} db röntgen felvétel a tervben. Ez túl sok — általában 1-2 elegendő.`,
            details: xrayEvents.map(e => ({ vizit: e.vizit, name: e.name }))
        });
    }

    // ── 7. Check: excessive surgical preps ──
    const surgPrepEvents = vizitek.filter(v => isSurgicalPrep(v.name));
    if (surgPrepEvents.length > 2) {
        issues.push({
            severity: "warning",
            rule: "excessive_surgical_preps",
            message: `${surgPrepEvents.length} db műtéti előkészítés a tervben. Általában 1-2 elegendő.`,
        });
    }

    // ── 8. Check: brand mismatch (e.g., Alpha Bio abutment on Nobel implant) ──
    for (const [fog, events] of toothTimeline) {
        const brands = new Set();
        for (const ev of events) {
            const brand = detectBrand(ev.name);
            if (brand && (isImplant(ev.name) || isAbutment(ev.name) || isCrown(ev.name))) {
                brands.add(brand);
            }
        }
        if (brands.size > 1) {
            issues.push({
                severity: "error",
                rule: "brand_mismatch",
                tooth: fog,
                message: `Fog ${fog}: Márkakeveredés — ${[...brands].join(" + ")} ugyanazon a fogon. Az implantátum és a felépítmény/korona azonos márkájú kell legyen.`,
            });
        }
    }

    // ── 9. Check: crown delivery before healing cap / abutment ──
    for (const [fog, events] of toothTimeline) {
        const sorted = events.slice().sort((a, b) => a.vizit - b.vizit);
        let hasImplant = false;
        let hasHealingCap = false;
        let hasAbutment = false;

        for (const ev of sorted) {
            if (isImplant(ev.name)) hasImplant = true;

            if (hasImplant && isHealingCap(ev.name)) {
                // Healing cap AFTER crown is wrong
                if (hasAbutment) {
                    // Check if crown was already delivered
                    const crownBefore = sorted.filter(e => e.vizit < ev.vizit && isCrown(e.name));
                    if (crownBefore.length > 0) {
                        issues.push({
                            severity: "error",
                            rule: "healing_cap_after_crown",
                            tooth: fog,
                            message: `Fog ${fog}: Gyógyulási sapka (vizit ${ev.vizit}) a korona átadása UTÁN. Lehetetlen sorrend.`,
                        });
                    }
                }
                hasHealingCap = true;
            }

            if (isAbutment(ev.name)) hasAbutment = true;
        }
    }

    // ── 10. Check: parodontology should complete BEFORE implant/surgery ──
    const parodontVizits = new Set();
    const surgeryVizits = new Set();
    for (const v of vizitek) {
        if (isParodontology(v.name)) parodontVizits.add(v.vizit);
        if (isImplant(v.name) || isExtraction(v.name) || isSinusLift(v.name) || isBoneGraft(v.name)) {
            surgeryVizits.add(v.vizit);
        }
    }

    if (parodontVizits.size > 0 && surgeryVizits.size > 0) {
        const maxParoVizit = Math.max(...parodontVizits);
        const minSurgVizit = Math.min(...surgeryVizits);
        // Check for interleaving — parodontology should finish before surgery starts
        const overlapping = [...parodontVizits].filter(v => surgeryVizits.has(v));
        if (overlapping.length > 0) {
            issues.push({
                severity: "warning",
                rule: "parodontology_parallel_surgery",
                message: `Parodontológia és sebészet/implantológia PÁRHUZAMOSAN ugyanabban az ülésben (vizit: ${overlapping.join(", ")}). A parodontológiát előbb be kellene fejezni.`,
            });
        }
    }

    // ── 11. Check: sinus lift on front teeth (only makes sense on 5-6-7 positions) ──
    for (const v of vizitek) {
        if (isSinusLift(v.name)) {
            const fogNum = parseInt(v.fog);
            if (!isNaN(fogNum)) {
                // Extract position (last digit)
                const pos = fogNum % 10;
                // Sinus lift only makes sense on upper premolars/molars (positions 4-8, upper = 1x, 2x)
                const quadrant = Math.floor(fogNum / 10);
                if (quadrant > 2 || pos < 4) {
                    issues.push({
                        severity: "error",
                        rule: "sinus_lift_wrong_position",
                        tooth: v.fog,
                        message: `Fog ${v.fog}: Sinuslift/arcüregemelés értelmetlen ezen a pozíción. Csak felső 4-8 pozíciókon van értelme (felső premolárisok és molárisok felett).`,
                    });
                }
            }
        }
    }

    // ── 12. Check: 2+ crowns on same tooth (different rules) ──
    for (const [fog, events] of toothTimeline) {
        const crownEvents = events.filter(e => isCrown(e.name) && !isImplantProsthetic(e.name));
        if (crownEvents.length > 1) {
            // Check if they're different crown types (not just revisits)
            const uniqueNames = new Set(crownEvents.map(e => norm(e.name)));
            if (uniqueNames.size > 1) {
                issues.push({
                    severity: "warning",
                    rule: "multiple_crown_types_same_tooth",
                    tooth: fog,
                    message: `Fog ${fog}: Többféle korona — ${[...uniqueNames].join(", ")}. Felesleges ismétlés lehet, ellenőrizze.`,
                });
            }
        }
    }

    // ── 13. Check: implant inserted multiple times on same tooth ──
    for (const [fog, events] of toothTimeline) {
        const implantInserts = events.filter(e =>
            isImplant(e.name) && !isAbutment(e.name) && !isHealingCap(e.name) &&
            !isCrown(e.name) && norm(e.name).includes("beültet") || norm(e.name).includes("implantáció") || norm(e.name).includes("implantációs")
        );
        if (implantInserts.length > 1) {
            issues.push({
                severity: "error",
                rule: "duplicate_implant",
                tooth: fog,
                message: `Fog ${fog}: Implantátum ${implantInserts.length}x beültetve (vizit: ${implantInserts.map(e => e.vizit).join(", ")}). Egy pozícióba csak egy implantátum ültethető.`,
            });
        }
    }

    // ── 14. Cross-check with input text ──
    const inputLower = norm(inputText || "");

    // Check if input mentions Nobel but output has Alpha Bio (or vice versa)
    const inputBrand = detectBrand(inputText || "");
    if (inputBrand) {
        const outputBrands = new Set();
        for (const v of vizitek) {
            const b = detectBrand(v.name);
            if (b) outputBrands.add(b);
        }
        for (const ob of outputBrands) {
            if (ob !== inputBrand) {
                issues.push({
                    severity: "error",
                    rule: "input_brand_mismatch",
                    message: `Bemenetben "${inputBrand}" szerepel, de a kimenetben "${ob}" kezelés is van. A márkának egyeznie kell.`,
                });
            }
        }
    }

    return {
        issues,
        summary: buildSummary(issues)
    };
}

function buildSummary(issues) {
    const errors = issues.filter(i => i.severity === "error").length;
    const warnings = issues.filter(i => i.severity === "warning").length;
    return {
        passed: errors === 0 && warnings === 0,
        errors,
        warnings,
        total: issues.length
    };
}
