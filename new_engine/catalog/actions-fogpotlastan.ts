// TreatNote V2 — Atomic Actions: Fogpótlástan
import type { AtomicAction } from '../shared/types.js';

export const FOGPOTLASTAN: AtomicAction[] = [
  {
    slug: 'korona_preparacio',
    nameHu: 'Korona preparáció',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'preparálás korona preparáció csonkelőkészítés prep koronaprep csiszolás fogcsiszolás',
  },
  {
    slug: 'lenyomatvetel',
    nameHu: 'Lenyomatvétel',
    category: 'fogpotlastan',
    scaling: 'per_arch',
    parameters: [
      { name: 'type', type: 'enum', required: false, values: ['digitalis','szilikon','alginat'], default: 'digitalis' },
      { name: 'arch', type: 'enum', required: false, values: ['felso','also','mindketto'], default: 'mindketto' },
    ],
    embeddingText: 'lenyomatvétel digitális lenyomat szilikon lenyomat intraorális szkenner scanner állcsontonként tanulmányi lenyomat precíziós antagonista lenyomat készítés alginát',
  },
  {
    slug: 'harapasrogzites',
    nameHu: 'Harapásrögzítés',
    category: 'fogpotlastan',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'harapásrögzítés harapásvétel okklúzió regisztrálás bite registration',
  },
  {
    slug: 'ideiglenes_korona',
    nameHu: 'Ideiglenes korona',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'type', type: 'enum', required: false, values: ['rendeloi','labor','hosszutavu'], default: 'rendeloi' },
    ],
    embeddingText: 'ideiglenes korona provizórikus korona temporális PMMA Scutan rendelőben készített',
  },
  {
    slug: 'vazproba',
    nameHu: 'Vázpróba',
    category: 'fogpotlastan',
    scaling: 'per_session',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'vázpróba próba illeszkedés ellenőrzés framework try-in',
  },
  {
    slug: 'korona_cementalas',
    nameHu: 'Korona/híd cementálás (átadás)',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'fixation', type: 'enum', required: false, values: ['vegleges','ideiglenes'], default: 'vegleges' },
    ],
    embeddingText: 'korona cementálás beragasztás átadás ragasztás végleges rögzítés fogpótlás ideiglenes ragasztás protetikai munka beragasztása fogmű átadás',
  },
  {
    slug: 'fem_keramia_korona',
    nameHu: 'Fém-kerámia korona',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'fémkerámia korona PFM korona fém-kerámia crown metal ceramic',
  },
  {
    slug: 'cirkon_korona',
    nameHu: 'Cirkónium korona',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'type', type: 'enum', required: false, values: ['full_kontúr','veneered','multilayer'], default: 'full_kontúr' },
    ],
    embeddingText: 'cirkónium korona cirkon korona fémmentes kerámia korona zirconia full contour CEREC',
  },
  {
    slug: 'emax_korona',
    nameHu: 'E.max préskerámia korona',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'E.max korona préskerámia Empress lítium-diszilikát IPS kerámia korona',
  },
  {
    slug: 'hidtag',
    nameHu: 'Hídtag',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'material', type: 'enum', required: false, values: ['fem_keramia','cirkon','emax'], default: 'fem_keramia' },
    ],
    embeddingText: 'hídtag pontic híd köztes tag pótolt fog fémkerámia cirkónium',
  },
  {
    slug: 'inlay_onlay',
    nameHu: 'Inlay / Onlay betét',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'material', type: 'enum', required: false, values: ['keramia','kompozit','emax','tessera'], default: 'keramia' },
    ],
    embeddingText: 'inlay onlay betét indirekt restauráció kerámia betét E.max Tessera CEREC',
  },
  {
    slug: 'veneer_hej',
    nameHu: 'Héjkerámia (veneer)',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'material', type: 'enum', required: false, values: ['emax','porcelan','kompozit'], default: 'emax' },
    ],
    embeddingText: 'héjkerámia veneer porcelán héj E.max esztétikus héj foglemez',
  },
  {
    slug: 'implant_korona',
    nameHu: 'Korona implantátumra',
    category: 'fogpotlastan',
    scaling: 'per_unit',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
      { name: 'material', type: 'enum', required: false, values: ['cirkon','fem_keramia'], default: 'cirkon' },
      { name: 'fixation', type: 'enum', required: false, values: ['csavaros','cementalas'], default: 'csavaros' },
    ],
    embeddingText: 'implantátum korona csavaros korona implantátumra cementált átmenőcsavaros',
  },
  {
    slug: 'implant_ideiglenes_korona',
    nameHu: 'Ideiglenes korona implantátumra',
    category: 'fogpotlastan',
    scaling: 'per_unit',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'ideiglenes korona implantátumra provizórikus átmenőcsavaros Nobel felépítményre',
  },
  {
    slug: 'fogszin_meghatarozas',
    nameHu: 'Fogszín meghatározás',
    category: 'fogpotlastan',
    scaling: 'per_session',
    parameters: [],
    embeddingText: 'fogszín meghatározás shade taking szín kiválasztás VITA individualizált kerámia festés',
  },
  {
    slug: 'korona_levetel',
    nameHu: 'Korona levétel / átvágás',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'korona levétel átvágás régi korona eltávolítás korona csere',
  },
  {
    slug: 'hosszutavu_ideiglenes',
    nameHu: 'Hosszútávú ideiglenes korona/híd',
    category: 'fogpotlastan',
    scaling: 'per_tooth',
    parameters: [
      { name: 'tooth_fdi', type: 'int', required: true },
    ],
    embeddingText: 'hosszútávú ideiglenes korona híd labor ideiglenes provizórikus Ivotion PMMA fém erősítéssel',
  },
  {
    slug: 'egyeni_kanal',
    nameHu: 'Egyéni kanál',
    category: 'fogpotlastan',
    scaling: 'per_arch',
    parameters: [],
    embeddingText: 'egyéni kanál individuális kanál custom tray lenyomatvétel',
  },
];
