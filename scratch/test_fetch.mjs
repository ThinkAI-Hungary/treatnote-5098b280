import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const SUPABASE_URL = env.match(/VITE_SUPABASE_URL="(.*)"/)[1].trim();
const SUPABASE_ANON_KEY = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY="(.*)"/)[1].trim();

async function test() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/regenerate-item-embedding`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ item_id: 'ca6c531b-0fec-41de-a07e-974a4d0c5a47' })
  });
  console.log(res.status);
  console.log(await res.text());
}

test();
