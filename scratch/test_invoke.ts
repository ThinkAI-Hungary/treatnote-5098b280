import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("VITE_SUPABASE_URL");
const supabaseKey = Deno.env.get("VITE_SUPABASE_ANON_KEY");

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing environment variables!");
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.functions.invoke('regenerate-item-embedding', {
    body: { item_id: 'ca6c531b-0fec-41de-a07e-974a4d0c5a47' }
  });
  console.log("Data:", data);
  console.log("Error:", error);
}

test();
