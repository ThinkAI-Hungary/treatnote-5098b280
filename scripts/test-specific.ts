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

const text = "A páciensnek tizenegyes és tizenkettes foga hiányzik, a huszonegyestől a huszonötös fogáig fémkerámia koronák helyezkednek el, illetve fémkerámia híd és a végén van korona. A tizenegy-nyolcas foga itt, hát az viszonylag rossz állapotban van már. Okkulzálisan lyukas, ezt majd tömni kell. Mozog is, a mobilitása az másodfokú. A tasak mélysége az kettes, íny visszahúzódása van egy miliméter. Azt a páciens azt mondta, hogy kopogásra, illetve érintésre fáj, fájdalmat érez, illetve hideg, hideg üdítőknél, hideg ételeknél is kellemetlenséget érez. Ö... (négy másodperc szünet) Kicsit erózionált a fog, periaplikális elváltozás látható. Ö... tötötö... A fog színe az a hármas. Illetve, illetve van ö... cirkonkorona is ezen a fogon, illetve egy Straumann implantátum, aminek az átmérője hat miliméter, a hossza két miliméter, a beültetés dátuma pedig 2004. április 6-a volt.";

async function run() {
    console.log(`Injecting Case...`);
    
    const formData = new FormData();
    const dummyBlob = new Blob(["dummy"], { type: "audio/webm" });
    formData.append("audio", dummyBlob, "test.webm");
    
    formData.append("user_id", "925386ef-6c42-470c-aec4-8deeb938086e");
    formData.append("treatnote_patient_id", "1062b97b-c035-4641-8812-9cc1ed1aa7ef");
    formData.append("mode", "voxis");
    formData.append("filename", `Test_Specific_Data.webm`);
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
          const { data, error } = await supabaseAdmin.from('native_voice_jobs').select('status, progress_percent, result').eq('id', body.job_id).single();
          if (data) {
             process.stdout.write(`\rProgress: ${data.progress_percent}%`);
             if (data.status !== 'processing') {
                console.log(`\nJob ${body.job_id} finished with status: ${data.status}`);
                console.log(JSON.stringify(data.result, null, 2));
                break;
             }
          }
        }
      }
    } catch (e) {
      console.error(`Fetch failed:`, e);
    }
}

run();
