// ============================================================
// TreatNote V2 — Pipeline Stage 04: Expand
// Scaling processor + multi-visit injection + clinical phase ordering
// ============================================================

import { ACTION_BY_SLUG } from '../catalog/atomic-actions.js';
import type { ProtocolInstance } from '../shared/types.js';
import { MULTI_VISIT } from './visit-definitions.js';
import { ACTION_TO_PHASE, CLINICAL_PHASES } from './clinical-phases.js';

export interface ExpandedItem {
  actionSlug: string;
  actionName: string;
  toothFdi: number | null;
  quantity: number;
  scaling: string;
  parameters: Record<string, unknown>;
  visitNum: number;              // GLOBAL visit number (1-based, after phase ordering)
  templateSlug: string | null;
  clinicalPhase: string | null;  // e.g. 'extractio', 'implantacio_sebeszeti'
}

export interface ExpandResult {
  items: ExpandedItem[];
}

const TOOTH_SPECIFIC_SCALING = ['per_tooth', 'per_canal', 'per_surface', 'per_unit'];

function resolveToothFdi(
  actionParams: Record<string, unknown>,
  protocolParams: Record<string, unknown>,
  scaling: string
): number | null {
  const rawFdi = (actionParams.tooth_fdi as number) || (protocolParams.tooth_fdi as number) || null;
  return TOOTH_SPECIFIC_SCALING.includes(scaling) ? rawFdi : null;
}

function computeQuantity(
  scaling: string,
  actionParams: Record<string, unknown>,
  protocolParams: Record<string, unknown>
): number {
  switch (scaling) {
    case 'per_canal':
      return (actionParams.canal_count as number) || (protocolParams.canal_count as number) || 1;
    case 'per_surface': {
      const surfaces = actionParams.surfaces as string[];
      return surfaces ? surfaces.length : 1;
    }
    case 'per_arch': {
      const arch = (actionParams.arch as string) || 'felso';
      return arch === 'mindketto' ? 2 : 1;
    }
    case 'per_unit':
      return (actionParams.quantity as number) || 1;
    default:
      return 1;
  }
}

/**
 * Determine the dominant clinical phase for a protocol's actions.
 * Used for _inherit actions (anesztezia, kofferdam, etc.)
 */
function getDominantPhase(actionSlugs: string[]): string {
  let maxPriority = -Infinity;
  let dominant = 'konzervalo';

  for (const slug of actionSlugs) {
    const phaseSlug = ACTION_TO_PHASE[slug];
    if (!phaseSlug || phaseSlug === '_inherit') continue;
    const phase = CLINICAL_PHASES.find(p => p.slug === phaseSlug);
    if (phase && phase.priority > maxPriority) {
      maxPriority = phase.priority;
      dominant = phase.slug;
    }
  }
  return dominant;
}

/** Resolve clinical phase for an action, handling _inherit */
function resolvePhase(actionSlug: string, dominantPhase: string): string {
  const phaseSlug = ACTION_TO_PHASE[actionSlug];
  if (!phaseSlug || phaseSlug === '_inherit') return dominantPhase;
  return phaseSlug;
}

// ── Pre-expand: build raw items with LOCAL visit numbers ──
interface RawExpandedItem {
  actionSlug: string;
  actionName: string;
  toothFdi: number | null;
  quantity: number;
  scaling: string;
  parameters: Record<string, unknown>;
  localVisitNum: number;       // visit within this protocol
  templateSlug: string | null;
  clinicalPhase: string;
  protocolIndex: number;       // which protocol it belongs to
}

/** Expand protocol instances into flat items with clinical phase ordering */
export function expandProtocols(protocols: ProtocolInstance[]): ExpandResult {
  const rawItems: RawExpandedItem[] = [];

  for (let pi = 0; pi < protocols.length; pi++) {
    const protocol = protocols[pi];
    const templateSlug = protocol.templateSlug;
    const multiVisit = templateSlug ? MULTI_VISIT[templateSlug] : null;

    // Determine dominant phase from protocol's extracted actions
    const extractedSlugs = protocol.atomicActions.map(a => a.slug);
    const dominantPhase = getDominantPhase(extractedSlugs);

    // Track which multi-visit visits have been covered
    const coveredVisits = new Set<number>();

    // --- Process LLM-extracted actions ---
    for (const action of protocol.atomicActions) {
      const def = ACTION_BY_SLUG.get(action.slug);
      if (!def) continue;

      let localVisitNum = 1;
      if (templateSlug && multiVisit) {
        for (const v of multiVisit) {
          if (v.actions.includes(action.slug)) {
            localVisitNum = v.visit;
            coveredVisits.add(v.visit);
            break;
          }
        }
      }

      const phase = resolvePhase(action.slug, dominantPhase);
      const toothFdi = resolveToothFdi(action.parameters, protocol.parameters, def.scaling);
      const quantity = computeQuantity(def.scaling, action.parameters, protocol.parameters);

      rawItems.push({
        actionSlug: action.slug,
        actionName: def.nameHu,
        toothFdi,
        quantity,
        scaling: def.scaling,
        parameters: action.parameters,
        localVisitNum,
        templateSlug,
        clinicalPhase: phase,
        protocolIndex: pi,
      });
    }

    // --- Inject future visit actions from multi-visit template ---
    if (multiVisit) {
      for (const visitDef of multiVisit) {
        if (coveredVisits.has(visitDef.visit)) continue;

        for (const actionSlug of visitDef.actions) {
          const def = ACTION_BY_SLUG.get(actionSlug);
          if (!def) continue;

          const futureParams: Record<string, unknown> = {};
          if (protocol.parameters.tooth_fdi) futureParams.tooth_fdi = protocol.parameters.tooth_fdi;
          if (protocol.parameters.brand) futureParams.brand = protocol.parameters.brand;

          // For future visits, determine dominant phase from THAT visit's actions
          const visitActionSlugs = visitDef.actions;
          const visitDominant = getDominantPhase(visitActionSlugs);
          const phase = resolvePhase(actionSlug, visitDominant);

          const toothFdi = resolveToothFdi(futureParams, protocol.parameters, def.scaling);
          const quantity = computeQuantity(def.scaling, futureParams, protocol.parameters);

          rawItems.push({
            actionSlug,
            actionName: def.nameHu,
            toothFdi,
            quantity,
            scaling: def.scaling,
            parameters: futureParams,
            localVisitNum: visitDef.visit,
            templateSlug,
            clinicalPhase: phase,
            protocolIndex: pi,
          });
        }
      }
    }
  }

  // ── Phase F: Global visit ordering ──
  //
  // The dictation is a TREATMENT PLAN.
  //
  // Approach:
  // 1. Sort PROTOCOLS by their V1 (entry) phase priority
  // 2. Lay out each protocol's visits sequentially (V1, V2, V3...)
  // 3. Protocols with the same entry priority share V1 (parallel)
  // 4. Sequential protocols: P_B.V1 starts after P_A's LAST visit

  // ── Step 1: Determine each protocol's entry priority ──
  interface ProtocolMeta {
    protocolIndex: number;
    entryPriority: number;     // phase priority of V1 actions
    localVisits: Map<number, RawExpandedItem[]>;  // localVisitNum → items
    maxLocalVisit: number;
  }

  const protocolMetas: ProtocolMeta[] = [];
  const protoMap = new Map<number, ProtocolMeta>();

  for (const item of rawItems) {
    if (!protoMap.has(item.protocolIndex)) {
      const meta: ProtocolMeta = {
        protocolIndex: item.protocolIndex,
        entryPriority: -1,
        localVisits: new Map(),
        maxLocalVisit: 0,
      };
      protoMap.set(item.protocolIndex, meta);
      protocolMetas.push(meta);
    }
    const meta = protoMap.get(item.protocolIndex)!;

    if (!meta.localVisits.has(item.localVisitNum)) {
      meta.localVisits.set(item.localVisitNum, []);
    }
    meta.localVisits.get(item.localVisitNum)!.push(item);

    if (item.localVisitNum > meta.maxLocalVisit) {
      meta.maxLocalVisit = item.localVisitNum;
    }

    // Entry priority = max priority of V1 actions
    if (item.localVisitNum === 1) {
      const phaseDef = CLINICAL_PHASES.find(p => p.slug === item.clinicalPhase);
      const prio = phaseDef?.priority ?? -1;
      if (prio > meta.entryPriority) meta.entryPriority = prio;
    }
  }

  // ── Step 2: Sort protocols by entry priority ──
  protocolMetas.sort((a, b) => {
    const priA = a.entryPriority === -1 ? 100 : a.entryPriority;
    const priB = b.entryPriority === -1 ? 100 : b.entryPriority;
    if (priA !== priB) return priA - priB;
    return a.protocolIndex - b.protocolIndex;
  });

  // ── Step 3: Assign global visit numbers ──
  // Walk protocols in sorted order. Each protocol lays out its visits sequentially.
  // Same-priority protocols share V1 (parallel start).
  // Independent (-1) protocols attach to the first visit (can be done anytime).
  let nextGlobalVisit = 1;
  let lastEntryPriority = -Infinity;
  let isFirstProtocol = true;

  for (const meta of protocolMetas) {
    const isIndependent = meta.entryPriority === -1;
    const currentPriority = isIndependent ? 100 : meta.entryPriority;

    if (isIndependent) {
      // Independent protocols (konzerváló): attach V1 to the FIRST visit (vizit_1)
      // Their multi-visit follow-ups still get sequential visits after that
      const v1GlobalVisit = 1;

      const sortedLocalVisits = [...meta.localVisits.keys()].sort((a, b) => a - b);
      let currentVisit = v1GlobalVisit;
      for (const localVisit of sortedLocalVisits) {
        if (localVisit > sortedLocalVisits[0]) {
          currentVisit = nextGlobalVisit + 1;
          nextGlobalVisit = currentVisit;
        }
        const items = meta.localVisits.get(localVisit)!;
        for (const item of items) {
          (item as any)._globalVisit = currentVisit;
        }
      }
    } else {
      // Normal protocols: phase-based ordering
      if (!isFirstProtocol && currentPriority !== lastEntryPriority) {
        nextGlobalVisit++;
      }

      const v1GlobalVisit = nextGlobalVisit;
      const sortedLocalVisits = [...meta.localVisits.keys()].sort((a, b) => a - b);

      let currentVisit = v1GlobalVisit;
      for (const localVisit of sortedLocalVisits) {
        if (localVisit > sortedLocalVisits[0]) {
          currentVisit++;
        }
        const items = meta.localVisits.get(localVisit)!;
        for (const item of items) {
          (item as any)._globalVisit = currentVisit;
        }
      }

      if (currentVisit >= nextGlobalVisit) {
        nextGlobalVisit = currentVisit;
      }

      lastEntryPriority = currentPriority;
      isFirstProtocol = false;
    }
  }

  // Build final items
  const items: ExpandedItem[] = rawItems.map(raw => ({
    actionSlug: raw.actionSlug,
    actionName: raw.actionName,
    toothFdi: raw.toothFdi,
    quantity: raw.quantity,
    scaling: raw.scaling,
    parameters: raw.parameters,
    visitNum: (raw as any)._globalVisit || 1,
    templateSlug: raw.templateSlug,
    clinicalPhase: raw.clinicalPhase,
  }));

  return { items };
}
