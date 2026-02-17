
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
    console.log("Searching for 'Próba' telephely...");
    const { data: telephelyData, error: telephelyError } = await supabase
        .from('telephely')
        .select('id, name')
        .ilike('name', '%próba%');

    if (telephelyError) {
        console.error("Error fetching telephely:", telephelyError);
    } else {
        console.log("Found Telephelys:", telephelyData);
    }

    console.log("\nInspecting 'szotar_kezelesek' schema (via sample data or error)...");
    const { data: szotarData, error: szotarError } = await supabase
        .from('szotar_kezelesek')
        .select('*')
        .limit(1);

    if (szotarError) {
        console.error("Error inspecting szotar_kezelesek:", szotarError);
    } else if (szotarData && szotarData.length > 0) {
        console.log("Columns:", Object.keys(szotarData[0]));
        console.log("Sample Data:", szotarData[0]);
    } else {
        console.log("Table 'szotar_kezelesek' is empty.");
        // If empty, we can't easily see columns via JS client without inspection. 
        // But we can try to insert a dummy object to get a schema error or check migration files again.
        // Actually, listing migration files for 'create table szotar_kezelesek' is better.
    }
}

main();
