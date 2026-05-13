// ============================================================
// TreatNote V2 — Pipeline Stage 05: Map STDL (Edge Function version)
// Atomi akciók → klinika STDL szótár tételek (Supabase lookup)
// ============================================================

import type { ExpandedItem } from './04-expand.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface MappedItemStdl {
  actionSlug: string;
  actionName: string;
  toothFdi: number | null;
  quantity: number;
  scaling: string;
  visitNum: number;
  templateSlug: string | null;
  clinicalPhase: string | null;
  // Mapping result
  szotarKezelesId: string | null; // Keep the same interface property name for compatibility with downstream
  szotarKezelesName: string | null;
  confidence: number;
  reviewed: boolean;
  // Original parameters for ERP
  parameters: Record<string, unknown>;
}

export interface MapResultStdl {
  items: MappedItemStdl[];
  unmapped: string[];   // action slugs with no mapping
}

interface DbMappingStdl {
  stdl_treatment_item_id: string;
  stdl_treatment_item_name: string;
  atomic_action_slug: string;
  conditions: Record<string, unknown>;
  confidence: number;
  reviewed: boolean;
}

/** Map expanded items to clinic-specific items using v2_clinic_mappings_stdl (Supabase) */
export async function mapToClinicItemsStdl(
  expandedItems: ExpandedItem[],
  telephelyId: string,
  supabase: SupabaseClient
): Promise<MapResultStdl> {
  const items: MappedItemStdl[] = [];
  const unmapped: string[] = [];

  // Load all mappings for this telephely from Supabase
  const { data: mappingsRaw, error } = await supabase
    .from('v2_clinic_mappings_stdl')
    .select('stdl_treatment_item_id, stdl_treatment_item_name, atomic_action_slug, conditions, confidence, reviewed')
    .eq('telephely_id', telephelyId);

  if (error) {
    throw new Error(`Failed to load v2_clinic_mappings_stdl: ${error.message}`);
  }

  const mappings: DbMappingStdl[] = (mappingsRaw || []).map((m: Record<string, unknown>) => ({
    stdl_treatment_item_id: m.stdl_treatment_item_id as string,
    stdl_treatment_item_name: m.stdl_treatment_item_name as string,
    atomic_action_slug: m.atomic_action_slug as string,
    conditions: (m.conditions as Record<string, unknown>) || {},
    confidence: m.confidence as number,
    reviewed: m.reviewed as boolean,
  }));

  // Index by slug
  const mappingIndex = new Map<string, DbMappingStdl[]>();
  for (const m of mappings) {
    const arr = mappingIndex.get(m.atomic_action_slug) || [];
    arr.push(m);
    mappingIndex.set(m.atomic_action_slug, arr);
  }

  for (const item of expandedItems) {
    // Derive tooth_region from FDI number if not already present
    if (item.toothFdi && !item.parameters['tooth_region']) {
      const fdi = typeof item.toothFdi === 'string' ? parseInt(item.toothFdi as unknown as string) : item.toothFdi;
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
      const conditions = candidate.conditions || {};
      const conditionKeys = Object.keys(conditions);
      let score = candidate.confidence;

      if (conditionKeys.length === 0) {
        // Generic (no-condition) mapping — baseline
        score = candidate.confidence;
      } else {
        // Condition-specific mapping — strongly prefer if conditions match
        for (const [key, value] of Object.entries(conditions)) {
          const paramValue = item.parameters[key];
          if (paramValue !== undefined && paramValue == value) {
            score += 0.5; // STRONG boost for condition match
          } else if (paramValue !== undefined) {
            score -= 1.0; // Heavy penalty for mismatch
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
      szotarKezelesId: bestMatch.stdl_treatment_item_id,
      szotarKezelesName: bestMatch.stdl_treatment_item_name,
      confidence: bestMatch.confidence,
      reviewed: bestMatch.reviewed,
    });
  }

  return { items, unmapped: [...new Set(unmapped)] };
}
