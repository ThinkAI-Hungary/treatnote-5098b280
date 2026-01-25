/**
 * Előre definiált kezelési protokollok
 * Ezeket külön-külön küldjük az n8n webhook-nak párhuzamosan
 */

export interface TreatmentProtocol {
  id: number;
  category: string;
  name: string;
  protocol: string;
}

export const TREATMENT_PROTOCOLS: TreatmentProtocol[] = [
  {
    id: 1,
    category: "Diagnosztika",
    name: "Állapotfelmérés",
    protocol: "1. Vizit:\n- Anamnézis felvétele és a panaszok egyeztetése.\n- Teljes szájüregi vizsgálat elvégzése.\n- Panoráma röntgen készítése a diagnózishoz."
  },
  {
    id: 2,
    category: "Higiénia",
    name: "Fogkőeltávolítás",
    protocol: "1. Vizit:\n- Ultrahangos fogkőeltávolítás (depurálás) az íny felett.\n- Homokfúvás alkalmazása az elszíneződések ellen.\n- Polírozás pasztával a sima felszínért."
  },
  {
    id: 3,
    category: "Parodontológia",
    name: "Parodontális zárt kürett",
    protocol: "A fogágybetegségek kezelését célzó beavatkozás általában két külön alkalommal történik, állcsontonként elosztva.\n1. Vizit (pl. Felső állcsont):\n- Érzéstelenítés beadása.\n- Tasakmélységek mérése szondával (státusz felvétele).\n- Íny alatti tisztítás kézi műszerekkel (kürett), valamint a gyulladt szövetek eltávolítása.\n- Fertőtlenítő átöblítés.\n2. Vizit (pl. Alsó állcsont):\n- Ugyanaz a folyamat elvégzése a másik állcsonton, jellemzően 1-2 nap elteltével."
  },
  {
    id: 4,
    category: "Konzerváló Fogászat",
    name: "Esztétikus Tömés",
    protocol: "A szuvas fogak helyreállítása egyetlen vizit alatt történik, modern anyagok és technikák alkalmazásával.\n1. Vizit:\n- Érzéstelenítés (pl. QuickSleeper).\n- A szuvas rész eltávolítása és az üreg kialakítása.\n- Izolálás (Kofferdam gumilepedővel) a száraz környezetért.\n- Bondozás, majd rétegzéses tömés készítése kompozit anyagból, több felszínre.\n- A tömés kidolgozása, a magasság beállítása és polírozás."
  },
  {
    id: 5,
    category: "Konzerváló Fogászat",
    name: "Inlay",
    protocol: "Egyetlen fog inlay-vel történő felépítése általában két találkozót igényel.\n1. Vizit:\n- Érzéstelenítés, majd az üreg kialakítása.\n- Precíziós lenyomatvétel (szilikonnal vagy digitális szkennerrel).\n- Ideiglenes tömés behelyezése.\n2. Vizit:\n- A kész inlay beragasztása végleges cementtel.\n- A harapás ellenőrzése és beállítása."
  },
  {
    id: 6,
    category: "Konzerváló Fogászat",
    name: "Mikroszkópos Gyökérkezelés",
    protocol: "A fogmegtartó kezelés nagy precizitást igényel, ezért általában 2-3 alkalomra van szükség a véglegesítéshez.\n1. Vizit:\n- Diagnosztika készítése (CT felvétel vagy kisröntgen).\n- Érzéstelenítés, majd a fog megnyitása (trepanálás).\n- Idegek eltávolítása és a csatornahossz mérése.\n- Gépi tágítás elvégzése mikroszkóp alatt.\n- Gyógyszeres lezárás az ideiglenes időszakra.\n2. Vizit:\n- A csatornák átöblítése és fertőtlenítése.\n- Végleges gyökértömés elkészítése (guttapercha).\n- Kontroll röntgenfelvétel.\n- Fedőtömés készítése vagy csap előkészítése."
  },
  {
    id: 7,
    category: "Konzerváló Fogászat",
    name: "Gyökérkezelés",
    protocol: "A fogmegtartó kezelés nagy precizitást igényel, ezért általában 2-3 alkalomra van szükség a véglegesítéshez.\n1. Vizit:\n- Diagnosztika készítése (CT felvétel vagy kisröntgen).\n- Érzéstelenítés, majd a fog megnyitása (trepanálás).\n- Idegek eltávolítása és a csatornahossz mérése.\n- Tágítás elvégzése.\n- Gyógyszeres lezárás az ideiglenes időszakra.\n2. Vizit:\n- A csatornák átöblítése és fertőtlenítése.\n- Végleges gyökértömés elkészítése (guttapercha).\n- Kontroll röntgenfelvétel.\n- Fedőtömés készítése vagy csap előkészítése."
  },
  {
    id: 8,
    category: "Gyermekfogászat",
    name: "Barázdazárás",
    protocol: "A szuvasodás megelőzését szolgáló fájdalommentes beavatkozás, amely fúrás nélkül, egyetlen alkalommal történik.\n1. Vizit:\n- A rágófelszín alapos tisztítása kefével és levegővel.\n- A barázdák kondicionálása (savazás).\n- Folyékony barázdazáró anyag befolyatása a résekbe.\n- Az anyag megkötése UV lámpás megvilágítással."
  },
  {
    id: 9,
    category: "Fogpótlás",
    name: "Cirkon Korona (Szóló)",
    protocol: "Egyetlen fog koronával történő felépítése általában három találkozót igényel a pontos illeszkedés érdekében.\n1. Vizit:\n- Érzéstelenítés, majd a fog lecsiszolása (vállas előkészítés).\n- Precíziós lenyomatvétel (szilikonnal vagy digitális szkennerrel).\n- Ideiglenes műanyag korona elkészítése és felragasztása a csonk védelmére.\n2. Vizit:\n- Vázpróba (ez a lépés opcionális, esetenként elhagyható).\n3. Vizit:\n- A kész cirkon korona beragasztása végleges cementtel.\n- A harapás ellenőrzése és beállítása."
  },
  {
    id: 10,
    category: "Fogpótlás",
    name: "Fémkerámia Korona (Szóló)",
    protocol: "Egyetlen fog koronával történő felépítése általában három találkozót igényel a pontos illeszkedés érdekében.\n1. Vizit:\n- Érzéstelenítés, majd a fog lecsiszolása (vállas előkészítés).\n- Precíziós lenyomatvétel (szilikonnal vagy digitális szkennerrel).\n- Ideiglenes műanyag korona elkészítése és felragasztása a csonk védelmére.\n2. Vizit:\n- Vázpróba (ez a lépés opcionális, esetenként elhagyható).\n3. Vizit:\n- A kész fémkerámia korona beragasztása végleges cementtel.\n- A harapás ellenőrzése és beállítása."
  },
  {
    id: 11,
    category: "Fogpótlás",
    name: "Héjkerámia",
    protocol: "A mosoly esztétikai korrekcióját szolgáló vékony héjak felhelyezése 2-3 alkalmat vesz igénybe.\n1. Vizit:\n- Mosolytervezés és fotódokumentáció készítése.\n- Minimális csiszolás a fog elülső felszínéből.\n- Lenyomatvétel.\n- Ideiglenes héj felhelyezése.\n2. Vizit:\n- A vékony kerámia héjak speciális ragasztása.\n- Végső polírozás."
  },
  {
    id: 12,
    category: "Fogpótlás",
    name: "Éjszakai Harapásemelő Sín",
    protocol: "A fogcsikorgatás ellen védő sín elkészítése két rövid látogatást igényel.\n1. Vizit:\n- Tanulmányi lenyomatvétel az alsó és felső fogívről.\n2. Vizit:\n- A laboratórium által elkészített átlátszó sín átadása és az illeszkedés ellenőrzése."
  },
  {
    id: 13,
    category: "Szájsebészet",
    name: "Foghúzás (Egyszerű)",
    protocol: "A menthetetlen fog eltávolítása egyetlen sebészeti vizit alkalmával történik.\n1. Vizit:\n- Helyi érzéstelenítés.\n- A fog eltávolítása fogóval vagy emelővel.\n- A seb kitisztítása (kürett).\n- Tamponra harapás a vérzés csillapítására (varrat behelyezése ennél a típusnál általában nem szükséges)."
  },
  {
    id: 14,
    category: "Szájsebészet",
    name: "Fogimplantátum beültetés (Műtéti fázis)",
    protocol: "A műgyökér beültetése egy komolyabb sebészeti beavatkozás, amelyet hosszú gyógyulási idő követ.\n1. Vizit (Műtét):\n- Steril előkészületek.\n- Érzéstelenítés és az íny feltárása.\n- Az implantátum (csavar) behajtása a csontba.\n- Az íny összevarrása.\n- (Ezt követően 3-6 hónap gyógyulási időszak következik a felszabadítás előtt)."
  },
  {
    id: 15,
    category: "Szájsebészet / Protetika",
    name: "Implantátum Korona (Protetikai fázis)",
    protocol: "Az implantátum csontosodása után kezdődik a fogpótlás elkészítése, amely három lépésben zajlik.\n1. Vizit:\n- Az implantátum felszabadítása és az ínyformázó csavar behelyezése.\n2. Vizit:\n- Lenyomatvétel lenyomati fejjel.\n3. Vizit:\n- A végleges felépítmény behelyezése és a kész korona becsavarozása vagy ragasztása az implantátumra."
  },
  {
    id: 16,
    category: "Esztétika",
    name: "Rendelői Fogfehérítés",
    protocol: "A fogak árnyalatának világosítása egyetlen, hosszabb (kb. 1,5-2 órás) kezelés alkalmával történik.\n1. Vizit:\n- Ínyvédő gél felvitele a lágyszövetek védelmére.\n- A fehérítő anyag felvitele a fogakra, általában 3x15 perces ciklusban.\n- Az anyag aktiválása LED lámpás megvilágítással.\n- Érzékenységcsökkentő ecsetelés a kezelés végén.\n- (Gyakran adnak mellé otthoni fenntartó sínt is)."
  },
  {
    id: 17,
    category: "Fogszabályozás",
    name: "Rögzített Fogszabályozó (Felhelyezés)",
    protocol: "A fogszabályozó készülék felragasztása precíz előkészítést igényel, így a folyamat két alkalomra oszlik.\n1. Vizit:\n- Teleröntgen, fotók készítése és lenyomatvétel a tervezéshez.\n2. Vizit:\n- A fogak polírozása és tisztítása.\n- A brekettek (tappancsok) felragasztása egyenként a fogakra.\n- A drótív bekötése a brekettekbe."
  },
  {
    id: 18,
    category: "Fogpótlás",
    name: "Fém-kerámia Híd",
    protocol: "A hiányzó fogak pótlása híddal három találkozót igényel, amely magában foglalja az előkészítést, a próbát és az átadást.\n1. Vizit (Előkészítés):\n- Érzéstelenítés.\n- A hiányt határoló szomszédos fogak (pillérek) lecsiszolása.\n- Precíziós lenyomatvétel a csonkokról.\n- Ideiglenes híd készítése és felragasztása a pillérek védelme érdekében.\n2. Vizit (Vázpróba):\n- A híd vázának ellenőrzése a szájban.\n3. Vizit (Átadás):\n- A kész, leplezett híd beragasztása végleges cementtel.\n- A harapás ellenőrzése."
  },
  {
    id: 19,
    category: "Fogpótlás",
    name: "Cirkonium Híd",
    protocol: "A hiányzó fogak pótlása híddal három találkozót igényel, amely magában foglalja az előkészítést, a próbát és az átadást.\n1. Vizit (Előkészítés):\n- Érzéstelenítés.\n- A hiányt határoló szomszédos fogak (pillérek) lecsiszolása.\n- Precíziós lenyomatvétel a csonkokról.\n- Ideiglenes híd készítése és felragasztása a pillérek védelme érdekében.\n2. Vizit (Vázpróba):\n- A híd vázának ellenőrzése a szájban.\n3. Vizit (Átadás):\n- A kész, leplezett híd beragasztása végleges cementtel.\n- A harapás ellenőrzése."
  }
];
