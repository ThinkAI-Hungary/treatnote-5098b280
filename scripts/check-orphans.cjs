const { createClient } = require('@supabase/supabase-js');

const url = process.env.VITE_SUPABASE_URL || "https://bpjzgapmoyhtgryglcke.supabase.co";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!key) throw new Error("Missing key");

const supabase = createClient(url, key);

async function check() {
    console.log("Checking DB...");
    const { data: orphans, error } = await supabase
        .from('licenses')
        .select('id, company_id')
        .is('telephely_id', null);

    console.log("Orphans remaining:", orphans?.length, error?.message || '');
}

check();
