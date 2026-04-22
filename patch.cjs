const fs = require('fs');
const files = [
  'supabase/functions/native-voice-webhook/process-treatnote-internal.ts',
  'supabase/functions/native-voice-webhook/process-statusz-internal.ts'
];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');

  // Insert keyterms for ElevenLabs
  if (!content.includes('keyterms')) {
    const keytermsJSON = JSON.stringify([
      'huszonkettő', 'huszonhárom', 'huszonnégy', 'huszonöt', 'huszonhat', 'huszonhét', 'huszonnyolc', 'tizenkettő', 'tizenhárom', 'tizennégy', 'tizenöt', 'tizenhat', 'tizenhét', 'tizennyolc', 'harminckettő', 'harminchárom', 'harmincnégy', 'harmincöt', 'harminchat', 'harminchét', 'harmincnyolc', 'negyvenkettő', 'negyvenhárom', 'negyvennégy', 'negyvenöt', 'negyvenhat', 'negyvenhét', 'negyvennyolc', 'tizenegyes', 'tizenkettes', 'tizenhármas', 'tizennégyes', 'tizenötös', 'tizenhatos', 'tizenhetes', 'tizennyolcas', 'huszonegyes', 'huszonkettes', 'huszonhármas', 'huszonnégyes', 'huszonötös', 'huszonhatos', 'huszonhetes', 'huszonnyolcas', 'harmincegyes', 'harminckettes', 'harminchármas', 'harmincnégyes', 'harmincötös', 'harminchatos', 'harminchetes', 'harmincnyolcas', 'negyvenegyes', 'negyvenkettes', 'negyvenhármas', 'negyvennégyes', 'negyvenötös', 'negyvenhatos', 'negyvenhetes', 'negyvennyolcas', 'extractio', 'implantátum', 'gyökérkezelés', 'fémkerámia', 'cirkónium', 'depurálás', 'kürett', 'rezekció'
    ]);
    content = content.replace('formData.append("audio_events", "true");', 'formData.append("audio_events", "true");\n      formData.append("keyterms", JSON.stringify(' + keytermsJSON + '));');
  }

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
