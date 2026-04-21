import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
envText.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v) env[k.trim()] = v.join('=').trim().replace(/"/g, '');
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SECRET_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('native_voice_jobs').select('*').limit(2).order('created_at', { ascending: false });
  fs.writeFileSync('pepszi.json', JSON.stringify(data || error, null, 2), 'utf8');
}

main();
