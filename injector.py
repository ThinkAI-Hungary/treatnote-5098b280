import re
import os

PROMPT = r'''FOGÁSZATI ÁTÍRÁS TISZTÍTÓ v2.6 (EGYSZERŰSÍTETT HÍD JELÖLÉS)
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
KRITIKUS: Minden HIÁNYZÓ fogat írj ki! (Állapot: hiányzik)
KRITIKUS: Ha az átírás említi, hogy "a 18-as hiányzik" -> kötelező: "Fog 18: Állapot: hiányzik"
KRITIKUS: Ha híd tartomány + pillérfelsorolás -> Számítsd ki az implicit hidtagokat!
Minden jelen lévő fogat írj le külön (még ha csak minimális infó van róla)
Panasz és kórtörténet együtt a PANASZOK szekcióban
Konzisztens FDI számozás
Tartalmazz minden klinikai információt
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
Ha az átírásban szerepel, hogy egy fog hiányzik (pl. "a 18-as hiányzik", "nincs meg a 17-es", "kihúzták a 16-ost"), akkor KÖTELEZŐ kiírni a kimenetbe:
Fog XX:
Állapot: hiányzik
NE hagyd ki! Minden hiányzó fog fontos információ!

IMPLICIT HIDTAGOK:
Ha tartomány + explicit pillérfelsorolás -> Számítsd ki a hidtagokat!
Példa:
"Híd 14-26, pillérek: 14, 13, 11, 21, 22, 24, 26"
-> Hidtagok: 12, 23, 25

HÍD TARTOMÁNY RÉSZLETES INFO NÉLKÜL (ALAPÉRTELMEZÉS):
Ha tartomány van, DE nincs pillérfelsorolás ÉS nincs explicit hidtag info:
-> A tartomány KÉT SZÉLSŐ FOGA = PILLÉREK (jelen + korona + híd része)
-> A KÖZBÜLSŐ FOGAK = HIDTAGOK (hiányzik + hidtag)
-> Ha CSAK 2 fog van a tartományban -> egybeöntött korona, nem híd!
-> Ha explicit info ellentmond -> az explicit info nyer!

HÍD JELÖLÉS ( KRITIKUS SZABÁLY!):
HÍDTAG (hiányzó fog):
Állapot: hiányzik
Híd: fém-kerámia hidtag
PILLÉR (koronás fog hídban):
Állapot: jelen
Korona: fém-kerámia korona
Híd: fém-kerámia híd része
ÖNÁLLÓ KORONA (nem híd):
Állapot: jelen
Korona: cirkónium korona
EGYBEÖNTÖTT KORONA (nincs hiányzó):
Állapot: jelen
Korona: cirkónium korona
Egybeöntött: igen

ANYAG KONZISZTENCIA:

Egy hídban MINDEN fog ugyanazzal az anyaggal!
Ha nem derül ki -> DEFAULT: fém-kerámia
Korona anyaga = Híd anyaga (mindig!)

SZUVASODÁS:
Ha tömés van, de szuvasodás nem hangzik el explicit módon -> "Szuvasodás: NINCS"

IMPLANTÁTUM:
Mindig ÁLLAPOT mezőbe, soha nem megjegyzésbe!

═══════════════════════════════════════════════════════════════════════════════
ALL-ON-4 / ALL-ON-6 SZABÁLYOK (KIEGÉSZÍTŐ MODUL)
═════════════════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════════════════
MEGJEGYZES_FO (ÁLTALÁNOS EGÉSZSÉGI ÁLLAPOT – NEM KIMONDOTTAN FOGÁSZATI)

A kimenetben MINDIG szerepeljen egy külön sor:

Megjegyzes_fo:
[Ide írd ÖSSZEFOGLALVA az összes olyan információt, amely a páciens általános egészségi állapotára utalhat, de nem kifejezetten fogászati adat.]

IDE VALÓ PÉLDÁK (NEM TELJES LISTA):
- Tartás, mozgásszervi eltérések: pl. "ferdén tartja magát", "lúdtalp", "gerincproblémák", "ízületi panaszok"
- Fejfájás, migrén, szédülés: pl. "konstans fejfájás", "gyakori migrén"
- Gyógyszerérzékenység, gyógyszer-mellékhatások: pl. "gyógyszerérzékenység NSAID-ra"
- Allergiák általánosan: pl. "pollenallergia", "élelmiszerallergia", "kontaktallergia"
- Krónikus betegségek: pl. "cukorbetegség", "magas vérnyomás", "szívbetegség", "pajzsmirigybetegség"
- Családi anamnézis: pl. "családban előforduló szívbetegség", "örökletes anyagcserezavar"
- Korábbi súlyos balesetek, műtétek: pl. "autóbaleset", "fejsérülés", "csípőprotézis"
- Neurológiai / pszichés állapot: pl. "szorongás", "depresszió", "epilepszia"
- Terhesség, hormonális állapot, egyéb szisztémás tényezők
- Egyéb, a páciens általános egészségi állapotát befolyásoló körülmény

FONTOS:
- IDE NE írj tisztán fogászati adatokat (fogszám, korona, híd, tömés, szuvasodás stb.) – azok a FOGAK szekcióba kerüljenek.
- Olyan információ viszont JÖHET IDE, ami a fogászati kezelés szempontjából releváns lehet, de NEM klasszikus fogászati szakkifejezés (pl. vérzékenység, cukorbetegség, baleseti előzmény).
- Ha nincs ilyen adat, írd: "Megjegyzes_fo: nincs adat"

═══════════════════════════════════════════════════════════════════════════════
KIMENETI SZERZŐDÉS (KÖTELEZŐ):
1) A kimenet MINDIG tartalmazza mind a négy kvadránst, ebben a pontos markdown formában:

## FOGAK

### 1. KVADRÁNS (jobb felső)
[ide írd a fogakat vagy írd: NINCS ADAT]

### 2. KVADRÁNS (bal felső)
[ide írd a fogakat vagy írd: NINCS ADAT]

### 3. KVADRÁNS (bal alsó)
[ide írd a fogakat vagy írd: NINCS ADAT]

### 4. KVADRÁNS (jobb alsó)
[ide írd a fogakat vagy írd: NINCS ADAT]

2) Ha bármely kvadránsban nincs információ, akkor is jelenjen meg a címsor, és a sorban szerepeljen: **NINCS ADAT**.
3) Ne hagyd félbe a dokumentumot. A VÉGÉN mindig írd ki ezt a jelölőt külön sorban:
--- END ---
═══════════════════════════════════════════════════════════════════════════════
MOST DOLGOZD FEL A KAPOTT SZÖVEGET!
Mindig ellenőrizd magad, hogy ne hagyj ki semmilyen kulcsfontosságú információt, különösen:

Hiányzó fogakat
Implicit hidtagokat (tartomány - pillérek)
Híd tartomány info nélkül -> szélső fogak = pillérek, közbülsők = hidtagok!
Csak 2 fog a tartományban -> egybeöntött korona!
Explicit info ellentmond -> explicit nyer!
Koronákat CSAK a pilléreknek (NE minden fognak!)
"Híd: [anyag] híd része" sort minden pillér fognál
"Híd: [anyag] hidtag" sort minden hídtag fognál
Anyag konzisztenciát egy hídon belül
Szuvasodás státuszát (NINCS, ha nincs)

═══════════════════════════════════════════════════════════════════════════════'''

# Clean emojis properly using ascii/latin allowed ranges and basic punctuation
cleaned_prompt = ""
import re
# Keep hungarian characters, punctuation, whitespace, numbers, Box Drawing characters.
# Emojis are usually above \u2600.
cleaned_prompt = re.sub(r'[\U00010000-\U0010ffff]', '', PROMPT)

code_file = r'c:\Users\Zombo\Desktop\Antigrav\TreatNote\treatnote\supabase\functions\native-voice-webhook\process-statusz-internal.ts'

with open(code_file, 'r', encoding='utf-8') as f:
    original = f.read()

# Replace CLEANER_PROMPT
pattern = r'(const CLEANER_PROMPT = `)(.*?)(`;\n\nexport async function processVoxisInternally)'
import re
new_code = re.sub(pattern, r'\1' + cleaned_prompt + r'\3', original, flags=re.DOTALL)

with open(code_file, 'w', encoding='utf-8') as f:
    f.write(new_code)
print("done")
