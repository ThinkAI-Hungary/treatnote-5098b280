// ============================================================
// TreatNote V2 — Global Defaults (Edge Function version)
// Klinika felülírhatja az onboarding során
// ============================================================

export const GLOBAL_DEFAULTS = {
  korona_anyag: 'fem_keramia' as const,
  tomo_anyag: 'nano_hibrid_kompozit' as const,
  anesztezia: 'infiltracios' as const,
  anesztezia_also_molaris: 'vezetekes' as const,
  gyokertomo_anyag: 'ah_plus_guttapercha' as const,
  lenyomat: 'digitalis' as const,

  /** Default csatornaszámok FDI fog-csoportonként */
  csatornaszam: {
    felso_metszok: 1,
    also_metszok: 1,
    szemfogak: 1,
    felso_premolarisok: 2,
    also_premolarisok: 1,
    felso_molarisok: 3,
    also_molarisok: 3,
  },
} as const;

export type GlobalDefaults = typeof GLOBAL_DEFAULTS;
