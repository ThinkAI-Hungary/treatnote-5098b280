const fs = require('fs');
let content = fs.readFileSync('supabase/functions/native-voice-webhook/process-treatnote-internal.ts', 'utf-8');

// Fix escaped variables
content = content.replace(/\\\$\{/g, '${');

// Fix Claude prompt
content = content.replace(/Dolgozd fel az alábbi szöveget:\\n\\n\$\{transcript\}/g, 'Kérlek, dolgozd fel az alábbi diktálást:\\n\\n<diktalas>\\n${transcript}\\n</diktalas>');

// Fix rule
const oldRule = `TERÜLET-ALAPÚ KEZELÉSEK (parodontológia, dentálhigiénia, teljes szájra vonatkozó kezelések):
Ha a kezelés nem egy konkrét fogra, hanem kvadránsra, állcsontra vagy az egész szájra vonatkozik
(pl. "kürett mind a négy kvadránsban", "teljes parodontológiai kezelés", "depurálás az egész fogsoron"),
akkor KÖTELEZŐEN adj meg reprezentatív fogakat a fogak mezőben, kvadránsonként egyet-egyet:
- Jobb felső kvadráns: 16
- Bal felső kvadráns: 26
- Bal alsó kvadráns: 36
- Jobb alsó kvadráns: 46
Ha csak egy vagy két kvadránsra vonatkozik, csak azokat írd be.`;

const newRule = `TERÜLET-ALAPÚ KEZELÉSEK (parodontológia, dentálhigiénia, teljes szájra vonatkozó kezelések):
Ha a kezelés nem egy konkrét fogra, hanem kvadránsra, állcsontra vagy az egész szájra vonatkozik
(pl. "kürett mind a négy kvadránsban", "teljes parodontológiai kezelés", "depurálás az egész fogsoron"),
akkor KÖTELEZŐEN HAGYD ÜRESEN a fogak mezőt, azaz egy üres listát adj vissza:
- "fogak": []
Ezzel jelezzük a rendszernek, hogy a kezelés az egész szájra vagy egy általános területre vonatkozik.`;

content = content.replace(oldRule, newRule);

fs.writeFileSync('supabase/functions/native-voice-webhook/process-treatnote-internal.ts', content);
console.log('Fixed');
