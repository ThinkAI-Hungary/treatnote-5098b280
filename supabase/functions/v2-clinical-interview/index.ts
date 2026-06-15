// ============================================================
// TreatNote V2 — Clinical Interview Edge Function
// AI-powered onboarding: clinical questions → protocol overrides
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════
// Clinical Questions Definition
// ═══════════════════════════════════════════════════════════════

interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  icon?: string;
}

interface ClinicalQuestion {
  id: string;
  title: string;
  subtitle: string;
  type: 'single' | 'multi' | 'freetext';
  options: QuestionOption[];
  allowFreeText: boolean;       // "Egyéb" option with text input
  conditionalOn?: string;       // only show if this question's answer includes a value
  conditionalValues?: string[]; // show only if the conditionalOn answer includes one of these
}

const CLINICAL_QUESTIONS: ClinicalQuestion[] = [
  // ── 1. Anesthesia ──
  {
    id: 'anesthesia_preference',
    title: 'Milyen érzéstelenítést alkalmaznak leggyakrabban?',
    subtitle: 'Az érzéstelenítés típusa szinte minden protokollt érint',
    type: 'single',
    options: [
      { id: 'infiltration', label: 'Infiltrációs érzéstelenítés', description: 'A legtöbb kezeléshez' },
      { id: 'block', label: 'Vezetéses érzéstelenítés', description: 'Alsó fogaknál és sebészetnél preferáljuk' },
      { id: 'depends', label: 'Régiótól és kezeléstől függ', description: 'Felső fogaknál infiltrációs, alsónál vezetéses' },
      { id: 'sedation_available', label: 'Szedáció is elérhető', description: 'Fogászati szedációval is dolgozunk' },
    ],
    allowFreeText: true,
  },

  // ── 3. Kofferdam ──
  {
    id: 'rubber_dam',
    title: 'Milyen esetben használnak kofferdámot?',
    subtitle: 'A kofferdam-használat befolyásolja a legtöbb konzerváló és ragasztási protokollt',
    type: 'single',
    options: [
      { id: 'always', label: 'Mindig, minden beavatkozásnál', description: 'Tömés, gyökérkezelés, ragasztás egyaránt' },
      { id: 'endo_adhesive', label: 'Gyökérkezelésnél és ragasztásnál', description: 'Endo, inlay/onlay/héj ragasztás, de töméskor nem' },
      { id: 'endo_only', label: 'Csak gyökérkezelésnél', description: 'Kizárólag endodonciai beavatkozásoknál' },
      { id: 'never', label: 'Nem használunk kofferdámot' },
    ],
    allowFreeText: true,
  },

  // ── 4. Endo: visit count ──
  {
    id: 'endo_approach',
    title: 'Hogyan végzik a gyökérkezelést?',
    subtitle: 'Egyszeri vagy többalkalmas? Ez befolyásolja az endo protokollokat',
    type: 'single',
    options: [
      { id: 'single_visit', label: 'Egy ülésben', description: 'Feltárás, tágítás és gyökértömés egy alkalommal' },
      { id: 'multi_visit', label: 'Két vagy több alkalom', description: 'Feltárás → gyógyszeres zárás → gyökértömés külön' },
      { id: 'depends', label: 'Esettől függ', description: 'Az orvos dönti el a klinikai helyzet alapján' },
    ],
    allowFreeText: true,
  },

  // ── 5. Endo: rotary system ──
  {
    id: 'endo_system',
    title: 'Milyen gépi gyökércsatorna-tágítási rendszert használnak?',
    subtitle: 'Több rendszer is kiválasztható, ha különböző orvosok mást használnak',
    type: 'multi',
    options: [
      { id: 'protaper', label: 'ProTaper (Gold / Next / Ultimate)' },
      { id: 'reciproc', label: 'Reciproc (Blue)' },
      { id: 'waveone', label: 'WaveOne (Gold)' },
      { id: 'hyflex', label: 'HyFlex EDM / CM' },
      { id: 'manual', label: 'Kézi műszerekkel dolgozunk', description: 'Nincs gépi tágítás' },
    ],
    allowFreeText: true,
  },

  // ── 6. Endo: magnification ──
  {
    id: 'magnification',
    title: 'Használnak nagyítást endodonciánál?',
    subtitle: 'Mikroszkóp vagy lupé használata befolyásolja a kezelés minőségét és dokumentációját',
    type: 'single',
    options: [
      { id: 'microscope', label: 'Operációs mikroszkóp', description: 'Minden gyökérkezelésnél' },
      { id: 'loupes', label: 'Lupé (nagyító szemüveg)' },
      { id: 'none', label: 'Nem használunk nagyítást' },
    ],
    allowFreeText: true,
  },

  // ── 7. Filling materials ──
  {
    id: 'filling_material',
    title: 'Milyen tömőanyagot használnak?',
    subtitle: 'Jelölje be az összes használt anyagtípust',
    type: 'multi',
    options: [
      { id: 'nano_hybrid', label: 'Nano-hibrid kompozit', description: 'Pl. Filtek, Estelite, Harmonize' },
      { id: 'bulk_fill', label: 'Bulk-fill kompozit', description: 'Pl. Filtek Bulk Fill, SDR, Tetric PowerFill' },
      { id: 'gic', label: 'Üvegionomer (GIC)', description: 'Pl. Fuji, Ketac — gyerekfogászatnál preferált' },
      { id: 'depends', label: 'Esettől és helytől függ' },
    ],
    allowFreeText: true,
  },

  // ── 8. Pulp capping ──
  {
    id: 'pulp_capping',
    title: 'Végeznek direkt pulpasapkázást mély carieseknél?',
    subtitle: 'Több anyag is kiválasztható, ha esettől függően másikat használnak',
    type: 'multi',
    options: [
      { id: 'yes_biodentine', label: 'Igen, Biodentine-nel' },
      { id: 'yes_mta', label: 'Igen, MTA-val' },
      { id: 'yes_caoh', label: 'Igen, Ca(OH)2 (Dycal, Life) alkalmazásával' },
      { id: 'no', label: 'Nem — mély cariesnél rögtön gyökérkezelés' },
    ],
    allowFreeText: true,
  },

  // ── 9. Post & core ──
  {
    id: 'post_core',
    title: 'Milyen csapos felépítést preferálnak gyökérkezelt fogaknál?',
    subtitle: 'A felépítés módja befolyásolja a csapos protokollt',
    type: 'single',
    options: [
      { id: 'fiber', label: 'Üvegszálas csap + kompozit felépítés', description: 'A modern standard' },
      { id: 'cast', label: 'Öntött fém csapos csonk' },
      { id: 'direct', label: 'Direkt kompozit felépítés (csap nélkül)', description: 'Ha elegendő foganyag maradt' },
      { id: 'depends', label: 'Esettől függ' },
    ],
    allowFreeText: true,
  },

  // ── 10. Impression ──
  {
    id: 'impression_method',
    title: 'Milyen lenyomati módszert használnak?',
    subtitle: 'Ez az egyik legnagyobb hatású beállítás — az összes protetikai protokollt érinti',
    type: 'single',
    options: [
      { id: 'digital', label: 'Digitális intraorális szkenner', description: 'Trios, iTero, Medit, vagy hasonló' },
      { id: 'traditional', label: 'Hagyományos lenyomat', description: 'Alginát, szilikon, polietér' },
      { id: 'both', label: 'Mindkettő — esettől függ', description: 'Digitális és hagyományos egyaránt' },
    ],
    allowFreeText: true,
  },

  // ── 11. Lab ──
  {
    id: 'lab_setup',
    title: 'Van saját fogászati laborjuk?',
    subtitle: 'A laborviszony befolyásolja a protetikai munkafolyamatokat',
    type: 'single',
    options: [
      { id: 'inhouse', label: 'Igen, házon belüli labor', description: 'Saját fogtechnikus' },
      { id: 'external', label: 'Külsős laborral dolgozunk', description: 'Munkákat kiküldik' },
      { id: 'cadcam', label: 'CAD/CAM chairside', description: 'CEREC vagy hasonló — egy ülésben készül' },
    ],
    allowFreeText: true,
  },

  // ── 12. Crown preference ──
  {
    id: 'crown_preference',
    title: 'Milyen koronatípust preferálnak alapértelmezetten?',
    subtitle: 'Ez lesz az alapértelmezett anyag a korona protokolloknál',
    type: 'single',
    options: [
      { id: 'zirconia', label: 'Cirkónium (fémmentes)', description: 'Esztétikus, erős, allergiamentes' },
      { id: 'pfm', label: 'Fém-kerámia (PFM)', description: 'Hagyományos, költséghatékony' },
      { id: 'emax', label: 'E.max préskerámia', description: 'Kiváló esztétika, frontfogakra ideális' },
      { id: 'depends', label: 'Esettől függ', description: 'Nincs általános preferencia' },
    ],
    allowFreeText: true,
  },

  // ── 13. Crown visits ──
  {
    id: 'crown_visits',
    title: 'Hány alkalomból készül egy korona?',
    subtitle: 'Ez befolyásolja a korona protokollok ülésszámát',
    type: 'single',
    options: [
      { id: 'two', label: 'Két alkalom (prep + átadás)', description: 'Hagyományos, vázpróba nélkül' },
      { id: 'three', label: 'Három alkalom (prep + vázpróba + átadás)', description: 'Vázpróbával' },
      { id: 'one_cadcam', label: 'Egy alkalom (CAD/CAM chairside)', description: 'CEREC — prep és átadás egyben' },
      { id: 'depends', label: 'Esettől függ' },
    ],
    allowFreeText: true,
  },

  // ── 14. Guided surgery (conditional) ──
  {
    id: 'guided_surgery',
    title: 'Használnak navigált/tervezett sebészetet?',
    subtitle: 'Implantátum beültetésnél digitális tervezés és sablonos beültetés',
    type: 'single',
    options: [
      { id: 'always', label: 'Mindig, minden implant esetben' },
      { id: 'complex', label: 'Csak komplex eseteknél', description: 'Egyszerűbb eseteknél szabadkézzel' },
      { id: 'never', label: 'Nem használunk navigált sebészetet' },
    ],
    allowFreeText: true,
    conditionalOn: 'practice_type',
    conditionalValues: ['surgery', 'mixed'],
  },

  // ── 15. Implant system (conditional) ──
  {
    id: 'implant_system',
    title: 'Milyen implantátum rendszert használnak?',
    subtitle: 'Jelölje be az összes rendszert, amivel dolgoznak',
    type: 'multi',
    options: [
      { id: 'straumann', label: 'Straumann (BLT / BLX)' },
      { id: 'nobel', label: 'Nobel Biocare (Active / Parallel CC)' },
      { id: 'megagen', label: 'MegaGen (AnyRidge / AnyOne)' },
      { id: 'neodent', label: 'Neodent (Helix / Grand Morse)' },
      { id: 'alpha_bio', label: 'Alpha-Bio (Neo / SPI)' },
      { id: 'dentsply', label: 'Dentsply (Astra / Ankylos / Xive)' },
    ],
    allowFreeText: true,
    conditionalOn: 'practice_type',
    conditionalValues: ['surgery', 'mixed'],
  },

  // ── 16. Implant loading (conditional) ──
  {
    id: 'implant_loading',
    title: 'Végeznek azonnali terhelést implantátumnál?',
    subtitle: 'Azonnali ideiglenes korona készítése beültetés napján',
    type: 'single',
    options: [
      { id: 'immediate_always', label: 'Igen, rutinszerűen', description: 'Az esztétikai zónában mindig' },
      { id: 'immediate_sometimes', label: 'Néha, ha a stabilitás engedi' },
      { id: 'delayed', label: 'Nem — mindig késleltetett terhelés', description: '3-6 hónap gyógyulás után' },
    ],
    allowFreeText: true,
    conditionalOn: 'practice_type',
    conditionalValues: ['surgery', 'mixed'],
  },

  // ── 17. Bone graft (conditional) ──
  {
    id: 'bone_graft',
    title: 'Milyen csontpótló anyagot használnak?',
    subtitle: 'Jelölje be az összes használt anyagtípust',
    type: 'multi',
    options: [
      { id: 'xenograft', label: 'Xenograft (Bio-Oss, Cerabone)', description: 'Állati eredetű csontpótló' },
      { id: 'allograft', label: 'Allograft (maxgraft, Puros)', description: 'Humán eredetű csontpótló' },
      { id: 'synthetic', label: 'Szintetikus (Nanobone, Maxresorb)' },
      { id: 'autograft', label: 'Autológ csont (saját csont)', description: 'Ramus, tuber vagy chin graft' },
      { id: 'prf', label: 'PRF/APRF + csontpótló kombinációk' },
    ],
    allowFreeText: true,
    conditionalOn: 'practice_type',
    conditionalValues: ['surgery', 'mixed'],
  },

  // ── 18. Imaging ──
  {
    id: 'imaging',
    title: 'Milyen képalkotó berendezéseik vannak?',
    subtitle: 'Jelölje be, amivel a rendelő rendelkezik',
    type: 'multi',
    options: [
      { id: 'periapical', label: 'Periapikális röntgen' },
      { id: 'panoramic', label: 'Panoráma röntgen (OPG)' },
      { id: 'cbct', label: 'CBCT / 3D CT' },
      { id: 'io_camera', label: 'Intraorális kamera' },
    ],
    allowFreeText: true,
  },
];

// ═══════════════════════════════════════════════════════════════
// LLM Override Generation
// ═══════════════════════════════════════════════════════════════

async function generateOverrides(
  answers: Record<string, { selected: string | string[]; freeText?: string }>,
): Promise<{ overrides: any[]; summary: string[] }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

  // Import protocol catalog
  const { PROTOCOL_TEMPLATES } = await import('../_shared/v2-engine/catalog/protocol-templates.ts');
  const { ATOMIC_ACTIONS } = await import('../_shared/v2-engine/catalog/atomic-actions.ts');

  const protocolList = PROTOCOL_TEMPLATES.map(t =>
    `- ${t.slug}: "${t.nameHu}" → [${t.atomicActions.join(', ')}]`
  ).join('\n');

  const actionList = ATOMIC_ACTIONS.map(a =>
    `- ${a.slug}: "${a.nameHu}" (${a.category}, scaling: ${a.scaling})`
  ).join('\n');

  const answersText = Object.entries(answers).map(([qId, a]) => {
    const q = CLINICAL_QUESTIONS.find(q => q.id === qId);
    const selectedLabel = Array.isArray(a.selected)
      ? a.selected.map(s => q?.options.find(o => o.id === s)?.label || s).join(', ')
      : q?.options.find(o => o.id === a.selected)?.label || a.selected;
    return `${q?.title || qId}: ${selectedLabel}${a.freeText ? ` (megjegyzés: "${a.freeText}")` : ''}`;
  }).join('\n');

  const prompt = `Te egy magyar fogászati protokoll-konfigurációs szakértő AI vagy.

Egy fogászati klinika kitöltötte a klinikai kérdőívet. A válaszaik alapján kell módosítanod az alapértelmezett protokoll-template-eket, hogy illeszkedjenek a klinika gyakorlatához.

## A KLINIKA VÁLASZAI:
${answersText}

## ALAPÉRTELMEZETT PROTOKOLLOK:
${protocolList}

## ELÉRHETŐ ATOMI AKCIÓK:
${actionList}

## FELADAT:
Elemezd a klinika válaszait és határozd meg, mely protokollokat kell módosítani. Minden módosításhoz add meg:

1. protocol_slug — melyik protokoll
2. is_disabled — true ha a teljes protokollt ki kell kapcsolni (pl. a klinika nem végez ilyen beavatkozást)
3. excluded_actions — eltávolítandó atomi akciók (pl. kofferdam eltávolítása tömési protokollból)
4. added_actions — hozzáadandó atomi akciók (pl. intraoralis_scan hozzáadása)
5. reason_hu — rövid magyar nyelvű indoklás a módosításra (a fogorvosnak jelenik meg!)

## SZABÁLYOK:
- NE adj ki olyan protokollt, ami NEM változik az alapértelmezetthez képest!
- A "reason_hu" legyen tömör és érthető, pl. "Kofferdam eltávolítva — a rendelő csak gyökérkezelésnél használja"
- Ha a "practice_type" kizár egy teljes kategóriát (pl. általános rendelő → nincs implantáció), akkor az összes ilyen protokollt is_disabled: true
- Ha digitális szkenner → cseréld a "lenyomatvetel"-t "intraoralis_scan"-ra a protetikai protokollokban
- A free-text megjegyzéseket is vedd figyelembe!

## KIMENET:
Válaszolj KIZÁRÓLAG valid JSON-nal, a következő formátumban:
{
  "overrides": [
    {
      "protocol_slug": "tobbfelszinu_tomes",
      "is_disabled": false,
      "excluded_actions": ["kofferdam"],
      "added_actions": [],
      "reason_hu": "Kofferdam eltávolítva — a rendelő csak gyökérkezelésnél használja"
    }
  ],
  "summary_hu": [
    "Kofferdam eltávolítva 6 tömési protokollból",
    "Digitális lenyomat beállítva 10 protetikai protokollban"
  ]
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude error: ${res.status} ${body}`);
  }

  const data = await res.json() as any;
  const rawText = data.content?.[0]?.text || '';

  // Parse JSON from response
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse JSON from LLM response: ${rawText.substring(0, 300)}`);
  }

  const result = JSON.parse(jsonMatch[0]);
  return {
    overrides: result.overrides || [],
    summary: result.summary_hu || [],
  };
}

// ═══════════════════════════════════════════════════════════════
// HTTP Handler
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { operation, telephelyId } = body;

    if (!telephelyId) {
      return new Response(JSON.stringify({ error: 'telephelyId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── get-questions ──
    if (operation === 'get-questions') {
      // Fetch existing answers if any (for re-running)
      const { data: telephely } = await supabase
        .from('telephely')
        .select('clinical_interview_answers, setup_completed_at')
        .eq('id', telephelyId)
        .maybeSingle();

      return new Response(JSON.stringify({
        questions: CLINICAL_QUESTIONS,
        previousAnswers: telephely?.clinical_interview_answers || null,
        setupCompletedAt: telephely?.setup_completed_at || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── process-answers ──
    if (operation === 'process-answers') {
      const { answers } = body;
      if (!answers || typeof answers !== 'object') {
        return new Response(JSON.stringify({ error: 'answers object required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate overrides via LLM
      const { overrides, summary } = await generateOverrides(answers);

      // Return the proposed changes for review (don't save yet!)
      return new Response(JSON.stringify({
        overrides,
        summary,
        totalChanges: overrides.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── save-overrides ──
    if (operation === 'save-overrides') {
      const { answers, overrides } = body;

      // Clear existing overrides
      await supabaseAdmin
        .from('v2_clinic_protocol_overrides')
        .delete()
        .eq('telephely_id', telephelyId);

      // Insert new overrides
      const rows = (overrides || [])
        .filter((o: any) => o.is_disabled || o.excluded_actions?.length > 0 || o.added_actions?.length > 0)
        .map((o: any) => ({
          telephely_id: telephelyId,
          protocol_slug: o.protocol_slug,
          is_disabled: o.is_disabled || false,
          excluded_actions: o.excluded_actions || [],
          added_actions: o.added_actions || [],
        }));

      if (rows.length > 0) {
        const { error } = await supabaseAdmin
          .from('v2_clinic_protocol_overrides')
          .insert(rows);
        if (error) throw new Error(`Failed to save overrides: ${error.message}`);
      }

      // Save answers for re-runnability + mark complete
      await supabaseAdmin
        .from('telephely')
        .update({
          clinical_interview_answers: answers,
          setup_completed_at: new Date().toISOString(),
        })
        .eq('id', telephelyId);

      return new Response(JSON.stringify({
        ok: true,
        saved: rows.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown operation: ${operation}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Clinical interview error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
