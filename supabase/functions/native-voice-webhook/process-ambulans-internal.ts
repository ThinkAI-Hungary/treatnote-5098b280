const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const AMBULANS_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AmbulansAdatlapExtraction",
  "type": "object",
  "additionalProperties": false,
  "required": ["document", "fields", "diagnoses", "procedures", "found", "validation"],
  "properties": {
    "document": {
      "type": "object", "additionalProperties": false,
      "required": ["template_id", "language", "source_type"],
      "properties": {
        "template_id": { "type": "string", "minLength": 1 },
        "language": { "type": "string", "enum": ["hu"] },
        "source_type": { "type": "string", "enum": ["transcript", "text", "note"] }
      }
    },
    "fields": {
      "type": "object", "additionalProperties": false,
      "required": ["1_javitas", "2_eredeti_datum", "3_eredeti_szakrendelo", "4_eredeti_naplosorszam", "5_naplosorszam", "6_rendelo_neve", "7_rendelo_azonosito", "8_beutalo_munkahely_neve", "9a_beutalo_munkahely_azonosito", "9b_beutalo_orvos_kod", "9c_ellatast_igazolo_adat", "9d_beutalo_kelte", "9e_eeszt_beutalo_azonosito", "10_teritesi_kategoria", "10_reszleges_teritesi_dij", "11_ellato_orvos_kod", "12_biztositas_orszag_vagy_allampolgarsag", "13_szemelyazonosito_jel", "14_szemelyazonosito_tipus", "15_beteg_neve", "16_szuletesi_datum", "17_anyja_neve", "18_leanykori_nev", "19_lakcim", "20_kezeles_ideje_datum", "20_kezeles_ideje_ido", "21_beteg_neme", "22_ellatas_tipusa", "23_tovabbkuldes", "24_baleset_minositese", "25_e_adatlap_kitoltes", "27a_beavatkozasok_jellege", "28_laborvizsgalat_keres", "29_kepalkoto_keres", "30_ct_mri_pet_keres", "31_fizioterapia_utalas", "32_utikoltseg", "33_keresokepesseg", "34_segedeszkoz_venyek_szama", "35_venyek_szama", "36_gyogyfurdo_venyek_szama", "40_varolista_esetazonosito"],
      "properties": {
        "1_javitas": { "anyOf": [{ "type": "string", "enum": ["0", "1", "2"] }, { "type": "null" }] },
        "2_eredeti_datum": { "anyOf": [{ "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }, { "type": "null" }] },
        "3_eredeti_szakrendelo": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "4_eredeti_naplosorszam": { "anyOf": [{ "type": "string", "pattern": "^[0-9]{8}$" }, { "type": "null" }] },
        "5_naplosorszam": { "anyOf": [{ "type": "string", "pattern": "^[0-9]{8}$" }, { "type": "null" }] },
        "6_rendelo_neve": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "7_rendelo_azonosito": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "8_beutalo_munkahely_neve": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "9a_beutalo_munkahely_azonosito": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "9b_beutalo_orvos_kod": { "anyOf": [{ "type": "string", "pattern": "^[0-9]{5}$" }, { "type": "null" }] },
        "9c_ellatast_igazolo_adat": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "9d_beutalo_kelte": { "anyOf": [{ "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }, { "type": "null" }] },
        "9e_eeszt_beutalo_azonosito": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "10_teritesi_kategoria": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "10_reszleges_teritesi_dij": { "anyOf": [{ "type": "number", "minimum": 0 }, { "type": "null" }] },
        "11_ellato_orvos_kod": { "anyOf": [{ "type": "string", "pattern": "^[0-9]{5}$" }, { "type": "null" }] },
        "12_biztositas_orszag_vagy_allampolgarsag": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "13_szemelyazonosito_jel": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "14_szemelyazonosito_tipus": { "anyOf": [{ "type": "string", "enum": ["0", "1", "2", "3", "5", "6", "7", "9"] }, { "type": "null" }] },
        "15_beteg_neve": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "16_szuletesi_datum": { "anyOf": [{ "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }, { "type": "null" }] },
        "17_anyja_neve": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "18_leanykori_nev": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "19_lakcim": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "20_kezeles_ideje_datum": { "anyOf": [{ "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }, { "type": "null" }] },
        "20_kezeles_ideje_ido": { "anyOf": [{ "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$" }, { "type": "null" }] },
        "21_beteg_neme": { "anyOf": [{ "type": "string", "enum": ["1", "2"] }, { "type": "null" }] },
        "22_ellatas_tipusa": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "23_tovabbkuldes": { "anyOf": [{ "type": "string", "enum": ["0", "1", "2", "3", "4", "5", "6", "7", "8"] }, { "type": "null" }] },
        "24_baleset_minositese": { "anyOf": [{ "type": "string", "pattern": "^[0-9]{2}$" }, { "type": "null" }] },
        "25_e_adatlap_kitoltes": { "anyOf": [{ "type": "string", "enum": ["0", "1"] }, { "type": "null" }] },
        "27a_beavatkozasok_jellege": { "anyOf": [{ "type": "string", "enum": ["A", "V", "C", "D", "K", "R"] }, { "type": "null" }] },
        "28_laborvizsgalat_keres": { "anyOf": [{ "type": "string", "enum": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] }, { "type": "null" }] },
        "29_kepalkoto_keres": { "anyOf": [{ "type": "string", "enum": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] }, { "type": "null" }] },
        "30_ct_mri_pet_keres": { "anyOf": [{ "type": "string", "enum": ["0", "1", "2", "3", "4"] }, { "type": "null" }] },
        "31_fizioterapia_utalas": { "anyOf": [{ "type": "string", "enum": ["0", "1", "2", "3", "4", "5", "6", "7", "8"] }, { "type": "null" }] },
        "32_utikoltseg": { "anyOf": [{ "type": "string", "enum": ["0", "1", "2", "3"] }, { "type": "null" }] },
        "33_keresokepesseg": { "anyOf": [{ "type": "string", "enum": ["0", "1", "2", "3", "4", "5"] }, { "type": "null" }] },
        "34_segedeszkoz_venyek_szama": { "anyOf": [{ "type": "integer", "minimum": 0 }, { "type": "null" }] },
        "35_venyek_szama": { "anyOf": [{ "type": "integer", "minimum": 0 }, { "type": "null" }] },
        "36_gyogyfurdo_venyek_szama": { "anyOf": [{ "type": "integer", "minimum": 0 }, { "type": "null" }] },
        "40_varolista_esetazonosito": { "anyOf": [{ "type": "string" }, { "type": "null" }] }
      }
    },
    "diagnoses": {
      "type": "array", "maxItems": 5,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["bno10", "text_label", "evidence", "confidence"],
        "properties": {
          "bno10": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
          "text_label": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
          "evidence": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "procedures": {
      "type": "array", "maxItems": 6,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["oeno", "text_label", "quantity_me", "evidence", "confidence"],
        "properties": {
          "oeno": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
          "text_label": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
          "quantity_me": { "anyOf": [{ "type": "integer", "minimum": 0 }, { "type": "null" }] },
          "evidence": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "found": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["field", "value", "evidence", "confidence"],
        "properties": {
          "field": { "type": "string", "minLength": 1 },
          "value": { "anyOf": [{ "type": "string" }, { "type": "number" }, { "type": "integer" }, { "type": "boolean" }, { "type": "null" }] },
          "evidence": { "type": "string" },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "validation": {
      "type": "object", "additionalProperties": false,
      "required": ["errors", "warnings"],
      "properties": {
        "errors": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["field", "code", "message"], "properties": { "field": { "type": "string" }, "code": { "type": "string" }, "message": { "type": "string" } } } },
        "warnings": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["field", "code", "message"], "properties": { "field": { "type": "string" }, "code": { "type": "string" }, "message": { "type": "string" } } } }
      }
    }
  }
};

const EXTRACT_USER_PROMPT = `--------------------------------
FELADAT
--------------------------------
Kinyerni a leiratból az ambuláns adatlap mezőihez tartozó értékeket.
1) Mezőket a "fields" objektumban töltsd (ha nincs, null).
2) Diagnózisokat (BNO-10) a "diagnoses" tömbben add vissza (max 5, CSAK fogorvosi K00-K14 kódok).
3) Beavatkozásokat (OENO + mennyiség) a "procedures" tömbben add vissza (max 6).
4) MINDEN kinyert elemhez adj evidence (max 180 karakter) és confidence (0..1).
5) Ha érték formai hibás: fields-ben null, found-ba jelöltként, validation.errors-ba hiba.
6) Dátum formátum: YYYY-MM-DD. Orvos kód: pontosan 5 számjegy.
Ne találj ki OENO/BNO kódokat – ha csak szöveges diagnózis van, a kód mező legyen null.
document.template_id = "ambulans_v1", language = "hu", source_type = "transcript"

BEMENETI LEIRAT:
`;

const ANAMNEZIS_SYSTEM = `Feladat: Írj "Anamnézis" szekciót egy ambuláns laphoz a bemeneti szöveg alapján.
Csak a szövegben szereplő tényeket írd le. Ha nincs adat: "Nincs adat."
Magyarul, tömören, orvosi jelleggel. Kulcs: érték sorokkal tagolj.

KÖTELEZŐ KIMENET FORMÁTUM:
Családban előforduló lényeges megbetegedések:
[tartalom]

Gyermekkori megbetegedések:
[tartalom]

Ismert betegségek:
[tartalom]

Korábbi műtétek:
[tartalom]

Fogászati anamnézis:
[tartalom]

Rendszeresen szedett gyógyszerek:
[tartalom]

Gyógyszerérzékenység:
[tartalom]

Allergia:
[tartalom]

Beültetett eszközök:
[tartalom]

Jelen panaszok:
Kezdet: ...
Hely: ...
Jelleg: ...

Státusz:
Extraoralis vizsgálat:
[tartalom]
Intraoralis vizsgálat:
[tartalom]

Vizsgálati leletek:
[tartalom]`;

const KEZELESEK_SYSTEM = `Te egy ambuláns lap KEZELÉSEK szekcióját írod meg.
Csak a bemeneti szöveg alapján dolgozz. Ha valami nem szerepel: "nincs adat".
Klinikai stílus. A kimenetben NE legyen semmi más, csak a KEZELÉSEK blokk.

KIMENET:
KEZELÉSEK:
1) Ellátás típusa: {első ellátás / kontroll / sürgősségi / egyéb / nincs adat}
2) Állapotfelmérés és vizsgálatok:
   - Fizikális vizsgálat: {igen/nem/nincs adat} | Főbb megállapítás: {...}
   - Vitalparaméterek: {.../nincs adat}
   - Képalkotó: {nincs/készült/kérve} | Típus: {...} | Eredmény: {...}
   - Labor: {nincs/készült/kérve} | Eredmény: {...}
   - Konzílium: {nincs/történt/kérve} | Szakma: {...}
3) Beavatkozások / ellátás:
   - {beavatkozás} | Indok: {...} | Részletek: {...}
4) Terápia:
   - {.../nincs adat}
5) Megfigyelés: {javult/romlott/változatlan/nincs adat}
6) Diszpozíció:
   - Hazabocsátás: {igen/nem/nincs adat}
   - Beutalás: {nincs/van} | Hova: {...}
   - Kontroll: {nincs/van} | Mikor: {...}
7) Betegnek adott tanács: {.../nincs adat}`;

const GYOGYSZEREK_SYSTEM = `Te egy ambuláns lap GYÓGYSZEREK szekcióját írod meg.
Csak a szövegben szereplő gyógyszereket írd le. Ha dózis hiányzik: "nincs adat".
A kimenetben NE legyen semmi más, csak a GYÓGYSZEREK blokk.

KIMENET:
GYÓGYSZEREK:
1) Rendszeresen szedett gyógyszerek:
   - Név: {...} | Adagolás: {.../nincs adat} | Indikáció: {.../nincs adat}
   - Ha nincs: nincs adat
2) Ambulancián beadott szerek:
   - Név: {...} | Dózis: {.../nincs adat} | Indok: {.../nincs adat}
   - Ha nem volt: nincs adat
3) Felírt/javasolt gyógyszerek:
   - Név: {...} | Adagolás: {.../nincs adat} | Időtartam: {.../nincs adat}
   - Ha nincs: nincs felírt gyógyszer
4) Allergia / gyógyszerérzékenység: {.../nincs adat}
5) Megjegyzés: {.../nincs adat}`;

async function callClaude(system: string, userText: string, apiKey: string): Promise<string> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText }
      ],
      temperature: 0.1
    })
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const d = await res.json();
  return d.choices[0].message.content;
}

async function matchDentalBno(evidenceTexts: string[], openaiKey: string, supabaseAdmin: any): Promise<any[][]> {
  if (evidenceTexts.length === 0) return [];
  const embRes = await fetch(OPENAI_EMBED_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-large", dimensions: 1536, input: evidenceTexts })
  });
  if (!embRes.ok) return evidenceTexts.map(() => []);
  const embData = await embRes.json();
  const results: any[][] = [];
  for (const item of embData.data) {
    const { data: rpcData } = await supabaseAdmin.rpc("match_dental_bno_embedding", {
      query_embedding: `[${item.embedding.join(",")}]`,
      match_threshold: 0.55,
      match_count: 3,
      p_source_types: ["name", "semantic_description", "text_source"]
    });
    results.push(rpcData || []);
  }
  return results;
}

export async function processAmbulansInternally(
  jobId: string, audio: File | null, supabaseAdmin: any,
  apiKeys: { openai: string; elevenlabs: string; anthropic: string },
  context: { userId: string; companyId: string; telephelyId: string; logErrorToDatabase: any },
  overrideTranscript?: string
) {
  const updateProgress = async (percent: number, message: string) => {
    await supabaseAdmin.from("native_voice_jobs").update({ progress_percent: percent, progress_message: message }).eq("id", jobId);
  };
  const traceLogs: any[] = [];
  const appendTrace = async (node: string, status: string, details?: any) => {
    traceLogs.push({ timestamp: new Date().toISOString(), node, status, details });
    await supabaseAdmin.from("native_voice_jobs").update({ trace_logs: traceLogs }).eq("id", jobId);
  };

  try {
    // ── STEP 1: ElevenLabs STT ──────────────────────────────────────
    await updateProgress(5, "Hangfelvétel előkészítése...");
    await appendTrace("1 - ElevenLabs STT", "processing");
    let transcript = overrideTranscript || "";
    if (!overrideTranscript) {
      if (!audio) throw new Error("Hiányzó hangfájl.");
      const fd = new FormData();
      fd.append("file", audio, audio.name || "audio.webm");
      fd.append("model_id", "scribe_v2");
      fd.append("language_code", "hu");
      fd.append("diarize", "true");
      fd.append("timestamp_granularity", "word");

      const keyterms = [
        "fémkerámia", "cirkon", "cirkónium", "préskerámia", "aranykerámia",
        "híd", "hídtag", "pillér", "korona", "gyökérkezelés", "gyökértömött",
        "extractio", "foghúzás", "lyukas", "szuvas", "szuvasodás", "tejfog",
        "implant", "implantátum", "csontpótlás", "sinuslift", "depurálás",
        "All-on-4", "All-on-6", "radix", "mobilitás", "tasakmélység", "ínyvisszahúzódás",
        "kopogtatásra érzékeny", "hidegre érzékeny", "melegre érzékeny", "ráharapásra érzékeny",
        "foghány", "barázdazárás", "csonkfelépítés", "inlay", "onlay", "overlay", "héj", "veneer",
        "Zsigmondy", "FDI", "kvadráns",
        "tizenegyes", "tizenkettes", "tizenhármas", "tizennégyes", "tizenötös", "tizenhatos", "tizenhetes", "tizennyolcas",
        "huszonegyes", "huszonkettes", "huszonhármas", "huszonnégyes", "huszonötös", "huszonhatos", "huszonhetes", "huszonnyolcas",
        "harmincegyes", "harminckettes", "harminchármas", "harmincnégyes", "harmincötös", "harminchatos", "harminchetes", "harmincnyolcas",
        "negyvenegyes", "negyvenkettes", "negyvenhármas", "negyvennégyes", "negyvenötös", "negyvenhatos", "negyvenhetes", "negyvennyolcas"
      ];
      keyterms.forEach(term => fd.append("keyterms", term));

      const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST", headers: { "xi-api-key": apiKeys.elevenlabs }, body: fd
      });
      if (!r.ok) throw new Error(`ElevenLabs hiba: ${await r.text()}`);
      transcript = (await r.json()).text;
    }
    await updateProgress(25, "Szöveggé alakítva. Adatmezők kinyerése...");
    await appendTrace("1 - ElevenLabs STT", "completed", { preview: transcript.substring(0, 100) });

    // ── STEP 2: GPT-4o-mini Strukturált kinyerés ──────────────────────────
    await appendTrace("2 - GPT-4o-mini Strukturált kinyerés", "processing");
    const gptRes = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKeys.openai}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_schema", json_schema: { name: "AmbulansAdatlapExtraction", strict: true, schema: AMBULANS_SCHEMA } },
        messages: [
          { role: "system", content: "Magyar orvosi dokumentum kinyerő asszisztens. Pontosan kövesd a JSON sémát." },
          { role: "user", content: EXTRACT_USER_PROMPT + transcript }
        ]
      })
    });
    if (!gptRes.ok) throw new Error(`GPT-4o-mini hiba: ${await gptRes.text()}`);
    const gptData = await gptRes.json();
    const extracted = JSON.parse(gptData.choices[0].message.content);
    await updateProgress(45, "Adatok kinyerve. BNO kódok párosítása...");
    await appendTrace("2 - GPT-4o-mini Strukturált kinyerés", "completed");

    // ── STEP 3: Dental BNO Matcher ──────────────────────────────────
    await appendTrace("3 - Fogorvosi BNO párosítás (K00-K14)", "processing");
    const diagsToEmbed = (extracted.diagnoses || []).filter((d: any) => !d.bno10 && d.evidence?.length > 2);
    const bnoMatches = await matchDentalBno(diagsToEmbed.map((d: any) => d.evidence), apiKeys.openai, supabaseAdmin);
    const enrichedDiagnoses = (extracted.diagnoses || []).map((d: any) => {
      if (d.bno10) return d;
      const idx = diagsToEmbed.findIndex((x: any) => x === d);
      if (idx === -1 || !bnoMatches[idx]?.length) return d;
      const top = bnoMatches[idx][0];
      return { ...d, bno10: top.code, _bno_name: top.name, confidence: Math.round(top.similarity * 100) / 100 };
    });
    await updateProgress(65, "BNO párosítva. Klinikai szövegek generálása...");
    await appendTrace("3 - Fogorvosi BNO párosítás", "completed", { matched: enrichedDiagnoses.filter((d: any) => d.bno10).length });

    // ── STEP 4: 3 parallel Claude agents ───────────────────────────
    await appendTrace("4 - Anamnézis / Kezelések / Gyógyszerek (Claude)", "processing");
    const userText = `Dolgozd fel az alábbi szöveget:\n\n${transcript}`;
    const [pap_history, pap_treatments, pap_drugs] = await Promise.all([
      callClaude(ANAMNEZIS_SYSTEM, userText, apiKeys.anthropic),
      callClaude(KEZELESEK_SYSTEM, userText, apiKeys.anthropic),
      callClaude(GYOGYSZEREK_SYSTEM, userText, apiKeys.anthropic)
    ]);
    await updateProgress(95, "Szövegek kész. Mentés...");
    await appendTrace("4 - Klinikai szövegek", "completed");

    // ── STEP 5: Save result ─────────────────────────────────────────
    const result = {
      pap_history,
      pap_treatments,
      pap_drugs,
      diagnoses: enrichedDiagnoses,
      procedures: extracted.procedures || [],
      fields: extracted.fields || {},
      validation: extracted.validation || { errors: [], warnings: [] }
    };
    await supabaseAdmin.from("native_voice_jobs").update({
      status: "completed",
      result,
      raw_audio_text: transcript,
      progress_percent: 100,
      progress_message: "Kész! Ambuláns lap sikeresen összeállítva.",
      completed_at: new Date().toISOString()
    }).eq("id", jobId);

    console.log(`[Native Job ${jobId}] Ambuláns processing completed.`);
  } catch (err) {
    console.error(`[Native Job ${jobId}] Ambuláns error:`, err);
    await supabaseAdmin.from("native_voice_jobs").update({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      progress_percent: 0,
      progress_message: "Hiba történt a feldolgozás során.",
      completed_at: new Date().toISOString()
    }).eq("id", jobId);
  }
}
