const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=\"([^\"]+)\"/);
const keyMatch = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=\"([^\"]+)\"/);
const SUPABASE_URL = urlMatch ? urlMatch[1] : null;
const SUPABASE_KEY = keyMatch ? keyMatch[1] : null;

async function fix() {
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    console.log('Finding Próba cég...');
    const compRes = await fetch(SUPABASE_URL + '/rest/v1/companies?name=ilike.*Próba cég*&select=id', { headers });
    const companies = await compRes.json();
    if (!companies || companies.length === 0) return console.log('Company not found');
    const compId = companies[0].id;

    console.log('Finding telephely...');
    const tRes = await fetch(SUPABASE_URL + '/rest/v1/telephely?company_id=eq.' + compId + '&select=id', { headers });
    const telephelys = await tRes.json();
    if (!telephelys || telephelys.length === 0) return console.log('Telephely not found');
    const telephelyId = telephelys[0].id;

    console.log('Finding orphaned licenses...');
    const lRes = await fetch(SUPABASE_URL + '/rest/v1/licenses?company_id=eq.' + compId + '&telephely_id=is.null&select=id', { headers });
    const licenses = await lRes.json();

    if (!licenses || licenses.length === 0) return console.log('No orphaned licenses found.');

    console.log('Fixing ' + licenses.length + ' licenses...');
    let fixed = 0;
    for (let l of licenses) {
        const patchRes = await fetch(SUPABASE_URL + '/rest/v1/licenses?id=eq.' + l.id, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ telephely_id: telephelyId })
        });
        if (patchRes.ok) fixed++;
    }
    console.log('Successfully attached ' + fixed + ' licenses to the clinic!');
}
fix().catch(console.error);
