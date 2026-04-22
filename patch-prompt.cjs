const fs = require('fs');
const files = [
  'supabase/functions/native-voice-webhook/process-treatnote-internal.ts',
  'supabase/functions/native-voice-webhook/process-statusz-internal.ts'
];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');

  // Insert prompt addition for Claude
  const promptAddition = 'RÉSZ: STT (HANGFELISMERŐ) HIBÁK JAVÍTÁSA (KRITIKUS!)\\n' +
    'A bemeneti szöveg egy gépi hangfelismerő (Speech-to-Text) eredménye. Magyar nyelvben a ragozott számoknál nagyon gyakoriak a fonetikus félrehallások (pl. "huszonöt-tő" a "huszonegyestől" helyett, vagy "kettőtől" a "kettesből" helyett).\\n' +
    'Ha logikátlan fogászati tartományt látsz (pl. "huszonöttől huszonötös fogig fémkerámia híd" vagy "tizenegyestől tizenegyesig"), tudnod kell, hogy ez egy STT hiba! Egy fogra nem teszünk hidat, és nincs értelme önmagától önmagáig tartó tartománynak.\\n' +
    'Ilyenkor a kontextus és a hangzáshasonlóság alapján korrigáld a leglogikusabb tartományra (pl. "huszonöt-tő huszonötös" -> 21-től 25-ig)! Soha ne adj vissza értelmetlen kiterjedést STT elírások miatt.\\n\\n';
  
  if (!content.includes('STT (HANGFELISMERŐ) HIBÁK JAVÍTÁSA')) {
    content = content.replace('RÉSZ: FONETIKUS SZINONIMÁK', promptAddition + 'RÉSZ: FONETIKUS SZINONIMÁK');
  }

  fs.writeFileSync(file, content);
  console.log('Updated ' + file);
}
