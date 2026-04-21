import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
const envFile = readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(l => {
  if(!l || l.startsWith('#')) return;
  const i = l.indexOf('=');
  const val = l.substring(i + 1).replace(/^["']|["']$/g, '').trim().replace(/["']$/g, '').trim();
  env[l.substring(0, i)] = val;
});
const supabase = createClient(env['VITE_SUPABASE_URL'], env['SUPABASE_SECRET_KEY']);
(async () => {
  const { data, error } = await supabase.from('native_voice_jobs').select('id, mode, status, result').order('created_at', { ascending: false }).limit(1);
  if(data && data.length) {
     writeFileSync('trace_debug.json', JSON.stringify({ result: data[0].result }, null, 2));
     console.log('Wrote trace_debug.json');
  } else { console.log('no data', error); }
})();
