// TreatNote V2 — Atomic Actions: Szájsebészet + Implantáció + Parodontológia
import type { AtomicAction } from '../types.ts';

// --- SZÁJSEBÉSZET ---
export const SZAJSEBESZET: AtomicAction[] = [
  {
    slug: 'extractio_egyszeru',
    nameHu: 'Extractio (egyszerű)',
    category: 'szajsebeszet',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'extractio fogeltávolítás foghúzás egyszerű fogóval fogkihúzás',
  },
  {
    slug: 'extractio_sebeszeti',
    nameHu: 'Extractio (sebészeti feltárásból)',
    category: 'szajsebeszet',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'is_wisdom', type: 'boolean', required: false, default: false },
    ],
    embeddingText: 'extractio sebészi feltárásból műtéti fogeltávolítás bölcsességfog retineált impaktált lebenyes',
  },
  // varrat (varrás/suturing) removed — not a separately billed item, included in surgical procedure price
  {
    slug: 'varratszedes',
    nameHu: 'Varratszedés',
    category: 'szajsebeszet',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'varratszedés sebkontroll műtét utáni kontroll sebtisztítás',
  },
  {
    slug: 'sebellatas',
    nameHu: 'Sebellátás / sebtoilette',
    category: 'szajsebeszet',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'sebellátás sebtoilette seb utókezelés extractiós seb',
  },
  {
    slug: 'frenulektomia',
    nameHu: 'Frenulektómia',
    category: 'szajsebeszet',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'frenulektómia frenulum vágás szájpad nyelv fék',
  },
  {
    slug: 'vestibulum_plasztika',
    nameHu: 'Vesztibulum plasztika',
    category: 'szajsebeszet',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'vesztibulum plasztika feszes íny szélesítés lágyszövet sebészet',
  },
];

// --- IMPLANTÁCIÓ ---
export const IMPLANTACIO: AtomicAction[] = [
  {
    slug: 'implantatum_beultes',
    nameHu: 'Implantátum beültetés',
    category: 'implantacio',
    scaling: 'per_unit',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'brand', type: 'enum', required: false, values: ['nobel','straumann','osstem','dentium','alpha_bio','neodent'], default: 'nobel' },
    ],
    embeddingText: 'implantátum beültetés fogbeültetés fixture inserció dental implant NobelActive Straumann Osstem',
  },
  {
    slug: 'gyogyulasi_sapka',
    nameHu: 'Gyógyulási sapka behelyezés',
    category: 'implantacio',
    scaling: 'per_unit',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'gyógyulási sapka sapka ideiglenes sapkapróba healing cap ínyformázó csavar behelyezés implantátum feltárás multiunit fejre Nobel',
  },
  {
    slug: 'abutment',
    nameHu: 'Felépítő fej (abutment)',
    category: 'implantacio',
    scaling: 'per_unit',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'type', type: 'enum', required: false, values: ['standard','egyedi','titan','cirkon'], default: 'standard' },
    ],
    embeddingText: 'abutment felépítő fej felépítmény multi-unit Atlantis egyedi implantátum',
  },
  {
    slug: 'scan_body',
    nameHu: 'Scan body',
    category: 'implantacio',
    scaling: 'per_unit',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'scan body implantátum szkenner test digitális lenyomat implant',
  },
  {
    slug: 'csontpotlas',
    nameHu: 'Csontpótlás',
    category: 'implantacio',
    scaling: 'per_unit',
    parameters: [
      { name: 'material', type: 'enum', required: false, values: ['bio_oss','xenogain','szintetikus','autogen'], default: 'bio_oss' },
    ],
    embeddingText: 'csontpótlás csontpótló anyag bone graft Bio-Oss Xenogain szintetikus augmentáció',
  },
  {
    slug: 'membran',
    nameHu: 'Membrán alkalmazás',
    category: 'implantacio',
    scaling: 'per_unit',
    parameters: [
      { name: 'type', type: 'enum', required: false, values: ['bio_gide','creos','kollagen','titan'], default: 'kollagen' },
    ],
    embeddingText: 'membrán kollagén membrán Bio-Gide Creos guided bone regeneration GBR',
  },
  {
    slug: 'sinus_lift_nyilt',
    nameHu: 'Sinus lift (nyílt)',
    category: 'implantacio',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'sinus lift nyílt arcüreg emelés nyílt technika laterális ablak maxilláris sinus augmentáció',
  },
  {
    slug: 'sinus_lift_zart',
    nameHu: 'Sinus lift (zárt)',
    category: 'implantacio',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'sinus lift zárt arcüreg emelés zárt technika crestal transalveoláris osteotóm',
  },
  {
    slug: 'socket_prezervacio',
    nameHu: 'Socket prezervació (alveolus)',
    category: 'implantacio',
    scaling: 'per_tooth',
    parameters: [],
    embeddingText: 'socket prezervació alveolus csont prezervació ridge preservation extractio utáni',
  },
  {
    slug: 'navigalt_sebeszet',
    nameHu: 'Navigált sebészeti sablon',
    category: 'implantacio',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'navigált sebészet sebészi sablon surgical guide tervezett implantáció digitális',
  },
  {
    slug: 'muteti_elokeszites',
    nameHu: 'Műtéti előkészítés',
    category: 'implantacio',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'műtéti előkészítés steril takarók Hygitech egyszerhasználatos műszervédő',
  },
];

// --- PARODONTOLÓGIA ---
export const PARODONTOLOGIA: AtomicAction[] = [
  {
    slug: 'depuralas',
    nameHu: 'Depurálás (fogkőeltávolítás + polírozás)',
    category: 'parodontologia',
    scaling: 'per_session',
    parameters: [
      { name: 'scope', type: 'enum', required: false, values: ['teljes','felso','also'], default: 'teljes' },
    ],
    embeddingText: 'depurálás fogkőeltávolítás polírozás professzionális tisztítás profilaxis scaling ultrahangos',
  },
  {
    slug: 'zart_kurett',
    nameHu: 'Zárt kürett',
    category: 'parodontologia',
    scaling: 'per_quadrant',
    parameters: [
      { name: 'quadrant', type: 'enum', required: false, values: ['Q1','Q2','Q3','Q4','felso','also'], default: 'Q1' },
    ],
    embeddingText: 'zárt kürett parodontális kürettázs gyógyszeres tasakkezelés subgingivális quadráns',
  },
  {
    slug: 'nyilt_kurett',
    nameHu: 'Nyílt kürett (lebenyműtét)',
    category: 'parodontologia',
    scaling: 'per_quadrant',
    parameters: [
      { name: 'quadrant', type: 'enum', required: false, values: ['Q1','Q2','Q3','Q4'] },
    ],
    embeddingText: 'nyílt kürett parodontális lebenyműtét flap surgery open curettage',
  },
  {
    slug: 'parodontologiai_vizsgalat',
    nameHu: 'Parodontológiai vizsgálat',
    category: 'parodontologia',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'parodontológiai vizsgálat tasakmérés állapotfelmérés parodontális státusz BOP',
  },
  {
    slug: 'air_flow',
    nameHu: 'Air-flow / biofilm terápia',
    category: 'parodontologia',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'air flow biofilm terápia EMS Profilaxis Master Prophyflex GBT porszóró',
  },
  {
    slug: 'inygrafit',
    nameHu: 'Kötőszöveti graft',
    category: 'parodontologia',
    scaling: 'per_tooth',
    parameters: [
      { name: 'type', type: 'enum', required: false, values: ['sajat','mucoderm'], default: 'sajat' },
    ],
    embeddingText: 'kötőszöveti graft szájpadi graft ínyrecesszió fedés Mucoderm gingiva plasztika',
  },
];
