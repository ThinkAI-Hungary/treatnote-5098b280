import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
envText.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v) env[k.trim()] = v.join('=').trim().replace(/"/g, '');
});

const SUBAPASE_URL = env['VITE_SUPABASE_URL']!;
const supabaseKey = env['SUPABASE_SECRET_KEY']!;
const supabaseAdmin = createClient(SUBAPASE_URL, supabaseKey);

async function run() {
  const { data, error } = await supabaseAdmin.from('native_voice_jobs')
    .select('id, raw_audio_text, result, created_at')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(50);
    
  if (error) {
    console.error(error);
  } else {
    fs.writeFileSync('batch_results.json', JSON.stringify(data, null, 2));
    console.log(`Saved ${data.length} records to batch_results.json`);
  }
}
run();
