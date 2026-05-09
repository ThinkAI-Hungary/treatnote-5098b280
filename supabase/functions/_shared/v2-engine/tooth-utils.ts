// ============================================================
// TreatNote V2 — FDI Tooth Utilities (Edge Function version)
// ============================================================

import type { ToothRegion } from './types.ts';

/** FDI fogszámok régiónkénti csoportosítása */
const REGION_MAP: Record<ToothRegion, number[]> = {
  felso_metszok: [11, 12, 21, 22],
  also_metszok: [31, 32, 41, 42],
  szemfogak: [13, 23, 33, 43],
  felso_premolarisok: [14, 15, 24, 25],
  also_premolarisok: [34, 35, 44, 45],
  felso_molarisok: [16, 17, 18, 26, 27, 28],
  also_molarisok: [36, 37, 38, 46, 47, 48],
};

export function getToothRegion(fdi: number): ToothRegion | null {
  for (const [region, teeth] of Object.entries(REGION_MAP)) {
    if (teeth.includes(fdi)) return region as ToothRegion;
  }
  return null;
}

export function isUpperTooth(fdi: number): boolean {
  return fdi >= 11 && fdi <= 28;
}

export function isLowerTooth(fdi: number): boolean {
  return fdi >= 31 && fdi <= 48;
}

export function isMolar(fdi: number): boolean {
  const unit = fdi % 10;
  return unit >= 6 && unit <= 8;
}

export function isPremolar(fdi: number): boolean {
  const unit = fdi % 10;
  return unit === 4 || unit === 5;
}

export function isAnterior(fdi: number): boolean {
  const unit = fdi % 10;
  return unit >= 1 && unit <= 3;
}

export function isFrontTooth(fdi: number): boolean {
  const unit = fdi % 10;
  return unit === 1 || unit === 2;
}
