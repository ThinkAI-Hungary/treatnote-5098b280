
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env vars manually or via dotenv
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = process.env.VITE_SUPABASE_URL || envConfig.VITE_SUPABASE_URL;
// We need service key. If not in .env, we might be stuck unless we have it in .env.local
// Let's try .env.local too
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
    try {
        const localEnvPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(localEnvPath)) {
            const localConfig = dotenv.parse(fs.readFileSync(localEnvPath));
            serviceKey = localConfig.SUPABASE_SERVICE_ROLE_KEY;
        }
    } catch (e) {
        console.error("Error loading .env.local", e);
    }
}

// Fallback to anon key if service key missing (might fail RLS, but try)
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || envConfig.VITE_SUPABASE_PUBLISHABLE_KEY;
const keyToUse = serviceKey || anonKey;

console.log(`Using URL: ${supabaseUrl}`);
console.log(`Using Key: ${keyToUse ? '***' : 'MISSING'}`);

const supabase = createClient(supabaseUrl!, keyToUse!);

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

        // Try to insert valid dummy data to get column error if needed? No, that's risky.
        // If empty, I'll rely on the migration analysis which I did earlier.
        // Wait, I never found the create table for szotar_kezelesek.
    }
}

main().catch(console.error);
