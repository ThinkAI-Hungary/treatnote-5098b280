import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "https://bpjzgapmoyhtgryglcke.supabase.co";
const key = process.env.SUPABASE_KEY;

if (!key) throw new Error("Missing key");

const supabase = createClient(url, key);

async function check() {
    console.log("--- STRIPE EVENTS ---");
    const { data: evts, error: e1 } = await supabase.from('stripe_events').select('*').order('created_at', { ascending: false }).limit(5);
    console.log(evts, e1);

    console.log("--- RECENT LICENSES ---");
    const { data: lics, error: e2 } = await supabase.from('licenses').select('id, telephely_id, company_id, status, created_at').order('created_at', { ascending: false }).limit(5);
    console.log(lics, e2);

    console.log("--- RECENT COMPANIES ---");
    const { data: comps, error: e3 } = await supabase.from('companies').select('id, name, seats, current_period_end').limit(3);
    console.log(comps, e3);
}

check();
