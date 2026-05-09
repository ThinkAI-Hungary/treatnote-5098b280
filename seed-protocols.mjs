// Re-seed v2_protocol_templates with proper multi-visit data from visit-definitions.ts
const SUPABASE_URL = 'https://bpjzgapmoyhtgryglcke.supabase.co';
const SUPABASE_KEY = 'sb_secret_gRiwdPwnR3BcA6zo1a8XXQ_Z7bJr8Vn';
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

// Multi-visit definitions from visit-definitions.ts
const MULTI_VISIT = {
  fem_keramia_korona_elso_ules: [
    { visit: 1, name: 'Preparáció + lenyomat', actions: ['infiltracios_anesztezia','korona_preparacio','lenyomatvetel','ideiglenes_korona'] },
    { visit: 2, name: 'Vázpróba', actions: ['vazproba'] },
    { visit: 3, name: 'Korona átadás', actions: ['korona_cementalas'] },
  ],
  cirkon_korona_elso_ules: [
    { visit: 1, name: 'Preparáció + digitális lenyomat', actions: ['infiltracios_anesztezia','korona_preparacio','lenyomatvetel','ideiglenes_korona'] },
    { visit: 2, name: 'Korona átadás', actions: ['korona_cementalas'] },
  ],
  emax_korona_template: [
    { visit: 1, name: 'Preparáció + digitális lenyomat', actions: ['infiltracios_anesztezia','korona_preparacio','lenyomatvetel','ideiglenes_korona'] },
    { visit: 2, name: 'Korona átadás', actions: ['korona_cementalas'] },
  ],
  korona_csere: [
    { visit: 1, name: 'Régi korona levétel + új preparáció', actions: ['infiltracios_anesztezia','korona_levetel','korona_preparacio','lenyomatvetel','ideiglenes_korona'] },
    { visit: 2, name: 'Új korona átadás', actions: ['korona_cementalas'] },
  ],
  hid_elso_ules: [
    { visit: 1, name: 'Pillérek preparációja + lenyomat', actions: ['infiltracios_anesztezia','korona_preparacio','lenyomatvetel','ideiglenes_korona'] },
    { visit: 2, name: 'Vázpróba', actions: ['vazproba'] },
    { visit: 3, name: 'Híd átadás', actions: ['korona_cementalas'] },
  ],
  veneer_prep: [
    { visit: 1, name: 'Héj preparáció + lenyomat', actions: ['infiltracios_anesztezia','korona_preparacio','lenyomatvetel'] },
    { visit: 2, name: 'Héjkerámia ragasztás', actions: ['infiltracios_anesztezia','kofferdam','korona_cementalas'] },
  ],
  inlay_onlay_prep: [
    { visit: 1, name: 'Preparáció + lenyomat', actions: ['infiltracios_anesztezia','korona_preparacio','lenyomatvetel','ideiglenes_tomes'] },
    { visit: 2, name: 'Betét ragasztás', actions: ['infiltracios_anesztezia','kofferdam','korona_cementalas'] },
  ],
  endo_plusz_korona: [
    { visit: 1, name: 'Gyökérkezelés (feltárás)', actions: ['infiltracios_anesztezia','kofferdam','trepanalas','csatorna_feltaras','csatorna_atoblites','ideiglenes_tomes'] },
    { visit: 2, name: 'Gyökértömés', actions: ['infiltracios_anesztezia','kofferdam','gyokertomes'] },
    { visit: 3, name: 'Csapos felépítés + korona prep', actions: ['infiltracios_anesztezia','csapos_felepites','korona_preparacio','lenyomatvetel','ideiglenes_korona'] },
    { visit: 4, name: 'Korona átadás', actions: ['korona_cementalas'] },
  ],
  gyokerkezeles_tobbalkalom: [
    { visit: 1, name: 'Feltárás + gyógyszeres zárás', actions: ['infiltracios_anesztezia','kofferdam','trepanalas','csatorna_feltaras','csatorna_atoblites','ideiglenes_tomes'] },
    { visit: 2, name: 'Gyökértömés', actions: ['infiltracios_anesztezia','kofferdam','gyokertomes','ideiglenes_tomes'] },
  ],
  ujragyokerkezeles: [
    { visit: 1, name: 'Régi gyökértömés eltávolítás + átöblítés', actions: ['infiltracios_anesztezia','kofferdam','gyokertomes_eltavolitas','csatorna_feltaras','csatorna_atoblites','ideiglenes_tomes'] },
    { visit: 2, name: 'Újra-gyökértömés', actions: ['infiltracios_anesztezia','kofferdam','gyokertomes','ideiglenes_tomes'] },
  ],
  implantatum_beultes_alap: [
    { visit: 1, name: 'Implantátum műtét', actions: ['vezetekes_anesztezia','muteti_elokeszites','navigalt_sebeszet','implantatum_beultes','gyogyulasi_sapka'] },
    { visit: 2, name: 'Varratszedés (10-14 nap)', actions: ['varratszedes'] },
    { visit: 3, name: 'Feltárás + lenyomat (3-6 hónap)', actions: ['infiltracios_anesztezia','gyogyulasi_sapka','scan_body','lenyomatvetel'] },
    { visit: 4, name: 'Abutment + korona átadás', actions: ['abutment','implant_korona'] },
  ],
  implantatum_csontpotlassal: [
    { visit: 1, name: 'Implantátum műtét + csontpótlás', actions: ['vezetekes_anesztezia','muteti_elokeszites','navigalt_sebeszet','implantatum_beultes','csontpotlas','membran','gyogyulasi_sapka'] },
    { visit: 2, name: 'Varratszedés (10-14 nap)', actions: ['varratszedes'] },
    { visit: 3, name: 'Feltárás + lenyomat (4-8 hónap)', actions: ['infiltracios_anesztezia','gyogyulasi_sapka','scan_body','lenyomatvetel'] },
    { visit: 4, name: 'Abutment + korona átadás', actions: ['abutment','implant_korona'] },
  ],
  sinus_lift_implanttal: [
    { visit: 1, name: 'Sinus lift + implantáció', actions: ['vezetekes_anesztezia','muteti_elokeszites','sinus_lift_nyilt','csontpotlas','membran','implantatum_beultes'] },
    { visit: 2, name: 'Varratszedés', actions: ['varratszedes'] },
    { visit: 3, name: 'Feltárás + lenyomat (6-9 hónap)', actions: ['infiltracios_anesztezia','gyogyulasi_sapka','scan_body','lenyomatvetel'] },
    { visit: 4, name: 'Korona átadás', actions: ['abutment','implant_korona'] },
  ],
  sinus_lift_onallo: [
    { visit: 1, name: 'Sinus lift műtét', actions: ['vezetekes_anesztezia','muteti_elokeszites','sinus_lift_nyilt','csontpotlas','membran'] },
    { visit: 2, name: 'Varratszedés', actions: ['varratszedes'] },
  ],
  all_on_4: [
    { visit: 1, name: 'Implantáció + azonnali terhelés', actions: ['vezetekes_anesztezia','muteti_elokeszites','navigalt_sebeszet','implantatum_beultes','implant_ideiglenes_korona','hosszutavu_ideiglenes'] },
    { visit: 2, name: 'Varratszedés + kontroll (10-14 nap)', actions: ['varratszedes','panorama_rtg'] },
    { visit: 3, name: 'Végleges lenyomat (3-6 hónap)', actions: ['scan_body','lenyomatvetel'] },
    { visit: 4, name: 'Végleges híd átadás', actions: ['korona_cementalas'] },
  ],
  all_on_6: [
    { visit: 1, name: 'Implantáció + azonnali terhelés', actions: ['vezetekes_anesztezia','muteti_elokeszites','navigalt_sebeszet','implantatum_beultes','implant_ideiglenes_korona','hosszutavu_ideiglenes'] },
    { visit: 2, name: 'Varratszedés + kontroll', actions: ['varratszedes','panorama_rtg'] },
    { visit: 3, name: 'Végleges lenyomat (3-6 hónap)', actions: ['scan_body','lenyomatvetel'] },
    { visit: 4, name: 'Végleges híd átadás', actions: ['korona_cementalas'] },
  ],
  extractio_socket_prezervacio: [
    { visit: 1, name: 'Extractio + socket feltöltés', actions: ['infiltracios_anesztezia','extractio_egyszeru','socket_prezervacio','csontpotlas','membran'] },
    { visit: 2, name: 'Varratszedés', actions: ['varratszedes'] },
  ],
  feherites_otthoni_template: [
    { visit: 1, name: 'Lenyomat / scan + sín készítés', actions: ['lenyomatvetel'] },
    { visit: 2, name: 'Sín átadás + instrukciók', actions: ['feherites_otthoni'] },
  ],
  mosolytervezes_template: [
    { visit: 1, name: 'Konzultáció + scan', actions: ['konzultacio','fotodokumentacio','intraoralis_scan'] },
    { visit: 2, name: 'Design bemutatás + mock-up', actions: ['mosolytervezes'] },
  ],
  harapasemelo_keszites: [
    { visit: 1, name: 'Lenyomat', actions: ['lenyomatvetel'] },
    { visit: 2, name: 'Sín átadás + beállítás', actions: ['harapasemelo_sin'] },
  ],
};

async function run() {
  // 1. Fetch all existing templates
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/v2_protocol_templates?select=id,slug&is_global=eq.true`, { headers });
  const templates = await resp.json();
  console.log(`Found ${templates.length} global templates, updating visit data...`);

  let updated = 0;
  for (const t of templates) {
    const mv = MULTI_VISIT[t.slug];
    if (!mv) continue;

    const allActions = mv.flatMap(v => v.actions);
    const updateResp = await fetch(`${SUPABASE_URL}/rest/v1/v2_protocol_templates?id=eq.${t.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ visits: mv, atomic_actions: allActions }),
    });
    if (!updateResp.ok) {
      console.error(`Failed ${t.slug}: ${await updateResp.text()}`);
    } else {
      console.log(`  ✅ ${t.slug} → ${mv.length} vizit`);
      updated++;
    }
  }
  console.log(`\nDone: ${updated}/${Object.keys(MULTI_VISIT).length} templates updated with multi-visit data.`);
}

run();
