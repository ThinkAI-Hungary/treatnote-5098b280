// ============================================================
// TreatNote V2 — Pipeline Stage 06: Format for RPA
// MapResult → treatnote.py kompatibilis JSON
// ============================================================

import type { MappedItem } from './05-map.ts';

export interface RpaVisitItem {
  vizit: string;        // "vizit_1", "vizit_2", ...
  fog: string;          // FDI szám stringként, vagy "teljesszajureg"
  name: string;         // szótár tétel neve (begépelődik a Flexi-Dent Select2-be)
}

export interface RpaOutput {
  vizitek: RpaVisitItem[];
}

/**
 * Format pipeline output for the treatnote.py RPA script.
 *
 * Rules:
 * 1. tooth_fdi → "fog" string; if null → "teljesszajureg"
 * 2. szotarKezelesName → "name" (exact name from clinic dictionary)
 * 3. per_session actions are deduplicated per visit (1× teljesszajureg)
 * 4. per_arch actions are deduplicated per visit
 * 5. Visit number comes from 04-expand (MULTI_VISIT injection)
 * 6. quantity > 1 → multiple entries
 */
export function formatForRpa(mappedItems: MappedItem[]): RpaOutput {
  const vizitek: RpaVisitItem[] = [];

  // Sort items by visitNum for proper ordering
  const sorted = [...mappedItems].sort((a, b) => a.visitNum - b.visitNum);

  // Track per_session and per_arch actions already added per visit to avoid duplicates
  // Key: "vizit_N::szotarKezelesName"
  const sessionDedup = new Set<string>();

  for (const item of sorted) {
    // Skip unmapped items
    if (!item.szotarKezelesName) continue;

    // Determine fog
    const fog = item.toothFdi ? String(item.toothFdi) : 'teljesszajureg';

    // Visit key from the expand stage
    const vizitKey = `vizit_${item.visitNum}`;

    // Per_session dedup: if scaling is per_session, only add once per visit
    if (item.scaling === 'per_session') {
      const dedupKey = `${vizitKey}::${item.szotarKezelesName}`;
      if (sessionDedup.has(dedupKey)) continue;
      sessionDedup.add(dedupKey);
    }

    // Per_arch dedup: also deduplicate per visit
    if (item.scaling === 'per_arch') {
      const dedupKey = `${vizitKey}::arch::${item.szotarKezelesName}`;
      if (sessionDedup.has(dedupKey)) continue;
      sessionDedup.add(dedupKey);
    }

    // Expand quantity (e.g., per_canal × 3)
    const qty = item.quantity || 1;
    for (let q = 0; q < qty; q++) {
      vizitek.push({
        vizit: vizitKey,
        fog,
        name: item.szotarKezelesName,
      });
    }
  }

  return { vizitek };
}
