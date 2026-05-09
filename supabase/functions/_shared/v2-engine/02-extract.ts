// ============================================================
// TreatNote V2 — Pipeline Stage 02: Extract (Edge Function version)
// Szöveg → atomi akciók (Claude LLM)
// ============================================================

import { ATOMIC_ACTIONS } from './catalog/atomic-actions.ts';
import { PROTOCOL_TEMPLATES } from './catalog/protocol-templates.ts';
import type { ProtocolInstance } from './types.ts';

/** Build the system prompt with catalog context */
function buildSystemPrompt(): string {
  const actionList = ATOMIC_ACTIONS.map(a =>
    `- ${a.slug} (${a.nameHu}) [scaling: ${a.scaling}] params: ${a.parameters.map(p => p.name + (p.required ? '*' : '')).join(', ') || 'nincs'}`
  ).join('\n');

  const templateList = PROTOCOL_TEMPLATES.map(t =>
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
6. Ha az orvos több fogat is mond, mindegyiket külön protocol instance-ként kezeld.
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
export async function extractActions(transcript: string): Promise<ExtractResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY required');
  }

  const systemPrompt = buildSystemPrompt();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Kérlek elemezd a következő diktálást és bontsd le atomi akciókra:\n\n"${transcript}"` }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude error: ${res.status} ${body}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const content = data.content as Array<{ text: string }>;
  const rawText = content?.[0]?.text || '';
  const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  const tokensUsed = (usage?.input_tokens || 0) + (usage?.output_tokens || 0);

  // Parse JSON from response
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`Could not parse JSON from LLM response: ${rawText.substring(0, 200)}`);
  }

  const protocols: ProtocolInstance[] = JSON.parse(jsonMatch[0]);

  return { protocols, rawResponse: rawText, tokensUsed };
}
