// ============================================================
// TreatNote V2 — Pipeline Stage 03: Validate
// Paraméter-validáció + default-hierarchia feltöltés
// ============================================================

import { ACTION_BY_SLUG } from './catalog/atomic-actions.ts';
import { GLOBAL_DEFAULTS } from './catalog/defaults.ts';
import { getToothRegion } from './tooth-utils.ts';
import type { ProtocolInstance, AtomicActionInstance } from './types.ts';

export interface ValidationWarning {
  actionSlug: string;
  field: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface ValidateResult {
  protocols: ProtocolInstance[];
  warnings: ValidationWarning[];
}

/** Validate and fill defaults for all protocol instances */
export function validateAndFillDefaults(
  protocols: ProtocolInstance[],
  clinicDefaults: Record<string, unknown> = {}
): ValidateResult {
  const warnings: ValidationWarning[] = [];

  const validated = protocols.map(protocol => ({
    ...protocol,
    atomicActions: protocol.atomicActions.map(action => {
      const def = ACTION_BY_SLUG.get(action.slug);
      if (!def) {
        warnings.push({
          actionSlug: action.slug,
          field: 'slug',
          message: `Ismeretlen atomi akció: ${action.slug}`,
          severity: 'error',
        });
        return action;
      }

      const params = { ...action.parameters };

      // Fill defaults from hierarchy: utterance > clinic > global
      for (const paramDef of def.parameters) {
        if (params[paramDef.name] !== undefined) continue; // AI already filled it

        // Try clinic defaults
        const clinicKey = `${def.slug}.${paramDef.name}`;
        if (clinicDefaults[clinicKey] !== undefined) {
          params[paramDef.name] = clinicDefaults[clinicKey];
          continue;
        }

        // Try global defaults based on context
        if (paramDef.name === 'canal_count' && params['tooth_fdi']) {
          const toothFdi = params['tooth_fdi'] as number;
          const region = getToothRegion(toothFdi);
          if (region && GLOBAL_DEFAULTS.csatornaszam[region]) {
            params[paramDef.name] = GLOBAL_DEFAULTS.csatornaszam[region];
            warnings.push({
              actionSlug: action.slug,
              field: 'canal_count',
              message: `Default csatornaszám (${GLOBAL_DEFAULTS.csatornaszam[region]}) a ${toothFdi} fog régiója alapján`,
              severity: 'info',
            });
          }
        }

        // Use parameter's own default
        if (params[paramDef.name] === undefined && paramDef.default !== undefined) {
          params[paramDef.name] = paramDef.default;
        }
      }

      // Validate required params
      for (const paramDef of def.parameters) {
        if (paramDef.required && params[paramDef.name] === undefined) {
          warnings.push({
            actionSlug: action.slug,
            field: paramDef.name,
            message: `Kötelező paraméter hiányzik: ${paramDef.name}`,
            severity: 'warning',
          });
        }
      }

      // Validate FDI range
      if (params['tooth_fdi']) {
        const fdi = params['tooth_fdi'] as number;
        if (fdi < 11 || fdi > 48 || fdi % 10 === 0 || fdi % 10 > 8) {
          warnings.push({
            actionSlug: action.slug,
            field: 'tooth_fdi',
            message: `Érvénytelen FDI fogszám: ${fdi}`,
            severity: 'error',
          });
        }
      }

      return { ...action, parameters: params } as AtomicActionInstance;
    }),
  }));

  return { protocols: validated, warnings };
}
