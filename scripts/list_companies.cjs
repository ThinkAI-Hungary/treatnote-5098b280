const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const lines = env.split('\n');
lines.forEach(line => {
    if (line.includes('SUPABASE')) {
        console.log(line);
    }
});
