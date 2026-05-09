const fs = require('fs');
const { parse } = require('csv-parse/sync');

const content = fs.readFileSync('c:/Users/Zombo/Desktop/Antigrav/TreatNote/treatnote/treatnote_altalanos_kezelesek.csv', 'utf8');
const cleanContent = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;

const records = parse(cleanContent, {
  delimiter: ';',
  columns: true,
  skip_empty_lines: true
});

let sql = 'DELETE FROM default_treatment_items;\n';

records.forEach((r, index) => {
  const name = (r['Név'] || r['NĂ©v'] || '').replace(/'/g, "''");
  const category = (r['Kategória'] || r['KategĂłria'] || '').replace(/'/g, "''");
  const aliasesRaw = r['Aliasok'] || '';
  const aliases = aliasesRaw.split('|').map(s => s.trim()).filter(s => s.length > 0);
  
  const aliasesSql = 'ARRAY[' + aliases.map(a => "'" + a.replace(/'/g, "''") + "'").join(',') + ']::text[]';
  
  sql += `INSERT INTO default_treatment_items (name, category, aliases, sort_order) VALUES ('${name}', '${category}', ${aliasesSql}, ${index});\n`;
});

fs.writeFileSync('c:/Users/Zombo/Desktop/Antigrav/TreatNote/treatnote/scratch/insert_defaults.sql', sql, 'utf8');
console.log('SQL generated.');
