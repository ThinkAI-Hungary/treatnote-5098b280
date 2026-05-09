// ============================================================
// TreatNote V2 — Atomic Actions Catalog (összefogó)
// ============================================================

import type { AtomicAction } from '../shared/types.js';
import { KONZERVALO } from './actions-konzervalo.js';
import { FOGPOTLASTAN } from './actions-fogpotlastan.js';
import { SZAJSEBESZET, IMPLANTACIO, PARODONTOLOGIA } from './actions-surgical.js';
import { DIAGNOSZTIKA, KOZOS, FOGSZABALYOZAS, EGYEB_KLINIKAI } from './actions-diagnostic-kozos.js';

/** Teljes atomi akció katalógus */
export const ATOMIC_ACTIONS: AtomicAction[] = [
  ...KONZERVALO,
  ...FOGPOTLASTAN,
  ...SZAJSEBESZET,
  ...IMPLANTACIO,
  ...PARODONTOLOGIA,
  ...DIAGNOSZTIKA,
  ...KOZOS,
  ...FOGSZABALYOZAS,
  ...EGYEB_KLINIKAI,
];

/** Slug alapján keresés */
export const ACTION_BY_SLUG = new Map<string, AtomicAction>(
  ATOMIC_ACTIONS.map(a => [a.slug, a])
);

/** Kategória alapján szűrés */
export function getActionsByCategory(category: string): AtomicAction[] {
  return ATOMIC_ACTIONS.filter(a => a.category === category);
}

// Re-export all
export { KONZERVALO, FOGPOTLASTAN, SZAJSEBESZET, IMPLANTACIO, PARODONTOLOGIA, DIAGNOSZTIKA, KOZOS, FOGSZABALYOZAS, EGYEB_KLINIKAI };
