import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || ''; // Using service role key for full access
const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEST_USER_ID = "e6a5fb7a-3ad7-466d-a7bf-2de919c25f84";
const TEST_COMPANY_ID = "d6ef74c4-fb89-4e86-a672-5ff00129157c";
const TEST_TELEPHELY_ID = "58baf192-af11-4f3a-8149-27d78a594964";
const TEST_PATIENT_ID = "41a3c6cb-9a74-44ab-adce-26f8c443cd0b"; // Nagy Péter

const SCENARIOS = [
  // BATCH 1 (1-10)
  "Jó napot! A beteg bal alsó hatos foga nagyon fáj napok óta. Erős kopogtatási érzékenységet tapasztaltam. A röntgen periapicalis laesiot mutat. Helyi érzéstelenítésben trepanáltam a 36-os fogat, majd tágítottam a csatornákat. Gyógyszeres lezárást kapott. Dalacint írtam fel neki, napi 3x1-et. Egy hét múlva jöjjön vissza gyökértömésre. BNO: K0470.",
  "Üdvözlöm. A páciens féléves kontrollra érkezett. Panasza nincs. A státuszfelvétel során mindent rendben találtam, szuvasodás nem látható. Az alsó frontok nyelv felőli részén enyhe fogkő volt, ezt ultrahangos depurátorral eltávolítottam, majd políroztam. Következő kontroll fél év múlva.",
  "A beteg elesett és letört a jobb felső kettes foga éle. Pulpa nem nyílt meg, de érzékeny. Helyi érzéstelenítést adtam, majd a 12-es fogon kompozit élpótlást készítettem. A harapást beállítottam. Gyógyszer nem kell. BNO: S0250.",
  "A páciens erős fájdalommal jött a jobb alsó bölcsességfoga környékén. Nyelési nehezítettség is van. Vizsgálatnál a 48-as fog körül pericoronitis látható, a gingiva duzzadt, vörös. Betadine-os átmosást végeztem a tasakban. Curam 1000 mg tablettát írtam fel, napi 2x1. Jövő héten szájsebészeti beutalóval a 48-as fog eltávolítása javasolt.",
  "A beteg ínyvérzésre panaszkodik fogmosáskor. A státusz során kiterjedt supragingivalis és subgingivalis fogkő, valamint gyulladt íny látható. Parodontális tasakok 4-5 mm mélyek. Alsó és felső állcsonton is teljeskörű depurálást és zárt kürettet csináltam. Corsodyl öblögetőt javasoltam kétszer naponta.",
  "A beteg a bal alsó metszők mozgathatóságát vette észre. Parodontális státusz alapján az íny visszahúzódott, a 31 és 41 fogak mozgathatóak. Kompozittal és üvegszállal sínereztem a 32-től 42-ig terjedő szakaszt, hogy stabilizáljam a fogakat. Otthoni fokozott szájhigiénia javasolt.",
  "A beteg aftára panaszkodik a jobb oldali buccán. Nagyon fáj neki evés közben. A vizsgálatnál egy 5 mm-es fekély látható. A területet leecseteltem Phlogosol oldattal. Otthonra is Phlogosol vagy Anaftin gél használatát javasoltam. Kontroll csak panasz esetén.",
  "A beteg bal arcfél duzzanattal érkezett, ami tegnap kezdődött. A 24-es fog gyökérkezelt, de most periapicalis tályog alakult ki. Helyi érzéstelenítés után incisiót végeztem a 24-es fog mellett a vestibulumban, genny ürült. Gumidraint helyeztem be. Augmentin 1g-ot írtam fel napi 2x1. Holnap jöjjön vissza drain cserére.",
  "A páciens azzal jött, hogy kiesett a tömés a jobb alsó hetesből tegnap este evés közben. Fájdalma nincs, csak érzékeny a hidegre. Érzéstelenítőt adtam, a szuvas részeket eltávolítottam a 47-es fogból, majd egy kétszínes kompozit tömést készítettem. Artikulációt ellenőriztem.",
  "A beteg erős hideg- és melegérzékenységről számol be az összes alsó rágófogánál. A fognyakaknál ék alakú kopások láthatóak, caries nincs. A 34, 35, 36 és 44, 45, 46 fogak nyaki részét fluoridos lakkal ecseteltem le. Sensodyne fogkrém használatát javasoltam, és puha sörtéjű fogkefét.",
];

async function runTest(index: number, transcript: string) {
  console.log(`\n--- Teszt ${index + 1} indítása ---`);
  
  const form = new FormData();
  // Dummy audio file
  const blob = new Blob(["dummy audio content"], { type: "audio/webm" });
  form.append("audio", blob, "test.webm");
  form.append("mode", "ambulans");
  form.append("user_id", TEST_USER_ID);
  form.append("treatnote_patient_id", TEST_PATIENT_ID);
  form.append("override_transcript", transcript);

  const webhookUrl = `${supabaseUrl}/functions/v1/native-voice-webhook`;
  
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabasePublishableKey}` 
      },
      body: form
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ Webhook hiba (Teszt ${index + 1}):`, res.status, errorText);
      return false;
    }

    const data = await res.json();
    if (!data.job_id) {
      console.error(`❌ Nincs job_id a válaszban (Teszt ${index + 1}):`, data);
      return false;
    }

    console.log(`✅ Job elindítva: ${data.job_id}. Várakozás a befejezésre...`);
    
    // Polling for completion
    let attempts = 0;
    while (attempts < 60) { // max 60 seconds
      await new Promise(r => setTimeout(r, 2000));
      
      const { data: jobInfo, error } = await supabase
        .from('native_voice_jobs')
        .select('status, progress_percent, error, result, trace_logs')
        .eq('id', data.job_id)
        .single();
        
      if (error) {
        console.error(`Hiba a job lekérdezésekor:`, error.message);
        continue;
      }
      
      if (jobInfo.status === 'completed') {
        console.log(`✅ Teszt ${index + 1} sikeresen befejeződött.`);
        console.log(`   Diagnózisok:`, JSON.stringify(jobInfo.result?.diagnoses));
        console.log(`   Beavatkozások:`, JSON.stringify(jobInfo.result?.procedures));
        console.log(`   Anamnézis (részlet):`, jobInfo.result?.pap_history?.substring(0, 50) + "...");
        console.log(`   Kezelések (részlet):`, jobInfo.result?.pap_treatments?.substring(0, 50) + "...");
        
        if (jobInfo.result?.validation?.errors?.length > 0) {
            console.log(`   ⚠️ Validációs hibák:`, jobInfo.result.validation.errors);
        }
        return true;
      } else if (jobInfo.status === 'error') {
        console.error(`❌ Teszt ${index + 1} hibára futott:`, jobInfo.error);
        console.error(`Trace logs:`, jobInfo.trace_logs);
        return false;
      }
      
      process.stdout.write('.');
      attempts++;
    }
    
    console.error(`❌ Teszt ${index + 1} időtúllépés.`);
    return false;
    
  } catch (err) {
    console.error(`❌ Kivétel történt (Teszt ${index + 1}):`, err);
    return false;
  }
}

async function runBatch() {
  console.log(`Starting Ambuláns Batch 1 (${SCENARIOS.length} tests)`);
  let successCount = 0;
  for (let i = 0; i < SCENARIOS.length; i++) {
    const success = await runTest(i, SCENARIOS[i]);
    if (success) successCount++;
  }
  console.log(`\n=== Batch 1 Befejezve: ${successCount}/${SCENARIOS.length} sikeres ===`);
}

runBatch();
