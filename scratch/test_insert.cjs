const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = fs.readFileSync('c:/Users/Zombo/Desktop/Antigrav/TreatNote/treatnote/.env.local', 'utf8');
let url, key;
env.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
  if (line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
});

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('default_treatment_items').insert([{ name: 'test_item', category: 'test' }]);
  console.log('Insert test result:', error ? error.message : 'Success');
}
run();
