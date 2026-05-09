// ============================================================
// TreatNote V2 — Atomic Action slug → human-readable name map
// Source: new_engine/catalog/actions-*.ts
// ============================================================

/** slug → magyar név */
export const ATOMIC_ACTION_NAMES: Record<string, string> = {
  // Konzerváló
  kompozit_tomes_1_felszin: 'Kompozit tömés (1 felszín)',
  kompozit_tomes_tobb_felszin: 'Kompozit tömés (több felszín)',
  frontfog_tomes: 'Frontfog tömés',
  ideiglenes_tomes: 'Ideiglenes tömés',
  caries_eltavolitas: 'Caries eltávolítás',
  amalgam_eltavolitas: 'Amalgám eltávolítás',
  barzdazaras: 'Barázdazárás',
  biomimetikus_ladaemeles: 'Biomimetikus ládaemelés',
  direkt_hej: 'Direkt kompozit héj',
  trepanalas: 'Trepanálás (hozzáférés)',
  csatorna_feltaras: 'Csatornafeltárás és tágítás',
  csatorna_atoblites: 'Csatorna átöblítés és gyógyszeres zárás',
  gyokertomes: 'Gyökértömés',
  gyokerkezeles_csatornankent: 'Gyökérkezelés (csatornánként)',
  gyokertomes_eltavolitas: 'Gyökértömés eltávolítás',
  csapos_felepites: 'Csapos felépítés',
  direkt_felszin_felepites: 'Direkt felépítés',
  fedotomes: 'Fedőtömés',
  tomes_eltavolitas: 'Tömés eltávolítás',

  // Fogpótlástan
  korona_preparacio: 'Korona preparáció',
  lenyomatvetel: 'Lenyomatvétel',
  harapasrogzites: 'Harapásrögzítés',
  ideiglenes_korona: 'Ideiglenes korona',
  vazproba: 'Vázpróba',
  korona_cementalas: 'Korona/híd cementálás (átadás)',
  fem_keramia_korona: 'Fém-kerámia korona',
  cirkon_korona: 'Cirkónium korona',
  emax_korona: 'E.max préskerámia korona',
  hidtag: 'Hídtag',
  inlay_onlay: 'Inlay / Onlay betét',
  veneer_hej: 'Héjkerámia (veneer)',
  implant_korona: 'Korona implantátumra',
  implant_ideiglenes_korona: 'Ideiglenes korona implantátumra',
  fogszin_meghatarozas: 'Fogszín meghatározás',
  korona_levetel: 'Korona levétel / átvágás',
  hosszutavu_ideiglenes: 'Hosszútávú ideiglenes korona/híd',
  egyeni_kanal: 'Egyéni kanál',

  // Szájsebészet
  extractio_egyszeru: 'Extractio (egyszerű)',
  extractio_sebeszeti: 'Extractio (sebészeti feltárásból)',
  varratszedes: 'Varratszedés',
  sebellatas: 'Sebellátás / sebtoilette',
  frenulektomia: 'Frenulektómia',
  vestibulum_plasztika: 'Vesztibulum plasztika',

  // Implantáció
  implantatum_beultes: 'Implantátum beültetés',
  gyogyulasi_sapka: 'Gyógyulási sapka behelyezés',
  abutment: 'Felépítő fej (abutment)',
  scan_body: 'Scan body',
  csontpotlas: 'Csontpótlás',
  membran: 'Membrán alkalmazás',
  sinus_lift_nyilt: 'Sinus lift (nyílt)',
  sinus_lift_zart: 'Sinus lift (zárt)',
  socket_prezervacio: 'Socket prezervació (alveolus)',
  navigalt_sebeszet: 'Navigált sebészeti sablon',
  muteti_elokeszites: 'Műtéti előkészítés',

  // Parodontológia
  depuralas: 'Depurálás (fogkőeltávolítás + polírozás)',
  zart_kurett: 'Zárt kürett',
  nyilt_kurett: 'Nyílt kürett (lebenyműtét)',
  parodontologiai_vizsgalat: 'Parodontológiai vizsgálat',
  air_flow: 'Air-flow / biofilm terápia',
  inygrafit: 'Kötőszöveti graft',

  // Diagnosztika
  konzultacio: 'Konzultáció / betegvizsgálat',
  intraoralis_rtg: 'Intraorális röntgen',
  panorama_rtg: 'Panoráma röntgen',
  cbct: 'CBCT (3D CT)',
  intraoralis_scan: 'Intraorális szkenner',
  fotodokumentacio: 'Fotódokumentáció',
  mosolytervezes: 'Mosolytervezés / Smile Design',

  // Közös
  infiltracios_anesztezia: 'Infiltrációs érzéstelenítés',
  vezetekes_anesztezia: 'Vezetéses érzéstelenítés',
  intraligamentaris_anesztezia: 'Intraligamentáris érzéstelenítés',
  kofferdam: 'Kofferdam izolálás',
  ecseteles: 'Ecsetelés / fluoridálás',
  lezer_kezeles: 'Lézer kezelés',

  // Esztétika
  feherites_rendeloi: 'Fogfehérítés (rendelői)',
  feherites_otthoni: 'Fogfehérítés (otthoni)',

  // Fogszabályozás
  rogzitett_keszulek_atadas: 'Rögzített fogszabályozó készülék átadás',
  fogszab_aktivalas: 'Fogszabályozó készülék aktiválás',
  invisalign_aligner: 'Invisalign / aligner kezelés',
  retainer: 'Retainer',
  fogszab_lenyomat: 'Fogszabályozás lenyomat + kezelési terv',

  // Egyéb
  harapasemelo_sin: 'Harapásemelő sín / bruxizmus sín',
  occlusio_beallitas: 'Occlusio beállítás / becsiszolás',
  fog_transzformalas: 'Fog transzformálás',
};

/** Get human-readable name for a slug, fallback to slug itself */
export function actionName(slug: string): string {
  return ATOMIC_ACTION_NAMES[slug] || slug;
}

/** All slugs as sorted options for select dropdowns */
export const ATOMIC_ACTION_OPTIONS = Object.entries(ATOMIC_ACTION_NAMES)
  .map(([slug, name]) => ({ slug, name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'hu'));
