// ============================================================
// TreatNote V2 — AI Pipeline Assessment
// Compares input dictation text against full pipeline debug data
// Diagnoses WHICH pipeline stage caused each issue
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const SYSTEM_PROMPT = `Te egy fogorvosi klinikai AI rendszer pipeline-diagnosztikai auditora vagy.

## A PIPELINE MŰKÖDÉSE

A pipeline 7 lépésből áll:

### STAGE 02 — EXTRAKCIÓ (AI)
A Claude AI a diktált szövegből PROTOKOLL-TEMPLATE-EKET ismer fel. Egy template egy komplex kezelést egyetlen egységként kezel:
- Pl. "gyökérkezelést végeztem" → a gyokerkezeles_egyszeri template → ez AUTOMATIKUSAN tartalmazza: infiltracios_anesztezia + kofferdam + trepanalas + csatorna_feltaras + csatorna_atoblites + gyokertomes
- Pl. "cirkónium korona preparáció" → a cirkon_korona_elso_ules template → tartalmazza: korona_preparacio + intraoralis_scan + harapasrogzites + ideiglenes_korona
- Ez NEM hallucináció, hanem helyes template-felismerés!

### STAGE 03 — VALIDÁCIÓ
Hiányzó paramétereket tölt ki default értékekkel (pl. felszín_szám, csatorna_szám).

### STAGE 04 — EXPAND
- Szétbontja a protokollokat atomi akciókra
- per_tooth: fogra bontás
- per_canal: csatornánként
- per_surface: felszínenként
- MULTI-VISIT: Ha a template többülési (pl. korona prep → vázpróba → cementálás), automatikusan JÖVŐBELI VIZITEK is generálódnak
- Ez azt jelenti, hogy a kimenetben TÖBB vizit lehet, mint amit a fogorvos az aktuális ülésben diktált — ez HELYES, nem hiba

### STAGE 04.5 — KLINIKAI VALIDÁCIÓ (5 pass)
Az A-E passok a következő szabályokat érvényesítik:
- Pass A: KATEGÓRIA DEDUPLIKÁCIÓ — Egy fogra, egy vizitben, ugyanolyan típusú kezelés ne legyen kétszer (pl. két extractio ugyanarra a fogra)
- Pass B: KLINIKAI SORREND — Ha egy fogat elhúztak (extractio), utána nem lehet rá tömést/koronát (de implant után igen). Ha koronát cementáltak, nem kell gyógyulási sapka.
- Pass C: POZÍCIÓ/MENNYISÉG — Sinus lift csak felső hátsó fogaknál (FDI 14-18, 24-28). Max 2 röntgen típusonként per vizit.
- Pass D: MÁRKA KONZISZTENCIA — Ha az orvos Nobel implantátumot mond, csak Nobel tételek maradnak.
- Pass E: VIZITEKEN ÁTÍVELŐ DEDUPLIKÁCIÓ — Egy fogra csak egyszer lehet implantátumot beültetni / fogat elhúzni.
Ha a klinikai validáció tételeket törölt: ellenőrizd, hogy a törlés helyes volt-e a fenti szabályok szerint.

### STAGE 05 — MAPPING (variáns-alapú)
Atomi akciók → klinika szótár tételek párosítása. A mapping FELTÉTEL-ALAPÚ (conditions):
- Egy akciónál TÖBB mapping is lehet, eltérő feltételekkel (variant). Pl. "kompozit_tomes_tobb_felszin" eltérő szótár tételt kaphat front fog vs moláris fog esetén.
- Feltétel-típusok: tooth_region (front/premolar/molar), canal_count, surface_count stb.
- A mapper automatikusan kiszámítja a tooth_region-t az FDI számból.
- Ha UNMAPPED: a szótárban nincs megfelelő tétel → ez KONFIGURÁCIÓS probléma (severity: warning), NEM pipeline bug. Az actionable lépés: a klinika adminnak be kell állítania a szótár mapping-et.
- Ha rossz szótár tétel (pl. rossz variáns választva): mapping_wrong (severity: critical)

### STAGE 06 — RPA KIMENET
Végleges formázás FlexiDent-nek.

## ÉRTÉKELÉSI SZABÁLYOK

KULCSFONTOSSÁGÚ: A pipeline PROTOKOLL TEMPLATE-EKET használ. Ha a fogorvos azt mondja "gyökérkezelést végeztem", a kimenetben NE jelöld hallucinációnak a kofferdam-ot vagy az érzéstelenítést — ezek a template részei!

Válaszolj KIZÁRÓLAG az alábbi JSON formátumban:
{
  "score": <0-100>,
  "verdict": "<PASS | WARN | FAIL>",
  "summary": "<1-2 mondatos magyar összefoglaló>",
  "findings": [
    {
      "type": "<extraction_miss | extraction_hallucination | validation_ok | expand_ok | clinical_removal | mapping_miss | mapping_wrong | template_correct | correct>",
      "stage": "<02_extract | 03_validate | 04_expand | 04.5_clinical | 05_map | 06_rpa>",
      "severity": "<critical | warning | info>",
      "description": "<magyar leírás, konkrétan melyik kezelés/fog/akció és mi a probléma>"
    }
  ]
}

DIAGNOSZTIKA:
1. Ellenőrizd a TEMPLATE FELISMERÉST: A kinyert templateSlug helyes-e? A diktálásban említett kezelés megfelel-e a template-nek?
2. Ha a kimenetben "extra" akciók vannak: NE jelöld hallucinációnak, ha azok a template részei! Ellenőrizd az atomicActions listát — ha a template tartalmazza, az HELYES.
3. Ha multi-visit vizitek jelennek meg (Vizit 2, 3...): Ez HELYES — a template jövőbeli üléseket is tartalmaz.
4. UNMAPPED: KIZÁRÓLAG a "Nem párosított" listát nézd! Ha ott "nincs" áll, akkor NINCS mapping hiba. NE találj ki mapping_miss-t ha a lista üres!
5. MAPPING_WRONG: Nézd meg a "Párosított" listában a szótár neveket — logikus-e az adott akcióhoz? Pl. "trepanalas → tejfog trepanálás" ROSSZ ha a fog egy felnőtt fog (FDI 11-48). Pl. "infiltracios_anesztezia → ICT érzéstelenítés" HELYES. Ha a szótár név "tejfog"-ot tartalmaz de felnőtt fogról van szó: ez KONFIGURÁCIÓS HIBA (severity: warning), NEM pipeline hiba.
6. VALÓDI extraction_miss: Csak akkor, ha a fogorvos KIMONDOTT egy kezelést és az NEM jelenik meg sehol a pipeline-ban.
7. VALÓDI extraction_hallucination: Csak ha egy akció NEM template része ÉS nem említett a diktálásban.
8. HÍDPÓTLÁSOK (Bridges) — NAGYON FONTOS:
   - Ha a fogorvos HIDAT említ (pl. "22-28 híd"), a helyes template a "hid_elso_ules" vagy hasonló híd-template. NE jelöld hallucination-nak!
   - A "hid_elso_ules" template a KORONA template kiterjesztése — tartalmaz korona_preparacio-t, ideiglenes_korona-t, stb. Ez HELYES, nem hallucináció.
   - Egy hídnál KIZÁRÓLAG a PILLÉRFOGAK (abutments) kapnak kezelést. A köztes fogak (hézagfogak/pontics) NEM kapnak sem preparációt, sem ideiglenes koronát, sem cementálást.
   - Példa: "22-28 híd, 23 is pillér" → pillérfogak: 22, 23, 28. Pontics: 24, 25, 26, 27. A kimenetben CSAK a 22, 23, 28 fogakon lesz preparáció/ideiglenes korona/cementálás — ez 100% HELYES!
   - NE jelöld EXTRACTION_MISS-nek ha a pontic fogakról (24, 25, 26, 27) "hiányzik" a preparáció — azok NEM kapnak preparációt.
   - NE jelöld EXTRACTION_HALLUCINATION-nak a hid_elso_ules template-et — ha a fogorvos hidat mond, ez a template HELYES.
9. Score 90+ és PASS ha: minden kezelés felismert, template helyes, mapping rendben (mapping_wrong severity:warning nem csökkenti 90 alá). Score 70-89 és WARN ha: kisebb hiányosságok. Score <70 és FAIL ha: kezelés hiányzik vagy kritikus pipeline hiba.

Légy PONTOS. Használj "template_correct" type-ot, ha egy template felismerés és kifejtés helyes volt.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { inputText, rpaOutput, unmapped, protocolCount, vizitCount, itemCount, debug } = await req.json();

    if (!inputText) {
      return new Response(
        JSON.stringify({ error: "Missing inputText" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format RPA output
    const rpaFormatted = (rpaOutput?.vizitek || [])
      .map((v: any) => `Vizit ${v.vizit}: fog ${v.fog || '—'} → ${v.name || v.kezeles || '?'}`)
      .join('\n');

    // Format extracted protocols
    const extractedFormatted = (debug?.extraction?.protocols || []).map((p: any, i: number) => {
      const actions = (p.atomicActions || []).map((a: any) => `    - ${a.slug} (conf: ${a.confidence || '?'})`).join('\n');
      return `Protokoll ${i + 1}: ${p.templateSlug || '?'} (conf: ${p.confidence})\n  Paraméterek: ${JSON.stringify(p.parameters || {})}\n  Akciók:\n${actions}`;
    }).join('\n\n');

    // Format validation warnings
    const warningsFormatted = (debug?.validation?.warnings || [])
      .map((w: any) => `- [${w.field}] ${w.message} (action: ${w.action || 'auto-fill'})`)
      .join('\n');

    // Format clinical validation
    const clinValFormatted = debug?.clinicalValidation
      ? `Pass A: ${debug.clinicalValidation.removedByPassA || 0} eltávolítva, Pass B: ${debug.clinicalValidation.removedByPassB || 0}, Pass C: ${debug.clinicalValidation.removedByPassC || 0}, Pass D: ${debug.clinicalValidation.removedByPassD || 0}, Pass E: ${debug.clinicalValidation.removedByPassE || 0}, Összesen: ${debug.clinicalValidation.totalRemoved || 0}`
      : 'nincs adat';

    // Format mapped items
    const mappedFormatted = (debug?.mapping?.items || [])
      .map((m: any) => `${m.actionSlug} → ${m.szotarKezelesName || 'NINCS'} (id: ${m.szotarKezelesId || '?'})`)
      .join('\n');

    const userPrompt = `DIKTÁLT SZÖVEG:
"""
${inputText}
"""

═══ PIPELINE DEBUG ═══

STAGE 02 — EXTRAKCIÓ (${protocolCount} protokoll):
${extractedFormatted || 'nincs adat'}

STAGE 03 — VALIDÁCIÓ figyelmeztetések:
${warningsFormatted || 'nincs figyelmeztetés'}

STAGE 04 — EXPAND: ${debug?.expansion?.itemCount || '?'} tétel

STAGE 04.5 — KLINIKAI VALIDÁCIÓ:
${clinValFormatted}

STAGE 05 — MAPPING:
Párosított:
${mappedFormatted || 'nincs'}
Nem párosított: ${(unmapped || []).join(', ') || 'nincs'}

STAGE 06 — RPA KIMENET (${itemCount} sor):
${rpaFormatted || 'üres'}

═══════════════════════

Diagnosztizáld a pipeline teljesítményét. Minden hibánál állapítsd meg, MELYIK STAGE okozza.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
    }

    const result = await response.json();
    const raw = result.content?.[0]?.text?.trim() || '{}';

    let assessment;
    try {
      assessment = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      assessment = match ? JSON.parse(match[0]) : { score: 0, verdict: 'FAIL', summary: 'Nem sikerült az értékelés', findings: [] };
    }

    return new Response(
      JSON.stringify(assessment),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[V2 Assess] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
