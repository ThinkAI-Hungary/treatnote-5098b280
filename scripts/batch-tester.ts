import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

const envText = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
envText.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v) env[k.trim()] = v.join('=').trim().replace(/"/g, '');
});

const SUBAPASE_URL = env['VITE_SUPABASE_URL']!;
const supabaseKey = env['SUPABASE_SECRET_KEY']!;
const supabaseAdmin = createClient(SUBAPASE_URL, supabaseKey);

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_KEY = env['OPENAI_API_KEY'];
const ANTHROPIC_KEY = env['ANTHROPIC_API_KEY'];

const cases = [
  "(14) Tizennégyes fog gyökérkezelve, esztétikus tömés okluzálisan és disztálisan.",
  "(41, 42) Negyvenegyes és negyvenkettes fog hiányzik.",
  "(36) Harminchatos pozícióban egy Straumann implantátum.",
  "(21, 22) Huszonegyes és huszonkettes egybeöntött fémkerámia korona, huszonkettes szuvas meziálisan.",
  "(45) Negyvenötös fognál komplett radix, extrakció javasolt.",
  "(24, 25, 26) Huszonnégyes és huszonhatos fém kerámia híd pillérei, huszonötös a hídtag.",
  "(11) Tizenegyes fog trauma miatt letört incizálisan, ideiglenes tömés.",
  "(37, 38) Harminchetes mély cariesa distalisan, harmincnyolcas bölcsességfog impaktált.",
  "(15) Tizenötös fogra kértünk egy kompozit inlayt, előkészítve.",
  "(44) Negyvennégyes fog vitalitás teszt negatív, periapikális elváltozással."
];

const EXTRACTOR_SYSTEM = `Te egy fogászati AI extractor vagy. A feladatod: a kapott fogászati szövegből kinyerd a kért kvadráns fogainak adatait STRUKTURÁLT JSON formátumban.

SZABÁLYOK:
- Csak a KÉRT kvadráns fogait add vissza
- Ha egy fog JELEN VAN (de nem mondanak róla semmit): active_properties maradjon üres [], Megjegyzes: ""
- Ha egy fog HIÁNYZIK: active_properties: ["Altalanos.Foghiany"], Megjegyzes: "hiányzik" 
- Implant: active_properties tartalmazza a megfelelő Implant.Altalanos.* enum értéket
- Korona: active_properties tartalmazza a megfelelő Korona.Altalanos.* enum értéket
- Híd pillér: active_properties tartalmazza a koronát ÉS a Hid.Altalanos.*-ot is
- Híd hidtag: active_properties tartalmazza az Altalanos.Foghiany + a Hid.Altalanos.* értéket
- Tömés: active_properties tartalmazza a megfelelő Tomes.*.* felület enum értéket
- Szuvasodás: active_properties tartalmazza a megfelelő Caries.Altalanos.* felület enum értéket
- Gyökértömés: active_properties tartalmazza a Gyokertomes.Vegleges.* értékeket
- Megjegyzes: szabad szöveges megjegyzés az adott foghoz

MEGJEGYZÉS MEZŐ HASZNÁLATA:
- Klinikai info amit az enum nem fed le (pl. mobilitás, fájdalom, kezelési terv)
- "gyökértömött" ha gyökérkezelés történt
- "egybeöntött" ha egybeöntött koronák
- Üresen hagyd ("") ha nincs extra info`;

const CLEANER_PROMPT = `FOGÁSZATI ÁTÍRÁS TISZTÍTÓ v2.6
FDI FOGSZÁMOZÁS (páciens szemszögéből)
Kvadránsok:
1X = jobb felső (11-18)
2X = bal felső (21-28)
3X = bal alsó (31-38)
4X = jobb alsó (41-48)

FELADAT: Használd a standard struktúrát és javítsd a fogászati hibákat.
STRUKTÚRA:
PANASZOK:
FOGAK:
1. KVADRÁNS (jobb felső)
...
2. KVADRÁNS (bal felső)
...
3. KVADRÁNS (bal alsó)
...
4. KVADRÁNS (jobb alsó)
...

MOST DOLGOZD FEL A KAPOTT SZÖVEGET!`;

// Just copying basic schema generator logic
const defs = {
    "fog_sparse": {
      "type": "object",
      "required": ["active_properties", "Megjegyzes"],
      "properties": {
        "Megjegyzes": { "type": "string" },
        "active_properties": {
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "additionalProperties": false
    }
};

const buildQuadrantSchema = (quadrantNum: number, positions: number[]) => {
    const properties: any = {};
    const required: string[] = [];
    positions.forEach(pos => {
      const toothStr = `${quadrantNum}${pos}`;
      properties[toothStr] = { "$ref": "#/$defs/fog_sparse" };
      required.push(toothStr);
    });
    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
      "$defs": defs
    };
};

function smartSplit(path: string): string[] {
    if (path.includes('..')) {
      const idx = path.indexOf('..');
      const top = path.slice(0, idx) + '.';
      const rest = path.slice(idx + 2);
      const dot = rest.indexOf('.');
      if (dot === -1) return [top, rest];
      return [top, rest.slice(0, dot), rest.slice(dot + 1)];
    }
    const parts = path.split('.');
    if (parts.length <= 2) return parts;
    return [parts[0], parts[1], parts.slice(2).join('.')];
}

function sparseToFull(sparseData: any, toothNumbers: string[]): any {
    const result: any = {};
    for (const n of toothNumbers) result[n] = { Megjegyzes: "" };
    
    for (const [toothNum, toothData] of Object.entries(sparseData as Record<string, any>)) {
      if (!result[toothNum]) continue;
      const activePaths = Array.isArray(toothData?.active_properties) ? toothData.active_properties : [];
      result[toothNum].active_properties = activePaths;
      for (const path of activePaths) {
        const keys = smartSplit(path);
        let cur = result[toothNum];
        for (let i = 0; i < keys.length - 1; i++) {
          if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
          cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = true;
      }
      result[toothNum].Megjegyzes = toothData?.Megjegyzes || "";
    }
    return result;
}

// ----------------------------------------------------

async function runTestFlow(transcript: string, index: number) {
    const jobId = randomUUID();
    
    console.log(`[Batch 1 - Case ${index+1}] Starting simulation for: ${transcript}`);
    // 1. Create DB Row
    const { data: jobInfo, error: errInsert } = await supabaseAdmin.from('native_voice_jobs').insert({
        id: jobId,
        user_id: "925386ef-6c42-470c-aec4-8deeb938086e", // the user's ID
        treatnote_patient_id: "1062b97b-c035-4641-8812-9cc1ed1aa7ef", // Pepszi Bela
        mode: "voxis",
        status: "processing",
        audio_filename: `Batch1_Case_${index+1}.webm`,
        duration_seconds: 5,
        progress_percent: 10,
        progress_message: "Tisztítás indítása..."
    });
    
    if (errInsert) { console.error("DB Insert Failed", errInsert); return; }

    // 2. Claude Cleaning
    const clBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: CLEANER_PROMPT,
        temperature: 0.1,
        messages: [{ role: "user", content: transcript }]
    };
    
    const clRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(clBody)
    });
    const clData = await clRes.json();
    const cleanedText = clData.content ? clData.content[0].text : "";

    // 3. Fallback quadrant chunking
    const chunks: any = { q1: cleanedText, q2: cleanedText, q3: cleanedText, q4: cleanedText };
    
    // 4. OpenAI quadrants
    const quadrantConfig = [
        { key: "q1", num: 1, positions: [8,7,6,5,4,3,2,1] },
        { key: "q2", num: 2, positions: [1,2,3,4,5,6,7,8] },
        { key: "q3", num: 3, positions: [8,7,6,5,4,3,2,1] },
        { key: "q4", num: 4, positions: [1,2,3,4,5,6,7,8] },
    ];
    
    let sparseResults: any = {};
    for (const qc of quadrantConfig) {
        const schema = buildQuadrantSchema(qc.num, qc.positions);
        const reqBody = {
            model: "gpt-4.1",
            temperature: 0,
            response_format: { type: "json_schema", json_schema: { name: `q${qc.num}`, strict: true, schema} },
            messages: [{ role: "system", content: EXTRACTOR_SYSTEM }, { role: "user", content: `Kérlek dolgozd fel és nyerd ki a ${qc.num}. KVADRÁNS fogait:\n\n${chunks[qc.key]}`}]
        };
        const oaRes = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(reqBody)
        });
        const oaData = await oaRes.json();
        sparseResults[qc.key] = oaData.choices ? JSON.parse(oaData.choices[0].message.content) : {};
    }

    // 5. Sparse to Full
    const quadrantTeeth: Record<string, string[]> = {
        q1: ["18","17","16","15","14","13","12","11"],
        q2: ["21","22","23","24","25","26","27","28"],
        q3: ["38","37","36","35","34","33","32","31"],
        q4: ["41","42","43","44","45","46","47","48"],
    };
    
    const fullResults: any = {};
    for (const qk of ["q1","q2","q3","q4"]) fullResults[qk] = sparseToFull(sparseResults[qk] || {}, quadrantTeeth[qk]);
    
    let mergedTeeth: any = {};
    for (const qk of ["q1","q2","q3","q4"]) Object.assign(mergedTeeth, fullResults[qk]);
    mergedTeeth.Megjegyzes_fo = "";

    // 6. DB Update
    await supabaseAdmin.from('native_voice_jobs').update({
        status: "completed",
        progress_percent: 100,
        progress_message: "Teszt Kész!",
        result: mergedTeeth,
        raw_audio_text: transcript,
        claude_cleaned_text: cleanedText
    }).eq("id", jobId);
    
    console.log(`[Batch 1 - Case ${index+1}] COMPLETED! Job ID: ${jobId}`);
}

async function run() {
    console.log("STARTING BATCH 1 TEST (Node Native)...");
    for(let i = 0; i < cases.length; i++) {
        await runTestFlow(cases[i], i);
    }
    console.log("ALL DONE!");
}

run();
