/**
 * Bidirectional mapping: Supabase `teeth` table ↔ frontend ToothData.
 *
 * DB model: individual fields (caries: bool, restoration: string, crown: string, ...)
 * Frontend: single `status` enum + per-surface `status` enum
 */

import type { ToothData, ToothStatus, ToothSurface } from '../store/dentalStore';

// ============ Supabase row type ============

export interface TeethRow {
  id?: string;
  examination_id: string;
  tooth_number: number;
  tooth_type: string;
  present: boolean | null;
  caries: boolean | null;
  caries_locations: string[] | null;
  restoration: string;
  restoration_locations: string[] | null;
  crown: string;
  bridge: string;
  prosthesis: string;
  endo_status: string;
  pathology: string;
  treatment_plan: string;
  mobility: number | null;
  fissure_sealing: boolean | null;
  notes: string | null;
}

// ============ Helpers ============

const SURFACE_MAP: Record<string, ToothSurface> = {
  mesial: 'mesial', distal: 'distal', occlusal: 'occlusal',
  buccal: 'buccal', lingual: 'lingual',
  m: 'mesial', d: 'distal', o: 'occlusal', b: 'buccal', l: 'lingual',
};

function normalizeSurface(s: string): ToothSurface | null {
  return SURFACE_MAP[s.toLowerCase().trim()] ?? null;
}

// ============ DB → Frontend ============

function deriveMainStatus(row: TeethRow): ToothStatus {
  if (row.present === false) return 'missing';
  if (row.treatment_plan === 'extraction') return 'extraction_planned';
  if (row.bridge === 'anchor') return 'bridge_anchor';
  if (row.bridge === 'pontic') return 'bridge_pontic';
  if (row.crown !== 'none' && row.crown) return 'crown';
  if (row.endo_status === 'treated' || row.endo_status === 'retreatment') return 'root_canal';
  if (row.restoration !== 'none' && row.restoration) return 'filled';
  if (row.caries) return 'caries';
  if (row.treatment_plan === 'implant' || row.prosthesis === 'fixed') return 'implant';
  return 'healthy';
}

function deriveSurfaceStatuses(row: TeethRow): Record<ToothSurface, ToothStatus> {
  const surfaces: Record<ToothSurface, ToothStatus> = {
    mesial: 'healthy', distal: 'healthy', occlusal: 'healthy',
    buccal: 'healthy', lingual: 'healthy',
  };
  if (row.restoration_locations) {
    for (const loc of row.restoration_locations) {
      const s = normalizeSurface(loc);
      if (s) surfaces[s] = 'filled';
    }
  }
  if (row.caries_locations) {
    for (const loc of row.caries_locations) {
      const s = normalizeSurface(loc);
      if (s) surfaces[s] = 'caries';
    }
  }
  return surfaces;
}

export function dbRowToToothData(row: TeethRow): ToothData {
  return {
    number: row.tooth_number,
    present: row.present ?? true,
    status: deriveMainStatus(row),
    surfaces: deriveSurfaceStatuses(row),
    mobility: row.mobility ?? 0,
    notes: row.notes ?? '',
    cariesLocations: (row.caries_locations ?? []).map(normalizeSurface).filter((s): s is ToothSurface => s !== null),
    restorationLocations: (row.restoration_locations ?? []).map(normalizeSurface).filter((s): s is ToothSurface => s !== null),
    endoStatus: (['none', 'treated', 'retreatment', 'planned'].includes(row.endo_status)
      ? row.endo_status : 'none') as ToothData['endoStatus'],
    crownType: (['none', 'metal', 'porcelain', 'zirconia', 'gold'].includes(row.crown)
      ? row.crown : 'none') as ToothData['crownType'],
  };
}

// ============ Frontend → DB ============

const ALL_SURFACES: ToothSurface[] = ['mesial', 'distal', 'occlusal', 'buccal', 'lingual'];

export function toothDataToDbRow(tooth: ToothData, examinationId: string): Omit<TeethRow, 'id'> {
  const cariesLocations = ALL_SURFACES.filter((s) => tooth.surfaces[s] === 'caries');
  const restorationLocations = ALL_SURFACES.filter((s) => tooth.surfaces[s] === 'filled');

  let crown = 'none';
  if (tooth.status === 'crown') crown = tooth.crownType !== 'none' ? tooth.crownType : 'porcelain';
  else if (tooth.crownType !== 'none') crown = tooth.crownType;

  let bridge = 'none';
  if (tooth.status === 'bridge_anchor') bridge = 'anchor';
  if (tooth.status === 'bridge_pontic') bridge = 'pontic';

  let treatmentPlan = 'none';
  if (tooth.status === 'extraction_planned') treatmentPlan = 'extraction';
  if (tooth.status === 'implant') treatmentPlan = 'implant';

  let restoration = 'none';
  if (tooth.status === 'filled' || restorationLocations.length > 0) restoration = 'composite';

  let prosthesis = 'none';
  if (tooth.status === 'implant') prosthesis = 'fixed';

  return {
    examination_id: examinationId,
    tooth_number: tooth.number,
    tooth_type: 'permanent',
    present: tooth.present,
    caries: tooth.status === 'caries' || cariesLocations.length > 0,
    caries_locations: cariesLocations,
    restoration,
    restoration_locations: restorationLocations,
    crown,
    bridge,
    prosthesis,
    endo_status: tooth.endoStatus,
    pathology: 'none',
    treatment_plan: treatmentPlan,
    mobility: tooth.mobility,
    fissure_sealing: false,
    notes: tooth.notes || null,
  };
}
