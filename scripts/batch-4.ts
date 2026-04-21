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
const JWT = env['SUPABASE_PERSONAL_ACCESS_TOKEN'] || env['SUPABASE_SECRET_KEY'];

const cases = [
  "(16) Tizenhatos fog palatinális gyökere amputálva lett (hemiszekció).",
  "(34, 35) Harmincnégyes és harmincötös fémkerámia leplezett korona, egybeöntve.",
  "(41, 31) Alsó nagymetszők meglazultak, III. fokú mobilitás.",
  "(24-27) Bal felső kvadránsban teljes híd, a huszonhatos hiányzik.",
  "(11, 12, 21, 22) Felső négy metszőfogra Ideiglenes műanyag korona.",
  "(46) Negyvenhatos fog occlusalis szuvasodás, jelenleg nyitva hagyva (trepanálva).",
  "(38) Harmincnyolcas bölcsességfog félig előtört, pericoronitis.",
  "(All-on-4) Felső állcsonton négyes All-on-4 implant, a 14, 12, 22, 24 pozíciókban.",
  "(43, 44, 45, 46) Alsó fronttól hátra fémkerámia korona a hármason, a többi hídtag fel a hatosig.",
  "(25) Huszonötös fogból a régi tömés kiesett, másodlagos caries mélyen."
];

async function run() {
  for (let i = 0; i < cases.length; i++) {
    const text = cases[i];
    console.log(`\nInjecting Case ${i + 31}/50...`);
    
    const formData = new FormData();
    const dummyBlob = new Blob(["dummy"], { type: "audio/webm" });
    formData.append("audio", dummyBlob, "test.webm");
    
    formData.append("user_id", "925386ef-6c42-470c-aec4-8deeb938086e");
    formData.append("treatnote_patient_id", "1062b97b-c035-4641-8812-9cc1ed1aa7ef");
    formData.append("mode", "voxis");
    formData.append("filename", `Test_Batch_4_Case_${i+1}.webm`);
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
        if (res.status === 409) {
          console.log("Rate limited! Waiting 10s and retrying...");
          await supabaseAdmin.from('native_voice_jobs').update({ status: 'error' }).eq('status', 'processing').eq('treatnote_patient_id', '1062b97b-c035-4641-8812-9cc1ed1aa7ef');
          await new Promise(r => setTimeout(r, 10000));
          i--;
        }
      }
    } catch (e) {
      console.error(`Fetch failed for case ${i+1}:`, e);
    }
  }
}

run();
