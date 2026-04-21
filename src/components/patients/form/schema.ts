import * as z from 'zod';

export const anamnezisSchema = z.object({
  // Section 1: Általános
  milyen_okkal_keresett_fel: z.string().optional(),
  hajlamos_e_ajulasra: z.enum(['Igen', 'Nem']).optional(),
  alacsony_e_a_vernyomasa: z.enum(['Igen', 'Nem']).optional(),
  szokott_e_zugni_a_fule: z.enum(['Igen', 'Nem']).optional(),
  
  // Section 2: Szív és Érrendszer
  szivbetegseg: z.enum(['Igen', 'Nem']).optional(),
  szivfejlodesi_rendellenesseg: z.enum(['Igen', 'Nem']).optional(),
  mubillentyu_beultetes: z.enum(['Igen', 'Nem']).optional(),
  szivbelhartya_gyulladas: z.enum(['Igen', 'Nem']).optional(),
  szivmutet: z.enum(['Igen', 'Nem']).optional(),
  pacemaker: z.enum(['Igen', 'Nem']).optional(),
  stent: z.enum(['Igen', 'Nem']).optional(),

  // Section 3: Gyógyszerek
  allando_gyogyszerek: z.string().optional(),
  jelenleg_szedett_gyogyszerek: z.string().optional(),
  csontritkulas: z.enum(['Igen', 'Nem']).optional(),
  csontritkulas_gyogyszer: z.string().optional(),
  verhigito: z.enum(['Igen', 'Nem']).optional(),

  // Section 4: Allergiák
  gyogyszer_allergia: z.enum(['Igen', 'Nem']).optional(),
  gyogyszer_allergia_reszletek: z.string().optional(),
  egyeb_allergia: z.string().optional(), 

  // Section 5: Életmód
  varandos_vagy_szoptat: z.enum(['Igen', 'Nem']).optional(),
  alkohol_rendszeresen: z.enum(['Igen', 'Nem']).optional(),
  drog_rendszeresen: z.enum(['Igen', 'Nem']).optional(),
  drog_reszletek: z.string().optional(),
  dohanyzik: z.enum(['Igen', 'Nem']).optional(),
  dohanyzas_mennyiseg: z.string().optional(),

  // Section 6: Egyéb betegségek
  cukorbetegseg: z.enum(['Igen', 'Nem']).optional(),
  inzulin: z.enum(['Igen', 'Nem']).optional(),
  magas_vernyomas: z.enum(['Igen', 'Nem']).optional(),
  pajzsmirigy: z.enum(['Igen', 'Nem']).optional(),
  reumas_betegseg: z.enum(['Igen', 'Nem']).optional(),
  epilepszia: z.enum(['Igen', 'Nem']).optional(),
  
  // Tüdőbetegségek
  tudobetegseg: z.enum(['Igen', 'Nem']).optional(),
  tudo_tbc: z.boolean().default(false),
  tudo_asztma: z.boolean().default(false),
  tudo_kronikus_bronhitisz: z.boolean().default(false),
  tudo_gyulladas: z.boolean().default(false),

  vesebetegseg: z.enum(['Igen', 'Nem']).optional(),
  
  // Idegrendszeri
  idegrendszeri_betegseg: z.enum(['Igen', 'Nem']).optional(),
  ideg_epilepszia: z.boolean().default(false),
  ideg_agyverzes: z.boolean().default(false),
  ideg_benulas: z.boolean().default(false),

  szorongas_depresszio: z.enum(['Igen', 'Nem']).optional(),
  szorongas_gyogyszer: z.string().optional(),

  immunhiany_hiv: z.enum(['Igen', 'Nem']).optional(),
  autoimmun: z.enum(['Igen', 'Nem']).optional(),
  emesztorendszeri: z.enum(['Igen', 'Nem']).optional(),
  
  fertozo_betegseg: z.string().optional(),
  egyeb_betegseg: z.string().optional(),
  korabbi_mutet: z.enum(['Igen', 'Nem']).optional(),
  korabbi_mutet_reszletek: z.string().optional(),
  
  majgyulladas_tipus: z.string().optional(), // Text or dropdown like "A", "B", "C"

  // Section 7: Fogászati Specifikus
  ragoizomzat_fajdalom: z.string().optional(),
  kattog_ragoizulet: z.string().optional(), // 'Bal', 'Jobb', 'Mindkettő'
  fogszabalyozo: z.enum(['Igen', 'Nem']).optional(),
  kapott_erzestelenitest: z.string().optional(), // label says: "Kapott-e már fogászati érzéstelenítést?" text input underneath
  erzestelenites_komplikacio: z.enum(['Igen', 'Nem']).optional(),
  erzestelenites_komplikacio_reszletek: z.string().optional(),

  // Section 8: Alvás és Fájdalmak
  horkol: z.enum(['Igen', 'Nem']).optional(),
  kiakad_allkapocs: z.enum(['Igen', 'Nem']).optional(),
  reggel_fejfajas: z.enum(['Igen', 'Nem']).optional(),
  reggel_nyak_hat_fajas: z.enum(['Igen', 'Nem']).optional(),
  forgolodik_alvas_kozben: z.enum(['Igen', 'Nem']).optional(),
  migrenes_fejfajas: z.enum(['Igen', 'Nem']).optional(),
  nappali_almossag: z.enum(['Igen', 'Nem']).optional(),
  delutan_nyakfajas: z.enum(['Igen', 'Nem']).optional(),
  delutan_fejfajas: z.enum(['Igen', 'Nem']).optional(),
  
  fejfajas_suruseg: z.string().optional(), // Dropdown: Naponta stb
  nyakfajas_suruseg: z.string().optional(), // Dropdown

  fajdalom_reszletezes: z.string().optional(),
  egyeb_befolyasolo_korulmeny: z.string().optional(),
  honnan_ertesult: z.string().optional(),

  // Nyilatkozatok
  nyilatkozat_adatkezeles: z.boolean().default(false),
  nyilatkozat_email: z.enum(['Igen', 'Nem']).optional(),
  nyilatkozat_tajekoztatas: z.boolean().default(false),
  nyilatkozat_kockazat: z.boolean().default(false),
  nyilatkozat_rtg_megtart: z.boolean().default(false),
  nyilatkozat_megertettem: z.boolean().default(false),
});

export const patientWizardSchema = z.object({
  // STEP 1: Alap_adatok
  titulus: z.string().optional(),
  vezeteknev: z.string().min(1, 'A vezetéknév kötelező'),
  keresztnev: z.string().min(1, 'A keresztnév kötelező'),
  szuletesi_vezeteknev: z.string().optional(),
  szuletesi_keresztnev: z.string().optional(),
  anyja_neve: z.string().optional(),
  neme: z.string().optional(),
  szuletesi_ido: z.string().optional(),
  szuletesi_hely: z.string().optional(),
  azonosito_okmany_tipusa: z.string().optional(),
  taj_szam: z.string().nullable().optional(),
  flexident_id: z.string().nullable().optional(),
  naptar_megjegyzes: z.string().nullable().optional(),
  orszag: z.string().default('Magyarország'),
  iranyitoszam: z.string().min(1, 'Irányítószám kötelező'),
  varos: z.string().min(1, 'A város kötelező'),
  utca_hazszam: z.string().min(1, 'Az utca és házszám kötelező'),
  telefon_1_orszagkod: z.string().default('36').refine(val => !val || (val.length === 2 && /^\d+$/.test(val)), { message: 'Az országkód értékének 2 számjegyből kell állnia.' }),
  telefon_1_korzet: z.string().optional().refine(val => !val || (val.length === 2 && /^\d+$/.test(val)), { message: 'A szolgáltató értékének 2 számjegyből kell állnia.' }),
  telefon_1_hivoszam: z.string().optional().refine(val => !val || (val.length === 7 && /^\d+$/.test(val)), { message: 'A hívószám értékének 7 számjegyből kell állnia.' }),
  telefon_1_leiras: z.string().optional(),
  kaphat_email_ertesitot: z.boolean().default(false),
  kapcsolattarto_email: z.string().email('Az e-mail címnek tartalmaznia kell egy @ jelet!').optional().or(z.literal('')),
  inaktiv_paciens: z.boolean().default(false),
  nem_kivant_paciens: z.boolean().default(false),
  nem_kivant_paciens_ok: z.string().optional(),
  nem_ker_levelet: z.boolean().default(false),

  // STEP 2: Tovabbi_adatok
  paciens_megszolitasa: z.string().optional(),
  mit_var_kezelestol: z.string().optional(),
  fontos_info_felelem: z.string().optional(),
  husegprogram_vege: z.string().optional(),
  marketing_hozzajarulas: z.boolean().default(false),

  // STEP 3: Anamnezis
  anamnezis: anamnezisSchema,
});

export type PatientWizardFormValues = z.infer<typeof patientWizardSchema>;
