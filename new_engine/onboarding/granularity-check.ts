// ============================================================
// TreatNote V2 — Onboarding: Granularity Check
// Detektálja az aggregáló (bundle) tételeket a szótárban
// ============================================================

import { getSzotarByTelephely, type SzotarKezeles } from '../db/supabase.js';
import 'dotenv/config';

/** Bundle-gyanús jelzők */
const BUNDLE_SIGNALS = [
  /\ball.?on.?\d/i,
  /teljes.*(kezelés|rehabilitáció|ellátás)/i,
  /csomag/i,
  /komplett/i,
  /\+.*\+/,                    // "korona + lenyomat + ideiglenes"
  /tartalmaz/i,
  /benne van/i,
  /mindent tartalmaz/i,
  /kezelés.*és.*kezelés/i,
];

/** Ár-alapú gyanú: ha a klinika tételei között kiugróan magas ár van */
interface GranularityIssue {
  item: SzotarKezeles;
  reason: string;
  severity: 'warning' | 'error';
}

export async function checkGranularity(telephelyId: string): Promise<GranularityIssue[]> {
  console.log(`\n=== Granularity check: ${telephelyId} ===\n`);

  const items = await getSzotarByTelephely(telephelyId);
  console.log(`${items.length} items loaded`);

  const issues: GranularityIssue[] = [];

  for (const item of items) {
    // Check bundle signals in name
    for (const signal of BUNDLE_SIGNALS) {
      if (signal.test(item.name)) {
        issues.push({
          item,
          reason: `Bundle-gyanú: "${item.name}" illeszkedik: ${signal}`,
          severity: 'warning',
        });
        break;
      }
    }

    // Check if name contains multiple treatment keywords
    const treatmentKeywords = [
      'korona', 'lenyomat', 'tömés', 'gyökérkezelés', 'extractio',
      'implant', 'csontpótlás', 'membrán', 'kürett', 'depurálás',
    ];
    const matches = treatmentKeywords.filter(kw =>
      item.name.toLowerCase().includes(kw.toLowerCase())
    );
    if (matches.length >= 3) {
      issues.push({
        item,
        reason: `Több kezelés egy tételben: ${matches.join(', ')}`,
        severity: 'error',
      });
    }
  }

  // Summary
  console.log(`\nIssues found: ${issues.length}`);
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Warnings: ${warnings.length}`);

  if (issues.length > 0) {
    console.log('\nDetails:');
    for (const issue of issues) {
      const icon = issue.severity === 'error' ? '❌' : '⚠️';
      console.log(`  ${icon} ${issue.item.name}`);
      console.log(`     ${issue.reason}`);
    }
  }

  return issues;
}

// CLI
if (process.argv[1]?.includes('granularity-check')) {
  const telephelyId = process.argv[2] || process.env.TELEPHELY_ID || '79d8df9c-1795-4ef3-ba65-157c6635e9dd';
  checkGranularity(telephelyId).catch(console.error);
}
