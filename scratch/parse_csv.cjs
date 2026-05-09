const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { parse } = require('csv-parse/sync');

const env = fs.readFileSync('c:/Users/Zombo/Desktop/Antigrav/TreatNote/treatnote/.env.local', 'utf8');
let url, key;
env.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
  if (line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
});

// Since we need to insert, we should use the service role key or let the publishable key work if RLS allows.
// default_treatment_items has no RLS or allows inserting? Let's assume we can use the publishable key or we can just use the supabase CLI or SQL.
// Actually, using the execute_sql tool is much safer and easier because it bypasses RLS and we don't need a token.
// Let's generate a JSON array from the CSV and use execute_sql tool!

const content = fs.readFileSync('c:/Users/Zombo/Desktop/Antigrav/TreatNote/treatnote/treatnote_altalanos_kezelesek.csv', 'utf8');
const records = parse(content, {
  delimiter: ';',
  columns: true,
  skip_empty_lines: true
});

const formatted = records.map((r, index) => {
  return {
    name: r['Név'],
    category: r['Kategória'],
    aliases: r['Aliasok'] ? r['Aliasok'].split('|').map(s => s.trim()) : [],
    sort_order: index
  };
});

fs.writeFileSync('c:/Users/Zombo/Desktop/Antigrav/TreatNote/treatnote/scratch/parsed_items.json', JSON.stringify(formatted, null, 2));
console.log('Parsed ' + formatted.length + ' items');
