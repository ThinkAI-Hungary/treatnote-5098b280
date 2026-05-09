// ============================================================
// TreatNote V2 — Protocol Templates
// Atomi akciók előre összeállított kompozíciói
// ============================================================

import type { ProtocolTemplate } from '../shared/types.js';

export const PROTOCOL_TEMPLATES: ProtocolTemplate[] = [
  // ===================== KONZERVÁLÓ =====================
  {
    slug: 'egyfelszinu_tomes',
    nameHu: 'Egyfelszínű kompozit tömés',
    triggers: ['egy felszín tömés', 'egyfelszínű tömés', 'kis tömés', 'O tömés', 'okkl tömés'],
    atomicActions: ['infiltracios_anesztezia', 'kompozit_tomes_1_felszin'],
  },
  {
    slug: 'tobbfelszinu_tomes',
    nameHu: 'Többfelszínű kompozit tömés',
    triggers: ['MOD tömés', 'OD tömés', 'MO tömés', 'többfelszínű', 'két felszín', 'három felszín', 'háromfelszínű'],
    atomicActions: ['infiltracios_anesztezia', 'kofferdam', 'kompozit_tomes_tobb_felszin'],
  },
  {
    slug: 'frontfog_tomes_template',
    nameHu: 'Frontfog tömés',
    triggers: ['frontfog tömés', 'elülső fog tömés', 'esztétikus tömés front'],
    atomicActions: ['infiltracios_anesztezia', 'frontfog_tomes'],
  },
  {
    slug: 'amalgam_csere',
    nameHu: 'Amalgám csere kompozitra',
    triggers: ['amalgám csere', 'régi tömés csere', 'amalgám eltávolítás'],
    atomicActions: ['infiltracios_anesztezia', 'kofferdam', 'amalgam_eltavolitas', 'kompozit_tomes_tobb_felszin'],
  },
  {
    slug: 'baradzazaras_template',
    nameHu: 'Barázdazárás',
    triggers: ['barázdazárás', 'sealant', 'fissura zárás'],
    atomicActions: ['barzdazaras'],
  },
  {
    slug: 'gyokerkezeles_egyszeri',
    nameHu: 'Gyökérkezelés (egyszeri ülés)',
    triggers: ['gyökérkezelés', 'RCT', 'endo', 'endodontia', 'gyökérkezelés gyökértöméssel'],
    atomicActions: ['infiltracios_anesztezia', 'kofferdam', 'trepanalas', 'csatorna_feltaras', 'csatorna_atoblites', 'gyokertomes', 'ideiglenes_tomes'],
  },
  {
    slug: 'gyokerkezeles_tobbalkalom',
    nameHu: 'Gyökérkezelés (első alkalom, gyökértömés nélkül)',
    triggers: ['gyökérkezelés több ülés', 'gyökérkezelés többalkalmas', 'gyökérkezelés első alkalom'],
    atomicActions: ['infiltracios_anesztezia', 'kofferdam', 'trepanalas', 'csatorna_feltaras', 'csatorna_atoblites', 'ideiglenes_tomes'],
  },
  {
    slug: 'gyokertomes_befejez',
    nameHu: 'Gyökértömés (befejező alkalom)',
    triggers: ['gyökértömés', 'befejező gyökérkezelés', 'végleges gyökértömés'],
    atomicActions: ['infiltracios_anesztezia', 'kofferdam', 'gyokertomes', 'ideiglenes_tomes'],
  },
  {
    slug: 'ujragyokerkezeles',
    nameHu: 'Újra-gyökérkezelés (retreatment)',
    triggers: ['újra gyökérkezelés', 'retreatment', 'reendo', 'gyökértömés eltávolítás', 'revízió gyökérkezelés'],
    atomicActions: ['infiltracios_anesztezia', 'kofferdam', 'gyokertomes_eltavolitas', 'csatorna_feltaras', 'csatorna_atoblites', 'ideiglenes_tomes'],
  },
  {
    slug: 'endo_plusz_korona',
    nameHu: 'Gyökérkezelés + korona prep (kombinált)',
    triggers: ['gyökérkezelés és korona', 'endo és korona', 'gyökérkezelés utána korona'],
    atomicActions: ['infiltracios_anesztezia', 'kofferdam', 'trepanalas', 'csatorna_feltaras', 'csatorna_atoblites', 'gyokertomes', 'csapos_felepites', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'],
  },
  {
    slug: 'direkt_hej_template',
    nameHu: 'Direkt kompozit héj',
    triggers: ['direkt héj', 'direkt kompozit héj', 'kompozit veneer'],
    atomicActions: ['infiltracios_anesztezia', 'direkt_hej'],
  },
  {
    slug: 'biomimetikus_template',
    nameHu: 'Biomimetikus ládaemelés + tömés',
    triggers: ['biomimetikus', 'ládaemelés', 'deep margin elevation'],
    atomicActions: ['infiltracios_anesztezia', 'kofferdam', 'biomimetikus_ladaemeles', 'kompozit_tomes_tobb_felszin'],
  },

  // ===================== FOGPÓTLÁSTAN: KORONA =====================
  {
    slug: 'fem_keramia_korona_elso_ules',
    nameHu: 'Fém-kerámia korona (prep + lenyomat)',
    triggers: ['fémkerámia korona', 'fém kerámia korona', 'PFM korona', 'porcelán borítású fémkorona'],
    atomicActions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'],
  },
  {
    slug: 'cirkon_korona_elso_ules',
    nameHu: 'Cirkónium korona (prep + scan)',
    triggers: ['cirkon korona', 'cirkónium korona', 'fémmentes korona', 'full kontúr korona'],
    atomicActions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'],
  },
  {
    slug: 'emax_korona_template',
    nameHu: 'E.max préskerámia korona',
    triggers: ['E.max korona', 'préskerámia korona', 'Empress korona'],
    atomicActions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'],
  },
  {
    slug: 'korona_vazproba',
    nameHu: 'Korona vázpróba',
    triggers: ['vázpróba', 'próba', 'illesztés'],
    atomicActions: ['vazproba'],
  },
  {
    slug: 'korona_atadas',
    nameHu: 'Korona átadás (cementálás)',
    triggers: ['korona átadás', 'korona cementálás', 'korona beragasztás', 'végleges korona'],
    atomicActions: ['korona_cementalas'],
  },
  {
    slug: 'korona_csere',
    nameHu: 'Korona csere (levétel + új prep)',
    triggers: ['korona csere', 'korona levétel', 'régi korona csere'],
    atomicActions: ['infiltracios_anesztezia', 'korona_levetel', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'],
  },

  // ===================== FOGPÓTLÁSTAN: HÍD =====================
  {
    slug: 'hid_elso_ules',
    nameHu: 'Híd (prep + lenyomat)',
    triggers: ['híd készítés', 'hídpótlás', 'híd prep'],
    atomicActions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'],
    description: 'korona_preparacio és ideiglenes_korona pillérenként, hidtag ponticonként',
  },
  {
    slug: 'hid_vazproba',
    nameHu: 'Híd vázpróba',
    triggers: ['híd vázpróba', 'híd próba'],
    atomicActions: ['vazproba'],
  },
  {
    slug: 'hid_atadas',
    nameHu: 'Híd átadás (cementálás)',
    triggers: ['híd átadás', 'híd cementálás', 'híd beragasztás'],
    atomicActions: ['korona_cementalas'],
  },

  // ===================== FOGPÓTLÁSTAN: INLAY/ONLAY/VENEER =====================
  {
    slug: 'inlay_onlay_prep',
    nameHu: 'Inlay/Onlay (prep + lenyomat)',
    triggers: ['inlay', 'onlay', 'betét készítés', 'kerámia betét'],
    atomicActions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_tomes'],
  },
  {
    slug: 'inlay_onlay_atadas',
    nameHu: 'Inlay/Onlay átadás',
    triggers: ['inlay átadás', 'onlay átadás', 'betét beragasztás', 'betét átadás'],
    atomicActions: ['infiltracios_anesztezia', 'kofferdam', 'korona_cementalas'],
  },
  {
    slug: 'veneer_prep',
    nameHu: 'Héjkerámia prep',
    triggers: ['veneer', 'héj', 'héjkerámia', 'porcelán héj'],
    atomicActions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel'],
  },
  {
    slug: 'veneer_atadas',
    nameHu: 'Héjkerámia átadás',
    triggers: ['veneer átadás', 'héj ragasztás', 'héj átadás'],
    atomicActions: ['infiltracios_anesztezia', 'kofferdam', 'korona_cementalas'],
  },

  // ===================== SZÁJSEBÉSZET =====================
  {
    slug: 'egyszeru_extractio',
    nameHu: 'Egyszerű fogeltávolítás',
    triggers: ['foghúzás', 'extractio', 'fogkihúzás', 'fog eltávolítás'],
    atomicActions: ['infiltracios_anesztezia', 'extractio_egyszeru'],
  },
  {
    slug: 'sebeszeti_extractio',
    nameHu: 'Sebészeti fogeltávolítás',
    triggers: ['sebészi extractio', 'bölcsességfog', 'műtéti fogeltávolítás', 'retineált'],
    atomicActions: ['infiltracios_anesztezia', 'muteti_elokeszites', 'extractio_sebeszeti'],
  },
  {
    slug: 'extractio_socket_prezervacio',
    nameHu: 'Extractio + socket prezervació',
    triggers: ['extractio csontpótlással', 'fog eltávolítás és socket', 'húzás és feltöltés'],
    atomicActions: ['infiltracios_anesztezia', 'extractio_egyszeru', 'socket_prezervacio', 'csontpotlas', 'membran'],
  },
  {
    slug: 'frenulektomia_template',
    nameHu: 'Frenulektómia',
    triggers: ['frenulektómia', 'frenulum', 'nyelv fék', 'ajak fék'],
    atomicActions: ['infiltracios_anesztezia', 'frenulektomia'],
  },
  {
    slug: 'postop_kontroll',
    nameHu: 'Műtét utáni kontroll',
    triggers: ['kontroll', 'varratszedés', 'műtét utáni', 'sebkontroll'],
    atomicActions: ['varratszedes'],
  },

  // ===================== IMPLANTÁCIÓ =====================
  {
    slug: 'implantatum_beultes_alap',
    nameHu: 'Implantátum beültetés (alap)',
    triggers: ['implantátum beültetés', 'fogbeültetés', 'implant beültetés'],
    atomicActions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'navigalt_sebeszet', 'implantatum_beultes', 'gyogyulasi_sapka'],
  },
  {
    slug: 'implantatum_csontpotlassal',
    nameHu: 'Implantátum beültetés csontpótlással',
    triggers: ['implantátum csontpótlással', 'implant augmentációval', 'implant és csontpótlás'],
    atomicActions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'navigalt_sebeszet', 'implantatum_beultes', 'csontpotlas', 'membran', 'gyogyulasi_sapka'],
  },
  {
    slug: 'sinus_lift_implanttal',
    nameHu: 'Sinus lift + implantátum',
    triggers: ['sinus lift', 'arcüreg emelés', 'sinus lift implanttal'],
    atomicActions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'sinus_lift_nyilt', 'csontpotlas', 'membran', 'implantatum_beultes'],
  },
  {
    slug: 'sinus_lift_onallo',
    nameHu: 'Sinus lift (önálló, implant nélkül)',
    triggers: ['sinus lift önálló', 'arcüreg emelés majd később implant'],
    atomicActions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'sinus_lift_nyilt', 'csontpotlas', 'membran'],
  },
  {
    slug: 'implant_feltaras_2_fazis',
    nameHu: 'Implantátum feltárás (2. fázis)',
    triggers: ['implant feltárás', 'implantátum szabadítás', 'gyógyulási sapka csere', 'implant 2. fázis'],
    atomicActions: ['infiltracios_anesztezia', 'gyogyulasi_sapka'],
    description: 'Gyógyulási idő után: implant feltárás, ínyformázó csere',
  },
  {
    slug: 'implant_lenyomat',
    nameHu: 'Implantátum lenyomat (scan body)',
    triggers: ['implant lenyomat', 'implant scan', 'scan body'],
    atomicActions: ['scan_body', 'lenyomatvetel'],
  },
  {
    slug: 'implant_abutment_atadas',
    nameHu: 'Implant: abutment + korona átadás',
    triggers: ['implant korona átadás', 'implantátum korona', 'abutment behelyezés és korona'],
    atomicActions: ['abutment', 'implant_korona'],
  },
  {
    slug: 'implant_ideiglenes_korona_template',
    nameHu: 'Azonnali ideiglenes korona implantátumra',
    triggers: ['azonnali terhelés', 'immediate loading', 'ideiglenes korona implantátumra'],
    atomicActions: ['implant_ideiglenes_korona'],
  },
  {
    slug: 'csontpotlas_onallo',
    nameHu: 'Csontpótlás (önálló)',
    triggers: ['csontpótlás', 'csontaugmentáció', 'ridge augmentáció', 'csontépítés'],
    atomicActions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'csontpotlas', 'membran'],
  },
  {
    slug: 'all_on_4',
    nameHu: 'All-on-4 (teljes ív)',
    triggers: ['all on 4', 'all-on-four', 'teljes ív 4 implant'],
    atomicActions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'navigalt_sebeszet', 'implantatum_beultes', 'implantatum_beultes', 'implantatum_beultes', 'implantatum_beultes', 'implant_ideiglenes_korona'],
    description: '4 implantátum + azonnali ideiglenes ív',
  },
  {
    slug: 'all_on_6',
    nameHu: 'All-on-6 (teljes ív)',
    triggers: ['all on 6', 'all-on-six', 'teljes ív 6 implant'],
    atomicActions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'navigalt_sebeszet', 'implantatum_beultes', 'implantatum_beultes', 'implantatum_beultes', 'implantatum_beultes', 'implantatum_beultes', 'implantatum_beultes', 'implant_ideiglenes_korona'],
    description: '6 implantátum + azonnali ideiglenes ív',
  },

  // ===================== PARODONTOLÓGIA =====================
  {
    slug: 'dentalhigieniai_kezeles',
    nameHu: 'Dentálhigiéniai kezelés (teljes)',
    triggers: ['fogkő', 'depurálás', 'tisztítás', 'scaling', 'higiéniai kezelés', 'dentálhigiénia'],
    atomicActions: ['depuralas', 'air_flow'],
  },
  {
    slug: 'zart_kurett_template',
    nameHu: 'Zárt kürett (gyógyszeres)',
    triggers: ['zárt kürett', 'kürettázs', 'tasakkezelés', 'parodontális kezelés'],
    atomicActions: ['infiltracios_anesztezia', 'zart_kurett'],
  },
  {
    slug: 'nyilt_kurett_template',
    nameHu: 'Nyílt kürett (lebenyműtét)',
    triggers: ['nyílt kürett', 'lebenyműtét', 'paro műtét', 'flap'],
    atomicActions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'nyilt_kurett'],
  },
  {
    slug: 'paro_kontroll',
    nameHu: 'Parodontológiai kontroll',
    triggers: ['paro kontroll', 'parodontológiai kontroll', 'tasakmérés kontroll'],
    atomicActions: ['parodontologiai_vizsgalat'],
  },
  {
    slug: 'inygrafit_template',
    nameHu: 'Kötőszöveti graft (ínyrecesszió)',
    triggers: ['ínyrecesszió', 'ínyvisszahúzódás', 'graft', 'kötőszöveti graft', 'ínyplasztika'],
    atomicActions: ['infiltracios_anesztezia', 'muteti_elokeszites', 'inygrafit'],
  },

  // ===================== DIAGNOSZTIKA =====================
  {
    slug: 'elso_vizsgalat',
    nameHu: 'Első vizsgálat + diagnosztika',
    triggers: ['első vizsgálat', 'konzultáció', 'állapotfelmérés', 'betegvizsgálat'],
    atomicActions: ['konzultacio', 'panorama_rtg', 'fotodokumentacio'],
  },
  {
    slug: 'implant_tervezes',
    nameHu: 'Implantátum tervezés (CBCT + konzultáció)',
    triggers: ['implant tervezés', 'CT vizsgálat', 'CBCT', 'implant konzultáció'],
    atomicActions: ['konzultacio', 'cbct'],
  },
  {
    slug: 'mosolytervezes_template',
    nameHu: 'Mosolytervezés (Smile Design)',
    triggers: ['mosolytervezés', 'smile design', 'wax-up', 'mock-up'],
    atomicActions: ['konzultacio', 'fotodokumentacio', 'intraoralis_scan', 'mosolytervezes'],
  },

  // ===================== ESZTÉTIKA =====================
  {
    slug: 'feherites_rendeloi_template',
    nameHu: 'Rendelői fogfehérítés',
    triggers: ['rendelői fehérítés', 'in-office whitening', 'Zoom fehérítés', 'professzionális fehérítés'],
    atomicActions: ['feherites_rendeloi'],
  },
  {
    slug: 'feherites_otthoni_template',
    nameHu: 'Otthoni fogfehérítés (sín készítés)',
    triggers: ['otthoni fehérítés', 'fehérítő sín', 'home bleaching', 'Opalescence otthoni'],
    atomicActions: ['lenyomatvetel', 'feherites_otthoni'],
  },

  // ===================== FOGSZABÁLYOZÁS =====================
  {
    slug: 'fogszab_konzultacio',
    nameHu: 'Fogszabályozás konzultáció',
    triggers: ['fogszabályozás konzultáció', 'ortodonciai konzultáció', 'szabályozás terv'],
    atomicActions: ['konzultacio', 'fogszab_lenyomat'],
  },
  {
    slug: 'rogzitett_keszulek_template',
    nameHu: 'Rögzített fogszabályozó készülék átadás',
    triggers: ['bracket ragasztás', 'multibond', 'fogszabályozó átadás', 'rögzített készülék'],
    atomicActions: ['rogzitett_keszulek_atadas'],
  },
  {
    slug: 'fogszab_kontroll',
    nameHu: 'Fogszabályozó kontroll / aktiválás',
    triggers: ['fogszab kontroll', 'ívcsere', 'gumicsere', 'fogszab aktiválás'],
    atomicActions: ['fogszab_aktivalas'],
  },

  // ===================== EGYÉB =====================
  {
    slug: 'harapasemelo_keszites',
    nameHu: 'Harapásemelő / bruxizmus sín készítés',
    triggers: ['harapásemelő', 'bruxizmus sín', 'fogcsikorgatás', 'éjszakai sín', 'stabilizációs sín'],
    atomicActions: ['lenyomatvetel', 'harapasemelo_sin'],
  },
  {
    slug: 'occlusio_template',
    nameHu: 'Occlusio beállítás / becsiszolás',
    triggers: ['occlusio', 'becsiszolás', 'harapás beállítás'],
    atomicActions: ['occlusio_beallitas'],
  },
];

/** Slug alapján keresés */
export const TEMPLATE_BY_SLUG = new Map<string, ProtocolTemplate>(
  PROTOCOL_TEMPLATES.map(t => [t.slug, t])
);
