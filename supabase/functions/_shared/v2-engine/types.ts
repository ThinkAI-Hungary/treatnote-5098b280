// ============================================================
// TreatNote V2 Engine — Shared Types (Edge Function version)
// ============================================================

/** Klinikai kategóriák */
export type ClinicalCategory =
  | 'konzervalo_fogaszat'
  | 'fogpotlastan'
  | 'szajsebeszet'
  | 'implantacio'
  | 'parodontologia'
  | 'diagnosztika'
  | 'fogszabalyozas'
  | 'kozos';

/** Scaling mód — meghatározza, mire vonatkozik a tétel */
export type ScalingMode =
  | 'per_tooth'       // foganként (pl. tömés, korona, extractio)
  | 'per_canal'       // csatornánként (pl. gyökérkezelés)
  | 'per_surface'     // felszínenként (pl. tömés felszínszáma)
  | 'per_arch'        // állcsontonként (pl. depurálás, fehérítés)
  | 'per_quadrant'    // kvadránsonként (pl. kürett)
  | 'per_sextant'     // szeksztánsonként
  | 'per_session'     // alkalmankénti / fix (pl. konzultáció, panoráma)
  | 'per_unit';       // darabonkénti (pl. implant, membrán)

/** Paraméter típusok */
export type ParamType = 'int' | 'string' | 'enum' | 'enum_list' | 'boolean';

/** Egy paraméter definíciója az atomi akcióban */
export interface ParameterDef {
  name: string;
  type: ParamType;
  required: boolean;
  values?: string[];       // enum/enum_list értékek
  min?: number;            // int min, vagy enum_list min_count
  max?: number;            // int max, vagy enum_list max_count
  default?: string | number | boolean;
  description?: string;    // rövid leírás
}

/** Atomi akció — a V2 katalógus alapegysége */
export interface AtomicAction {
  slug: string;            // egyedi azonosító: 'kompozit_tomes_1_felszin'
  nameHu: string;          // magyar név
  category: ClinicalCategory;
  parameters: ParameterDef[];
  scaling: ScalingMode;    // hogyan kell számolni a mennyiséget
  embeddingText: string;   // szöveg amiből embedding készül (onboarding mapping-hez)
  description?: string;    // opcionális leírás
}

/** Protokoll-template — atomi akciók előre összeállított kompozíciója */
export interface ProtocolTemplate {
  slug: string;
  nameHu: string;
  triggers: string[];      // AI trigger szavak/kifejezések
  atomicActions: string[]; // atomi akció slug-ok sorrendben
  description?: string;
}

/** Klinika-mapping: atomi akció → klinika szótár tétel */
export interface ClinicMapping {
  id: string;
  telephelyId: string;
  szotarKezelesId: string;       // FK → szotar_kezelesek
  szotarKezelesName: string;     // klinika-tétel neve
  atomicActionSlug: string;
  conditions: Record<string, unknown>;  // {"surface_count": 3}
  confidence: number;
  reviewed: boolean;
}

/** Runtime: egy protokoll-példány (AI kimenet) */
export interface ProtocolInstance {
  templateSlug: string | null;   // null = ad hoc (nincs template)
  confidence: number;
  parameters: Record<string, unknown>;
  atomicActions: AtomicActionInstance[];
}

/** Runtime: egy atomi akció instancia paraméterekkel */
export interface AtomicActionInstance {
  slug: string;
  parameters: Record<string, unknown>;
  confidence?: number;
}

/** Runtime: session (egy diktálás) */
export interface Session {
  id: string;
  telephelyId: string;
  doctorId?: string;
  patientRef?: string;
  transcript?: string;
  protocolInstances: ProtocolInstance[];
  reviewStatus: 'pending_quick' | 'pending_full' | 'approved' | 'rejected';
}

/** FDI fogtípus csoportok */
export type ToothRegion =
  | 'felso_metszok'       // 11-12, 21-22
  | 'also_metszok'        // 31-32, 41-42
  | 'szemfogak'           // 13, 23, 33, 43
  | 'felso_premolarisok'  // 14-15, 24-25
  | 'also_premolarisok'   // 34-35, 44-45
  | 'felso_molarisok'     // 16-18, 26-28
  | 'also_molarisok';     // 36-38, 46-48
