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
    category: "Diagnosztika és Higiénia",
    name: "Állapotfelmérés és Fogkőeltávolítás (Komplex)",
    protocol: "1. Vizit (Egyetlen alkalom):\n- Anamnézis, panaszok egyeztetése.\n- Teljes szájüregi vizsgálat.\n- Panoráma röntgen készítése.\n- Ultrahangos fogkőeltávolítás (depurálás) íny alatt és felett.\n- Homokfúvás (Air-flow) az elszíneződések ellen.\n- Polírozás pasztával."
  },
  {
    id: 2,
    category: "Parodontológia",
    name: "Parodontális zárt kürett (Mélytisztítás)",
    protocol: "Kezelés 2 alkalommal (állcsontonként):\n1. Vizit (pl. Felső állcsont):\n- Érzéstelenítés.\n- Tasakmélységek mérése szondával (státusz).\n- Íny alatti tisztítás kézi műszerekkel (kürett), gyulladt szövet eltávolítása.\n- Fertőtlenítő átöblítés.\n2. Vizit (pl. Alsó állcsont):\n- Ugyanaz a folyamat a másik állcsonton 1-2 nap múlva."
  },
  {
    id: 3,
    category: "Konzerváló Fogászat",
    name: "Esztétikus Tömés (Nagyőrlő)",
    protocol: "1. Vizit (Egyetlen alkalom):\n- Érzéstelenítés (pl. QuickSleeper).\n- Szuvas rész eltávolítása, üreg alakítása.\n- Izolálás (Kofferdam).\n- Bondozás és rétegzéses tömés (kompozit) több felszínre.\n- Kidolgozás, magasság beállítás, polírozás."
  },
  {
    id: 4,
    category: "Konzerváló Fogászat",
    name: "Mikroszkópos Gyökérkezelés (3-4 csatorna)",
    protocol: "Kezelés 2-3 alkalommal:\n1. Vizit:\n- Diagnosztika (CT vagy kusröntgen).\n- Érzéstelenítés, Trepanálás (megnyitás).\n- Idegek eltávolítása, csatornahossz mérése.\n- Gépi tágítás mikroszkóp alatt.\n- Gyógyszeres lezárás.\n2. Vizit:\n- Csatornák átöblítése.\n- Végleges gyökértömés (guttapercha).\n- Kontroll röntgen.\n- Fedőtömés vagy csap előkészítés."
  },
  {
    id: 5,
    category: "Gyermekfogászat",
    name: "Barázdazárás",
    protocol: "1. Vizit (Fúrás nélkül):\n- Rágófelszín tisztítása kefével/levegővel.\n- Barázdák kondicionálása (savazás).\n- Folyékony barázdazáró anyag befolyatása.\n- UV lámpás megvilágítás."
  },
  {
    id: 6,
    category: "Fogpótlás",
    name: "Cirkon Korona (Szóló)",
    protocol: "Kezelés 3 alkalommal:\n1. Vizit:\n- Érzéstelenítés, fog lecsiszolása (vállas előkészítés).\n- Precíziós lenyomatvétel (szilikon vagy digitális scan).\n- Ideiglenes műanyag korona készítése és felragasztása.\n2. Vizit:\n- Vázpróba (opcionális).\n3. Vizit:\n- A kész cirkon korona beragasztása végleges cementtel.\n- Harapás beállítása."
  },
  {
    id: 7,
    category: "Fogpótlás",
    name: "Héjkerámia (E-max Veneer)",
    protocol: "Kezelés 2-3 alkalommal:\n1. Vizit:\n- Mosolytervezés, fotózás.\n- Minimális csiszolás a fog elülső felszínéből.\n- Lenyomatvétel.\n- Ideiglenes héj felhelyezése.\n2. Vizit:\n- A vékony kerámia héjak speciális ragasztása.\n- Polírozás."
  },
  {
    id: 8,
    category: "Fogpótlás",
    name: "Éjszakai Harapásemelő Sín",
    protocol: "Kezelés 2 alkalommal:\n1. Vizit:\n- Tanulmányi lenyomatvétel (alsó/felső).\n2. Vizit:\n- A labor által elkészített átlátszó sín átadása, illeszkedés ellenőrzése."
  },
  {
    id: 9,
    category: "Szájsebészet",
    name: "Foghúzás (Egyszerű)",
    protocol: "1. Vizit:\n- Érzéstelenítés.\n- Fog eltávolítása fogóval/emelővel.\n- Sebkitisztítás (kürett).\n- Tamponra harapás (varrat általában nem szükséges)."
  },
  {
    id: 10,
    category: "Szájsebészet",
    name: "Fogimplantátum beültetés (Műtéti fázis)",
    protocol: "Kezelés több lépésben:\n1. Vizit (Műtét):\n- Steril előkészületek.\n- Érzéstelenítés, íny feltárása.\n- Implantátum (csavar) behajtása a csontba.\n- Íny összevarrása.\n- (3-6 hónap gyógyulás után következik a felszabadítás)."
  },
  {
    id: 11,
    category: "Szájsebészet / Protetika",
    name: "Implantátum Korona (Protetikai fázis)",
    protocol: "A gyógyulás után:\n1. Vizit:\n- Implantátum felszabadítása, ínyformázó csavar behelyezése.\n2. Vizit:\n- Lenyomatvétel a felépítményhez (fejhez).\n3. Vizit:\n- A kész korona rácsavarozása vagy ragasztása az implantátumra."
  },
  {
    id: 12,
    category: "Esztétika",
    name: "Rendelői Fogfehérítés",
    protocol: "1. Vizit (kb 1.5-2 óra):\n- Ínyvédő gél felvitele.\n- Fehérítő anyag felvitele a fogakra 3x15 perc ciklusban.\n- LED lámpás aktiválás.\n- Érzékenységcsökkentő ecsetelés.\n- (Gyakran adnak mellé otthoni fenntartó sínt)."
  },
  {
    id: 13,
    category: "Fogszabályozás",
    name: "Rögzített Fogszabályozó (Felhelyezés)",
    protocol: "Folyamat:\n1. Vizit:\n- Teleröntgen, fotók, lenyomat.\n2. Vizit:\n- Fogak polírozása.\n- Brekettek (tappancsok) felragasztása egyenként.\n- Drótív bekötése."
  },
  {
    id: 14,
    category: "Fogpótlás",
    name: "Fogászati Híd (3 tagú - 1 hiány pótlása)",
    protocol: "Kezelés 3 alkalommal:\n1. Vizit (Előkészítés):\n- Érzéstelenítés.\n- A hiányt határoló szomszédos fogak (pillérek) lecsiszolása.\n- Precíziós lenyomatvétel a csonkokról.\n- Ideiglenes híd készítése és felragasztása a védelem érdekében.\n2. Vizit (Vázpróba):\n- A híd vázának (fém vagy cirkon) ellenőrzése.\n3. Vizit (Átadás):\n- A kész, leplezett híd beragasztása végleges cementtel.\n- Harapás ellenőrzése."
  }
];
