import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function test() {
  const res = await supabase.functions.invoke('regenerate-item-embedding', {
    body: { item_id: 'ca6c531b-0fec-41de-a07e-974a4d0c5a47' }
  });
  console.log(res);
}

test();
