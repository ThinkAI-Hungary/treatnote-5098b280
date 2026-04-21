import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
envText.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v) env[k.trim()] = v.join('=').trim().replace(/"/g, '');
});

const supabase = createClient(env['VITE_SUPABASE_URL']!, env['SUPABASE_SECRET_KEY']!);

async function check() {
    const res = await supabase.from('dental_chart').select('*').limit(1);
    console.log(JSON.stringify(res, null, 2));
}

check();
