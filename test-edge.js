import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import fs from 'fs';

// Try reading environment variables from .env
const envFile = fs.readFileSync('.env', 'utf-8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0]] = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
    }
});

const url = env['VITE_SUPABASE_URL'] + '/functions/v1/create-checkout-session';

// Create a dummy payload
const payload = {
    company_id: "ebaa0e3a-7ef6-43f1-b552-44585fa50e82", // Example hardcoded but should fetch a real one
    telephely_id: "ad4b5ec9-e9ae-4ac6-8eb5-a7b297bfea71", // Example
    items: [{ price_id: "price_1Sz1XkDG9IVOU80stgzB49Nq", seats: 1 }],
    embedded: true
};

async function testFunction() {
    console.log("Fetching", url);
    // Note: We need a valid JWT token. 
    // Since I don't have the user's JWT, I will use the ANON key, which will return 401 Unauthorized, but let's see what happens.
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + env['VITE_SUPABASE_PUBLISHABLE_KEY'],
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    console.log("Status:", res.status);
    console.log("Response text:", await res.text());
}

testFunction().catch(console.error);
