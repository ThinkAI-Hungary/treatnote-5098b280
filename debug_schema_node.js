
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env vars
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = process.env.VITE_SUPABASE_URL || envConfig.VITE_SUPABASE_URL;
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
    try {
        const localEnvPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(localEnvPath)) {
            const localConfig = dotenv.parse(fs.readFileSync(localEnvPath));
            serviceKey = localConfig.SUPABASE_SERVICE_ROLE_KEY;
        }
    } catch (e) { console.error("Error loading .env.local", e); }
}

const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || envConfig.VITE_SUPABASE_PUBLISHABLE_KEY;
const keyToUse = serviceKey || anonKey;
const supabase = createClient(supabaseUrl, keyToUse);

async function main() {
    console.log("Listing ALL Telephelys (limit 10)...");
    const { data: allTv, error: tvError } = await supabase.from('telephely').select('id, name').limit(10);
    if (tvError) console.error("Error fetching telephelys:", tvError);
    else console.log("Telephelys:", allTv);

    let targetId;
    if (allTv && allTv.length > 0) {
        const proba = allTv.find(t => t.name.toLowerCase().includes('próba') || t.name.toLowerCase().includes('demo') || t.name.toLowerCase().includes('test'));
        if (proba) {
            console.log("Found likely test telephely:", proba);
            targetId = proba.id;
        } else {
            console.log("No explicit 'Próba' telephely found. Using the first one as target:", allTv[0]);
            targetId = allTv[0].id;
        }
    }

    if (!targetId) {
        console.log("No telephelys found to seed. Please create a company and telephely first.");
        return;
    }

    console.log(`\nTarget Telephely ID: ${targetId}`);

    // Inspect schema by trying to insert a bad record to get column hints, or just guessing common ones.
    // Based on previous files, szotar_kezelesek likely has: name, category, telephely_id.
    // We can try to READ from information_schema via RPC if possible.
    // Or just try to select * and see if it works.

    // Attempting a raw SQL query via RPC would be ideal if we had one set up, but we don't.
    // So we will just print the ID to be used in the SQL migration file.
}

main().catch(console.error);
