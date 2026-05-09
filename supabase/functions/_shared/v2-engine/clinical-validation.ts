// ============================================================
// TreatNote V2 — Clinical Validation Passes (A-E)
// Post-expansion validation and deduplication
// ============================================================

import type { ExpandedItem } from './04-expand.ts';
import { CLINICAL_PHASES, ACTION_TO_PHASE } from './clinical-phases.ts';

// ── Pass A: Kezelési kategória deduplikáció ──
// Egy fogra, egy vizitben, ugyanolyan típusú kezelés ne legyen kétszer.
const TREATMENT_CATEGORIES: Record<string, string> = {
  extractio_egyszeru: 'extractio',
  extractio_sebeszeti: 'extractio',
  implantatum_beultes: 'implant_insertion',
  gyogyulasi_sapka: 'healing_cap',
  abutment: 'abutment',
  sinus_lift_nyilt: 'sinus_lift',
  sinus_lift_zart: 'sinus_lift',
  cbct: 'xray_cbct',
  panorama_rtg: 'xray_panorama',
  intraoralis_rtg: 'xray_periapical',
  korona_cementalas: 'crown',
  korona_preparacio: 'crown_prep',
};

function passA(items: ExpandedItem[]): ExpandedItem[] {
  const seen = new Set<string>(); // key: "visitNum::toothFdi::category"
  return items.filter(item => {
    const category = TREATMENT_CATEGORIES[item.actionSlug];
    if (!category) return true; // no category → always keep

    const toothKey = item.toothFdi ?? 'full';
    const key = `${item.visitNum}::${toothKey}::${category}`;
    if (seen.has(key)) return false; // duplicate
    seen.add(key);
    return true;
  });
}


// ── Pass B: Klinikai sorrend ellenőrzés ──
// Ha egy fogat elhúztak, utána nem lehet rá tömést/koronát (kivéve implant után).
// Ha egy fogra koronát adtak, utána nem kell rá gyógyulási sapka.
const CONSERVATIVE_ACTIONS = new Set([
  'kompozit_tomes_1_felszin', 'kompozit_tomes_tobb_felszin', 'frontfog_tomes',
  'trepanalas', 'csatorna_feltaras', 'gyokertomes', 'korona_preparacio',
  'korona_cementalas', 'barzdazaras',
]);

function passB(items: ExpandedItem[]): ExpandedItem[] {
  // Track what has happened per tooth across visits
  const toothHistory = new Map<string, Set<string>>(); // toothFdi → set of action categories

  // Sort by visitNum to process in order
  const sorted = [...items].sort((a, b) => a.visitNum - b.visitNum);
  const result: ExpandedItem[] = [];

  for (const item of sorted) {
    const toothKey = item.toothFdi ? String(item.toothFdi) : null;
    if (!toothKey) {
      result.push(item);
      continue;
    }

    if (!toothHistory.has(toothKey)) {
      toothHistory.set(toothKey, new Set());
    }
    const history = toothHistory.get(toothKey)!;

    // Rule: if tooth was extracted and no implant placed, reject conservative actions
    if (history.has('extracted') && !history.has('implanted')) {
      if (CONSERVATIVE_ACTIONS.has(item.actionSlug)) continue; // skip
    }

    // Rule: if crown already cemented, no healing cap needed
    if (history.has('crowned') && item.actionSlug === 'gyogyulasi_sapka') continue;

    // Track events
    if (item.actionSlug === 'extractio_egyszeru' || item.actionSlug === 'extractio_sebeszeti') {
      history.add('extracted');
    }
    if (item.actionSlug === 'implantatum_beultes') {
      history.add('implanted');
    }
    if (item.actionSlug === 'korona_cementalas') {
      history.add('crowned');
    }

    result.push(item);
  }

  return result;
}


// ── Pass C: Pozíció és mennyiség szűrés ──
// Sinus lift: csak felső hátsó fogaknál (FDI 14-18, 24-28)
// Röntgen: max 2 felvétel típusonként per vizit
// Műtéti előkészítés: max 2 per vizit
const QUANTITY_LIMITS: Record<string, number> = {
  panorama_rtg: 2,
  cbct: 2,
  intraoralis_rtg: 2,
  muteti_elokeszites: 2,
};

function passC(items: ExpandedItem[]): ExpandedItem[] {
  const counts = new Map<string, number>(); // "visitNum::slug" → count
  return items.filter(item => {
    // Sinus lift anatomical check
    if (item.actionSlug === 'sinus_lift_nyilt' || item.actionSlug === 'sinus_lift_zart') {
      if (item.toothFdi) {
        const quadrant = Math.floor(item.toothFdi / 10);
        const position = item.toothFdi % 10;
        // Only upper quadrants (1, 2) and posterior teeth (position >= 4)
        if (quadrant !== 1 && quadrant !== 2) return false;
        if (position < 4) return false;
      }
    }

    // Quantity limits
    const limit = QUANTITY_LIMITS[item.actionSlug];
    if (limit !== undefined) {
      const key = `${item.visitNum}::${item.actionSlug}`;
      const current = counts.get(key) || 0;
      if (current >= limit) return false;
      counts.set(key, current + 1);
    }

    return true;
  });
}


// ── Pass D: Márka konzisztencia ──
// Ha az orvos Nobel-t mond, csak Nobel tételek maradnak a márka-specifikus akcióknál.
const BRAND_SPECIFIC_ACTIONS = new Set([
  'implantatum_beultes', 'abutment', 'gyogyulasi_sapka', 'implant_korona', 'scan_body',
]);

const KNOWN_BRANDS = [
  'Nobel', 'Nobel-Biocare', 'Alpha-Bio', 'Straumann', 'MegaGen',
  'Osstem', 'Biomet', 'Zimmer', 'Bredent', 'Dentium', 'MIS',
];

function passD(items: ExpandedItem[]): ExpandedItem[] {
  // Detect the brand mentioned in any item
  let detectedBrand: string | null = null;

  for (const item of items) {
    const brand = item.parameters.brand as string;
    if (brand) {
      detectedBrand = brand;
      break;
    }
  }

  if (!detectedBrand) return items; // no brand → no filtering

  // Filter: brand-specific actions must match the detected brand
  const filtered = items.filter(item => {
    if (!BRAND_SPECIFIC_ACTIONS.has(item.actionSlug)) return true; // not brand-specific → keep

    const itemBrand = item.parameters.brand as string;
    if (!itemBrand) return true; // no brand on this item → keep (generic)

    // Check if brands match (case-insensitive, partial match)
    const normalizedDetected = detectedBrand!.toLowerCase();
    const normalizedItem = itemBrand.toLowerCase();
    return normalizedItem.includes(normalizedDetected) || normalizedDetected.includes(normalizedItem);
  });

  // Safety net: if filtering would remove everything brand-specific, don't filter
  const brandItems = items.filter(i => BRAND_SPECIFIC_ACTIONS.has(i.actionSlug));
  const filteredBrandItems = filtered.filter(i => BRAND_SPECIFIC_ACTIONS.has(i.actionSlug));
  if (brandItems.length > 0 && filteredBrandItems.length === 0) {
    return items; // safety net — keep original
  }

  return filtered;
}


// ── Pass E: Viziteken átívelő duplikáció ──
// Egy fogra csak egyszer lehet implantátumot beültetni.
// Egy fogat csak egyszer lehet elhúzni.
const ONCE_PER_TOOTH_ACTIONS = new Set([
  'implantatum_beultes',
  'extractio_egyszeru',
  'extractio_sebeszeti',
]);

function passE(items: ExpandedItem[]): ExpandedItem[] {
  const seen = new Map<string, number>(); // "toothFdi::actionCategory" → first visitNum
  return items.filter(item => {
    if (!item.toothFdi) return true;
    if (!ONCE_PER_TOOTH_ACTIONS.has(item.actionSlug)) return true;

    const key = `${item.toothFdi}::${item.actionSlug}`;
    if (seen.has(key)) return false; // duplicate — keep only first
    seen.set(key, item.visitNum);
    return true;
  });
}


// ── Run all passes ──
export interface ValidationReport {
  removedByPassA: number;
  removedByPassB: number;
  removedByPassC: number;
  removedByPassD: number;
  removedByPassE: number;
  totalRemoved: number;
}

export function runClinicalValidation(items: ExpandedItem[]): {
  items: ExpandedItem[];
  report: ValidationReport;
} {
  const original = items.length;

  let result = passA(items);
  const afterA = result.length;

  result = passB(result);
  const afterB = result.length;

  result = passC(result);
  const afterC = result.length;

  result = passD(result);
  const afterD = result.length;

  result = passE(result);
  const afterE = result.length;

  return {
    items: result,
    report: {
      removedByPassA: original - afterA,
      removedByPassB: afterA - afterB,
      removedByPassC: afterB - afterC,
      removedByPassD: afterC - afterD,
      removedByPassE: afterD - afterE,
      totalRemoved: original - afterE,
    },
  };
}
