import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
envText.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v) env[k.trim()] = v.join('=').trim().replace(/"/g, '');
});

const supabase = createClient(env['VITE_SUPABASE_URL']!, env['SUPABASE_SECRET_KEY']!);

async function dump() {
    const { data } = await supabase.from('native_voice_jobs').select('result').order('created_at', { ascending: false }).limit(1);
    if(data) fs.writeFileSync('dump.json', JSON.stringify(data[0].result, null, 2));
}

dump();
