

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const TOOTH_ENUM_VALUES = [
  "Altalanos.Foghiany", "Altalanos.Tejfog", "Altalanos.Barazdazaras", "Altalanos.Parapulpalis_csap",
  "Altalanos.Radix", "Altalanos.Lecsiszolt_fog", "Altalanos.Rezekalt_fog", "Altalanos.Csontpotlas",
  "Implant.Altalanos.Nobel", "Implant.Altalanos.AlphaBio", "Implant.Altalanos.IDEGEN", "Implant.Altalanos.Ankylos",
  "Implant.Altalanos.SGS", "Implant.Altalanos.Straumann", "Implant.Altalanos.Astra", "Implant.Altalanos.Anyridge",
  "Implant.Altalanos.Nobel_Active", "Implant.Altalanos.Nobel_On1", "Implant.Altalanos.Nobel_Replace",
  "Implant.Altalanos.Camlog", "Implant.Altalanos.Conelog", "Implant.Altalanos.Camlog_Isy", "Implant.Altalanos.Denti",
  "Felepitmenyek.Altalanos.Altalanos_felepitmeny_-_Implant_Felepitmenyek", "Felepitmenyek.Altalanos.Bredent_Multi_unit_(egyenes)_-_Implant_Felepitmenyek",
  "Felepitmenyek.Altalanos.Bredent_Multi_unit_(szogtort_-_bal)_-_Implant_Felepitmenyek", "Felepitmenyek.Altalanos.Bredent_Multi_unit_(szogtort_-_jobb)_-_Implant_Felepitmenyek",
  "Peripacialis_elv..Altalanos.Granuloma_-_Periapicalis_elv.", "Peripacialis_elv..Altalanos.Cysta_-_Periapicalis_elv.", "Peripacialis_elv..Altalanos.Elhalt_gyoker_-_Periapicalis_elv.",
  "Gyokercsap.Altalanos.keramia_-_Gyokercsap", "Gyokercsap.Altalanos.fem_-_Gyokercsap", "Gyokercsap.Altalanos.uvegszalas_-_Gyokercsap", "Gyokercsap.Altalanos.Kompozit_-_Gyokercsap",
  "Caries.Altalanos.Mesialis_-_Caries", "Caries.Altalanos.Occlusalis_-_Caries", "Caries.Altalanos.Distalis_-_Caries",
  "Caries.Altalanos.Gingivo_B._-_Caries", "Caries.Altalanos.Buccalis_-_Caries", "Caries.Altalanos.Pal_Ling_-_Caries",
  "Caries.Altalanos.Incizalis_-_Caries", "Caries.Altalanos.Gyok._caries_3_-_Caries", "Caries.Altalanos.Gyok._caries_2_-_Caries", "Caries.Altalanos.Gyok._caries_1_-_Caries",
  "Tomes.Amalgam.Mesialis_-_Tomes_Amalgam", "Tomes.Amalgam.Occlusalis_-_Tomes_Amalgam", "Tomes.Amalgam.Distalis_-_Tomes_Amalgam",
  "Tomes.Amalgam.Gingivo_B._-_Tomes_Amalgam", "Tomes.Amalgam.Buccalis_-_Tomes_Amalgam", "Tomes.Amalgam.Pal_Ling_-_Tomes_Amalgam", "Tomes.Amalgam.Incizalis_-_Tomes_Amalgam",
  "Tomes.Esztetikus.Mesialis_-_Tomes_Esztetikus", "Tomes.Esztetikus.Occlusalis_-_Tomes_Esztetikus", "Tomes.Esztetikus.Distalis_-_Tomes_Esztetikus",
  "Tomes.Esztetikus.Gingivo_B._-_Tomes_Esztetikus", "Tomes.Esztetikus.Buccalis_-_Tomes_Esztetikus", "Tomes.Esztetikus.Pal_Ling_-_Tomes_Esztetikus",
  "Tomes.Esztetikus.Incizalis_-_Tomes_Esztetikus", "Tomes.Esztetikus.Eszt._tomes_(alt.)_-_Tomes_Esztetikus",
  "Tomes.Ideiglenes.Mesialis_-_Tomes_Ideiglenes", "Tomes.Ideiglenes.Occlusalis_-_Tomes_Ideiglenes", "Tomes.Ideiglenes.Distalis_-_Tomes_Ideiglenes",
  "Tomes.Ideiglenes.Gingivo_B._-_Tomes_Ideiglenes", "Tomes.Ideiglenes.Buccalis_-_Tomes_Ideiglenes", "Tomes.Ideiglenes.Pal_Ling_-_Tomes_Ideiglenes", "Tomes.Ideiglenes.Incizalis_-_Tomes_Ideiglenes",
  "Tomes.Arany.Mesialis_-_Tomes_Arany", "Tomes.Arany.Occlusalis_-_Tomes_Arany", "Tomes.Arany.Distalis_-_Tomes_Arany",
  "Tomes.Arany.Gingivo_B._-_Tomes_Arany", "Tomes.Arany.Buccalis_-_Tomes_Arany", "Tomes.Arany.Pal_Ling_-_Tomes_Arany", "Tomes.Arany.Incizalis_-_Tomes_Arany",
  "Csonkfelepites.Cetac-Molar.Mesialis_-_Csonkfelepites_Cetac-Molar", "Csonkfelepites.Cetac-Molar.Occlusalis_-_Csonkfelepites_Cetac-Molar", "Csonkfelepites.Cetac-Molar.Distalis_-_Csonkfelepites_Cetac-Molar",
  "Csonkfelepites.Vitremer.Mesialis_-_Csonkfelepites_Vitremer", "Csonkfelepites.Vitremer.Occlusalis_-_Csonkfelepites_Vitremer", "Csonkfelepites.Vitremer.Distalis_-_Csonkfelepites_Vitremer",
  "Csonkfelepites.Composite.Mesialis_-_Csonkfelepites_Composite", "Csonkfelepites.Composite.Occlusalis_-_Csonkfelepites_Composite", "Csonkfelepites.Composite.Distalis_-_Csonkfelepites_Composite",
  "Protezis.Altalanos.Teljes_-_Protezis", "Protezis.Altalanos.Teljes_(impl.)_-_Protezis", "Protezis.Altalanos.Steg_-_Protezis",
  "Protezis.Reszleges_kiveheto.bal_-_Protezis_Reszleges_kiveheto", "Protezis.Reszleges_kiveheto.kozep_-_Protezis_Reszleges_kiveheto", "Protezis.Reszleges_kiveheto.jobb_-_Protezis_Reszleges_kiveheto",
  "Protezis.Reszlegesen_kiveheto_implant.kozep_-_Protezis_Reszl._kiv._(impl.)", "Protezis.Reszlegesen_kiveheto_implant.bal_-_Protezis_Reszl._kiv._(impl.)", "Protezis.Reszlegesen_kiveheto_implant.jobb_-_Protezis_Reszl._kiv._(impl.)",
  "Protezis.Cserelendo_protezis.Cserelendo_teljes_prot._-_Protezis_Cserelendo_protezis", "Protezis.Cserelendo_protezis.Cserelendo_prot._-_bal_-_Protezis_Cserelendo_protezis",
  "Protezis.Cserelendo_protezis.Cserelendo_prot._-_kozep_-_Protezis_Cserelendo_protezis", "Protezis.Cserelendo_protezis.Cserelendo_prot._-_jobb_-_Protezis_Cserelendo_protezis",
  "Korona.Altalanos.Fem-keramia_-_Korona", "Korona.Altalanos.Cirkonium_-_Korona", "Korona.Altalanos.Preskeramia_-_Korona",
  "Korona.Altalanos.Aranykeramia_-_Korona", "Korona.Altalanos.Procera_-_Korona", "Korona.Altalanos.Ideig._Procera_-_Korona",
  "Korona.Altalanos.Ideiglenes_-_Korona", "Korona.Altalanos.Teleszk._korona_-_Korona", "Korona.Altalanos.Femkorona_-_Korona", "Korona.Altalanos.404:hu:crown_remove_-_Korona",
  "Korona.Ideiglenes_ragasztas.Aranykeramia_-_Korona_Ideiglenes_ragaszt.", "Korona.Ideiglenes_ragasztas.Femkeramia_-_Korona_Ideiglenes_ragaszt.", "Korona.Ideiglenes_ragasztas.Fem_-_Korona_Ideiglenes_ragaszt.",
  "Korona.Ideiglenes_ragasztas.Preskeramia_-_Korona_Ideiglenes_ragaszt.", "Korona.Ideiglenes_ragasztas.Procera_-_Korona_Ideiglenes_ragaszt.", "Korona.Ideiglenes_ragasztas.Cirkon_-_Korona_Ideiglenes_ragaszt.",
  "Hid.Altalanos.Fem-keramia_-_Hid", "Hid.Altalanos.Cirkonium_-_Hid", "Hid.Altalanos.Preskeramia_-_Hid",
  "Hid.Altalanos.Aranykeramia_-_Hid", "Hid.Altalanos.Hidelvalasztas_-_Hid", "Hid.Altalanos.Ideiglenes_hid_-_Hid",
  "Elpotlas.Altalanos.Mesialis_-_Elpotlas", "Elpotlas.Altalanos.Incizalis_-_Elpotlas", "Elpotlas.Altalanos.Distalis_-_Elpotlas",
  "Letort_fog.Altalanos.Mesialis_-_Letort_fog", "Letort_fog.Altalanos.Incizalis_-_Letort_fog", "Letort_fog.Altalanos.Distalis_-_Letort_fog",
  "Gyokertomes.Vegleges.M._Buccalis_-_Gyokertomes_Vegleges", "Gyokertomes.Vegleges.D._Buccalis_-_Gyokertomes_Vegleges", "Gyokertomes.Vegleges.Pal_Ling_-_Gyokertomes_Vegleges",
  "Gyokertomes.Vegleges.Ossz._gyoker_-_Gyokertomes_Vegleges", "Gyokertomes.Vegleges.Inkomplett_-_Gyokertomes_Vegleges",
  "Gyokertomes.Ideiglenes.M._Buccalis_-_Gyokertomes_Ideiglenes", "Gyokertomes.Ideiglenes.D._Buccalis_-_Gyokertomes_Ideiglenes", "Gyokertomes.Ideiglenes.Pal_Ling_-_Gyokertomes_Ideiglenes",
  "Gyokertomes.Ideiglenes.Ossz._gyoker_-_Gyokertomes_Ideiglenes",
  "Retrograd_gyokertomes.Altalanos.D._Buccalis_-_Retrograd_gy.tomes", "Retrograd_gyokertomes.Altalanos.M._Buccalis_-_Retrograd_gy.tomes", "Retrograd_gyokertomes.Altalanos.Palatinalis_-_Retrograd_gy.tomes", "Retrograd_gyokertomes.Altalanos.Kulonallo_-_Retrograd_gy.tomes",
  "Betetek.Inlay.Arany_-_Betetek_Inlay", "Betetek.Inlay.Kompozit_-_Betetek_Inlay", "Betetek.Inlay.Keramia_-_Betetek_Inlay", "Betetek.Inlay.Fembetet_-_Betetek_Inlay",
  "Betetek.Onlay.Arany_-_Betetek_Onlay", "Betetek.Onlay.Kompozit_-_Betetek_Onlay", "Betetek.Onlay.Keramia_-_Betetek_Onlay", "Betetek.Onlay.Fembetet_-_Betetek_Onlay",
  "Betetek.Overlay.Arany_-_Betetek_Overlay", "Betetek.Overlay.Kompozit_-_Betetek_Overlay", "Betetek.Overlay.Keramia_-_Betetek_Overlay", "Betetek.Overlay.Fembetet_-_Betetek_Overlay",
  "Hejak.Altalanos.Hej_-_Hejak", "Hejak.Altalanos.Veneer_lay_-_Hejak",
  "Specialis.Altalanos.Koronazando_fog_-_Specialis", "Specialis.Altalanos.Cserel._korona_-_Specialis", "Specialis.Altalanos.Kihuzando_fog_-_Specialis",
  "Specialis.Altalanos.Zarodott_fogh._-_Specialis", "Specialis.Altalanos.Egyenes_csavar_-_Specialis", "Specialis.Altalanos.Gombfeju_csavar_-_Specialis",
  "Specialis.Altalanos.Impaktalt_fog_-_Specialis", "Specialis.Altalanos.Muanyag_fog_-_Specialis", "Specialis.Altalanos.Brekket_-_Specialis"
];

// Reusable schema definitions
const defs = {
  "fog_sparse": {
    "type": "object",
    "properties": {
      "active_properties": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": TOOTH_ENUM_VALUES
        },
        "description": "Lista a TRUE értékű property-k teljes path-járól az enum-ból válogatva"
      },
      "Megjegyzes": {
        "type": "string",
        "description": "Szabad szavas megjegyzés az adott foghoz (pl. klinikai észrevétel, terv)."
      }
    },
    "required": ["active_properties", "Megjegyzes"],
    "additionalProperties": false
  }
};

const CLEANER_PROMPT = `FOGÁSZATI ÁTÍRÁS TISZTÍTÓ v2.6 (EGYSZERŰSÍTETT HÍD JELÖLÉS)
FDI FOGSZÁMOZÁS (páciens szemszögéből)
Kvadránsok:

1X = jobb felső (11-18)
2X = bal felső (21-28)
3X = bal alsó (31-38)
4X = jobb alsó (41-48)

Pozíciók (X): 1-2=metszők, 3=szemfog, 4-5=kis őrlők, 6-7=nagy őrlők, 8=bölcsesség
Magyar -> FDI példák:

"jobb felső hatos" = 16
"bal alsó négyes" = 34
"jobb felső hármas" = 13
"bal felső sarokfog" = 23

═══════════════════════════════════════════════════════════════════════════════
FELADAT

FONETIKUS SZINONIMÁK (MINDIG fordítsd le, de őrizd meg a típust!)
- "ólomfort", "all on for" -> All-on-4
- "ólomszix", "all on szix" -> All-on-6
- "inplant", "implánt" -> implantátum
- "szinuszlift" -> sinuslift
- "ekstrakció" -> extractio
- "ábátment" -> abutment/felépítő fej
- "vinyír" -> héj (vagy direkt héj, ha úgy hangzott el!)
- "ímídiet lóding" -> immediate loading
- "bongreft" -> csontpótlás
- "illé", "inlé", "porcelánillé" -> inlay
- "imex", "lmex" -> "e-max, emax"

Töröld: köszönések, "hát", "szóval", "ugye", admin beszélgetés
Tartsd: MINDEN klinikai adat (fogszám, állapot, tömés, korona, híd, allergia, panasz)
KRITIKUS: Ha egy fog HIÁNYZIK -> KÖTELEZŐ kiírni "Fog XX: Állapot: hiányzik"
KRITIKUS: Ha egy fogon KORONA van -> KÖTELEZŐ kiírni a FOGAK-ban foganként!
KRITIKUS: Ha egy fog HÍDHOZ tartozik -> KÖTELEZŐ kiírni foganként is!
Alakítsd: magyar leírások -> FDI számok
Strukturáld: az alábbi formátum szerint
═══════════════════════════════════════════════════════════════════════════════
KIMENET FORMÁTUM

PANASZOK (PANASZ + KÓRTÖRTÉNET)

PANASZOK:
PANASZ:
[Páciens panaszai saját szavaival, vagy "nincs panasz"]
KÓRTÖRTÉNET:

Allergiák: [lista vagy "nincs adat"]
Gyógyszerek: [lista vagy "nincs adat"]
Betegségek: [lista vagy "nincs adat"]
Dohányzás: [igen/nem vagy "nincs adat"]

─────────────────────────────────────────────────────────────────────────────

FOGAK - KVADRÁNSOK

FOGAK:
1. KVADRÁNS (jobb felső)
Fog 18 (jobb felső nyolcas):
Állapot: [jelen/hiányzik/implant/radix/tejfog/impaktált]
Híd: [anyag] hidtag - CSAK HA HÍDTAG (hiányzó fog egy hídban)
Korona: [anyag] korona - KÖTELEZŐ KIÍRNI, HA VAN KORONA!
Híd: [anyag] híd része - CSAK HA PILLÉR EGY HÍDBAN (korona mellett)
Tömés: [típus + felület]
Szuvasodás: [van + felület/NINCS] - mindig ki kell írni ha NINCS
Fog 17 (jobb felső hetes):
Állapot: [jelen/hiányzik/implant/radix/tejfog/impaktált]
Híd: [anyag] hidtag - HA HÍDTAG
Korona: [anyag] korona - HA VAN KORONA, ÍRNI KELL!
Híd: [anyag] híd része - HA PILLÉR
Tömés: [típus + felület]
Szuvasodás: [van + felület/NINCS] - MINDIG KI KELL ÍRNI, HA NINCS
[További információk, ha vannak]
[... folytatás 16, 15, 14, 13, 12, 11 ...]
2. KVADRÁNS (bal felső)
Fog 21 (bal felső egyes):
[...]
[... folytatás 22, 23, 24, 25, 26, 27, 28 ...]
3. KVADRÁNS (bal alsó)
Fog 38 (bal alsó nyolcas):
[...]
[... folytatás 37, 36, 35, 34, 33, 32, 31 ...]
4. KVADRÁNS (jobb alsó)
Fog 41 (jobb alsó egyes):
[...]
[... folytatás 42, 43, 44, 45, 46, 47, 48 ...]

═══════════════════════════════════════════════════════════════════════════════
KRITIKUS: HÍD FELDOLGOZÁS - DÖNTÉSI FA 
═══════════════════════════════════════════════════════════════════════════════

 FŐDÖNTÉSI FA - HIDAK FELDOLGOZÁSA:

Van híd tartomány említve? (pl. "14-26-ig híd", "kettestől ötösig híd")
│
├─ A) Van EXPLICIT pillérfelsorolás? (pl. "alatta a fogak: 14, 13, 11...")
│  │
│  ├─ IGEN -> IMPLICIT HIDTAGOK KISZÁMÍTÁSA!
│  │         Számítás: Tartomány - Pillérek = HIDTAGOK
│  │         Példa: 14-26 tartomány
│  │                Pillérek: 14,13,11,21,22,24,26
│  │                Hidtagok: 12,23,25 (ezek hiányoznak!)
│  │         -> Pillérek: Állapot: jelen + Korona + Híd része
│  │         -> Hidtagok: Állapot: hiányzik + Híd hidtag
│  │
│  └─ NEM -> Menj a B) pontra
│
├─ B) Van EXPLICIT "hiányzik" vagy "hidtag" említés?
│  │   (pl. "a 15-ös hiányzik", "a 24 hidtag", "a négyes műfog")
│  │
│  ├─ IGEN -> A hiányzó fogak = HIDTAGOK, a többi = PILLÉREK
│  │         -> Pillérek: Állapot: jelen + Korona + Híd része
│  │         -> Hidtagok: Állapot: hiányzik + Híd hidtag
│  │
│  └─ NEM -> Menj a C) pontra
│
├─ C) NINCS pillérfelsorolás ÉS NINCS explicit hidtag info?
│     ════════════════════════════════════════════════════════════
│     ALAPÉRTELMEZÉS: SZÉLSŐ FOGAK = PILLÉREK, KÖZBÜLSŐ FOGAK = HIDTAGOK
│     
│     Klinikai logika: egy híd két szélén vannak a tartó fogak (pillérek,
│     rajtuk korona van), a köztük lévő fogak hiányoznak (hidtagok,
│     műfog pótolja őket).
│     
│     SZABÁLY:
│     -> A tartomány ELSŐ foga = PILLÉR (Állapot: jelen + Korona + Híd része)
│     -> A tartomány UTOLSÓ foga = PILLÉR (Állapot: jelen + Korona + Híd része)
│     -> Minden KÖZBÜLSŐ fog = HIDTAG (Állapot: hiányzik + Híd hidtag)
│     
│     KIVÉTEL 1 - ELLENTMONDÁS A SZÖVEGBEN:
│     Ha a szöveg más részében ELLENTMOND ennek az alapértelmezésnek
│     (pl. egy közbülső fogról kiderül hogy jelen van, vagy egy szélső
│     fogról hogy hiányzik), akkor az EXPLICIT információ FELÜLÍRJA
│     az alapértelmezést!
│     
│     KIVÉTEL 2 - KÉT FOGBÓL ÁLLÓ TARTOMÁNY:
│     Ha a tartomány CSAK 2 fogat tartalmaz (pl. "hatostól hetesig"),
│     nincs közbülső fog -> NEM híd, hanem EGYBEÖNTÖTT KORONA.
│     -> Mindkét fog: Állapot: jelen + Korona + Egybeöntött: igen
│
└─ NEM -> Standard feldolgozás (explicit hiányzó fogak keresése a szövegben)

═══════════════════════════════════════════════════════════════════════════════
HÍD JELÖLÉS FOGANKÉNT:
═══════════════════════════════════════════════════════════════════════════════

HÍDTAG (hiányzó fog egy hídban):
Állapot: hiányzik
Híd: [anyag] hidtag
Példa: Híd: fém-kerámia hidtag

PILLÉR (korona egy hídban):
Állapot: jelen (vagy implant)
Korona: [anyag] korona
Híd: [anyag] híd része
Példa:
Korona: fém-kerámia korona
Híd: fém-kerámia híd része

ÖNÁLLÓ KORONA (nem híd része):
Állapot: jelen
Korona: [anyag] korona
Példa: Korona: cirkónium korona

EGYBEÖNTÖTT KORONA (összekapcsolt, de nincs hiányzó fog):
Állapot: jelen
Korona: [anyag] korona
Egybeöntött: igen
Példa:
Korona: cirkónium korona
Egybeöntött: igen

ANYAG KONZISZTENCIA:

Ha egy hídban minden fognak UGYANAZ az anyaga kell legyen!
Ha nem derül ki az anyag -> DEFAULT: fém-kerámia
Korona anyaga = Híd anyaga (mindig!)

═══════════════════════════════════════════════════════════════════════════════
SPECIÁLIS HANGFELISMERÉSI KORREKCIÓK (STT HALLUCINÁCIÓK JAVÍTÁSA):
═══════════════════════════════════════════════════════════════════════════════
Ha a leiratban olyan furcsa kifejezések vannak, mint:
- "gyökér közelét"
- "gyökér között"
Ezek szinte biztosan a "GYÖKÉRTÖMÖTT" (Gyökértömés) szavak félreértései az AI által.
EGYIK SEM "radix"! A radix "betört foggyökér". Ezért ezeket a hallucinációkat kezeld GYÖKÉRTÖMÉS-ként!

═══════════════════════════════════════════════════════════════════════════════
IMPLICIT HIDTAGOK FELISMERÉSE (csak ha van explicit pillérfelsorolás!):
═══════════════════════════════════════════════════════════════════════════════

Ha egy híd tartományt említenek (pl. "14-26") ÉS explicit felsorolják a pilléreket, akkor:

Számold ki a teljes tartományt (pl. 14-26 = 14, 13, 12, 11, 21, 22, 23, 24, 25, 26)
Vond ki a pilléreket (pl. pillérek: 14, 13, 11, 21, 22, 24, 26)
A maradék fogak = HIDTAGOK (12, 23, 25)

KRITIKUS: Ha valaki felsorolja a pilléreket, az implicit azt jelenti, hogy a tartományban lévő többi fog HIÁNYZIK (hidtag)!

KRITIKUS FIGYELMEZTETÉS - PILLÉRLISTA ÉRTELMEZÉSE:
Ha híd tartományt említenek (pl. "14-26-ig híd") ÉS felsorolják az "alatta lévő fogakat", akkor:

EZ NEM az összes fog a hídban!
EZ CSAK a PILLÉREK felsorolása!

PÉLDA:
"Híd 14-26, alatta a fogak: 14, 13, 11, 21, 22, 24, 26"
^^^^^^^^                ^^^^^^^^^^^^^^^^^^^^^^^^^^^
tartomány               CSAK a pillérek!
A tartományban lévő, de NEM felsorolt fogak (12, 23, 25) = HIDTAGOK (hiányoznak)!

═══════════════════════════════════════════════════════════════════════════════
KRITIKUS SZABÁLY - HIÁNYZÓ FOGAK:
═══════════════════════════════════════════════════════════════════════════════

Ha az átírásban egy fog HIÁNYZÓKÉNT van említve (kihúzva, nincs meg, soha nem volt, stb.), akkor KÖTELEZŐ kiírni a kimenetbe!
Példa: Ha az átírás azt mondja "a 18-as, 17-es, 16-os, 15-ös hiányzik", akkor:
Fog 18 (jobb felső nyolcas):
Állapot: hiányzik
Fog 17 (jobb felső hetes):
Állapot: hiányzik
Fog 16 (jobb felső hatos):
Állapot: hiányzik
Fog 15 (jobb felső ötös):
Állapot: hiányzik

CSAK akkor NE említs fogat, ha:

SEMMIT nem mondanak róla az átírásban
"Fog 41-48: nincs adat" (nem tudjuk, hogy jelen van-e vagy hiányzik)

Állapot értékek:

jelen = természetes fog fizikailag jelen van
hiányzik = nincs meg, kihúzva, soha nem volt
implant = implantátum jelen van (ez ÁLLAPOT, nem megjegyzés!)
radix = gyökérmaradvány
tejfog = tejfog
impaktált = beékelődött fog

További információk (ha vannak):

Korona: [anyag (fém-kerámia/cirkónium/préskerámia/aranykerámia/fém/ideiglenes) + korona] - MINDIG ÍRNI, HA VAN!
Híd: [anyag + hidtag VAGY híd része] - MINDIG ÍRNI, HA HÍDHOZ TARTOZIK!
Egybeöntött: [igen] - csak egybeöntött koronáknál (nincs hiányzó fog)
Szuvasodás: [hely - M/D/O/B/L/P vagy kombinációk: MOD, OD, MO]
Tömés: [típus (esztétikus/amalgám/ideiglenes/arany/csonkfelépítés/inlay/onlay/overlay/héj) + hely]
Gyökérkezelés: [gyökértömött/gyökércsatorna kezelés alatt/stb]
Barázdazárás: [van]
Mobilitás: [0/1/2/3 fok]
Periapikális elváltozás: [leírás]
Kezelési terv: [kihúzandó/koronázandó/barázdazárás/stb]
Megjegyzés: [bármilyen egyéb info]

Mindig jelöld explicit módon, ha egy fog tömött, de nincs szekunder caries.
Például: Tömés: MOD amalgám, Szuvasodás: NINCS

═══════════════════════════════════════════════════════════════════════════════
PÉLDÁK
─────────────────────────────────────────────────────────────────────────────
PÉLDA 1: Egyszerű eset
─────────────────────────────────────────────────────────────────────────────
BEMENET:
Jó napot! Na leülsz? Hát szóval, allergiás vagyok penicillinre.
Fáj a bal felső hatos. Van ott occlusalis szuvasodás, mély.
A jobb alsó ötös MOD esztétikus tömés, jó állapotban.
KIMENET:
PANASZOK:
PANASZ:
Fáj a bal felső hatos (26-os fog)
KÓRTÖRTÉNET:

Allergiák: Penicillin
Gyógyszerek: nincs adat
Betegségek: nincs adat
Dohányzás: nincs adat

FOGAK:
2. KVADRÁNS (bal felső)
Fog 26 (bal felső hatos):
Állapot: jelen
Szuvasodás: occlusalis (mély)
4. KVADRÁNS (jobb alsó)
Fog 45 (jobb alsó ötös):
Állapot: jelen
Tömés: esztétikus tömés, MOD felület, jó állapotban
Szuvasodás: NINCS
─────────────────────────────────────────────────────────────────────────────
PÉLDA 2: Híd esettel (explicit hidtag) - EGYSZERŰSÍTETT JELÖLÉS
─────────────────────────────────────────────────────────────────────────────
BEMENET:
Szia! A bal felső hármas, négyes, ötös, hatos között van egy híd.
A négyes az hiányzik, azt egy műfog pótolja.
Fémkerámia koronák vannak, egybeöntöttek.
A hármas gyökértömött. A hatos kicsit mozog, 1-es fok.
KIMENET:
PANASZOK:
PANASZ:
nincs panasz
KÓRTÖRTÉNET:

Allergiák: nincs adat
Gyógyszerek: nincs adat
Betegségek: nincs adat
Dohányzás: nincs adat

FOGAK:
2. KVADRÁNS (bal felső)
Fog 23 (bal felső hármas):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Gyökérkezelés: gyökértömött
Szuvasodás: NINCS
Fog 24 (bal felső négyes):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 25 (bal felső ötös):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 26 (bal felső hatos):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Mobilitás: 1 fok
Szuvasodás: NINCS
─────────────────────────────────────────────────────────────────────────────
PÉLDA 3: Implant alapú híd - EGYSZERŰSÍTETT JELÖLÉS
─────────────────────────────────────────────────────────────────────────────
BEMENET:
A jobb felső négyes és hatos implant. Közöttük a ötös hiányzik,
ott van egy műfog. Fémkerámia híd, egybeöntött koronák.
KIMENET:
PANASZOK:
PANASZ:
nincs panasz
KÓRTÖRTÉNET:

Allergiák: nincs adat
Gyógyszerek: nincs adat
Betegségek: nincs adat
Dohányzás: nincs adat

FOGAK:
1. KVADRÁNS (jobb felső)
Fog 14 (jobb felső négyes):
Állapot: implant
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Fog 15 (jobb felső ötös):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 16 (jobb felső hatos):
Állapot: implant
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
─────────────────────────────────────────────────────────────────────────────
PÉLDA 4: Egybeöntött korona (NINCS hiányzó fog) - EGYSZERŰSÍTETT JELÖLÉS
─────────────────────────────────────────────────────────────────────────────
BEMENET:
A bal felső három, négy, öt cirkónium koronák, egybeöntöttek.
Mind a három fog jelen van, csak össze vannak kapcsolva.
KIMENET:
PANASZOK:
PANASZ:
nincs panasz
KÓRTÖRTÉNET:

Allergiák: nincs adat
Gyógyszerek: nincs adat
Betegségek: nincs adat
Dohányzás: nincs adat

FOGAK:
2. KVADRÁNS (bal felső)
Fog 23 (bal felső hármas):
Állapot: jelen
Korona: cirkónium korona
Egybeöntött: igen
Szuvasodás: NINCS
Fog 24 (bal felső négyes):
Állapot: jelen
Korona: cirkónium korona
Egybeöntött: igen
Szuvasodás: NINCS
Fog 25 (bal felső ötös):
Állapot: jelen
Korona: cirkónium korona
Egybeöntött: igen
Szuvasodás: NINCS
─────────────────────────────────────────────────────────────────────────────
PÉLDA 5: HIÁNYZÓ FOGAK (KRITIKUS!)
─────────────────────────────────────────────────────────────────────────────
BEMENET:
Helló! A felső jobb 7-es, 6-os, 5-ös hiányzik.
Kihúzták őket pár éve. A 4-es jelen van, azon cirkónium korona van.
KIMENET:
PANASZOK:
PANASZ:
nincs panasz
KÓRTÖRTÉNET:

Allergiák: nincs adat
Gyógyszerek: nincs adat
Betegségek: nincs adat
Dohányzás: nincs adat

FOGAK:
1. KVADRÁNS (jobb felső)
Fog 17 (jobb felső hetes):
Állapot: hiányzik
Megjegyzés: Kihúzva pár éve
Fog 16 (jobb felső hatos):
Állapot: hiányzik
Megjegyzés: Kihúzva pár éve
Fog 15 (jobb felső ötös):
Állapot: hiányzik
Megjegyzés: Kihúzva pár éve
Fog 14 (jobb felső négyes):
Állapot: jelen
Korona: cirkónium korona
Szuvasodás: NINCS
FIGYELEM: Ebben a példában 3 HIÁNYZÓ FOG van - mind a 3-at KI KELL ÍRNI!
─────────────────────────────────────────────────────────────────────────────
PÉLDA 6: Komplex eset több kvadránssal - EGYSZERŰSÍTETT JELÖLÉS
─────────────────────────────────────────────────────────────────────────────
BEMENET:
Jó napot! Cukorbeteg vagyok, inzulint szedek. A bal alsó hetes fáj.
Jobb felső: a nyolcas és hetes hiányzik, a hatos gyökértömött, fém-kerámia korona rajta.
Bal felső: az egyes és kettes MOD amalgám tömés.
Jobb alsó: négyes és ötös cirkónium egybeöntött.
KIMENET:
PANASZOK:
PANASZ:
Fáj a bal alsó hetes (37-es fog)
KÓRTÖRTÉNET:

Allergiák: nincs adat
Gyógyszerek: Inzulin
Betegségek: Cukorbetegség
Dohányzás: nincs adat

FOGAK:
1. KVADRÁNS (jobb felső)
Fog 18 (jobb felső nyolcas):
Állapot: hiányzik
Fog 17 (jobb felső hetes):
Állapot: hiányzik
Fog 16 (jobb felső hatos):
Állapot: jelen
Korona: fém-kerámia korona
Gyökérkezelés: gyökértömött
Szuvasodás: NINCS
2. KVADRÁNS (bal felső)
Fog 21 (bal felső egyes):
Állapot: jelen
Tömés: amalgám tömés, MOD felület
Szuvasodás: NINCS
Fog 22 (bal felső kettes):
Állapot: jelen
Tömés: amalgám tömés, MOD felület
Szuvasodás: NINCS
3. KVADRÁNS (bal alsó)
Fog 37 (bal alsó hetes):
Állapot: jelen
Megjegyzés: Páciens panasza - fájdalom
4. KVADRÁNS (jobb alsó)
Fog 44 (jobb alsó négyes):
Állapot: jelen
Korona: cirkónium korona
Egybeöntött: igen
Szuvasodás: NINCS
Fog 45 (jobb alsó ötös):
Állapot: jelen
Korona: cirkónium korona
Egybeöntött: igen
Szuvasodás: NINCS
─────────────────────────────────────────────────────────────────────────────
PÉLDA 7: IMPLICIT HIDTAG FELISMERÉS (KRITIKUS!) - EGYSZERŰSÍTETT JELÖLÉS
─────────────────────────────────────────────────────────────────────────────
BEMENET:
A jobb felső négyestől a bal felső hatosig van egy fémkerámia híd.
Alatta a fogak: jobb négy, jobb három, jobb egy, bal egy,
bal kettő, bal négy és bal hat. Fémkerámia koronák, egybeöntöttek.
FONTOS: Nem mondja explicit, hogy a 12, 23, 25 hiányzik, de mivel ezek NINCSENEK a pillérfelsorolásban, ezek a HIDTAGOK!
GONDOLKODÁSI FOLYAMAT:

Tartomány: 14-26 -> Teljes lista: 14, 13, 12, 11, 21, 22, 23, 24, 25, 26 (10 fog)
Explicit pillérlista: 14, 13, 11, 21, 22, 24, 26 (7 fog)
Hiányzó fogak (hidtagok): 12, 23, 25 (3 fog)
Számítás: Tartomány - Pillérek = Hidtagok 

KIMENET:
PANASZOK:
PANASZ:
nincs panasz
KÓRTÖRTÉNET:

Allergiák: nincs adat
Gyógyszerek: nincs adat
Betegségek: nincs adat
Dohányzás: nincs adat

FOGAK:
1. KVADRÁNS (jobb felső)
Fog 14 (jobb felső négyes):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 13 (jobb felső hármas):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 12 (jobb felső kettes):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 11 (jobb felső egyes):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
2. KVADRÁNS (bal felső)
Fog 21 (bal felső egyes):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 22 (bal felső kettes):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 23 (bal felső hármas):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 24 (bal felső négyes):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 25 (bal felső ötös):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 26 (bal felső hatos):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
MAGYARÁZAT:

Tartomány: 14-26 (10 fog összesen)
Pillérek: 14, 13, 11, 21, 22, 24, 26 (7 fog)
Hidtagok: 12, 23, 25 (3 fog) - ezek NINCSENEK a pillérlistában!
A "jobb kettő" (12) NINCS említve -> hidtag
A "bal hármas" (23) NINCS említve -> hidtag
A "bal ötös" (25) NINCS említve -> hidtag

─────────────────────────────────────────────────────────────────────────────
PÉLDA 8: HÍD TARTOMÁNY RÉSZLETES INFO NÉLKÜL - SZÉLSŐ FOGAK = PILLÉREK
─────────────────────────────────────────────────────────────────────────────
BEMENET:
Bal felső kettestől ötösig fémkerámia, jobb alsó hármastól hetesig
fémkerámia híd van alkalmazva. Híd mind a két alkalomnál.

DÖNTÉSI FA ALKALMAZÁSA:
1. Van tartomány? IGEN (22-25 és 43-47)
2. Van explicit pillérfelsorolás? NEM
3. Van explicit hidtag/hiányzó fog említés? NEM
-> C) ág: SZÉLSŐ FOGAK = PILLÉREK, KÖZBÜLSŐ FOGAK = HIDTAGOK
   Ellentmondás a szövegben? NEM -> alkalmazzuk az alapértelmezést.

Híd 22-25:
-> Fog 22: szélső -> PILLÉR
-> Fog 23: közbülső -> HIDTAG
-> Fog 24: közbülső -> HIDTAG
-> Fog 25: szélső -> PILLÉR

Híd 43-47:
-> Fog 43: szélső -> PILLÉR
-> Fog 44: közbülső -> HIDTAG
-> Fog 45: közbülső -> HIDTAG
-> Fog 46: közbülső -> HIDTAG
-> Fog 47: szélső -> PILLÉR

KIMENET:
PANASZOK:
PANASZ:
nincs panasz
KÓRTÖRTÉNET:

Allergiák: nincs adat
Gyógyszerek: nincs adat
Betegségek: nincs adat
Dohányzás: nincs adat

FOGAK:
1. KVADRÁNS (jobb felső)
NINCS ADAT

2. KVADRÁNS (bal felső)
Fog 22 (bal felső kettes):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 23 (bal felső hármas):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 24 (bal felső négyes):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 25 (bal felső ötös):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS

3. KVADRÁNS (bal alsó)
NINCS ADAT

4. KVADRÁNS (jobb alsó)
Fog 43 (jobb alsó hármas):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 44 (jobb alsó négyes):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 45 (jobb alsó ötös):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 46 (jobb alsó hatos):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 47 (jobb alsó hetes):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS

─────────────────────────────────────────────────────────────────────────────
PÉLDA 9: HÍD TARTOMÁNY RÉSZLEGES INFÓVAL (explicit hidtag felülírja)
─────────────────────────────────────────────────────────────────────────────
BEMENET:
A bal felső kettestől ötösig fémkerámia híd, a hármas hiányzik,
azt pótolja a műfog.

DÖNTÉSI FA ALKALMAZÁSA:
1. Van tartomány? IGEN (22-25)
2. Van explicit pillérfelsorolás? NEM (de...)
3. Van explicit hidtag/hiányzó fog említés? IGEN ("a hármas hiányzik")
-> B) ág: A hiányzó fog = HIDTAG, a többi = PILLÉR

KIMENET:
PANASZOK:
PANASZ:
nincs panasz
KÓRTÖRTÉNET:

Allergiák: nincs adat
Gyógyszerek: nincs adat
Betegségek: nincs adat
Dohányzás: nincs adat

FOGAK:
2. KVADRÁNS (bal felső)
Fog 22 (bal felső kettes):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 23 (bal felső hármas):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 24 (bal felső négyes):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 25 (bal felső ötös):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS

─────────────────────────────────────────────────────────────────────────────
PÉLDA 10: KÉT FOGBÓL ÁLLÓ "HÍD" - SPECIÁLIS ESET -> EGYBEÖNTÖTT KORONA
─────────────────────────────────────────────────────────────────────────────
BEMENET:
A jobb alsó hatostól hetesig fémkerámia híd.

DÖNTÉSI FA ALKALMAZÁSA:
1. Van tartomány? IGEN (46-47)
2. Van explicit pillérfelsorolás? NEM
3. Van explicit hidtag/hiányzó fog említés? NEM
-> C) ág, DE: a tartomány CSAK 2 fogat tartalmaz -> NINCS közbülső fog
-> Ez nem valódi híd, hanem EGYBEÖNTÖTT KORONA

KIMENET:
PANASZOK:
PANASZ:
nincs panasz
KÓRTÖRTÉNET:

Allergiák: nincs adat
Gyógyszerek: nincs adat
Betegségek: nincs adat
Dohányzás: nincs adat

FOGAK:
4. KVADRÁNS (jobb alsó)
Fog 46 (jobb alsó hatos):
Állapot: jelen
Korona: fém-kerámia korona
Egybeöntött: igen
Szuvasodás: NINCS
Fog 47 (jobb alsó hetes):
Állapot: jelen
Korona: fém-kerámia korona
Egybeöntött: igen
Szuvasodás: NINCS

─────────────────────────────────────────────────────────────────────────────
PÉLDA 11: SZÉLSŐ FOG ELLENTMONDÁS - EXPLICIT INFO FELÜLÍR
─────────────────────────────────────────────────────────────────────────────
BEMENET:
A bal felső kettestől ötösig fémkerámia híd. A kettes hiányzik.

DÖNTÉSI FA ALKALMAZÁSA:
1. Van tartomány? IGEN (22-25)
2. Van explicit pillérfelsorolás? NEM
3. Van explicit hidtag/hiányzó fog említés? IGEN ("a kettes hiányzik")
-> B) ág: A hiányzó fog = HIDTAG, a többi = PILLÉR
   MEGJEGYZÉS: A 22 szélső fog lenne az alapértelmezés szerint pillér,
   DE az explicit info ("hiányzik") FELÜLÍRJA!

KIMENET:
PANASZOK:
PANASZ:
nincs panasz
KÓRTÖRTÉNET:

Allergiák: nincs adat
Gyógyszerek: nincs adat
Betegségek: nincs adat
Dohányzás: nincs adat

FOGAK:
2. KVADRÁNS (bal felső)
Fog 22 (bal felső kettes):
Állapot: hiányzik
Híd: fém-kerámia hidtag
Fog 23 (bal felső hármas):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 24 (bal felső négyes):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS
Fog 25 (bal felső ötös):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
Szuvasodás: NINCS

═══════════════════════════════════════════════════════════════════════════════
ELLENŐRZŐ CHECKLIST (minden híd esetén):
═══════════════════════════════════════════════════════════════════════════════

Mielőtt véglegesíted a FOGAK szekciót, menj végig ezen a checklistán:

1. Van tartomány? (pl. 14-26, 23-26, stb.)
2. Van explicit pillérfelsorolás? (pl. "alatta a fogak: 14, 13, 11...")
3. Van explicit hidtag/hiányzó fog említés? (pl. "a 24 hiányzik", "műfog")
4. Ha NINCS pillérfelsorolás ÉS NINCS hidtag info -> szélső fogak = pillérek, közbülsők = hidtagok!
5. Ha a tartomány CSAK 2 fogat tartalmaz -> egybeöntött korona, NEM híd!
6. Ellentmond-e bármilyen explicit info a szövegben az alapértelmezésnek? Ha igen -> explicit info nyer!
7. Ha VAN pillérfelsorolás -> kiszámoltam a teljes tartományt?
8. Ha VAN pillérfelsorolás -> kivontam a pilléreket a tartományból?
9. Ha VAN pillérfelsorolás -> a maradék fogakat hidtagként jelöltem?
10. Minden hidtagot "Állapot: hiányzik" + "Híd: [anyag] hidtag"-ként írtam ki?
11. A pillérek "Állapot: jelen" (vagy implant) státuszúak?
12. MINDEN pillér fognál kiírtam a "Korona: [anyag] korona" mezőt?
13. MINDEN pillér fognál kiírtam a "Híd: [anyag] híd része" mezőt?
14. Minden fog ugyanazzal az anyaggal szerepel a hídban?

Ha IGEN minden pontra -> Helyesen dolgoztad fel! 

═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
ALL-ON-4 / ALL-ON-6 FELDOLGOZÁS
═══════════════════════════════════════════════════════════════════════════════
Ha All-on-4 vagy All-on-6 hangzik el:
1. AZ IMPLANTÁTUM POZÍCIÓKRA:
   - Állapot: implant
   - Implant típus (pl. Nobel, Straumann, stb.) ha elhangzik
   - Korona: [anyag] korona (ha van)
2. AZ ÍV ÖSSZES TÖBBI HIÁNYZÓ FOGÁRA:
   - Állapot: hiányzik
3. PROTÉZIS JELÖLÉS – MELYIK FOGAKRA?
   ┌─────────────────────────────────────────────────────────┐
   │ All-on-4/6 esetén a Protezis.Altalanos.Teljes_(impl.)  │
   │ CSAK az IMPLANTÁTUM POZÍCIÓKRA kerüljön!               │
   │ (Flexi-Dent per-fog jelölést használ)                   │
   └─────────────────────────────────────────────────────────┘
PÉLDA: "Felső állcsonton All-on-4, Nobel implantok a 14, 12, 22, 24 pozícióban, 
cirkónium"
Fog 18: Állapot: hiányzik
Fog 17: Állapot: hiányzik
Fog 16: Állapot: hiányzik
Fog 15: Állapot: hiányzik
Fog 14: Állapot: implant
  Implant: Nobel
  Protézis: teljes (implantátumon)
  Korona: cirkónium korona
Fog 13: Állapot: hiányzik
Fog 12: Állapot: implant
  Implant: Nobel
  Protézis: teljes (implantátumon)
  Korona: cirkónium korona
Fog 11: Állapot: hiányzik
[...stb. 21-28, hiányzik kivéve 22 és 24]
═══════════════════════════════════════════════════════════════════════════════
KIVEHETŐ PROTÉZIS FELDOLGOZÁS
═══════════════════════════════════════════════════════════════════════════════
Részleges kivehető: a KAPOCS/TÁMASZTÓ fogakra kerüljön a protézis jelölés.
1. MELYIK FOGRA KERÜL?
   - A kapocs fogakra (jelen lévő fogak, amik tartják a protézist)
   - Jelöld az oldalt is: bal / közép / jobb
2. A PÓTOLT FOGAK:
   - Állapot: hiányzik
   - Megjegyzés: "részleges kivehető protézis pótolja"
PÉLDA: "Jobb alsó, a 43-as és 46-os a kapocs fog, a 44-es és 45-ös hiányzik,
fémvázkeretes részleges"
Fog 43: Állapot: jelen
  Protézis: részleges kivehető, jobb
  Megjegyzés: kapocs fog
Fog 44: Állapot: hiányzik
  Megjegyzés: részleges kivehető protézis pótolja
Fog 45: Állapot: hiányzik
  Megjegyzés: részleges kivehető protézis pótolja
Fog 46: Állapot: jelen
  Protézis: részleges kivehető, jobb
  Megjegyzés: kapocs fog
Teljes kivehető: az ÍV ELSŐ ÉS UTOLSÓ fogára (18+11 vagy 28+21 stb.):
  Protézis: teljes
  Összes többi fog: Állapot: hiányzik
==========
KRITIKUS SZABÁLYOK
═══════════════════════════════════════════════════════════════════════════════

 CSINÁLD:

 KRITIKUS: Minden pillér fognál írd ki MINDKETTŐT: "Korona: [anyag] korona" + "Híd: [anyag] híd része"
 KRITIKUS: Minden hídtag fognál írd ki: "Állapot: hiányzik" + "Híd: [anyag] hidtag"
 KRITIKUS: Ha híd anyaga nem derül ki -> DEFAULT: fém-kerámia
 KRITIKUS: Korona anyaga = Híd anyaga (mindig ugyanaz!)
 KRITIKUS: A végső kimenet generálása előtt CSOPORTOSÍTSD a fogakat kvadránsok szerint! Az 1X (11-18) fogak KIZÁRÓLAG az 1. KVADRÁNS alá, a 2X (21-28) fogak a 2. KVADRÁNS alá, a 3X a 3. KVADRÁNS alá, a 4X pedig a 4. KVADRÁNS alá kerülhetnek.
 KRITIKUS: Ha csak híd tartomány van megadva (nincs részletes info) -> szélső fogak = pillérek, közbülsők = hidtagok!
 KRITIKUS: Ha a tartomány csak 2 fogat tartalmaz -> egybeöntött korona, NEM híd!
 KRITIKUS: Ha explicit info ellentmond az alapértelmezésnek -> az explicit info nyer!
Kvadránsokat mindig növekvő sorrendben (1, 2, 3, 4)
Implantátum mindig állapot, nem megjegyzés
Ha tömés van, de szuvasodás nem -> "Szuvasodás: NINCS"
 KRITIKUS: A végső kimenet generálása előtt CSOPORTOSÍTSD a fogakat kvadránsok szerint! Az 1X (11-18) fogak KIZÁRÓLAG az 1. KVADRÁNS alá, a 2X (21-28) fogak a 2. KVADRÁNS alá, a 3X a 3. KVADRÁNS alá, a 4X pedig a 4. KVADRÁNS alá kerülhetnek.
 NE CSINÁLD:

 KRITIKUS: NE adj koronát MINDEN fognak egy hídban! Csak a PILLÉREKNEK (szélső fogak) jár korona!
 KRITIKUS: NE hagyd ki a koronát a pillér fogoknál!
 KRITIKUS: NE hagyd ki a "Híd: [anyag] híd része" sort a pillér fogoknál!
 KRITIKUS: NE használj különböző anyagokat ugyanazon híd fogainál!
 KRITIKUS: NE írj egy fogat rossz kvadránsba! (pl. egy 12-es fog soha nem szerepelhet a 2. KVADRÁNS alatt!)
 KRITIKUS: NE írd, hogy "NINCS ADAT" egy kvadránshoz, ha a szövegben korábban már azonosítottál oda tartozó fogat!
KRITIKUS: NE hagyd ki a hiányzó fogakat! (ha említve van, ki kell írni!)
KRITIKUS: NE hagyd figyelmen kívül a pillérfelsorolást! (implicit hidtagok!)
Ne találj ki információt
Ne írj "Fog 41-48: nincs adat" típusú sorokat (kivéve ha explicit így van az átírásban)
Ne duplikálj fogakat (egy fog = egy bejegyzés)
Ne írj ellentmondásos információt (pl. "hiányzik" ÉS "implant" ugyanarra a fogra)
Ne tedd az implantátumot megjegyzésbe - ez ÁLLAPOT!

═══════════════════════════════════════════════════════════════════════════════
VÉGSŐ EMLÉKEZTETŐK
═══════════════════════════════════════════════════════════════════════════════

STRUKTÚRA (mindig ebben a sorrendben):

PANASZOK: (panasz + kórtörténet együtt)
FOGAK: (kvadránsok 1-4, minden fog külön)

HIÁNYZÓ FOGAK:
Ha az átírásban szerepel, hogy egy fog hiányzik → KÖTELEZŐ kiírni a kimenetbe

IMPLICIT HIDTAGOK:
Ha tartomány + explicit pillérfelsorolás → Számítsd ki a hidtagokat!

HÍD TARTOMÁNY RÉSZLETES INFO NÉLKÜL (ALAPÉRTELMEZÉS):
Szélső fogak = pillérek, közbülsők = hidtagok
Ha CSAK 2 fog → egybeöntött korona, nem híd!

═══════════════════════════════════════════════════════════════════════════════
MOST DOLGOZD FEL A KAPOTT SZÖVEGET!
═══════════════════════════════════════════════════════════════════════════════`;

export async function processVoxisMock(jobId: string, apiKeys: any, context: any, overrideTranscript?: string) {
  const callOpenAI = async (messages: any[], apiKey: string, maxTokens = 8000) => {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages,
        temperature: 0,
        max_tokens: maxTokens
      })
    });
    if (!response.ok) throw new Error(`OpenAI error: ${await response.text()}`);
    const data = await response.json();
    return data.choices[0].message.content;
  };

  const callAnthropic = async (systemPrompt: string, prompt: string, apiKey: string) => {
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
    
    const payload = {
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      temperature: 0.1,
      messages: [
        { role: "user", content: prompt }
      ]
    };
    
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        throw new Error(`Anthropic error: ${await response.text()}`);
    }
    const data = await response.json();
    return data.content[0].text;
  };

  // OpenAI Structured Outputs with proper JSON Schema (matching n8n workflow)
  const callOpenAIStructured = async (messages: any[], schemaName: string, schema: any, apiKey: string) => {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema: schema
          }
        }
      })
    });
    if (!response.ok) throw new Error(`OpenAI error: ${await response.text()}`);
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  };

  /**
   * Local memory array of traces. We push to this and then update the DB.
   */
  const traceLogs: any[] = [];

  const appendTraceLog = async (node: string, status: 'processing' | 'completed' | 'error', details?: any) => {
    const entry = { timestamp: new Date().toISOString(), node, status, details };
    traceLogs.push(entry);
    console.log(`TRACE [${status}]: ${node}`, details);
  };

  const updateProgress = async (percent: number, message: string) => {
    console.log(`PROGRESS: ${percent}% - ${message}`);
  };

  const buildQuadrantSchema = (quadrantNum: number, positions: number[]) => {
    const properties: any = {};
    const required: string[] = [];
    positions.forEach(pos => {
      const toothStr = `${quadrantNum}${pos}`;
      properties[toothStr] = { "$ref": "#/$defs/fog_sparse" };
      required.push(toothStr);
    });
    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
      "$defs": defs
    };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Sparse → Full JSON conversion (replicates n8n Code in JavaScript15-18)
  // ═══════════════════════════════════════════════════════════════════════════
  function smartSplit(path: string): string[] {
    if (path.includes('..')) {
      const idx = path.indexOf('..');
      const top = path.slice(0, idx) + '.';
      const rest = path.slice(idx + 2);
      const dot = rest.indexOf('.');
      if (dot === -1) return [top, rest];
      const second = rest.slice(0, dot);
      const tail = rest.slice(dot + 1);
      return [top, second, tail];
    }
    const parts = path.split('.');
    if (parts.length <= 2) return parts;
    return [parts[0], parts[1], parts.slice(2).join('.')];
  }

  function setNestedProperty(obj: any, path: string, value: any) {
    const keys = smartSplit(path);
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    cur[keys[keys.length - 1]] = value;
  }

  function sparseToFull(sparseData: any, toothNumbers: string[]): any {
    const result: any = {};
    for (const n of toothNumbers) result[n] = { Megjegyzes: "" };

    for (const [toothNum, toothData] of Object.entries(sparseData as Record<string, any>)) {
      if (!result[toothNum]) continue;
      const activePaths = Array.isArray(toothData?.active_properties) ? toothData.active_properties : [];
      result[toothNum].active_properties = activePaths; // Preserve for frontend voxisMapper
      for (const path of activePaths) {
        try { setNestedProperty(result[toothNum], path, true); }
        catch (err) { console.error(`Error setting path: ${path} (tooth: ${toothNum})`, err); }
      }
      const note = typeof toothData?.Megjegyzes === 'string' ? toothData.Megjegyzes.trim() : "";
      result[toothNum].Megjegyzes = note;
    }
    return result;
  }

  try {
    const timings: Record<string, number> = {};
    let stepStart = Date.now();

    console.log(`[Native Job ${jobId}] Transcribing audio with ElevenLabs...`);
    await updateProgress(5, "Adatok inicializálása és hangfelvétel fogadása...");
    await appendTraceLog("1 - ElevenLabs STT", "processing");

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: ElevenLabs STT (matches n8n TRANSCRIBER1 node)
    // ═══════════════════════════════════════════════════════════════
    stepStart = Date.now();
    let transcript = overrideTranscript || "";
    if (!overrideTranscript) {
      if (!audioBuffer) throw new Error("Missing audio file for ElevenLabs and no override transcript provided.");
      const formData = new FormData();
      formData.append("file", audioBuffer, audioBuffer.name || "audio.webm");
      formData.append("model_id", "scribe_v1");
      formData.append("language_code", "hu");
      formData.append("diarize", "true");
      formData.append("timestamp_granularity", "word");
      formData.append("audio_events", "true");

      if (!apiKeys.elevenlabs) {
        throw new Error(`Missing ELEVENLABS_API_KEY environment variable. Please configure it in Supabase Secrets.`);
      }

      const elevenLabsResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: {
          "xi-api-key": apiKeys.elevenlabs,
        },
        body: formData,
      });

      if (!elevenLabsResponse.ok) {
        throw new Error(`ElevenLabs transcription failed: ${await elevenLabsResponse.text()}`);
      }

      const elevenLabsData = await elevenLabsResponse.json();
      transcript = elevenLabsData.text;
    }
    timings.step1_elevenlabs_ms = Date.now() - stepStart;
    console.log(`[Native Job ${jobId}] Transcript (${timings.step1_elevenlabs_ms}ms): ${transcript.substring(0, 200)}...`);
    await updateProgress(30, "Szöveggé alakítás kész! Klinikai adatok kinyerése...");
    await appendTraceLog("1 - ElevenLabs STT", "completed", { duration_ms: timings.step1_elevenlabs_ms, textPreview: transcript.substring(0, 100) });

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Claude Cleaner (matches n8n AI Agent2 node)
    // ═══════════════════════════════════════════════════════════════
    stepStart = Date.now();
    console.log(`[Native Job ${jobId}] Cleaning text with Claude Sonnet 4.6...`);
    await appendTraceLog("2 - AI Tisztítás (Claude)", "processing");
    const cleanedText = await callAnthropic(
      CLEANER_PROMPT,
      `Dolgozd fel az alábbi szöveget:\n\n${transcript}`,
      apiKeys.anthropic
    );
    timings.step2_claude_cleaner_ms = Date.now() - stepStart;
    console.log(`[Native Job ${jobId}] Claude cleaning done (${timings.step2_claude_cleaner_ms}ms)`);
    await appendTraceLog("2 - AI Tisztítás (Claude)", "completed", { duration_ms: timings.step2_claude_cleaner_ms });

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Markdown Splitter (matches n8n Code in JavaScript14)
    // ═══════════════════════════════════════════════════════════════
    stepStart = Date.now();
    await appendTraceLog("3 - Kvadráns Szétválasztó", "processing");

    // Get Megjegyzes_fo
    let fullReport = cleanedText;
    let megjegyzesFo = "";
    const megjegyzesMatch = fullReport.match(
        /\*{0,2}Megjegyzes_fo:\*{0,2}\s*([\s\S]*?)(?=\n---\s*(?:END|$)|\n##\s*FOGAK|\nFOGAK:|\n###\s*\d+\.?\s*KVADRÁNS|\n\d+\.?\s*KVADRÁNS|$)/i
    );
    if (megjegyzesMatch) {
      megjegyzesFo = megjegyzesMatch[1].trim();
    }

    // Split into 4 quadrants
    const headingPatterns = {
      q1: /(?:###\s*)?(?:JOBB\s+FELSŐ\s+KVADRÁNS|1\.?\s*KVADRÁNS\s*\([^)]*\)|KVADRÁNS\s*\(jobb felső\))/i,
      q2: /(?:###\s*)?(?:BAL\s+FELSŐ\s+KVADRÁNS|2\.?\s*KVADRÁNS\s*\([^)]*\)|KVADRÁNS\s*\(bal felső\))/i,
      q3: /(?:###\s*)?(?:BAL\s+ALSÓ\s+KVADRÁNS|3\.?\s*KVADRÁNS\s*\([^)]*\)|KVADRÁNS\s*\(bal alsó\))/i,
      q4: /(?:###\s*)?(?:JOBB\s+ALSÓ\s+KVADRÁNS|4\.?\s*KVADRÁNS\s*\([^)]*\)|KVADRÁNS\s*\(jobb alsó\))/i,
    };

    const findIndex = (re: RegExp) => {
      const m = fullReport.match(re);
      if (!m) return -1;
      return fullReport.indexOf(m[0]);
    };

    const starts = [
      { key: "q1", title: "### 1. KVADRÁNS (jobb felső)", idx: findIndex(headingPatterns.q1) },
      { key: "q2", title: "### 2. KVADRÁNS (bal felső)", idx: findIndex(headingPatterns.q2) },
      { key: "q3", title: "### 3. KVADRÁNS (bal alsó)", idx: findIndex(headingPatterns.q3) },
      { key: "q4", title: "### 4. KVADRÁNS (jobb alsó)", idx: findIndex(headingPatterns.q4) },
    ].filter(s => s.idx >= 0).sort((a, b) => a.idx - b.idx);

    const chunks: Record<string, string> = {};
    for (let i = 0; i < starts.length; i++) {
      const endIdx = i + 1 < starts.length ? starts[i + 1].idx : fullReport.length;
      chunks[starts[i].key] = fullReport.slice(starts[i].idx, endIdx).trim();
    }
    // fallback: if no quadrant headings found, put everything in q1
    if (starts.length === 0) {
      chunks["q1"] = fullReport;
    }
    timings.step3_markdown_splitter_ms = Date.now() - stepStart;
    console.log(`[Native Job ${jobId}] Markdown split done (${timings.step3_markdown_splitter_ms}ms), quadrants: ${Object.keys(chunks).join(', ')}`);
    await updateProgress(40, "Kvadránsok szétválasztva, AI elemzés indítása...");
    await appendTraceLog("3 - Kvadráns Szétválasztó", "completed", { duration_ms: timings.step3_markdown_splitter_ms, quadrants: Object.keys(chunks) });

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: OpenAI Quadrant Extractors (Structured Outputs)
    // ═══════════════════════════════════════════════════════════════
    stepStart = Date.now();
    await appendTraceLog("4 - OpenAI Adatkinyerés", "processing");

    const quadrantConfig = [
      { key: "q1", num: 1, positions: [8,7,6,5,4,3,2,1] },
      { key: "q2", num: 2, positions: [1,2,3,4,5,6,7,8] },
      { key: "q3", num: 3, positions: [8,7,6,5,4,3,2,1] },
      { key: "q4", num: 4, positions: [1,2,3,4,5,6,7,8] },
    ];

    const sparseResults: Record<string, any> = {};
    const quadrantTraces: Record<string, any> = {};

    const EXTRACTOR_SYSTEM = `Te egy fogászati AI extractor vagy. A feladatod: a kapott fogászati szövegből kinyerd a kért kvadráns fogainak adatait STRUKTURÁLT JSON formátumban.

SZABÁLYOK:
- Csak a KÉRT kvadráns fogait add vissza
- Ha egy fog JELEN VAN (de nem mondanak róla semmit): active_properties maradjon üres [], Megjegyzes: ""
- Ha egy fog HIÁNYZIK: active_properties: ["Altalanos.Foghiany"], Megjegyzes: "hiányzik" 
- Implant: active_properties tartalmazza a megfelelő Implant.Altalanos.* enum értéket
- Korona: active_properties tartalmazza a megfelelő Korona.Altalanos.* enum értéket
- Híd pillér: active_properties tartalmazza a koronát ÉS a Hid.Altalanos.*-ot is
- Híd hidtag: active_properties tartalmazza az Altalanos.Foghiany + a Hid.Altalanos.* értéket
- Tömés: active_properties tartalmazza a megfelelő Tomes.*.* felület enum értéket
- Szuvasodás: active_properties tartalmazza a megfelelő Caries.Altalanos.* felület enum értéket
- Gyökértömés: active_properties tartalmazza a Gyokertomes.Vegleges.* értékeket
- Megjegyzes: szabad szöveges megjegyzés az adott foghoz

HEURISZTIKA:
- Ha a szöveg NEM említi az adott fogat → active_properties: [], Megjegyzes: ""
- Ha a szöveg azt mondja "hiányzik" → ["Altalanos.Foghiany"]
- Fém-kerámia korona → ["Korona.Altalanos.Fem-keramia_-_Korona"]
- Cirkónium korona → ["Korona.Altalanos.Cirkonium_-_Korona"]
- Fém-kerámia híd pillér → ["Korona.Altalanos.Fem-keramia_-_Korona", "Hid.Altalanos.Fem-keramia_-_Hid"]
- Fém-kerámia hidtag → ["Altalanos.Foghiany", "Hid.Altalanos.Fem-keramia_-_Hid"]
- MOD esztétikus tömés → ["Tomes.Esztetikus.Mesialis_-_Tomes_Esztetikus", "Tomes.Esztetikus.Occlusalis_-_Tomes_Esztetikus", "Tomes.Esztetikus.Distalis_-_Tomes_Esztetikus"]

MEGJEGYZÉS MEZŐ HASZNÁLATA:
- Klinikai info amit az enum nem fed le (pl. mobilitás, fájdalom, kezelési terv)
- "gyökértömött" ha gyökérkezelés történt
- "egybeöntött" ha egybeöntött koronák
- Üresen hagyd ("") ha nincs extra info`;

    for (const qc of quadrantConfig) {
      const chunk = chunks[qc.key];
      if (!chunk) {
        sparseResults[qc.key] = {};
        continue;
      }

      const qStart = Date.now();
      const schema = buildQuadrantSchema(qc.num, qc.positions);
      const messages = [
        { role: "system", content: EXTRACTOR_SYSTEM },
        { role: "user", content: `Kérlek dolgozd fel az alábbi fogászati szöveget és nyerd ki a ${qc.num}. KVADRÁNS fogainak adatait:\n\n${chunk}` }
      ];

      try {
        const result = await callOpenAIStructured(messages, `quadrant_${qc.num}_extraction`, schema, apiKeys.openai);
        sparseResults[qc.key] = result;
        quadrantTraces[qc.key] = {
          prompt: messages,
          schema: schema,
          output: result,
          duration_ms: Date.now() - qStart
        };
      } catch (err) {
        console.error(`[Native Job ${jobId}] Q${qc.num} extraction failed:`, err);
        sparseResults[qc.key] = {};
        quadrantTraces[qc.key] = {
          prompt: messages,
          schema: schema,
          output: null,
          error: err instanceof Error ? err.message : String(err),
          duration_ms: Date.now() - qStart
        };
      }
    }

    timings.step4_quadrants_ms = Date.now() - stepStart;
    console.log(`[Native Job ${jobId}] Quadrant extraction done (${timings.step4_quadrants_ms}ms)`);
    await updateProgress(70, "Fogadatok kinyerve, konverzió...");
    await appendTraceLog("4 - OpenAI Adatkinyerés", "completed", { duration_ms: timings.step4_quadrants_ms });

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Sparse → Full JSON conversion
    // ═══════════════════════════════════════════════════════════════
    stepStart = Date.now();
    await appendTraceLog("5 - Generátor & Összeillesztő", "processing");

    const quadrantTeeth: Record<string, string[]> = {
      q1: ["18","17","16","15","14","13","12","11"],
      q2: ["21","22","23","24","25","26","27","28"],
      q3: ["38","37","36","35","34","33","32","31"],
      q4: ["41","42","43","44","45","46","47","48"],
    };

    const fullResults: Record<string, any> = {};
    for (const qk of ["q1","q2","q3","q4"]) {
      fullResults[qk] = sparseToFull(sparseResults[qk] || {}, quadrantTeeth[qk]);
    }

    timings.step5_sparse_to_full_ms = Date.now() - stepStart;
    console.log(`[Native Job ${jobId}] Sparse→Full conversion done (${timings.step5_sparse_to_full_ms}ms)`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 6: Final Merge (assembly)
    // ═══════════════════════════════════════════════════════════════
    stepStart = Date.now();

    const mergedTeeth: Record<string, any> = {};
    let teethWithData = 0;
    for (const qk of ["q1","q2","q3","q4"]) {
      const qData = fullResults[qk];
      for (const [toothNum, toothData] of Object.entries(qData as Record<string, any>)) {
        mergedTeeth[toothNum] = toothData;
        // Count teeth that have actual data (more than just empty Megjegyzes)
        const keys = Object.keys(toothData);
        if (keys.length > 1 || (toothData.Megjegyzes && toothData.Megjegyzes.length > 0)) {
          teethWithData++;
        }
      }
    }

    const resultJson = {
      Megjegyzes_fo: megjegyzesFo,
      ...mergedTeeth
    };

    timings.step6_merge_ms = Date.now() - stepStart;

    // Build comprehensive trace data
    const traceData: Record<string, any> = {
      step1_elevenlabs: {
        duration_ms: timings.step1_elevenlabs_ms,
        transcript_length: transcript.length,
      },
      step2_claude_cleaner: {
        model: "claude-sonnet-4-6",
        duration_ms: timings.step2_claude_cleaner_ms,
        system_prompt: CLEANER_PROMPT.substring(0, 500) + "...",
        response: cleanedText,
      },
      step3_markdown_splitter: {
        duration_ms: timings.step3_markdown_splitter_ms,
        chunks: chunks,
      },
      step4_quadrant_extractors: {
        model: "gpt-4.1",
        mode: "structured_outputs",
        duration_ms: timings.step4_quadrants_ms,
        ...quadrantTraces,
      },
      step5_sparse_to_full: {
        duration_ms: timings.step5_sparse_to_full_ms,
        ...fullResults,
      },
      step6_merge: {
        duration_ms: timings.step6_merge_ms,
        total_teeth: Object.keys(mergedTeeth).length,
        teeth_with_data: teethWithData,
        megjegyzes_fo: megjegyzesFo,
      },
      total_duration_ms: Object.values(timings).reduce((a, b) => a + b, 0),
    };

    await updateProgress(90, "Adatok összeállítva, mentés...");
    await appendTraceLog("5 - Generátor & Összeillesztő", "completed", { duration_ms: timings.step5_sparse_to_full_ms + timings.step6_merge_ms });

    // Update job successfully
    const { error: finalUpdateError } = await supabaseAdmin
        .from('native_voice_jobs')
        .update({
          status: 'completed',
          result: resultJson,
          raw_audio_text: transcript,
          claude_cleaned_text: cleanedText,
          trace_info: traceData,
          progress_percent: 100,
          progress_message: "Kész! Adatok sikeresen kinyerve.",
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

    if (finalUpdateError) {
      throw new Error(`Final database update failed: ${finalUpdateError.message}`);
    }

    console.log(`[Native Job ${jobId}] Státuszfelvétel internal processing completed successfully! (${traceData.total_duration_ms}ms total, ${teethWithData} teeth with data)`);
    
    // Log success
    if (context?.logErrorToDatabase) {
      await context.logErrorToDatabase(supabaseAdmin, {
          script_name: 'process-statusz-internal',
          summary: 'Sikeres AI Státuszfelvétel',
          full_log: `A(z) ${jobId} azonosítójú hangfelvétel AI feldolgozása sikeresen befejeződött. (${traceData.total_duration_ms}ms, ${teethWithData} fog adattal)`,
          user_id: context.userId,
          company_id: context.companyId,
          telephely_id: context.telephelyId,
          severity: 'info'
      });
    }

  } catch (error) {
    console.error(`[Native Job ${jobId}] Internal processing error:`, error);
    
    if (context?.logErrorToDatabase) {
      await context.logErrorToDatabase(supabaseAdmin, {
          script_name: 'process-statusz-internal',
          summary: 'Hiba a belső AI Státuszfelvétel során',
          full_log: error instanceof Error ? error.message : String(error),
          user_id: context.userId,
          company_id: context.companyId,
          telephely_id: context.telephelyId,
          severity: 'error'
      });
    }

    await supabaseAdmin
        .from('native_voice_jobs')
        .update({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          progress_percent: 0,
          progress_message: "Hiba történt a feldolgozás során.",
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
  }
}
