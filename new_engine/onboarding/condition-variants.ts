// ============================================================
// TreatNote V2 — Onboarding: Condition Variants Seeder
// Csatornaszám, fogtípus, felszín, implant márka, korona típus
// ============================================================

import { randomUUID } from 'crypto';
import { getDb, closeDb } from '../db/client.js';
import { getSzotarByTelephely, type SzotarKezeles } from '../db/supabase.js';
import { getEmbeddings, cosineSimilarity } from '../shared/embeddings.js';
import 'dotenv/config';

interface VariantRule {
  atomicActionSlug: string;
  conditionKey: string;
  variants: { value: unknown; searchTerms: string[] }[];
}

/** Condition-based variant rules */
const VARIANT_RULES: VariantRule[] = [

  // ========================
  // ENDODONTIA — csatornaszám
  // ========================
  {
    atomicActionSlug: 'gyokerkezeles_csatornankent',
    conditionKey: 'canal_count',
    variants: [
      { value: 1, searchTerms: ['gyökérkezelés 1 csatorna', 'mikroszkópos gyökérkezelés 1 csatorna'] },
      { value: 2, searchTerms: ['gyökérkezelés 2 csatorna', 'mikroszkópos gyökérkezelés 2 csatorna'] },
      { value: 3, searchTerms: ['gyökérkezelés 3 csatorna', 'mikroszkópos gyökérkezelés 3 csatorna'] },
      { value: 4, searchTerms: ['gyökérkezelés 4 csatorna', 'mikroszkópos gyökérkezelés 4 csatorna'] },
    ],
  },
  {
    atomicActionSlug: 'csatorna_feltaras',
    conditionKey: 'canal_count',
    variants: [
      { value: 1, searchTerms: ['gyökérkezelés 1 csatorna első kezelés', 'csatornafeltárás 1 csatorna'] },
      { value: 2, searchTerms: ['gyökérkezelés 2 csatorna első kezelés', 'csatornafeltárás 2 csatorna'] },
      { value: 3, searchTerms: ['gyökérkezelés 3 csatorna első kezelés', 'csatornafeltárás 3 csatorna'] },
      { value: 4, searchTerms: ['gyökérkezelés 4 csatorna első kezelés', 'csatornafeltárás 4 csatorna'] },
    ],
  },
  {
    atomicActionSlug: 'gyokertomes',
    conditionKey: 'tooth_region',
    variants: [
      { value: 'front', searchTerms: ['gyökérkezelés gyökértöméssel front fogon', 'gyökértömés front fog'] },
      { value: 'premolar', searchTerms: ['gyökérkezelés gyökértöméssel kisőrlő fogon', 'gyökértömés kisőrlő'] },
      { value: 'molar', searchTerms: ['gyökérkezelés gyökértöméssel nagyőrlő fogon Dental Excellence', 'gyökértömés nagyőrlő'], negativeTerms: ['4 csatorna'] },
      { value: 'molar_4ch', searchTerms: ['gyökérkezelés gyökértöméssel nagyőrlő fogon 4 csatorna esetén'] },
    ],
  },
  {
    atomicActionSlug: 'gyokertomes_eltavolitas',
    conditionKey: 'canal_count',
    variants: [
      { value: 1, searchTerms: ['régi gyökértömés eltávolítása frontfog', 'gyökértömés eltávolítás front'] },
      { value: 2, searchTerms: ['régi gyökértömés eltávolítása kisőrlő', 'gyökértömés eltávolítás kisőrlő csatornánként'] },
      { value: 3, searchTerms: ['régi gyökértömés eltávolítása nagyőrlő csatornánként', 'gyökértömés eltávolítás nagyőrlő'] },
      { value: 4, searchTerms: ['régi gyökértömés eltávolítása nagyőrlő csatornánként', 'gyökértömés eltávolítás nagyőrlő'] },
    ],
  },

  // ========================
  // TÖMÉS — felszín + fogtípus
  // ========================
  {
    atomicActionSlug: 'kompozit_tomes_1_felszin',
    conditionKey: 'tooth_region',
    variants: [
      { value: 'front', searchTerms: ['frontfog 1 felszínű tömés', 'frontfog tömés egy felszín'] },
      { value: 'premolar', searchTerms: ['kisőrlő tömés 1 felszínű', 'kisőrlő tömés egy felszín'] },
      { value: 'molar', searchTerms: ['nagyőrlő tömés 1 felszínű', 'nagyőrlő tömés egy felszín'] },
    ],
  },
  {
    atomicActionSlug: 'kompozit_tomes_tobb_felszin',
    conditionKey: 'tooth_region',
    variants: [
      { value: 'front', searchTerms: ['frontfog 3 felszínű tömés', 'frontfog tömés több felszín'] },
      { value: 'premolar', searchTerms: ['kisőrlő tömés 2 vagy több felszínű', 'kisőrlő tömés több felszín'] },
      { value: 'molar', searchTerms: ['nagyőrlő direkt restauráció 2 vagy több felszínű tömés', 'nagyőrlő tömés két vagy több felszín'] },
    ],
  },

  // ========================
  // IMPLANTÁCIÓ — márka
  // ========================
  {
    atomicActionSlug: 'implantatum_beultes',
    conditionKey: 'brand',
    variants: [
      { value: 'nobel', searchTerms: ['fogbeültetés NobelActive TiUltra Nobel-Biocare', 'Nobel implantátum beültetés'] },
      { value: 'straumann', searchTerms: ['Straumann implantátum beültetés fogbeültetés'] },
      { value: 'alpha_bio', searchTerms: ['AlphaBio implantátum beültetés fogbeültetés'] },
      { value: 'dentium', searchTerms: ['Dentium SuperLine implantátum beültetés fogbeültetés'] },
    ],
  },

  // ABUTMENT — márka
  {
    atomicActionSlug: 'abutment',
    conditionKey: 'brand',
    variants: [
      { value: 'nobel', searchTerms: ['felépítő fej Nobel-Biocare implantátumhoz', 'Nobel felépítő fej'] },
      { value: 'alpha_bio', searchTerms: ['felépítő fej Alpha Bio implantátumhoz'] },
      { value: 'dentium', searchTerms: ['felépítő fej Dentium implantátumhoz'] },
      { value: 'standard', searchTerms: ['felépítőfej implantátumra'] },
    ],
  },

  // ========================
  // KORONA — típus
  // ========================
  {
    atomicActionSlug: 'fem_keramia_korona',
    conditionKey: 'type',
    variants: [
      { value: 'standard', searchTerms: ['fém kerámia korona'] },
      { value: 'dental_excellence', searchTerms: ['fém kerámia korona Dental Excellence'] },
    ],
  },
  {
    atomicActionSlug: 'cirkon_korona',
    conditionKey: 'type',
    variants: [
      { value: 'full_kontúr', searchTerms: ['cirkon korona fémmentes korona', 'fémmentes cirkon korona'] },
      { value: 'veneered', searchTerms: ['cirkon korona Empress E-max fémmentes korona hídtag'] },
    ],
  },
  {
    atomicActionSlug: 'emax_korona',
    conditionKey: 'type',
    variants: [
      { value: 'standard', searchTerms: ['E-max koronák préskerámia'] },
      { value: 'hej', searchTerms: ['E-max porcelán héj'] },
    ],
  },

  // IMPLANT KORONA — rögzítés típus
  {
    atomicActionSlug: 'implant_korona',
    conditionKey: 'material',
    variants: [
      { value: 'fem_keramia', searchTerms: ['átmenőcsavaros rögzítésű fém kerámia korona implantátumhoz'] },
      { value: 'cirkon', searchTerms: ['átmenőcsavaros cirkon korona implantátumokba', 'cirkon fémmentes korona implantátumon'] },
    ],
  },

  // VENEER — típus
  {
    atomicActionSlug: 'veneer_hej',
    conditionKey: 'material',
    variants: [
      { value: 'emax', searchTerms: ['E-max porcelán héj', 'E-max héjak'] },
      { value: 'kompozit', searchTerms: ['direkt héj foganként', 'Renamel direkt héjak'] },
    ],
  },

  // ========================
  // CSONTPÓTLÁS — anyag
  // ========================
  {
    atomicActionSlug: 'csontpotlas',
    conditionKey: 'material',
    variants: [
      { value: 'bio_oss', searchTerms: ['Bio-oss csontpótló anyag gramm Geistlich', 'Bio-Oss csontpótlás'] },
      { value: 'cerabone', searchTerms: ['Cerabone csontpótló anyag gramm Botiss'] },
      { value: 'xenogain', searchTerms: ['Creos csontpótló Xenogain'] },
      { value: 'ethoss', searchTerms: ['Ethoss csontpótló anyag'] },
    ],
  },

  // ========================
  // MEMBRÁN — márka/típus
  // ========================
  {
    atomicActionSlug: 'membran',
    conditionKey: 'brand',
    variants: [
      { value: 'biogide', searchTerms: ['BioGide membrán mérettől függően'] },
      { value: 'creos', searchTerms: ['Creos membrán Xenoprotect'] },
      { value: 'jason', searchTerms: ['Jason membrán mérettől függően'] },
      { value: 'cytoplast', searchTerms: ['Cytoplast titán merevítésű nem felszívódó biomembrán'] },
    ],
  },

  // ========================
  // LENYOMAT — módszer
  // ========================
  {
    atomicActionSlug: 'lenyomatvetel',
    conditionKey: 'method',
    variants: [
      { value: 'digital', searchTerms: ['Digitális lenyomat állcsontonként'] },
      { value: 'alginat', searchTerms: ['alginát lenyomatvétel', 'Tanulmányi lenyomat állcsontonként alginát lenyomatanyagból'] },
      { value: 'szilikon', searchTerms: ['Lenyomati díj precíziós szilikon lenyomattal állcsontonként'] },
      { value: 'egyeni_kanal', searchTerms: ['Lenyomati díj egyéni kanállal állcsontonként'] },
    ],
  },

  // ========================
  // GYÓGYULÁSI SAPKA — márka
  // ========================
  {
    atomicActionSlug: 'gyogyulasi_sapka',
    conditionKey: 'brand',
    variants: [
      { value: 'nobel', searchTerms: ['Gyógyulási sapka multiunit fejre Nobel'] },
      { value: 'standard', searchTerms: ['Sapka ideiglenes célból'] },
    ],
  },

  // ========================
  // SOCKET PREZERVÁCIO — fogtípus
  // ========================
  {
    atomicActionSlug: 'socket_prezervacio',
    conditionKey: 'tooth_region',
    variants: [
      { value: 'front', searchTerms: ['Csontpótlás egy fog húzási helyének feltöltésére front és premoláris fog esetén'] },
      { value: 'molar', searchTerms: ['Csontpótlás egy fog húzási helyének feltöltésére moláris fog esetén'] },
    ],
  },
];

/** Seed condition-based variants for a telephely */
export async function seedConditionVariants(telephelyId: string): Promise<number> {
  console.log(`\n=== Seeding condition variants for ${telephelyId} ===\n`);

  // Fetch szótár items
  const szotarItems = await getSzotarByTelephely(telephelyId);
  console.log(`${szotarItems.length} szótár items loaded`);

  // Generate embeddings for all szótár items
  console.log('Generating szótár embeddings...');
  const szotarTexts = szotarItems.map(i => i.name);
  const szotarEmbVectors = await getEmbeddings(szotarTexts, 'text-embedding-3-large');
  const szotarEmbeddings = new Map<string, number[]>();
  szotarItems.forEach((item, i) => szotarEmbeddings.set(item.id, szotarEmbVectors[i]));

  const db = getDb();
  let totalInserted = 0;

  for (const rule of VARIANT_RULES) {
    console.log(`\n  ${rule.atomicActionSlug} (${rule.conditionKey}):`);

    // Remove old condition-specific mappings for this action (keep the generic one)
    db.prepare(
      `DELETE FROM v2_clinic_mappings WHERE telephely_id = ? AND atomic_action_slug = ? AND conditions != '{}'`
    ).run(telephelyId, rule.atomicActionSlug);

    for (const variant of rule.variants) {
      // Embed search terms
      const searchEmbeddings = await getEmbeddings(variant.searchTerms, 'text-embedding-3-large');

      // Find best szótár match for this variant
      let bestItem: SzotarKezeles | null = null;
      let bestSim = 0;

      for (const szItem of szotarItems) {
        // Skip items matching negativeTerms
        if ((variant as any).negativeTerms?.length) {
          const nameLower = szItem.name.toLowerCase();
          if ((variant as any).negativeTerms.some((nt: string) => nameLower.includes(nt.toLowerCase()))) continue;
        }
        const szEmb = szotarEmbeddings.get(szItem.id)!;
        for (const searchEmb of searchEmbeddings) {
          const sim = cosineSimilarity(searchEmb, szEmb);
          if (sim > bestSim) {
            bestSim = sim;
            bestItem = szItem;
          }
        }
      }

      if (bestItem && bestSim > 0.5) {
        const conditions = { [rule.conditionKey]: variant.value };
        db.prepare(`
          INSERT OR REPLACE INTO v2_clinic_mappings (id, telephely_id, szotar_kezeles_id, szotar_kezeles_name, atomic_action_slug, conditions, confidence, reviewed)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
          randomUUID(), telephelyId, bestItem.id, bestItem.name,
          rule.atomicActionSlug, JSON.stringify(conditions), bestSim
        );
        console.log(`    ${rule.conditionKey}=${String(variant.value).padEnd(12)} → "${bestItem.name}" (${bestSim.toFixed(3)})`);
        totalInserted++;
      } else {
        console.log(`    ${rule.conditionKey}=${String(variant.value).padEnd(12)} → ⚠ no match (best: ${bestSim.toFixed(3)})`);
      }
    }
  }

  console.log(`\n✓ ${totalInserted} condition variants seeded`);
  return totalInserted;
}

// CLI
if (process.argv[1]?.includes('condition-variants')) {
  const telephelyId = process.argv[2] || process.env.TELEPHELY_ID || '79d8df9c-1795-4ef3-ba65-157c6635e9dd';
  seedConditionVariants(telephelyId)
    .then(() => closeDb())
    .catch(err => { console.error(err); closeDb(); process.exit(1); });
}
