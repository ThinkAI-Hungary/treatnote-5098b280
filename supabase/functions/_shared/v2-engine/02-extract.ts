// ============================================================
// TreatNote V2 — Pipeline Stage 02: Extract (Edge Function version)
// Szöveg → atomi akciók (Claude LLM)
// ============================================================

import { ATOMIC_ACTIONS } from './catalog/atomic-actions.ts';
import { PROTOCOL_TEMPLATES } from './catalog/protocol-templates.ts';
import type { ProtocolInstance, ProtocolTemplate } from './types.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Override types ──

interface ProtocolOverride {
  protocol_slug: string;
  is_disabled: boolean;
  excluded_actions: string[];
  added_actions: string[];
  custom_triggers: string[] | null;
}

/** Fetch clinic overrides and apply them to global templates */
async function getClinicTemplates(
  telephelyId: string | undefined,
  supabase: SupabaseClient | undefined
): Promise<ProtocolTemplate[]> {
  // No clinic context → use global defaults
  if (!telephelyId || !supabase) return PROTOCOL_TEMPLATES;

  // Fetch overrides
  const { data: overrides } = await supabase
    .from('v2_clinic_protocol_overrides')
    .select('protocol_slug, is_disabled, excluded_actions, added_actions, custom_triggers')
    .eq('telephely_id', telephelyId);

  // No overrides → use global defaults
  if (!overrides?.length) return PROTOCOL_TEMPLATES;

  // Index overrides by slug
  const overrideMap = new Map<string, ProtocolOverride>();
  for (const o of overrides) {
    overrideMap.set(o.protocol_slug, o as ProtocolOverride);
  }

  // Apply overrides
  const result: ProtocolTemplate[] = [];
  for (const template of PROTOCOL_TEMPLATES) {
    const override = overrideMap.get(template.slug);

    // Skip disabled protocols
    if (override?.is_disabled) continue;

    if (override) {
      // Apply action modifications
      let actions = [...template.atomicActions];

      // Remove excluded actions
      if (override.excluded_actions?.length) {
        actions = actions.filter(a => !override.excluded_actions.includes(a));
      }

      // Add extra actions
      if (override.added_actions?.length) {
        for (const a of override.added_actions) {
          if (!actions.includes(a)) actions.push(a);
        }
      }

      result.push({
        ...template,
        atomicActions: actions,
        triggers: override.custom_triggers || template.triggers,
      });
    } else {
      result.push(template);
    }
  }

  return result;
}

/** Build the system prompt with catalog context */
function buildSystemPrompt(templates: ProtocolTemplate[]): string {
  const actionList = ATOMIC_ACTIONS.map(a =>
    `- ${a.slug} (${a.nameHu}) [scaling: ${a.scaling}] params: ${a.parameters.map(p => p.name + (p.required ? '*' : '')).join(', ') || 'nincs'}`
  ).join('\n');

  const templateList = templates.map(t =>
    `- ${t.slug}: "${t.nameHu}" → [${t.atomicActions.join(', ')}]`
  ).join('\n');

  return `Te egy fogászati klinikai asszisztens AI vagy. A feladatod, hogy a fogorvos diktálásából kinyerd a klinikai akciókat és KEZELÉSI TERVET állíts össze.

## ATOMI AKCIÓK KATALÓGUS
${actionList}

## PROTOKOLL-TEMPLATE-EK (gyakori kombinációk)
${templateList}

## KLINIKAI FÁZISOK ÉS PRIORITÁSOK
A kezelések az alábbi klinikai fázisokba tartoznak. Eltérő fázisú kezelések NEM végezhetők egy ülésben.

| Fázis | Prioritás | Példák |
|-------|-----------|--------|
| Diagnosztika | 0 | röntgen, CT, konzultáció |
| Parodontológia | 1 | kürett, depurálás |
| Extractio | 2 | fogeltávolítás |
| Csontpótlás | 3 | sinuslift, Bio-Oss |
| Implantáció (sebészi) | 4 | implantátum beültetés |
| Implantáció (protetikai) | 5 | abutment, gyógyulási sapka |
| Protetikai előkészítés | 6 | lenyomat, szkennelés |
| Protetikai átadás | 7 | korona, híd, héj |
| Konzerváló | -1 | tömés, gyökérkezelés (független, bármikor végezhető) |

## SZABÁLYOK
1. Minden egyes kezelést a megfelelő atomi akciókra bontsd le.
2. Ha egy ismert protokoll-template illeszkedik, használd azt (templateSlug kitöltve). AKTÍVAN keresd a template-egyezéseket — a fogorvos nem mindig mondja ki a template nevét, de az akciók alapján felismerhető.
3. Ha nem illeszkedik template, templateSlug legyen null, és sorold fel az egyedi atomi akciókat.
4. Minden fogat FDI számozással adj meg (11-48). Ha az orvos szóban mondja ("tizenegyes"), konvertáld.
5. Anyagot, csatornaszámot, felszínt csak akkor add meg, ha az orvos kimondta. Ha nem mondta, hagyd üresen — a validate lépés tölti ki a defaultokból.
6. Ha az orvos több fogat mond EGYEDI KEZELÉSEKHEZ (pl. tömés a 14-esen és a 16-oson), mindegyiket külön protocol instance-ként kezeld.
   **KIVÉTEL — HÍD (BRIDGE):** Ha az orvos HIDAT említ (pl. "31-től 35-ig hidat készítek", "cirkónium híd 31-35"), az EGYETLEN ProtocolInstance. A parameters-ben adj meg tooth_from és tooth_to értékeket, és a tooth_fdi legyen az első pillér foga. NE bontsd külön fogankénti protokollokra!
7. Confidence értéket adj 0.0-1.0 skálán.

### KRITIKUS: PROTOKOLLOK SZÉTVÁLASZTÁSA
8. Ha a diktálásban ELTÉRŐ KLINIKAI FÁZISÚ kezelések szerepelnek, azokat KÜLÖN ProtocolInstance-ként add ki.
   Példák:
   - "Extractio 14, socket prezervácio, majd implant a 14-esbe" → 2 protokoll:
     a) extractio_socket_prezervacio (14-es fogra)
     b) implantatum_beultes_alap (14-es fogra)
   - "Konzultáció, röntgen, majd bölcsességfog eltávolítás" → 2 protokoll:
     a) elso_vizsgalat (diagnosztika)
     b) sebeszeti_extractio (bölcsességfog)
   - "Fogkő, tömés a 36-oson" → 2 protokoll, DE mivel mindkettő együlésben elvégezhető (paro + konzerváló), a downstream rendszer összevonja
9. Extractio és implantáció SOHA nem lehet egy protokollon belül — köztük hónapok telnek el.
10. Diagnosztika (konzultáció, röntgen) és invazív beavatkozás (extractio, implant) legyen külön protokoll.
11. Konzerváló kezelések (tömés, gyökérkezelés) lehetnek párhuzamosan ugyanazon vizitben más konzerváló kezelésekkel.

### HÍD PÉLDA
Diktálás: "Huszonkettőstől huszonnyolcasig fémkerámia hidat készítek és a huszonhármas is pillér fog."
Ez egy 22-28 híd: 22, 23, 28 a PILLÉREK (abutmentek, ezeket preparáljuk), 24-25-26-27 a HÉZAGPÓTLÓK (ponticok, ezeket NEM preparáljuk).
**KRITIKUS:** A templateSlug MINDIG "hid_elso_ules" legyen ha a fogorvos HIDAT mond! NE használd a "korona_elso_ules" template-et hídnál — az egyedi koronákra való!
Helyes output: EGY darab ProtocolInstance:
\`\`\`json
{
  "templateSlug": "hid_elso_ules",
  "confidence": 0.95,
  "parameters": { "tooth_fdi": 22, "tooth_from": 22, "tooth_to": 28, "material": "femkeramia", "pillar_teeth": [22, 23, 28] },
  "atomicActions": [
    { "slug": "infiltracios_anesztezia", "parameters": {} },
    { "slug": "korona_preparacio", "parameters": { "tooth_fdi": 22 } },
    { "slug": "korona_preparacio", "parameters": { "tooth_fdi": 23 } },
    { "slug": "korona_preparacio", "parameters": { "tooth_fdi": 28 } },
    { "slug": "lenyomatvetel", "parameters": {} },
    { "slug": "ideiglenes_korona", "parameters": {} }
  ]
}
\`\`\`
FONTOS: Csak a PILLÉREKRE adj meg korona_preparacio-t! A köztük lévő fogak hézagpótlók (ponticok) — azokra NEM kell preparáció. Ha az orvos KÖZTES pillérfogat is megnevez (pl. "23 is pillér"), azt is add hozzá a preparációkhoz és a pillar_teeth listához.
HELYTELEN: "korona_elso_ules" template hídnál, vagy foganként külön protokoll — az nem híd, hanem külön koronák!

## KIMENET
Válaszolj KIZÁRÓLAG valid JSON tömbbel, ProtocolInstance[] formátumban:
[
  {
    "templateSlug": "gyokerkezeles_egyszeri" | null,
    "confidence": 0.95,
    "parameters": { "tooth_fdi": 11 },
    "atomicActions": [
      { "slug": "infiltracios_anesztezia", "parameters": {} },
      { "slug": "kofferdam", "parameters": {} },
      { "slug": "trepanalas", "parameters": { "tooth_fdi": 11 } },
      ...
    ]
  }
]`;
}

export interface ExtractResult {
  protocols: ProtocolInstance[];
  rawResponse: string;
  tokensUsed: number;
}

/** Extract clinical actions from transcript using Claude */
export async function extractActions(
  transcript: string,
  telephelyId?: string,
  supabase?: SupabaseClient,
  enableThinking?: boolean
): Promise<ExtractResult> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY required');
  }

  // Get clinic-customized templates (applies overrides)
  const templates = await getClinicTemplates(telephelyId, supabase);
  const systemPrompt = buildSystemPrompt(templates);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Kérlek elemezd a következő diktálást és bontsd le atomi akciókra:\n\n"${transcript}"` }
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${errBody}`);
  }

  const data = await res.json() as Record<string, any>;
  const rawText = data.choices?.[0]?.message?.content || '';
  const tokensUsed = data.usage?.total_tokens || 0;

  // Parse JSON from response
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`Could not parse JSON from LLM response: ${rawText.substring(0, 200)}`);
  }

  const protocols: ProtocolInstance[] = JSON.parse(jsonMatch[0]);

  return { protocols, rawResponse: rawText, tokensUsed };
}
