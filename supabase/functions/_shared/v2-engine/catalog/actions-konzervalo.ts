// TreatNote V2 — Atomic Actions: Konzerváló fogászat
import type { AtomicAction } from '../types.ts';

export const KONZERVALO: AtomicAction[] = [
  {
    slug: 'kompozit_tomes_1_felszin',
    nameHu: 'Kompozit tömés (1 felszín)',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true, min: 11, max: 48 },
      { name: 'surface', type: 'enum', required: true, values: ['M','O','D','B','L','I'] },
      { name: 'material', type: 'enum', required: false, values: ['nano_hibrid','mikro_hibrid','fluid','GIC'], default: 'nano_hibrid' },
    ],
    embeddingText: 'kompozit tömés egy felszín restauráció direkt tömőanyag fényrekötő',
  },
  {
    slug: 'kompozit_tomes_tobb_felszin',
    nameHu: 'Kompozit tömés (több felszín)',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true, min: 11, max: 48 },
      { name: 'surfaces', type: 'enum_list', required: true, values: ['M','O','D','B','L','I'], min: 2, max: 5 },
      { name: 'material', type: 'enum', required: false, values: ['nano_hibrid','mikro_hibrid','fluid','GIC'], default: 'nano_hibrid' },
    ],
    embeddingText: 'kompozit tömés több felszín MOD OD MO restauráció direkt tömőanyag esztétikus',
  },
  {
    slug: 'frontfog_tomes',
    nameHu: 'Frontfog tömés',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'surfaces', type: 'enum_list', required: false, values: ['M','D','B','L','I'], min: 1, max: 4 },
    ],
    embeddingText: 'frontfog tömés elülső fog esztétikus kompozit restauráció',
  },
  {
    slug: 'ideiglenes_tomes',
    nameHu: 'Ideiglenes tömés',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'material', type: 'enum', required: false, values: ['uvegionomer','gyogyszeres','rovid_tavu','hosszu_tavu'], default: 'uvegionomer' },
    ],
    embeddingText: 'ideiglenes tömés üvegionomer tömőanyag temporális provizórikus gyógyszeres Pulp-X',
  },
  {
    slug: 'caries_eltavolitas',
    nameHu: 'Caries eltávolítás',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'caries eltávolítás szuvasodás szuvas anyag eltávolítás excaválás',
  },
  {
    slug: 'amalgam_eltavolitas',
    nameHu: 'Amalgám eltávolítás',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'amalgám eltávolítás régi tömés cseréje amalgám csere',
  },
  {
    slug: 'barzdazaras',
    nameHu: 'Barázdazárás',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'barázdazárás sealant fissura zárás megelőzés preventív',
  },
  {
    slug: 'biomimetikus_ladaemeles',
    nameHu: 'Biomimetikus ládaemelés',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'biomimetikus ládaemelés deep margin elevation Everx üvegszál',
  },
  {
    slug: 'direkt_hej',
    nameHu: 'Direkt kompozit héj',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'direkt kompozit héj veneer esztétikus felépítés frontfog',
  },
  // --- Endodontia ---
  {
    slug: 'trepanalas',
    nameHu: 'Trepanálás (hozzáférés)',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'trepanálás hozzáférés gyökércsatorna megnyitás access cavity',
  },
  {
    slug: 'csatorna_feltaras',
    nameHu: 'Csatornafeltárás és tágítás',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'canal_count', type: 'int', required: false, min: 1, max: 4, description: 'Csatornák száma (default: fogszám alapján)' },
    ],
    embeddingText: 'csatornafeltárás gépi tágítás gyökércsatorna kezelés endodontia mikroszkópos hosszmeghatározás gyökérkezelés csatorna',
  },
  {
    slug: 'csatorna_atoblites',
    nameHu: 'Csatorna átöblítés és gyógyszeres zárás',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'gyökércsatorna átöblítés gyógyszeres zárás irrigálás NaOCl kalcium-hidroxid',
  },
  {
    slug: 'gyokertomes',
    nameHu: 'Gyökértömés',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'canal_count', type: 'int', required: false, min: 1, max: 4 },
      { name: 'material', type: 'enum', required: false, values: ['guttapercha','biokerámia'], default: 'guttapercha' },
    ],
    embeddingText: 'gyökértömés gyökérkezelés gyökértöméssel guttapercha obturáció AH Plus gyökértömő anyag végleges zárás front kisőrlő nagyőrlő',
  },
  {
    slug: 'csapos_felepites',
    nameHu: 'Csapos felépítés',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'material', type: 'enum', required: false, values: ['uvegszalas','fem','kompozit'], default: 'uvegszalas' },
    ],
    embeddingText: 'csapos felépítés csonkfelépítés üvegszálas csap core build-up intracanális post Dentapreg parapulpális csap gyökércsap',
  },
  {
    slug: 'direkt_felszin_felepites',
    nameHu: 'Direkt felépítés',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'direkt felépítés csonkfelépítés injektálásos technika Everx kompozit felépítés preendo',
  },
  {
    slug: 'fedotomes',
    nameHu: 'Fedőtömés',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'fedőtömés ideiglenes fedőtömés alábélelés bélelés tömés zárás fedés',
  },
  {
    slug: 'gyokerkezeles_csatornankent',
    nameHu: 'Gyökérkezelés (csatornánként)',
    category: 'konzervalo_fogaszat',
    scaling: 'per_canal',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'canal_count', type: 'int', required: true, min: 1, max: 4 },
    ],
    embeddingText: 'gyökérkezelés csatorna egy két három négy csatornás gyökérkezelés endodontia RCT endo csatornánként',
  },
  {
    slug: 'gyokertomes_eltavolitas',
    nameHu: 'Gyökértömés eltávolítás',
    category: 'konzervalo_fogaszat',
    scaling: 'per_canal',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'gyökértömés eltávolítás revízió reendo retreatment csatornánként régi gyökértömés',
  },
  {
    slug: 'tomes_eltavolitas',
    nameHu: 'Tömés eltávolítás',
    category: 'konzervalo_fogaszat',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'tömés eltávolítás régi tömés eltávolítás kiszedés csere',
  },
];
