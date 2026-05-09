// TreatNote V2 — Atomic Actions: Diagnosztika + Közös (anesztézia, kofferdam, stb.)
import type { AtomicAction } from '../shared/types.js';

// --- DIAGNOSZTIKA ---
export const DIAGNOSZTIKA: AtomicAction[] = [
  {
    slug: 'konzultacio',
    nameHu: 'Konzultáció / betegvizsgálat',
    category: 'diagnosztika',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'konzultáció betegvizsgálat első vizsgálat állapotfelmérés kezelési terv tanácsadás',
  },
  {
    slug: 'intraoralis_rtg',
    nameHu: 'Intraorális röntgen',
    category: 'diagnosztika',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: false },
    ],
    embeddingText: 'intraorális röntgen periapicális felvétel RVG röntgen RTG kis röntgen',
  },
  {
    slug: 'panorama_rtg',
    nameHu: 'Panoráma röntgen',
    category: 'diagnosztika',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'panoráma röntgen OPT ortopantomogram nagy röntgen felvétel',
  },
  {
    slug: 'cbct',
    nameHu: 'CBCT (3D CT)',
    category: 'diagnosztika',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'CBCT cone beam CT 3D felvétel 3 dimenziós röntgen volumetrikus',
  },
  {
    slug: 'intraoralis_scan',
    nameHu: 'Intraorális szkenner',
    category: 'diagnosztika',
    scaling: 'per_arch',
    parameters: [],
    embeddingText: 'intraorális scan szkenner szkennelés digitális lenyomat CEREC Primescan Trios',
  },
  {
    slug: 'fotodokumentacio',
    nameHu: 'Fotódokumentáció',
    category: 'diagnosztika',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'fotódokumentáció fotó fénykép státusz felvétel klinikai fotó',
  },
  {
    slug: 'mosolytervezes',
    nameHu: 'Mosolytervezés / Smile Design',
    category: 'diagnosztika',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'mosolytervezés smile design wax-up mock-up digitális tervezés DSD',
  },
];

// --- KÖZÖS (minden kategóriában használt) ---
export const KOZOS: AtomicAction[] = [
  {
    slug: 'infiltracios_anesztezia',
    nameHu: 'Infiltrációs érzéstelenítés',
    category: 'kozos',
    scaling: 'per_session',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: false },
    ],
    embeddingText: 'helyi infiltrációs érzéstelenítés anesztézia Ultracain lokál injekció',
  },
  {
    slug: 'vezetekes_anesztezia',
    nameHu: 'Vezetéses érzéstelenítés',
    category: 'kozos',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'vezetéses érzéstelenítés mandibularis blokk alsó ideg blokkolás IAN block',
  },
  {
    slug: 'intraligamentaris_anesztezia',
    nameHu: 'Intraligamentáris érzéstelenítés',
    category: 'kozos',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: false },
    ],
    embeddingText: 'intraligamentáris érzéstelenítés ICT Quick Sleeper számítógépes STA',
  },
  {
    slug: 'kofferdam',
    nameHu: 'Kofferdam izolálás',
    category: 'kozos',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'kofferdam cofferdam izolálás rubber dam gumi lepedő',
  },
  {
    slug: 'ecseteles',
    nameHu: 'Ecsetelés / fluoridálás',
    category: 'kozos',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'ecsetelés fluoridálás fluorid lakk elmex desensibilizálás érzékenység csökkentés',
  },
  {
    slug: 'lezer_kezeles',
    nameHu: 'Lézer kezelés',
    category: 'kozos',
    scaling: 'per_session',
    parameters: [
      { name: 'indication', type: 'enum', required: false, values: ['desensibilizalas','feltaras','feherites','paro'] },
    ],
    embeddingText: 'lézer kezelés laser desensibilizálás lágyszövet lézer dióda',
  },
  {
    slug: 'feherites_rendeloi',
    nameHu: 'Fogfehérítés (rendelői)',
    category: 'kozos',
    scaling: 'per_arch',
    parameters: [
      { name: 'arch', type: 'enum', required: false, values: ['felso','also','mindketto'], default: 'mindketto' },
    ],
    embeddingText: 'fogfehérítés rendelői whitening Opalescence Zoom professional in-office bleaching',
  },
  {
    slug: 'feherites_otthoni',
    nameHu: 'Fogfehérítés (otthoni)',
    category: 'kozos',
    scaling: 'per_arch',
    parameters: [],
    embeddingText: 'fogfehérítés otthoni home bleaching fehérítő sín tálca zselé Opalescence Go',
  },
];

// --- FOGSZABÁLYOZÁS ---
export const FOGSZABALYOZAS: AtomicAction[] = [
  {
    slug: 'rogzitett_keszulek_atadas',
    nameHu: 'Rögzített fogszabályozó készülék átadás',
    category: 'fogszabalyozas',
    scaling: 'per_arch',
    parameters: [
      { name: 'arch', type: 'enum', required: false, values: ['felso','also','mindketto'], default: 'felso' },
      { name: 'type', type: 'enum', required: false, values: ['fem','keramia','onligirozo'], default: 'fem' },
    ],
    embeddingText: 'rögzített fogszabályozó készülék átadás multibond bracket fém kerámia önligírozó EMPOWER fogív',
  },
  {
    slug: 'fogszab_aktivalas',
    nameHu: 'Fogszabályozó készülék aktiválás',
    category: 'fogszabalyozas',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'fogszabályozó aktiválás ív csere ívcsere gumicsere kontroll beállítás ortodonciai',
  },
  {
    slug: 'invisalign_aligner',
    nameHu: 'Invisalign / aligner kezelés',
    category: 'fogszabalyozas',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'Invisalign aligner átlátszó fogszabályozó sín clear aligner',
  },
  {
    slug: 'retainer',
    nameHu: 'Retainer',
    category: 'fogszabalyozas',
    scaling: 'per_arch',
    parameters: [
      { name: 'type', type: 'enum', required: false, values: ['rogzitett','kivetetheto'], default: 'rogzitett' },
    ],
    embeddingText: 'retainer rögzített retainer kivehető retainer fogszabályozás utáni megtartás',
  },
  {
    slug: 'fogszab_lenyomat',
    nameHu: 'Fogszabályozás lenyomat + kezelési terv',
    category: 'fogszabalyozas',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'fogszabályozás lenyomatvétel kezelési terv konzultáció ortodonciai terv lenyomatokok',
  },
];

// --- HARAPÁSEMELŐ / OCCLUSIO / SÍN ---
export const EGYEB_KLINIKAI: AtomicAction[] = [
  {
    slug: 'harapasemelo_sin',
    nameHu: 'Harapásemelő sín / bruxizmus sín',
    category: 'kozos',
    scaling: 'per_arch',
    parameters: [
      { name: 'arch', type: 'enum', required: false, values: ['felso','also'], default: 'felso' },
    ],
    embeddingText: 'harapásemelő sín bruxizmus fogcsikorgatás éjszakai sín stabilizációs sín fólia állcsont',
  },
  {
    slug: 'occlusio_beallitas',
    nameHu: 'Occlusio beállítás / becsiszolás',
    category: 'kozos',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'occlusio beállítás harapás becsiszolás becsiszolása érintkezés okklúzió',
  },
  {
    slug: 'fog_transzformalas',
    nameHu: 'Fog transzformálás',
    category: 'kozos',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'fog transzformálás fog átalakítás formakorrekció esztétikus',
  },
];
