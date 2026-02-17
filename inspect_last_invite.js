import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    try {
        const envPath = path.resolve(__dirname, '.env');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/VITE_SUPABASE_PUBLISHABLE_KEY="(.*)"/);
        const anonKey = match ? match[1] : null;

        if (!anonKey) {
            throw new Error("Could not find VITE_SUPABASE_PUBLISHABLE_KEY in .env");
        }

        const response = await fetch("https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1/klinika-admin", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${anonKey}`
            },
            body: JSON.stringify({
                operation: "debug-inspect-invite",
                email: "asd123@gmail.com",
                secret: "super-secret-fix-key-123"
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${text}`);
        }

        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error:", error);
    }
}

main();
