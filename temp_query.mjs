import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
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
  const { data, error } = await supabase.from('szabalyok').select('nev, items').in('id', ['16f40324-ba03-468f-8c2f-88cb02551962', 'a31de5c1-7b8e-4b6d-a404-b4dc0387cb0b', '7dd1a1e5-1579-472a-9270-0ddefdfcd6a5']);
  console.log(JSON.stringify(data, null, 2));
})();
