const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { parse } = require('csv-parse/sync');

const env = fs.readFileSync('c:/Users/Zombo/Desktop/Antigrav/TreatNote/treatnote/.env.local', 'utf8');
let url, key;
env.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
  if (line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
});

const supabase = createClient(url, key);

async function run() {
  // Wipe all existing entries
  console.log('Wiping default_treatment_items...');
  const { error: deleteError } = await supabase.from('default_treatment_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (deleteError) {
    console.error('Delete error:', deleteError);
    return;
  }
  
  console.log('Reading CSV...');
  const content = fs.readFileSync('c:/Users/Zombo/Desktop/Antigrav/TreatNote/treatnote/treatnote_altalanos_kezelesek.csv', 'utf8');
  const cleanContent = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;

  const records = parse(cleanContent, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true
  });

  const formatted = records.map((r, index) => {
    const name = r['Név'] || r['NĂ©v'] || '';
    const category = r['Kategória'] || r['KategĂłria'] || '';
    const aliasesRaw = r['Aliasok'] || '';
    const aliases = aliasesRaw.split('|').map(s => s.trim()).filter(s => s.length > 0);
    
    return {
      name,
      category,
      aliases,
      sort_order: index
    };
  });

  console.log(`Inserting ${formatted.length} items...`);
  const chunkSize = 100;
  for (let i = 0; i < formatted.length; i += chunkSize) {
    const chunk = formatted.slice(i, i + chunkSize);
    const { error } = await supabase.from('default_treatment_items').insert(chunk);
    if (error) {
      console.error('Insert error at chunk', i, error);
      return;
    }
  }

  console.log('Done!');
}
run();
