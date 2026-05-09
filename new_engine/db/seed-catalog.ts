// ============================================================
// TreatNote V2 — Seed Catalog into SQLite
// Betölti az atomi akciókat és protokoll-template-eket a DB-be
// ============================================================

import { randomUUID } from 'crypto';
import { getDb, closeDb } from './client.js';
import { ATOMIC_ACTIONS } from '../catalog/atomic-actions.js';
import { PROTOCOL_TEMPLATES } from '../catalog/protocol-templates.js';
import { MULTI_VISIT } from '../pipeline/visit-definitions.js';

function seedAtomicActions(): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO v2_atomic_actions
      (id, slug, name_hu, category, parameter_schema, default_params, embedding_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const action of ATOMIC_ACTIONS) {
      // Check if slug already exists
      const existing = db.prepare('SELECT id FROM v2_atomic_actions WHERE slug = ?').get(action.slug) as { id: string } | undefined;
      const id = existing?.id || randomUUID();

      stmt.run(
        id,
        action.slug,
        action.nameHu,
        action.category,
        JSON.stringify(action.parameters),
        '{}',
        action.embeddingText,
      );
    }
  });
  tx();
  return ATOMIC_ACTIONS.length;
}

function seedProtocolTemplates(): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO v2_protocol_templates
      (id, slug, name_hu, category, triggers, atomic_actions, visits, description, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  // Derive category from template slug/content
  function deriveCategory(t: any): string {
    const slug = t.slug || '';
    if (slug.includes('implant') || slug.includes('sinus') || slug.includes('all_on')) return 'implantacio';
    if (slug.includes('extractio') || slug.includes('frenul') || slug.includes('csontpotlas')) return 'szajsebeszet';
    if (slug.includes('tomes') || slug.includes('amalgam') || slug.includes('gyoker') || slug.includes('inlay')) return 'konzervalo';
    if (slug.includes('korona') || slug.includes('hid') || slug.includes('veneer') || slug.includes('laminat')) return 'fogpotlastan';
    if (slug.includes('kurett') || slug.includes('paro') || slug.includes('dental') || slug.includes('iny')) return 'parodontologia';
    if (slug.includes('vizsgalat') || slug.includes('rtg') || slug.includes('diag')) return 'diagnosztika';
    if (slug.includes('fogszab') || slug.includes('retainer') || slug.includes('invisalign')) return 'fogszabalyozas';
    if (slug.includes('postop')) return 'szajsebeszet';
    return 'egyeb';
  }

  // Multi-visit structures imported from visit-definitions.ts

  const tx = db.transaction(() => {
    for (const template of PROTOCOL_TEMPLATES) {
      const existing = db.prepare('SELECT id FROM v2_protocol_templates WHERE slug = ?').get(template.slug) as { id: string } | undefined;
      const id = existing?.id || randomUUID();

      // Use multi-visit structure if defined, otherwise single visit
      const visits = MULTI_VISIT[template.slug] || [
        { visit: 1, name: template.nameHu, actions: template.atomicActions }
      ];

      stmt.run(
        id,
        template.slug,
        template.nameHu,
        deriveCategory(template),
        JSON.stringify(template.triggers),
        JSON.stringify(template.atomicActions),
        JSON.stringify(visits),
        template.description || null,
      );
    }
  });
  tx();
  return PROTOCOL_TEMPLATES.length;
}

// ---- Main ----
async function main() {
  console.log('Seeding V2 catalog...');
  console.log('');

  const actionCount = seedAtomicActions();
  console.log(`✓ Atomic actions: ${actionCount} seeded`);

  const templateCount = seedProtocolTemplates();
  console.log(`✓ Protocol templates: ${templateCount} seeded`);

  // Verify
  const db = getDb();
  const actions = db.prepare('SELECT COUNT(*) as c FROM v2_atomic_actions').get() as { c: number };
  const templates = db.prepare('SELECT COUNT(*) as c FROM v2_protocol_templates').get() as { c: number };

  console.log('');
  console.log(`DB verification: ${actions.c} actions, ${templates.c} templates`);

  // Show category distribution
  const cats = db.prepare('SELECT category, COUNT(*) as c FROM v2_atomic_actions GROUP BY category ORDER BY c DESC').all() as { category: string; c: number }[];
  console.log('');
  console.log('Category distribution:');
  for (const { category, c } of cats) {
    console.log(`  ${category}: ${c}`);
  }

  closeDb();
  console.log('');
  console.log('Done ✓');
}

main().catch(console.error);
