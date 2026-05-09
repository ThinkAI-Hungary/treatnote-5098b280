// ============================================================
// TreatNote V2 — Pipeline Stage 05: Map
// Atomi akciók → klinika szótár tételek (DB lookup)
// ============================================================

import { queryAll } from '../db/client.js';
import type { ExpandedItem } from './04-expand.js';

export interface MappedItem {
  actionSlug: string;
  actionName: string;
  toothFdi: number | null;
  quantity: number;
  scaling: string;
  visitNum: number;
  templateSlug: string | null;
  clinicalPhase: string | null;
  // Mapping result
  szotarKezelesId: string | null;
  szotarKezelesName: string | null;
  confidence: number;
  reviewed: boolean;
  // Original parameters for ERP
  parameters: Record<string, unknown>;
}

export interface MapResult {
  items: MappedItem[];
  unmapped: string[];   // action slugs with no mapping
}

interface DbMapping {
  szotar_kezeles_id: string;
  szotar_kezeles_name: string;
  conditions: string;
  confidence: number;
  reviewed: number;
}

/** Map expanded items to clinic-specific items using v2_clinic_mappings */
export function mapToClinicItems(
  expandedItems: ExpandedItem[],
  telephelyId: string
): MapResult {
  const items: MappedItem[] = [];
  const unmapped: string[] = [];

  // Load all mappings for this telephely
  const mappings = queryAll<DbMapping>(
    `SELECT szotar_kezeles_id, szotar_kezeles_name, atomic_action_slug, conditions, confidence, reviewed
     FROM v2_clinic_mappings WHERE telephely_id = ?`,
    [telephelyId]
  ) as (DbMapping & { atomic_action_slug: string })[];

  // Index by slug
  const mappingIndex = new Map<string, (DbMapping & { atomic_action_slug: string })[]>();
  for (const m of mappings) {
    const arr = mappingIndex.get(m.atomic_action_slug) || [];
    arr.push(m);
    mappingIndex.set(m.atomic_action_slug, arr);
  }

  for (const item of expandedItems) {
    // Derive tooth_region from FDI number if not already present
    if (item.toothFdi && !item.parameters['tooth_region']) {
      const fdi = typeof item.toothFdi === 'string' ? parseInt(item.toothFdi) : item.toothFdi;
      const toothNum = fdi % 10; // last digit = tooth position in quadrant
      if (toothNum >= 1 && toothNum <= 3) item.parameters['tooth_region'] = 'front';
      else if (toothNum >= 4 && toothNum <= 5) item.parameters['tooth_region'] = 'premolar';
      else if (toothNum >= 6 && toothNum <= 8) item.parameters['tooth_region'] = 'molar';
    }
    const candidates = mappingIndex.get(item.actionSlug) || [];

    if (candidates.length === 0) {
      unmapped.push(item.actionSlug);
      items.push({
        ...item,
        szotarKezelesId: null,
        szotarKezelesName: null,
        confidence: 0,
        reviewed: false,
      });
      continue;
    }

    // Find best matching candidate based on conditions
    let bestMatch = candidates[0];
    let bestScore = -1;

    for (const candidate of candidates) {
      const conditions = JSON.parse(candidate.conditions || '{}');
      const conditionKeys = Object.keys(conditions);
      let score = candidate.confidence;

      if (conditionKeys.length === 0) {
        // Generic (no-condition) mapping — baseline
        score = candidate.confidence;
      } else {
        // Condition-specific mapping — strongly prefer if conditions match
        let allMatch = true;
        for (const [key, value] of Object.entries(conditions)) {
          const paramValue = item.parameters[key];
          if (paramValue !== undefined && paramValue == value) {
            score += 0.5; // STRONG boost for condition match
          } else if (paramValue !== undefined) {
            score -= 1.0; // Heavy penalty for mismatch
            allMatch = false;
          }
          // If param not present, no penalty — generic fallback
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    items.push({
      ...item,
      szotarKezelesId: bestMatch.szotar_kezeles_id,
      szotarKezelesName: bestMatch.szotar_kezeles_name,
      confidence: bestMatch.confidence,
      reviewed: bestMatch.reviewed === 1,
    });
  }

  return { items, unmapped: [...new Set(unmapped)] };
}
