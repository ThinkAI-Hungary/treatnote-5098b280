// ============================================================
// TreatNote V2 — Clinical Phase Definitions (Edge Function version)
// Klinikai fázisok és prioritások a vizit-sorrendezéshez
// ============================================================

export interface ClinicalPhase {
  slug: string;
  nameHu: string;
  priority: number;   // -1 = independent, 0-7 = sequential ordering
}

/**
 * Clinical phase priority table (Pass F).
 * Lower priority = earlier in the treatment sequence.
 * Priority -1 = independent (can run in parallel, typically its own visit).
 *
 * Same-priority actions CAN be in the same visit.
 * Different-priority actions go to SEPARATE visits (sequential).
 */
export const CLINICAL_PHASES: ClinicalPhase[] = [
  { slug: 'diagnosztika',              nameHu: 'Diagnosztika',              priority: 0 },
  { slug: 'parodontologia',            nameHu: 'Parodontológia',            priority: 1 },
  { slug: 'extractio',                 nameHu: 'Extractio',                 priority: 2 },
  { slug: 'csontpotlas',               nameHu: 'Csontpótlás',              priority: 3 },
  { slug: 'implantacio_sebeszeti',     nameHu: 'Implantáció (sebészi)',     priority: 4 },
  { slug: 'implantacio_protetikai',    nameHu: 'Implantáció (protetikai)',  priority: 5 },
  { slug: 'protetikai_elokeszites',    nameHu: 'Protetikai előkészítés',   priority: 6 },
  { slug: 'protetikai_atadas',         nameHu: 'Protetikai átadás',        priority: 7 },
  { slug: 'konzervalo',                nameHu: 'Konzerváló',               priority: -1 },
];

/**
 * Map each atomic action slug → clinical phase slug.
 * This determines which phase an action belongs to.
 */
export const ACTION_TO_PHASE: Record<string, string> = {
  // ── Diagnosztika (priority 0) ──
  konzultacio: 'diagnosztika',
  intraoralis_rtg: 'diagnosztika',
  panorama_rtg: 'diagnosztika',
  cbct: 'diagnosztika',
  intraoralis_scan: 'diagnosztika',
  fotodokumentacio: 'diagnosztika',
  mosolytervezes: 'diagnosztika',

  // ── Parodontológia (priority 1) ──
  depuralas: 'parodontologia',
  air_flow: 'parodontologia',
  zart_kurett: 'parodontologia',
  nyilt_kurett: 'parodontologia',
  parodontologiai_vizsgalat: 'parodontologia',
  ecseteles: 'parodontologia',

  // ── Extractio (priority 2) ──
  extractio_egyszeru: 'extractio',
  extractio_sebeszeti: 'extractio',

  // ── Csontpótlás (priority 3) ──
  socket_prezervacio: 'csontpotlas',
  csontpotlas: 'csontpotlas',
  membran: 'csontpotlas',
  sinus_lift_nyilt: 'csontpotlas',
  sinus_lift_zart: 'csontpotlas',

  // ── Implantáció sebészi (priority 4) ──
  implantatum_beultes: 'implantacio_sebeszeti',
  navigalt_sebeszet: 'implantacio_sebeszeti',

  // ── Implantáció protetikai (priority 5) ──
  abutment: 'implantacio_protetikai',
  gyogyulasi_sapka: 'implantacio_protetikai',
  scan_body: 'implantacio_protetikai',
  implant_korona: 'implantacio_protetikai',
  implant_ideiglenes_korona: 'implantacio_protetikai',

  // ── Protetikai előkészítés (priority 6) ──
  korona_preparacio: 'protetikai_elokeszites',
  korona_levetel: 'protetikai_elokeszites',
  lenyomatvetel: 'protetikai_elokeszites',
  ideiglenes_korona: 'protetikai_elokeszites',
  csapos_felepites: 'protetikai_elokeszites',
  vazproba: 'protetikai_elokeszites',

  // ── Protetikai átadás (priority 7) ──
  korona_cementalas: 'protetikai_atadas',

  // ── Konzerváló (priority -1, independent) ──
  trepanalas: 'konzervalo',
  csatorna_feltaras: 'konzervalo',
  csatorna_atoblites: 'konzervalo',
  gyokertomes: 'konzervalo',
  gyokertomes_eltavolitas: 'konzervalo',
  ideiglenes_tomes: 'konzervalo',
  kompozit_tomes_1_felszin: 'konzervalo',
  kompozit_tomes_tobb_felszin: 'konzervalo',
  frontfog_tomes: 'konzervalo',
  amalgam_eltavolitas: 'konzervalo',
  barzdazaras: 'konzervalo',
  biomimetikus_ladaemeles: 'konzervalo',

  // ── Közös (sesszió-szintű, a fázis szerint megy) ──
  infiltracios_anesztezia: '_inherit',   // inherits phase from context
  vezetekes_anesztezia: '_inherit',
  intraligamentaris_anesztezia: '_inherit',
  kofferdam: '_inherit',
  muteti_elokeszites: '_inherit',
  varratszedes: '_inherit',
  postop_kontroll: '_inherit',
  lezer_kezeles: '_inherit',
  hosszutavu_ideiglenes: '_inherit',

  // ── Fogszabályozás ──
  rogzitett_keszulek_atadas: 'protetikai_elokeszites',
  fogszab_aktivalas: 'protetikai_elokeszites',
  fogszab_levetel: 'protetikai_atadas',
  invisalign_atadas: 'protetikai_elokeszites',
  invisalign_kontroll: 'protetikai_elokeszites',
  retainer_ragasztas: 'protetikai_atadas',
  harapasemelo_sin: 'protetikai_elokeszites',

  // ── Fehérítés ──
  feherites_rendeloi: 'konzervalo',
  feherites_otthoni: 'konzervalo',
};

/** Look up the clinical phase priority for a given action slug */
export function getPhaseForAction(actionSlug: string): ClinicalPhase | null {
  const phaseSlug = ACTION_TO_PHASE[actionSlug];
  if (!phaseSlug || phaseSlug === '_inherit') return null;
  return CLINICAL_PHASES.find(p => p.slug === phaseSlug) || null;
}

/** Get priority for an action. Returns -1 for independent, null for inheriting. */
export function getPriorityForAction(actionSlug: string): number | null {
  const phase = getPhaseForAction(actionSlug);
  return phase ? phase.priority : null;
}
