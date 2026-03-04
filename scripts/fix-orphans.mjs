import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "https://bpjzgapmoyhtgryglcke.supabase.co";
const key = process.env.SUPABASE_KEY;

if (!key) throw new Error("Missing key");

const supabase = createClient(url, key);

async function fixOrphaned() {
    console.log("Fetching licenses with NULL telephely_id...");
    const { data: orphans, error: err1 } = await supabase
        .from('licenses')
        .select('id, company_id')
        .is('telephely_id', null);

    if (err1) {
        console.error("Error fetching orphans:", err1);
        return;
    }

    console.log(`Found ${orphans?.length || 0} orphaned licenses.`);

    if (!orphans || orphans.length === 0) return;

    for (const orphan of orphans) {
        const { data: telephelys } = await supabase
            .from('telephely')
            .select('id')
            .eq('company_id', orphan.company_id)
            .order('created_at', { ascending: true })
            .limit(1);

        if (telephelys && telephelys.length > 0) {
            const tId = telephelys[0].id;
            console.log(`Linking license ${orphan.id} to telephely ${tId}`);
            await supabase
                .from('licenses')
                .update({ telephely_id: tId })
                .eq('id', orphan.id);
        } else {
            console.log(`No telephely found for company ${orphan.company_id}`);
        }
    }
    console.log("Done fixing orphans.");
}

fixOrphaned();
