const fs = require('fs');
let code = fs.readFileSync('src/components/klinika/TreatmentRuleEditor.tsx', 'utf8');
code = code.replace(
  /updateItem\(visitIndex, itemIndex, 'name', kezeles\.name\);\s*setActiveAutocomplete\(null\);/g,
  `updateItem(visitIndex, itemIndex, 'name', kezeles.name);\n                                            updateItem(visitIndex, itemIndex, 'item_id', kezeles.id);\n                                            setActiveAutocomplete(null);`
);
fs.writeFileSync('src/components/klinika/TreatmentRuleEditor.tsx', code);
console.log('Fixed');
