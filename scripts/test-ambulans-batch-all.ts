import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY || '');

const SCENARIOS = [
  // BATCH 2
  "Beteg egy 3 napos foghúzás helyével jött, ami nagyon fáj. A 46-os fog helyén alveolitis sicca alakult ki. Helyi érzéstelenítésben a sebet kikapartam, majd Alvogyl pasztát helyeztem be. Fájdalomcsillapító szedése javasolt.",
  "Éves ellenőrzésre érkezett, panaszmentes. Készült egy panorámaröntgen. Szuvasság nem látható, de a 18-as és 28-as bölcsességfogak impaktáltak, panasz esetén eltávolításuk javasolt. Fogkövet eltávolítottam mindkét állcsonton.",
  "Beteg fogselymezés közben észrevette, hogy mozog a jobb felső kettesen levő korona. A vizsgálat során kiderült, hogy a csap meglazult. A fémkerámia koronát csappal együtt eltávolítottam, megtisztítottam, majd Fuji plus cementtel vissza is ragasztottam. A betegnek nincs panasza.",
  "A páciens elmondása szerint 2 napja leesett a bicikliről. Azóta az alsó metszői (31, 41) érzékenyek, de nem törtek le. Röntgen felvételt készítettem, ami negatív. Hidegingerre élénken reagálnak. Kímélő étrendet javasoltam és kontrollt egy hét múlva.",
  "Páciens esztétikai panasszal jött, a felső frontfogain (11, 21) elszíneződött kompozit tömések vannak. A régi töméseket kifúrtam érzéstelenítésben, majd Optragate felhelyezése után esztétikus rétegzett kompozit töméseket készítettem. Szín: A2.",
  "A beteg jobb oldali arcfájdalomra panaszkodik, ami a fülébe sugárzik. Panorámaröntgent csináltam. A 48-as fog mesioangularis impakcióban van és nyomja a 47-es fogat. Előjegyeztem sebészeti eltávolításra a jövő hétre. Addig Cataflam 50 mg tabletta javasolt szükség esetén.",
  "A beteg ínye spontán vérzik és bűzös leheletre panaszkodik. A vizsgálat ANUG (Akut necrotizáló ulceratív gingivitis) gyanúját veti fel. Betadine oldatos öblítést végeztem, és Klion tablettát írtam fel napi 3x1-et. Corsodyl öblögetőt és puha fogkefét javasoltam. 3 nap múlva kontroll.",
  "Letört a rágófelület a bal felső ötösből (25). Fájdalma nincs. A szuvas dentint exkaváltam, majd üvegionomer alábélelést követően kétszínes kompozit tömést helyeztem be. Csiszolás és polírozás után a páciens elégedetten távozott.",
  "Alsó kivehető pótlás alábélelése miatt jött. A protézis billeg. A rendelőben direkt alábélelő anyaggal (Ufi Gel) elvégeztem az alábélelést. A pótlás stabilitása helyreállt. Otthoni tisztításra hívtam fel a figyelmet.",
  "A beteg a fognyaki érzékenység miatt jött vissza kontrollra. A 34-36 területen a Gluma desenzitizer hatására a panaszok jelentősen enyhültek, de még nem szűntek meg teljesen. Ismételt fluoridos ecsetelést végeztem.",
  
  // BATCH 3
  "Kislány, 8 éves, leesett a mászókáról tegnap. A 11-es és 21-es fog megmozdult, fokozottan mozgatható. Érzéstelenítés után drótsínt helyeztem fel kompozittal a 12-22-es fogakra. Pépes étrendet és fokozott higiéniát javasoltam. Kontroll 2 hét múlva.",
  "A páciens elmondta, hogy reggelente fáj a rágóizma és kattog az állkapcsa. Bruxizmus gyanúja. Készült egy alginát lenyomat mindkét állcsontról éjszakai harapásemelő sín készítéséhez. A sínt a jövő héten fogjuk átadni.",
  "Kiesett az arany inlay a 36-os fogból tegnap ragacsos cukorka evése közben. Fájdalma nincs, a fogbél zárt. Az üreget megtisztítottam, a betétet fertőtlenítettem, és RelyX cementtel véglegesen visszaragasztottam.",
  "A páciens 5 napja volt gyökérkezelésen a bal alsó hetesen (37). Ma panasza nincs, a fog kopogtatásra nem érzékeny. A gyógyszeres tömést eltávolítottam, a csatornákat nátrium-hipoklorittal átöblítettem, majd végleges gyökértömést (guttapercha + AH Plus) készítettem. Fedőtömés kompozitból.",
  "A beteg bölcsességfog-húzás varratszedésére jött a 38-as foghoz. A seb szépen gyógyult, gyulladás nincs. A varratokat eltávolítottam. Panaszmentes, további teendő nincs.",
  "Felső fogsor készítésének 2. fázisa: egyéni kanalas lenyomatvétel. Precíziós lenyomatot vettem szilikonnal a felső állcsontról. Következő ülésben harapásmagasság meghatározás lesz.",
  "Páciens esztétikai beavatkozásra érkezett. Két ízben 15 perces fogfehérítést végeztünk Opalescence Boost anyaggal. Szín: A3-ról A1-re világosodott. A fogakra fluorid gélt tettünk. Pár napig kerülni kell a színező ételeket.",
  "A beteg hídberagasztásra jött. A labor által küldött 3 tagú cirkon hidat (13-15) próbáltam. A széli záródás megfelelő, az artikuláció jó. Ketac Cem-mel véglegesen beragasztottam a pótolt fogakat. Esztétikailag nagyon szép.",
  "Duzzadt, vérző íny a jobb alsó negyedben. Röntgenen a 46-os fog mesialis gyökere mellett mély csonttasak látható. Helyi érzéstelenítésben nyitott kürettet végeztem, granulációs szövetet távolítottam el, majd két varrattal zártam. Varratszedés egy hét múlva.",
  "Foghúzás előkészítése ortodonciai okból. A 14-es és 24-es fogakat fogszabályzós orvos kérésére helyi érzéstelenítésben eltávolítottam. Gelatamp szivacsot helyeztem a fogmederbe, varrat nem kellett.",

  // BATCH 4
  "A páciens 1 hónapja beültetett implantátum felszabadítására érkezett a 36-os pozícióban. Érzéstelenítésben kis bemetszést ejtettem az ínyen, eltávolítottam a zárócsavart és behelyeztem a gyógyulási csavart. 2 varratot is betettem.",
  "Gyökérkezelés 1. ülés. A 45-ös fogból genny ürült. Érzéstelenítésben trepanáltam a fogat, az exkaváció során a pulpa már nekrótikus volt. A gyökércsatornát géppel tágítottam, Ca(OH)2 pasztát raktam bele, és Cavittal zártam.",
  "Beteg egy napja duzzadt arccal ébredt. A 21-es foga gyökérkezelt, felette nagy fistula látható. Érzéstelenítésben fistulaincisiót végeztem, jódos csíkot helyeztem be. Antibiotikum (Dalacin) receptet adtam. Holnap csíkcsere.",
  "Éves kontroll. Mindkét állcsonton megjelent a fogkő, az íny gyulladt. UH depurálás, majd ProphyFlex sópolírozás történt. A betegnek megmutattam a helyes fogselymezést.",
  "A páciens jobb felső hátsó foga ráharapásra érzékeny. A 16-os fogon lévő nagy amalgámtömést eltávolítottam kofferdam izolálásban. Az üreg mély volt, de a pulpa nem nyílt meg. Theracal alábélelés után esztétikus kompozit tömést kapott.",
  "Letört rágócsücsök a 37-es fogon. Lenyomatot vettem e-max onlay készítéséhez. Ideiglenes töméssel zártam az üreget. Az inlay ragasztás jövő héten lesz.",
  "Gyermek, 6 éves, mély barázdájú hatos fogakkal (16, 26, 36, 46). Ecsetelés és szárítás után Fissurit barázdazáró anyagot vittem fel mind a négy első maradó nagyőrlőre. A szülőknek fluoridos fogkrémet ajánlottam.",
  "A páciens hídlevételre érkezett a 12-22 tartományról, mert a pótlás alatti fogak fájnak. A fémkerámia hidat koronalehúzóval eltávolítottam. A 22-es fog csonkja szuvas, ezt ideiglenesen üvegionomerrel elláttam. A régi hidat ideiglenesként visszaragasztottam provizórikus cementtel.",
  "Alsó fogsor átadása. A kivehető pótlást bepróbáltam, a nyálkahártyát nem nyomja, az artikuláció megfelelő. A betegnek megtanítottam a pótlás be- és kivételét.",
  "Implantátum csavarozható korona lenyomatvétel. A 46-os fog pozíciójában eltávolítottam a gyógyulási csavart, behelyeztem a lenyomatvételi fejet. Zárt kanalas szilikon lenyomat készült, majd a gyógyulási csavart visszatettem.",

  // BATCH 5
  "A páciens letört 23-as fogával jött, amit 1 éve gyökérkezeltek. Csapos fogfelépítést végeztem üvegszálas csappal és kompozit csonkfelépítő anyaggal. Majd lecsiszoltam a csonkot és lenyomatot vettem fémkerámia koronához. Ideiglenes korona készült.",
  "Fájdalmas nyelés és szájnyitási korlátozottság a bal alsó nyolcas régiójában. Pericoronitis acuta. Érzéstelenítésben az ínytasakot hidrogén-peroxiddal és jódos oldattal öblítettem. Antibiotikumot (Augmentin) írtam fel. Ha megnyugszik, javasolt az extractio.",
  "A beteg panaszmentes, csak kontrollra jött. A 14-es és 15-ös fogak között lévő tömés széle elállt, az íny gyulladt. A kompozit tömést kicseréltem sávmatrica segítségével, kontaktpontot kialakítottam. Ínygyulladásra öblögető javasolt.",
  "Trauma miatti letört zománc a 41-es fogon. Pulpa nem érintett. A letört élrészt simítottam finírozó gyémánttal, majd fluorid lakkal ecseteltem. Nem igényelt kompozit felépítést.",
  "Hirtelen fellépő pulzáló fájdalom a bal felső 4-es (24) fognál. Éjszaka nem hagyta aludni. Helyi érzéstelenítést adtam, majd trepanáltam a fogat. Erős vérzés indult a pulpából (pulpitis acuta). Ca(OH)2-es paszta, Cavit. Antibiotikum nem indokolt.",
  "A páciens elégedetlen a fogai színével. Lenyomat készült otthoni sínbe helyezhető fogfehérítő rendszerhez (Opalescence). Átadtuk a fóliasínt és a fecskendőket.",
  "Alsó 4 őrlőfog hiányának pótlása (36, 37, 46, 47). Implantátum tervezéséhez CBCT-t kértem és beutaltam a pácienst röntgenbe. Visszarendelve a CT lelettel.",
  "Bölcsességfog eltávolítás: a 18-as fog szuvasodott. 2 ampulla Lidocain érzéstelenítésben a 18-as fogat emelővel és fogóval komplikációmentesen eltávolítottam. A seb vérzése elállt. Gombócozni 20 percig kell. Fájdalomcsillapító javasolt otthonra.",
  "Panaszos beteg a nyelvháton lévő égő érzés miatt. Gombás fertőzés gyanúja (Candidiasis). Nystatinos ecsetelést végeztem, és Corsodylos szájvíz mellőzését kértem (helyette Mycosist szuszpenzió). Egy hét múlva kontroll.",
  "Foghúzás és azonnali implantáció. A 15-ös fogat gyökértörés miatt atraumatikusan eltávolítottam. A fogmedret kitisztítottam, majd behelyeztem egy Straumann implantátumot (4.1x10mm). Csontpótlást végeztem Bio-Osszal és membránnal fedtem. Záró varratokat tettem be."
];

async function runTest(index: number, transcript: string) {
  const form = new FormData();
  const blob = new Blob(["dummy audio"], { type: "audio/webm" });
  form.append("audio", blob, "test.webm");
  form.append("mode", "ambulans");
  form.append("user_id", "e6a5fb7a-3ad7-466d-a7bf-2de919c25f84");
  form.append("treatnote_patient_id", "41a3c6cb-9a74-44ab-adce-26f8c443cd0b");
  form.append("override_transcript", transcript);

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/native-voice-webhook`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${supabasePublishableKey}` },
      body: form
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.job_id) return false;

    let attempts = 0;
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 2000));
      const { data: jobInfo } = await supabase.from('native_voice_jobs').select('status').eq('id', data.job_id).single();
      if (jobInfo?.status === 'completed') return true;
      if (jobInfo?.status === 'error') return false;
      attempts++;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function runAll() {
  console.log(`Indítom a 40 tesztet (Batch 2-5)...`);
  let successCount = 0;
  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = await runTest(i, SCENARIOS[i]);
    if (s) {
      successCount++;
      console.log(`✅ Teszt ${i + 11} kész (${successCount}/${i+1} sikeres eddig)`);
    } else {
      console.log(`❌ Teszt ${i + 11} HIBÁS`);
    }
  }
  console.log(`\n=== KÉSZ: ${successCount}/${SCENARIOS.length} sikeres ===`);
}

runAll();
