const fs = require('fs');
const path = require('path');

const inputPath = 'C:/Users/Zombo/.gemini/antigravity/brain/674538bc-f586-462a-b22a-2c829861f71e/.system_generated/steps/412/output.txt';
const desktopPath = 'C:/Users/Zombo/Desktop/Antigrav/TreatNote/treatnote/proba_szotar_import.csv';

const rawData = fs.readFileSync(inputPath, 'utf8');

let data;
try {
  const parsed = JSON.parse(rawData);
  const innerMatch = parsed.result.match(/\[.*\]/s);
  data = JSON.parse(innerMatch[0]);
} catch (e) {
  console.error('Failed to parse:', e);
  process.exit(1);
}

let csvContent = 'Név;Kategória;Ár\n';
let priceCount = 0;

for (const item of data) {
  const name = (item.name || '').replace(/"/g, '""');
  const category = (item.category || '').replace(/"/g, '""');
  
  const price = priceCount + 1;
  priceCount++;
  
  csvContent += `"${name}";"${category}";${price}\n`;
}

fs.writeFileSync(desktopPath, csvContent, 'utf8');
console.log('Successfully generated ' + desktopPath);
