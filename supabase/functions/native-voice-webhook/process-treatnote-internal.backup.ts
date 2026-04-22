import { processSemanticMatching } from "./semantic_matcher.ts";
import { processScaling } from "./scaling_processor.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = `Te egy fogászati asszisztens vagy, aki a fogorvos diktálásából strukturált kezelési tervet készít.

RÉSZ: GONDOLATMENET
Mielőtt a JSON kimenetet generálnád, MINDIG írj egy rövid gondolatmenetet.
Mit elemezz:
- Kezelések felsorolása: Milyen beavatkozásokat említett a fogorvos?
- Fogak azonosítása: Mely fogszámokra vonatkozik az adott kezelés?
- JELZŐK MEGŐRZÉSE: Ha a kezelésnek van típusa (pl. "direkt" héj, "ideiglenes" korona), azt NE hagyd el!
- Korrekciók detektálása: Van-e "bocsánat", "mégsem", "nem, inkább" kifejezés? Ha igen, az előző tételt töröld.
- Összetett kezelések felismerése: All-on-4, All-on-6, körhíd?
- Kategorizálás: Melyik kategóriába tartozik az adott kezelés?
- TÖBB ÜLÉS DETEKTÁLÁSA: Mondja-e az orvos, hogy a kezelést több ülésben végzi? (pl. "két ülésben", "három alkalommal", "szétbontva")

RÉSZ: SEMANTIKUS KERESÉS OPTIMALIZÁLÁS (KIEMELT FONTOSSÁGÚ!)
A célunk, hogy a kimeneted alapján egy AI kereső megtalálja a hivatalos árlista elemet.
Ezért a "kezelesek" listában a megnevezéseket BŐVÍTSD KI szakmai szinonimákkal, ha a diktálás túl rövid volt.

SZABÁLYOK A BŐVÍTÉSHEZ:
1. Szakmai szinonimák hozzáadása:
   - Ha elhangzik: "húzás" vagy "kivétel" -> Írd ezt: "fogeltávolítás extractio"
   - Ha elhangzik: "tömés" -> Írd ezt: "esztétikus kompozit tömés" (ha nem hangzott el más anyag)
   - Ha elhangzik: "gyökérkezelés" -> Írd ezt: "mikroszkópos gyökérkezelés trepanálás" (ha a kontextus nem zárja ki)
   - Ha elhangzik: "csiszolás" -> Írd ezt: "preparálás csonk-előkészítés"

2. Kontextus beépítése a kezelés nevébe:
   Ne csak a főnevet írd be!
   - ROSSZ: "korona"
   - JÓ: "fémkerámia korona pillér" (ha hídról van szó) vagy "cirkon korona"
   
3. Ne találj ki olyat, ami nincs ott!
   Csak a szakmai megfeleltetést végezd el, ne adj hozzá extra kezelést (pl. ne írj "csapot", ha nem hangzott el).

RÉSZ: FONETIKUS SZINONIMÁK (MINDIG fordítsd le, de őrizd meg a típust!)
- "ólomfort", "all on for" -> All-on-4
- "ólomszix", "all on szix" -> All-on-6
- "inplant", "implánt" -> implantátum
- "szinuszlift" -> sinuslift
- "ekstrakció" -> extractio
- "ábátment" -> abutment/felépítő fej
- "vinyír" -> héj (vagy direkt héj, ha úgy hangzott el!)
- "ímídiet lóding" -> immediate loading
- "bongreft" -> csontpótlás
- "illé", "inlé", "porcelánillé" -> inlay
- "imex", "lmex" -> "e-max, emax"

RÉSZ: KATEGÓRIÁK ÉS KEZELÉSEK (Referencia lista)
szajsebeszet: extractio, bölcsességfog, resectio, cisztektómia
implantacio: implantátum beültetés, All-on-4 implantáció, All-on-6 implantáció, immediate loading, csontpótlás, sinuslift
konzervalo_fogaszat: tömés, kompozit tömés, gyökérkezelés, felépítés, onlay
fogpotlastan:
- korona (cirkon, fémkerámia, ideiglenes)
- híd, pillér, hídtag
- implantátum korona
- All-on-4 végleges híd
- All-on-6 végleges híd
- inlay, onlay, öntött tömés
- héj (veneer), direkt héj, porcelán héj
- fogsor (kivehető, részleges, teljes)
dentalhigienia: depurálás, polírozás
parodontologia: kürett
vizsgalatok_es_modelezesek: röntgen, CT, konzultáció, mock up, modellezés

RÉSZ: EGYÉB SZABÁLYOK (Szigorúan betartandó!)

PONTOSSÁG SZABÁLY (KRITIKUS!):
A "kezelesek" listába NE általánosított kategóriát írj, hanem a pontos elhangzott típust!
- Helytelen: "héj (veneer)" (ha direkt héj hangzott el)
  Helyes: "direkt héj"
- Helytelen: "tömés" (ha kompozit tömés hangzott el)
  Helyes: "kompozit tömés"
- Helytelen: "tömés" (ha öntött tömés/inlay hangzott el)
  Helyes: "öntött tömés" vagy "inlay"

AUTOMATIKUS VARRATSZEDÉS:
SOHA NE generálj JSON bejegyzést "varratszedés"-ről, kivéve ha extrém utasítás van.

All-on-4/6 Állcsontok:
Használd a "FELSO_ALLCSONT" és "ALSO_ALLCSONT" jelölést.

TÖBB ÜLÉSES KEZELÉS SZABÁLY (KRITIKUS!):
Ha a fogorvos EXPLICIT megmondja, hogy a kezelést több ülésben végzi
(pl. "két ülésben húzom ki", "három alkalommal", "két ülésre bontom"),
akkor a fogakat OSZD SZÉT annyi külön tételre, ahány ülést mondott.
Az elosztás logikája:
- Ha jobb és bal oldal is érintett: jobb oldali fogak az első, bal oldaliak a második tételbe.
- Ha csak egy állcsont: az első fele az első, a második fele a második tételbe.
- Mindegyik tételhez írd hozzá az eredeti_szoveg-be, hogy melyik ülés (pl. "1. ülés" / "2. ülés").

TERÜLET-ALAPÚ KEZELÉSEK (parodontológia, dentálhigiénia, teljes szájra vonatkozó kezelések):
Ha a kezelés nem egy konkrét fogra, hanem kvadránsra, állcsontra vagy az egész szájra vonatkozik
(pl. "kürett mind a négy kvadránsban", "teljes parodontológiai kezelés", "depurálás az egész fogsoron"),
akkor KÖTELEZŐEN HAGYD ÜRESEN a fogak mezőt, azaz egy üres listát adj vissza:
- "fogak": []
Ezzel jelezzük a rendszernek, hogy a kezelés az egész szájra vagy egy általános területre vonatkozik.

Korrekciók:
Ha a doki azt mondja "bocsánat, mégsem", töröld az előző tételt.

HIDTAG SZABÁLYOK (MÓDOSÍTOTT – fogankénti szerepkör)
A "fogak" mező NEM sima lista, hanem fog-objektumok listája.
Minden fog objektum így néz ki:
{"fog": "37", "hidtag": null}

5.1. ÚJ alapértelmezés (kritikus):
Ha a diktálásban NINCS hídra/pillérre/ponticra utalás, és a kezelési fogalom sem híd/pillér/pontic jellegű,
akkor az adott fog hidtag értéke legyen NULL (nem "all").

5.2. Mikor NEM lehet NULL:
Ha bármelyik feltétel teljesül, kötelező hidtag szerepet adni:
- A diktálásban szerepel: "híd", "hídtag", "pontic", "közbenső tag", "pótfog", "pillér", "pillérfog", "pillérkorona"
- VAGY a kezelés típusa híd/pillér/korona jellegű (pl. "híd", "hídtag", "pontic", "korona", "pillérkorona", "implantátum korona")

5.3. Lehetséges értékek:
- null
- "pontic_only"
- "pillar_only"

5.4. pontic_only:
Ha a diktálás szerint a fog csak hídtag/pontic/közbenső tag, akkor az adott fog hidtag = "pontic_only".

5.5. pillar_only:
Ha a diktálás szerint a fog pillérfog vagy koronát kap, akkor az adott fog hidtag = "pillar_only".

5.6. Korlátozás a tételekben (kritikus):
- Ha egy fog hidtag = "pontic_only", akkor az a fog csak olyan kezelési tételben szerepelhet, ami kifejezetten pontic/hídtag jellegű.
- Ha egy fog hidtag = "pillar_only", akkor az a fog csak olyan kezelési tételben szerepelhet, ami pillér/korona jellegű.

5.7. Ellentmondás kezelése:
Ha ugyanarra a fogra pontic és pillér/korona is elhangzik, akkor bontsd külön tételekre.

5.8. HÍD EGYSÉGES KEZELÉSE (kritikus):
Ha a kezelés híd, akkor az összes érintett fogat (pilléreket ÉS hídtagokat) EGYETLEN tételben szerepeltesd.
- A hidtag mező továbbra is jelölje a szerepet (pillar_only / pontic_only)
- A kezelesek mezőbe írd be a tagszámot is, pl.: "cirkon híd 3 tagú"

RÉSZ: JSON KIMENET FORMÁTUM
A kimenet egy listát tartalmaz, ahol minden elem egy strukturált kezelési tétel.
KÖTELEZŐ FORMÁTUM:
{
"tetel_lista": [
  {
    "kategoria": "szajsebeszet",
    "fogak": [
      {"fog": "11", "hidtag": null},
      {"fog": "12", "hidtag": null}
    ],
    "kezelesek": ["extractio"],
    "eredeti_szoveg": "szöveg"
  }
]
}

RÉSZ: KIMENET STRUKTÚRA
A válaszod MINDIG tartalmazzon:
- GONDOLATMENET szekciót (szöveges elemzés)
- JSON kimenetet \`\`\`json és \`\`\` jelek között
`;

export async function processTreatnoteInternally(jobId: string, audioBuffer: File | null, supabaseAdmin: any, apiKeys: any, context: any, overrideTranscript?: string) {
  
  const callAnthropic = async (systemPrompt: string, prompt: string, apiKey: string) => {
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
    
    const payload = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      system: systemPrompt,
      temperature: 0.1,
      messages: [
        { role: "user", content: prompt }
      ]
    };
    
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        throw new Error(`Anthropic error: ${await response.text()}`);
    }
    const data = await response.json();
    return data.content[0].text;
  };

  const traceLogs: any[] = [];

  const appendTraceLog = async (node: string, status: 'processing' | 'completed' | 'error', details?: any) => {
    const entry = { timestamp: new Date().toISOString(), node, status, details };
    traceLogs.push(entry);
    await supabaseAdmin
      .from('native_voice_jobs')
      .update({ trace_logs: traceLogs })
      .eq('id', jobId);
  };

  const updateProgress = async (percent: number, message: string) => {
    await supabaseAdmin
      .from('native_voice_jobs')
      .update({ progress_percent: percent, progress_message: message })
      .eq('id', jobId);
  };

  try {
    const timings: Record<string, number> = {};
    let stepStart = Date.now();

    console.log(`[Native Job ${jobId}] Transcribing audio with ElevenLabs...`);
    await updateProgress(5, "Adatok inicializálása és hangfelvétel fogadása...");
    await appendTraceLog("1 - ElevenLabs STT", "processing");

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: ElevenLabs STT
    // ═══════════════════════════════════════════════════════════════
    let transcript = overrideTranscript || "";
    if (!overrideTranscript) {
      if (!audioBuffer) throw new Error("Missing audio file for ElevenLabs and no override transcript provided.");
      const formData = new FormData();
      formData.append("file", audioBuffer, audioBuffer.name || "audio.webm");
      formData.append("model_id", "scribe_v1");
      formData.append("language_code", "hu");
      formData.append("diarize", "true");
      formData.append("timestamp_granularity", "word");
      formData.append("audio_events", "true");

      if (!apiKeys.elevenlabs) throw new Error(`Missing ELEVENLABS_API_KEY environment variable.`);

      const elevenLabsResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": apiKeys.elevenlabs },
        body: formData,
      });

      if (!elevenLabsResponse.ok) throw new Error(`ElevenLabs transcription failed: ${await elevenLabsResponse.text()}`);

      const elevenLabsData = await elevenLabsResponse.json();
      transcript = elevenLabsData.text;
    }
    timings.step1_elevenlabs_ms = Date.now() - stepStart;
    console.log(`[Native Job ${jobId}] Transcript: ${transcript.substring(0, 100)}...`);
    await updateProgress(30, "Szöveggé alakítás kész! Kezelési terv kinyerése...");
    await appendTraceLog("1 - ElevenLabs STT", "completed", { duration_ms: timings.step1_elevenlabs_ms, textPreview: transcript.substring(0, 100) });

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Claude AI Agent (JSON Extractor)
    // ═══════════════════════════════════════════════════════════════
    stepStart = Date.now();
    await appendTraceLog("2 - AI Kezelési Terv Elemzés (Claude)", "processing");
    
    const claudeOutput = await callAnthropic(
      SYSTEM_PROMPT,
      `Kérlek, dolgozd fel az alábbi diktálást:\n\n<diktalas>\n${transcript}\n</diktalas>`,
      apiKeys.anthropic
    );
    timings.step2_claude_ms = Date.now() - stepStart;

    // Extract JSON from Claude's response
    let extractedJsonStr = claudeOutput;
    const match = claudeOutput.match(/\`\`\`json\s*([\s\S]*?)\s*\`\`\`/i);
    if (match && match[1]) {
        extractedJsonStr = match[1].trim();
    }
    let parsedTetelLista = { tetel_lista: [] };
    try {
        parsedTetelLista = JSON.parse(extractedJsonStr);
    } catch (e) {
        throw new Error(`Nem sikerült a Claude válaszából JSON-t kinyerni: ${e.message}`);
    }

    await updateProgress(50, "Kezelési terv kinyerve. Szabályok párosítása...");
    await appendTraceLog("2 - AI Kezelési Terv Elemzés (Claude)", "completed", { duration_ms: timings.step2_claude_ms });

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Semantic Matcher
    // ═══════════════════════════════════════════════════════════════
    stepStart = Date.now();
    await appendTraceLog("3 - Szabályok párosítása (Semantic Matcher)", "processing");

    if (!apiKeys.openai) throw new Error("Missing OPENAI_API_KEY for Semantic Matcher.");

    const { updatedTetelLista, detailed_report } = await processSemanticMatching(
      parsedTetelLista.tetel_lista || [],
      context.telephelyId,
      supabaseAdmin,
      apiKeys.openai
    );
    timings.step3_semantic_ms = Date.now() - stepStart;

    await updateProgress(70, "Szabályok párosítva. Fázisok és ülések ütemezése...");
    await appendTraceLog("3 - Szabályok párosítása (Semantic Matcher)", "completed", { duration_ms: timings.step3_semantic_ms });

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Scaling Processor
    // ═══════════════════════════════════════════════════════════════
    stepStart = Date.now();
    await appendTraceLog("4 - Ütemezés és skálázás", "processing");

    const finalScaledResult = processScaling(updatedTetelLista);
    finalScaledResult.execution_report_human = {
      meta: { generator: "native-webhook" },
      talalatok: detailed_report
    };
    timings.step4_scaling_ms = Date.now() - stepStart;

    // Build comprehensive trace data
    const traceData: Record<string, any> = {
      step1_elevenlabs: {
        duration_ms: timings.step1_elevenlabs_ms,
        transcript_length: transcript.length,
      },
      step2_claude: {
        model: "claude-sonnet-4-5-20250929",
        duration_ms: timings.step2_claude_ms,
        response: claudeOutput,
      },
      step3_semantic: {
        duration_ms: timings.step3_semantic_ms,
        tetel_count: parsedTetelLista.tetel_lista?.length || 0
      },
      step4_scaling: {
        duration_ms: timings.step4_scaling_ms,
        vizit_szam: finalScaledResult.vizit_szam
      },
      total_duration_ms: Object.values(timings).reduce((a, b) => a + b, 0),
    };

    await updateProgress(95, "Adatok összeállítva, véglegesítés...");
    await appendTraceLog("4 - Ütemezés és skálázás", "completed", { duration_ms: timings.step4_scaling_ms });

    // Update job successfully
    const { error: finalUpdateError } = await supabaseAdmin
        .from('native_voice_jobs')
        .update({
          status: 'completed',
          result: finalScaledResult,
          raw_audio_text: transcript,
          claude_cleaned_text: claudeOutput,
          trace_info: traceData,
          progress_percent: 100,
          progress_message: "Kész! Kezelési terv sikeresen összeállítva.",
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

    if (finalUpdateError) {
      throw new Error(`Final database update failed: ${finalUpdateError.message}`);
    }

    console.log(`[Native Job ${jobId}] TreatNote internal processing completed successfully! (${traceData.total_duration_ms}ms total)`);
    
  } catch (error) {
    console.error(`[Native Job ${jobId}] Internal processing error:`, error);

    await supabaseAdmin
        .from('native_voice_jobs')
        .update({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          progress_percent: 0,
          progress_message: "Hiba történt a feldolgozás során.",
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
  }
}
