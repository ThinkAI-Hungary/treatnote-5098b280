import { DENTAL_STATUSES } from './constants';

export interface ToothColorScheme {
  /** SVG fill color for the crown */
  mainColor: string;
  /** Root stroke color */
  rootColor: string;
  /** Badge/indicator color for multi-status */
  badgeColor: string;
  /** Whether the tooth should show as "absent" (dashed outline) */
  isAbsent: boolean;
  /** Whether the tooth has a treatment plan marker */
  hasPlanMarker: boolean;
}

/**
 * Resolves the visual color scheme for a tooth based on its comma-separated
 * production status string.  Priority order (first match wins):
 * 1. missing / foghiány → absent placeholder
 * 2. Caries group        → red
 * 3. Tömés group         → blue
 * 4. Korona group        → amber
 * 5. Híd group           → purple
 * 6. Implant group       → emerald
 * 7. Gyökértömés group   → pink
 * 8. Protézis group      → indigo
 * 9. Periapicalis group  → orange
 * 10. Speciális group    → orange (special markers)
 * 11. Betétek group      → teal
 * 12. Héjak group        → cyan
 * 13. Csonkfelépítés     → slate
 * 14. Default healthy    → theme primary
 */
export function getToothColors(status: string | undefined): ToothColorScheme {
  if (!status || status === 'healthy') {
    return {
      mainColor: 'hsl(var(--muted) / 0.5)',
      rootColor: 'hsl(var(--border))',
      badgeColor: '',
      isAbsent: false,
      hasPlanMarker: false,
    };
  }

  const statuses = status.split(',').map(s => s.trim());
  
  // Check for plan markers
  const hasPlanMarker = statuses.some(s => 
    s === 'teeth_extraction_mark' || s === 'crown_needed' || s === 'replace_needed'
  );

  // Check for missing
  if (statuses.includes('missing') || statuses.includes('missing_closed')) {
    return {
      mainColor: '#9ca3af',
      rootColor: '#9ca3af',
      badgeColor: '',
      isAbsent: true,
      hasPlanMarker,
    };
  }

  // Find the first status definition with a group for coloring priority
  for (const sid of statuses) {
    const def = DENTAL_STATUSES.find(s => s.id === sid);
    if (!def) continue;

    const group = def.group;
    const colors = GROUP_COLORS[group];
    if (colors) {
      return {
        mainColor: colors.main,
        rootColor: colors.root,
        badgeColor: colors.badge,
        isAbsent: false,
        hasPlanMarker,
      };
    }
  }

  // Fallback: has a non-healthy status but no group match
  return {
    mainColor: 'hsl(var(--primary))',
    rootColor: 'hsl(var(--muted-foreground))',
    badgeColor: 'hsl(var(--primary))',
    isAbsent: false,
    hasPlanMarker,
  };
}

const GROUP_COLORS: Record<string, { main: string; root: string; badge: string }> = {
  'Caries':              { main: '#ef4444', root: '#ef4444', badge: '#ef4444' },
  'Caries (szekunder)':  { main: '#dc2626', root: '#dc2626', badge: '#dc2626' },
  'Tömés':               { main: '#3b82f6', root: '#3b82f6', badge: '#3b82f6' },
  'Korona':              { main: '#f59e0b', root: '#f59e0b', badge: '#f59e0b' },
  'Híd':                 { main: '#8b5cf6', root: '#8b5cf6', badge: '#8b5cf6' },
  'Implant':             { main: '#10b981', root: '#10b981', badge: '#10b981' },
  'Felépítmények':       { main: '#059669', root: '#059669', badge: '#059669' },
  'Gyökértömés':         { main: '#ec4899', root: '#ec4899', badge: '#ec4899' },
  'Retrográd gyökértömés': { main: '#db2777', root: '#db2777', badge: '#db2777' },
  'Protézis':            { main: '#6366f1', root: '#6366f1', badge: '#6366f1' },
  'Periapicalis':        { main: '#f97316', root: '#f97316', badge: '#f97316' },
  'Gyökércsap':          { main: '#a855f7', root: '#a855f7', badge: '#a855f7' },
  'Speciális':           { main: '#f97316', root: '#f97316', badge: '#f97316' },
  'Betétek':             { main: '#14b8a6', root: '#14b8a6', badge: '#14b8a6' },
  'Héjak':               { main: '#06b6d4', root: '#06b6d4', badge: '#06b6d4' },
  'Csonkfelépítés':      { main: '#64748b', root: '#64748b', badge: '#64748b' },
  'Élpótlás':            { main: '#0ea5e9', root: '#0ea5e9', badge: '#0ea5e9' },
  'Letört fog':          { main: '#f97316', root: '#f97316', badge: '#f97316' },
  'Általános':           { main: '#6b7280', root: '#6b7280', badge: '#6b7280' },
  'Ideiglenes ragasztás':{ main: '#fbbf24', root: '#fbbf24', badge: '#fbbf24' },
};

/**
 * Returns a human-readable status label for a (potentially multi-) status string.
 */
export function getStatusLabel(status: string | undefined): string {
  if (!status || status === 'healthy') return 'Egészséges';
  const statuses = status.split(',').map(s => s.trim());
  const labels = statuses.map(sid => {
    const def = DENTAL_STATUSES.find(s => s.id === sid);
    return def?.name || sid;
  });
  return labels.join(', ');
}

// ============ Surface helpers ============

export type SurfaceId = 'M' | 'O' | 'D' | 'V' | 'L' | 'C';

export interface SurfaceEntry {
  statusId: string;
  surfaces: SurfaceId[];
  color: string;
}

/**
 * Parses the pipe-delimited surface string from the database into
 * structured entries with resolved colors.
 *
 * Input format: "caries:M,O|filling_esthetic:D,V"
 * Output: [{ statusId: "caries", surfaces: ["M","O"], color: "#ef4444" }, ...]
 */
export function parseSurfaces(surfaceStr: string | null | undefined): SurfaceEntry[] {
  if (!surfaceStr) return [];

  // Handle legacy format (just "M,O,D" without status prefix)
  if (!surfaceStr.includes(':')) return [];

  return surfaceStr.split('|').map(part => {
    const [statusId, surfaceCsv] = part.split(':');
    const surfaces = (surfaceCsv || '').split(',').map(s => s.trim()).filter(Boolean) as SurfaceId[];
    return {
      statusId: statusId.trim(),
      surfaces,
      color: getSurfaceColor(statusId.trim()),
    };
  }).filter(e => e.surfaces.length > 0);
}

/**
 * Returns the fill color for a given status ID, used for surface overlay rects.
 */
export function getSurfaceColor(statusId: string): string {
  const def = DENTAL_STATUSES.find(s => s.id === statusId);
  if (!def) return '#6b7280'; // fallback gray

  const group = def.group;
  const colors = GROUP_COLORS[group];
  return colors?.main || '#6b7280';
}
