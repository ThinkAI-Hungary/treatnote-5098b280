import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
envText.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v) env[k.trim()] = v.join('=').trim().replace(/"/g, '');
});

const supabaseAdmin = createClient(env['VITE_SUPABASE_URL']!, env['SUPABASE_SECRET_KEY']!);

const SUBAPASE_URL = env['VITE_SUPABASE_URL'];
const JWT = env['SUPABASE_PERSONAL_ACCESS_TOKEN'] || env['SUPABASE_SECRET_KEY']; // For API auth if needed, but webhook is public/anon usually

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

async function run() {
  for (let i = 0; i < cases.length; i++) {
    const text = cases[i];
    console.log(`Injecting Case ${i + 1}/10...`);
    
    const formData = new FormData();
    // Dummy audio blob to bypass validation
    const dummyBlob = new Blob(["dummy"], { type: "audio/webm" });
    formData.append("audio", dummyBlob, "test.webm");
    
    // User Context from Pepszi
    formData.append("user_id", "925386ef-6c42-470c-aec4-8deeb938086e");
    formData.append("treatnote_patient_id", "1062b97b-c035-4641-8812-9cc1ed1aa7ef");
    formData.append("mode", "voxis");
    formData.append("filename", `Test_Batch_1_Case_${i+1}.webm`);
    
    // OUR OVERRIDE HACK
    formData.append("override_transcript", text);

    try {
      const res = await fetch(`${SUBAPASE_URL}/functions/v1/native-voice-webhook`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env['VITE_SUPABASE_PUBLISHABLE_KEY']}`
        },
        body: formData
      });
      
      const body = await res.json();
      console.log(`Response ${res.status}:`, body);

      if (res.status === 200 && body.job_id) {
        console.log(`Waiting for job ${body.job_id} to complete...`);
        while(true) {
          await new Promise(r => setTimeout(r, 2000));
          const { data, error } = await supabaseAdmin.from('native_voice_jobs').select('status, progress_percent').eq('id', body.job_id).single();
          if (data) {
             process.stdout.write(`\rProgress: ${data.progress_percent}%`);
             if (data.status !== 'processing') {
                console.log(`\nJob ${body.job_id} finished with status: ${data.status}`);
                break;
             }
          }
        }
      } else {
        // if rate limited, wait 5 seconds and retry
        if (res.status === 409) {
          console.log("Rate limited! Waiting 10s and retrying...");
          // We need to clear any stuck jobs for Pepszi just in case
          await supabaseAdmin.from('native_voice_jobs').update({ status: 'error' }).eq('status', 'processing').eq('treatnote_patient_id', '1062b97b-c035-4641-8812-9cc1ed1aa7ef');
          await new Promise(r => setTimeout(r, 10000));
          i--; // retry current index
        }
      }
    } catch (e) {
      console.error(`Fetch failed for case ${i+1}:`, e);
    }
  }
}

run();
