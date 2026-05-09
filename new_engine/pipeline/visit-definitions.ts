// ============================================================
// TreatNote V2 — Visit Definitions
// Multi-visit structures for protocol templates
// Used by: seed-catalog.ts (DB seeding) and 06-format-rpa.ts (RPA output)
// ============================================================

export interface VisitDefinition {
  visit: number;
  name: string;
  actions: string[];
}

/**
 * Multi-visit structures keyed by protocol template slug.
 * If a template slug is not in this map, it's a single-visit protocol.
 */
export const MULTI_VISIT: Record<string, VisitDefinition[]> = {

  // KORONA: prep → vázpróba → átadás
  fem_keramia_korona_elso_ules: [
    { visit: 1, name: 'Preparáció + lenyomat', actions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'] },
    { visit: 2, name: 'Vázpróba', actions: ['vazproba'] },
    { visit: 3, name: 'Korona átadás', actions: ['korona_cementalas'] },
  ],
  cirkon_korona_elso_ules: [
    { visit: 1, name: 'Preparáció + digitális lenyomat', actions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'] },
    { visit: 2, name: 'Korona átadás', actions: ['korona_cementalas'] },
  ],
  emax_korona_template: [
    { visit: 1, name: 'Preparáció + digitális lenyomat', actions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'] },
    { visit: 2, name: 'Korona átadás', actions: ['korona_cementalas'] },
  ],
  korona_csere: [
    { visit: 1, name: 'Régi korona levétel + új preparáció', actions: ['infiltracios_anesztezia', 'korona_levetel', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'] },
    { visit: 2, name: 'Új korona átadás', actions: ['korona_cementalas'] },
  ],

  // HÍD: prep → vázpróba → átadás
  hid_elso_ules: [
    { visit: 1, name: 'Pillérek preparációja + lenyomat', actions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'] },
    { visit: 2, name: 'Vázpróba', actions: ['vazproba'] },
    { visit: 3, name: 'Híd átadás', actions: ['korona_cementalas'] },
  ],

  // VENEER: prep → átadás
  veneer_prep: [
    { visit: 1, name: 'Héj preparáció + lenyomat', actions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel'] },
    { visit: 2, name: 'Héjkerámia ragasztás', actions: ['infiltracios_anesztezia', 'kofferdam', 'korona_cementalas'] },
  ],

  // INLAY/ONLAY: prep → átadás
  inlay_onlay_prep: [
    { visit: 1, name: 'Preparáció + lenyomat', actions: ['infiltracios_anesztezia', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_tomes'] },
    { visit: 2, name: 'Betét ragasztás', actions: ['infiltracios_anesztezia', 'kofferdam', 'korona_cementalas'] },
  ],

  // ENDO + KORONA: 3-4 vizit
  endo_plusz_korona: [
    { visit: 1, name: 'Gyökérkezelés (feltárás)', actions: ['infiltracios_anesztezia', 'kofferdam', 'trepanalas', 'csatorna_feltaras', 'csatorna_atoblites', 'ideiglenes_tomes'] },
    { visit: 2, name: 'Gyökértömés', actions: ['infiltracios_anesztezia', 'kofferdam', 'gyokertomes'] },
    { visit: 3, name: 'Csapos felépítés + korona prep', actions: ['infiltracios_anesztezia', 'csapos_felepites', 'korona_preparacio', 'lenyomatvetel', 'ideiglenes_korona'] },
    { visit: 4, name: 'Korona átadás', actions: ['korona_cementalas'] },
  ],

  // GYÖKÉRKEZELÉS — többalkalmas
  gyokerkezeles_tobbalkalom: [
    { visit: 1, name: 'Feltárás + gyógyszeres zárás', actions: ['infiltracios_anesztezia', 'kofferdam', 'trepanalas', 'csatorna_feltaras', 'csatorna_atoblites', 'ideiglenes_tomes'] },
    { visit: 2, name: 'Gyökértömés', actions: ['infiltracios_anesztezia', 'kofferdam', 'gyokertomes', 'ideiglenes_tomes'] },
  ],

  // RETREATMENT: 2 vizit
  ujragyokerkezeles: [
    { visit: 1, name: 'Régi gyökértömés eltávolítás + átöblítés', actions: ['infiltracios_anesztezia', 'kofferdam', 'gyokertomes_eltavolitas', 'csatorna_feltaras', 'csatorna_atoblites', 'ideiglenes_tomes'] },
    { visit: 2, name: 'Újra-gyökértömés', actions: ['infiltracios_anesztezia', 'kofferdam', 'gyokertomes', 'ideiglenes_tomes'] },
  ],

  // IMPLANTÁCIÓ: műtét → feltárás → lenyomat → korona
  implantatum_beultes_alap: [
    { visit: 1, name: 'Implantátum műtét', actions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'navigalt_sebeszet', 'implantatum_beultes', 'gyogyulasi_sapka'] },
    { visit: 2, name: 'Varratszedés (10-14 nap)', actions: ['varratszedes'] },
    { visit: 3, name: 'Feltárás + lenyomat (3-6 hónap)', actions: ['infiltracios_anesztezia', 'gyogyulasi_sapka', 'scan_body', 'lenyomatvetel'] },
    { visit: 4, name: 'Abutment + korona átadás', actions: ['abutment', 'implant_korona'] },
  ],
  implantatum_csontpotlassal: [
    { visit: 1, name: 'Implantátum műtét + csontpótlás', actions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'navigalt_sebeszet', 'implantatum_beultes', 'csontpotlas', 'membran', 'gyogyulasi_sapka'] },
    { visit: 2, name: 'Varratszedés (10-14 nap)', actions: ['varratszedes'] },
    { visit: 3, name: 'Feltárás + lenyomat (4-8 hónap)', actions: ['infiltracios_anesztezia', 'gyogyulasi_sapka', 'scan_body', 'lenyomatvetel'] },
    { visit: 4, name: 'Abutment + korona átadás', actions: ['abutment', 'implant_korona'] },
  ],
  sinus_lift_implanttal: [
    { visit: 1, name: 'Sinus lift + implantáció', actions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'sinus_lift_nyilt', 'csontpotlas', 'membran', 'implantatum_beultes'] },
    { visit: 2, name: 'Varratszedés', actions: ['varratszedes'] },
    { visit: 3, name: 'Feltárás + lenyomat (6-9 hónap)', actions: ['infiltracios_anesztezia', 'gyogyulasi_sapka', 'scan_body', 'lenyomatvetel'] },
    { visit: 4, name: 'Korona átadás', actions: ['abutment', 'implant_korona'] },
  ],
  sinus_lift_onallo: [
    { visit: 1, name: 'Sinus lift műtét', actions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'sinus_lift_nyilt', 'csontpotlas', 'membran'] },
    { visit: 2, name: 'Varratszedés', actions: ['varratszedes'] },
  ],

  // ALL-ON-4/6: műtét + azonnali → végleges
  all_on_4: [
    { visit: 1, name: 'Implantáció + azonnali terhelés', actions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'navigalt_sebeszet', 'implantatum_beultes', 'implant_ideiglenes_korona', 'hosszutavu_ideiglenes'] },
    { visit: 2, name: 'Varratszedés + kontroll (10-14 nap)', actions: ['varratszedes', 'panorama_rtg'] },
    { visit: 3, name: 'Végleges lenyomat (3-6 hónap)', actions: ['scan_body', 'lenyomatvetel'] },
    { visit: 4, name: 'Végleges híd átadás', actions: ['korona_cementalas'] },
  ],
  all_on_6: [
    { visit: 1, name: 'Implantáció + azonnali terhelés', actions: ['vezetekes_anesztezia', 'muteti_elokeszites', 'navigalt_sebeszet', 'implantatum_beultes', 'implant_ideiglenes_korona', 'hosszutavu_ideiglenes'] },
    { visit: 2, name: 'Varratszedés + kontroll', actions: ['varratszedes', 'panorama_rtg'] },
    { visit: 3, name: 'Végleges lenyomat (3-6 hónap)', actions: ['scan_body', 'lenyomatvetel'] },
    { visit: 4, name: 'Végleges híd átadás', actions: ['korona_cementalas'] },
  ],

  // EXTRACTIO + SOCKET PREZERVÁCIO
  extractio_socket_prezervacio: [
    { visit: 1, name: 'Extractio + socket feltöltés', actions: ['infiltracios_anesztezia', 'extractio_egyszeru', 'socket_prezervacio', 'csontpotlas', 'membran'] },
    { visit: 2, name: 'Varratszedés', actions: ['varratszedes'] },
  ],

  // FOGFEHÉRÍTÉS otthoni: sín + átadás
  feherites_otthoni_template: [
    { visit: 1, name: 'Lenyomat / scan + sín készítés', actions: ['lenyomatvetel'] },
    { visit: 2, name: 'Sín átadás + instrukciók', actions: ['feherites_otthoni'] },
  ],

  // MOSOLYTERVEZÉS
  mosolytervezes_template: [
    { visit: 1, name: 'Konzultáció + scan', actions: ['konzultacio', 'fotodokumentacio', 'intraoralis_scan'] },
    { visit: 2, name: 'Design bemutatás + mock-up', actions: ['mosolytervezes'] },
  ],

  // HARAPÁSEMELŐ
  harapasemelo_keszites: [
    { visit: 1, name: 'Lenyomat', actions: ['lenyomatvetel'] },
    { visit: 2, name: 'Sín átadás + beállítás', actions: ['harapasemelo_sin'] },
  ],
};
