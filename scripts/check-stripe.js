import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://bpjzgapmoyhtgryglcke.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Fetching licenses...");
    const { data: licenses, error: licError } = await supabase
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log("Licenses:", licenses, "Error:", licError);

    console.log("\nFetching companies...");
    const { data: companies, error: compError } = await supabase
        .from('companies')
        .select('id, name, seats, subscription_status')
        .eq('name', 'Próba cég');

    console.log("Companies:", companies, "Error:", compError);
}

check().catch(console.error);
