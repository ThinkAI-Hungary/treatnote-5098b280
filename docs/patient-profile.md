# TreatNote – Páciens Profil modul fejlesztői dokumentáció

## Áttekintés

A Páciens Profil oldal (`/patients/:id`) a TreatNote platform legösszetettebb nézetje. Egy adott páciens teljes klinikai adatlapját jeleníti meg: alapadatok, anamnézis, fogászati státusz (interaktív fogíven), hangfelvétel-alapú feldolgozás és előzménynapló.

---

## 1. Fő oldal: `PatientProfile.tsx`

**Útvonal:** `src/pages/PatientProfile.tsx`

### Adatbetöltés

```ts
supabase.from('patient_alap_adatok').select('*').eq('id', id).single()
```

A `patient` state tartalmaz minden alapadatot. Ha `loading === true`, egy placeholder jelenik meg. Ha `patient === null`, hibaüzenet + vissza gomb jelenik meg.

### Szerkesztési mód

Ha `isEditing === true`, a teljes oldal helyét átveszi a `NewPatientWizard` komponens, az `existingPatient` prop-pal feltöltve. Sikeres mentés után `fetchPatient()` hívódik újra.

### Layout – CSS Grid

Az oldal fő tartalma egy `grid grid-cols-12` alapú elrendezés:

| Oszlop | Szélesség | Tartalom |
|--------|-----------|----------|
| COL 1 | `col-span-3` | `NativeVoiceJobHistory` – hangjob lista |
| COL 2 | `col-span-6` | Alapadatok, Elérhetőség, Anamnézis, `PatientHistoryPanel` |
| COL 3 | `col-span-3` | `NativeVoiceRecordingPanel` – felvétel készítése |

Teljes szélességű blokkok alatta:
- `DentalChart` – fogászati státusz (Zsigmondy-kereszt)
- `VerdiktDisplay` – kiválasztott hangjob részletei (csak ha van kiválasztva)

### Admin funkció: "Clean user"

Csak `isAdmin === true` esetén látható. Törli a `dental_chart` tábla összes sorát a pácienshez. Megerősítő dialógus + `window.location.reload()` után.

### Voice state

```ts
const { jobs, isLoading, refetch } = useUnifiedVoiceHistory(patientId);
const [selectedNativeJobId, setSelectedNativeJobId] = useState<string | null>(null);
```

A `selectedJob` a kiválasztott job objektuma a `jobs` tömbből. A `VerdiktDisplay` csak akkor renderelődik, ha `selectedNativeJobId !== null`.

---

## 2. Páciens alapadatok (DB tábla)

**Tábla:** `patient_alap_adatok`

| Mező | Típus | Leírás |
|------|-------|--------|
| `id` | uuid | Elsődleges kulcs |
| `vezeteknev` | text | Páciens vezetékneve |
| `keresztnev` | text | Páciens keresztneve |
| `titulus` | text? | Dr., Prof. stb. |
| `szuletesi_ido` | date | Születési dátum |
| `anyja_neve` | text | Anyja neve |
| `taj_szam` | text | TAJ azonosító |
| `neme` | text | Nem |
| `telefon_1_orszagkod` | text | Pl. "36" |
| `telefon_1_korzet` | text | Körzethívó |
| `telefon_1_hivoszam` | text | Szám |
| `kapcsolattarto_email` | text | Email cím |
| `iranyitoszam` | text | Irányítószám |
| `varos` | text | Város |
| `utca_hazszam` | text | Utca, házszám |
| `anamnezis` | jsonb | Gyors anamnézis (lásd lent) |
| `flexident_id` | text? | FlexiDent integráció ID |
| `created_at` | timestamptz | Rögzítés ideje |

### `anamnezis` JSONB mezők

```json
{
  "gyogyszer_allergia": "Igen" | "Nem",
  "gyogyszer_allergia_reszletek": "...",
  "egyeb_allergia": "...",
  "verhigito": "Igen" | "Nem",
  "varandos_vagy_szoptat": "Igen" | "Nem",
  "pacemaker": "Igen" | "Nem",
  "cukorbetegseg": "Igen" | "Nem",
  "magas_vernyomas": "Igen" | "Nem",
  "alacsony_e_a_vernyomasa": "Igen" | "Nem",
  "szivbetegseg": "Igen" | "Nem",
  "pajzsmirigy": "Igen" | "Nem",
  "csontritkulas": "Igen" | "Nem",
  "epilepszia": "Igen" | "Nem",
  "milyen_okkal_keresett_fel": "...",
  "allando_gyogyszerek": "..."
}
```

Az anamnézis a `PatientProfile.tsx`-ben inline renderelődik, piros (`text-destructive`) riasztásokkal a kritikus adatokhoz (allergia, vérhígító, pacemaker, stb.).

---

## 3. Fogászati Státusz: `DentalChart`

**Útvonal:** `src/components/patients/dental-chart/DentalChart.tsx`

### Adatbetöltés

```ts
supabase.from('dental_chart').select('*').eq('patient_id', patientId)
```

Az eredmény egy `Record<string, ToothModel>` map, ahol a kulcs a fogszám (`"11"`, `"32"` stb.)

### Interakció

1. A felhasználó kattint egy fogra a `ZsigmondyCross`-on
2. `setSelectedTooth(toothNum)` fut
3. A `ToothEditorPanel` megjelenik alatta
4. Mentéskor `handleSaveTooth(t: ToothModel)` fut:
   - Ha a foghoz már van rekord → `UPDATE` a `dental_chart` táblában
   - Ha nincs → `INSERT`
5. Mentés után `window.dispatchEvent(new Event('dental-chart-updated'))` esemény is frissíti a nézetet

### `ToothModel` típus

```ts
type ToothModel = {
  id?: string;
  patient_id?: string;
  tooth_number: string;
  status: string;           // Pl. "caries", "crown_zirconium" – lásd statuses.json
  surfaces: string | null;  // Pl. "mesial,occlusal"
  mobility?: number | null;
  percussion_sensitive?: boolean | null;
  periapical_lesion?: boolean | null;
  gum_recession_mm?: number | null;
  pocket_depth_mm?: number | null;
  prosthetic_type?: string | null;
  prosthetic_material?: string | null;
  prosthetic_shade?: string | null;
  implant_system?: string | null;
  implant_diameter?: number | null;
  implant_length?: number | null;
  implant_date?: string | null;
  percussion?: string | null;
  sensitivity?: string | null;
  dental_signs?: string[] | null;  // BNO kódok tömbje
  notes?: string | null;
};
```

### `statuses.json`

**Útvonal:** `src/components/patients/dental-chart/statuses.json`

728 soros JSON tömb, minden elem:
```json
{ "id": "crown_zirconium", "name": "Cirkónium korona", "group": "Korona", "hasSurfaces": false }
```

Az `id` az, ami az adatbázisban tárolódik. A `name` az ember-olvasható megjelenített név. A `PatientHistoryPanel` is importálja ezt a szótárként való fordításhoz.

**Csoportok:** Általános, Implant, Felépítmények, Periapicalis, Gyökércsap, Caries, Tömés, Csonkfelépítés, Protézis, Korona, Ideiglenes ragasztás, Híd, Gyökértömés, Betétek, Héjak, Speciális

### Tejfogak

A `showBabyTeeth` switch váltja a `ZsigmondyCross`-ban a tejfog nézetet. A tejfogak számai általában 51-85 tartományban vannak (FDI rendszer szerint).

---

## 4. Fogstátusz előzmény: `dental_chart_history`

**Tábla:** `dental_chart_history`

Trigger tábla, automatikusan feltöltődik, amikor a `dental_chart` táblában INSERT, UPDATE vagy DELETE történik.

| Mező | Típus | Leírás |
|------|-------|--------|
| `id` | uuid | PK |
| `patient_id` | uuid | FK → patient_alap_adatok |
| `tooth_number` | text | Fogszám |
| `operation` | text | `'INSERT'`, `'UPDATE'`, `'DELETE'` |
| `old_state` | jsonb | Korábbi állapot (UPDATE/DELETE esetén) |
| `new_state` | jsonb | Új állapot (INSERT/UPDATE esetén) |
| `changed_by` | uuid | FK → profiles.user_id |
| `changed_at` | timestamptz | Változás időpontja |

> **Fontos:** A `PatientHistoryPanel` kiszűri a `DELETE` műveleteket, ezeket nem jeleníti meg felhasználónak (csak admin feladat).

---

## 5. Történet Napló: `PatientHistoryPanel`

**Útvonal:** `src/components/patients/history/PatientHistoryPanel.tsx`

### Props

```ts
interface PatientHistoryPanelProps {
  patientId: string;
}
```

### Adatbetöltés

Párhuzamosan tölt be két forrásból:

1. **`dental_chart_history`** – fogstátusz változások (DELETE nélkül)
2. **`patient_treatment_plans`** – kezelési tervek, itemekkel együtt (`JOIN patient_treatment_plan_items`)

Majd az érintett `changed_by` és `user_id` azonosítók alapján batch-lekérdezi a `profiles` táblát a nevekért és avatar URL-ekért.

### Batch logika

A fogstátusz változásokat **időalapú csoportosítással** (batching) dolgozza fel:

- Ugyanaz a felhasználó (`changed_by`)
- 15 percen belül
- → egyetlen `batched_status_change` esemény

Ha egy batch csak 1 elemet tartalmaz → `status_change` típusú esemény.

```ts
// Batch létrehozása
if (isSameUser && timeDiff <= 15) {
  currentBatch.push(ev);
} else {
  unified.push(createBatchEvent(currentBatch));
  currentBatch = [ev];
}
```

### `UnifiedEvent` típus

```ts
interface UnifiedEvent {
  id: string;
  type: 'status_change' | 'batched_status_change' | 'treatment_plan';
  date: string;             // ISO timestamp
  userId: string | null;
  profile?: { full_name: string; avatar_url: string | null };
  summary: string;          // Pl. "6 fogstátusz módosítás rögzítve"
  icon: JSX.Element;
  rawData: any;             // A nyers DB rekord
  batchedEvents?: any[];    // Batched esetén az összes fog változása
  relatedTeeth?: string[];  // Szűréshez: érintett fogszámok
}
```

### Nézetkezelés

**Alapnézet (kis panel):**
- Összes esemény görgethetően, időrendben (legfrissebb elöl)
- `overflow-y-auto` natív scroll
- "Teljes Napló" gomb a fejlécben → `setShowFullHistory(true)`

**Részletek popup (kis ablak):**
- `Dialog` komponens, megnyílik ha `selectedEvent !== null && !showFullHistory`
- `overflow-y-auto` görgethető tartalom
- Status change esetén: mező-szintű változások táblázatos formában
- Batched esetén: foganként csoportosítva, minden foghoz saját mező-lista
- Kezelési terv esetén: ülések szerint csoportosított tételek

**Teljes napló popup (nagy ablak):**
- `Dialog`, `w-[90vw] h-[85vh]`
- Bal sáv: szűrők (fogszám, orvos, dátum)
- Jobb oldal: `filteredEvents` listája, kinyitható részletekkel

### Szűrők (Teljes Napló nézetben)

| Szűrő | Logika |
|-------|--------|
| Fogszám | `ev.relatedTeeth?.includes(filterTooth)` |
| Orvos | `ev.userId === filterDoctor` |
| Dátum | `ev.date.startsWith(filterDate)` (ISO string prefix match) |
| Strict tooth match | Switch: kezelési terv itemeit is szűri fogszámra |

### Értékfordítás (status IDs → nevek)

```ts
import statusesData from '@/components/patients/dental-chart/statuses.json';

const statusNames: Record<string, string> = {};
statusesData.forEach((s) => { statusNames[s.id] = s.name; });

// Használat a formatValue() függvényben:
if (fieldKey === 'status') return statusNames[val] || val;
```

---

## 6. Hangrögzítés: `NativeVoiceRecordingPanel`

**Útvonal:** `src/components/voice/NativeVoiceRecordingPanel.tsx`

### Props

```ts
interface NativeVoiceRecordingPanelProps {
  treatnotePatientId: string;
  isFlexi?: boolean;           // FlexiDent integráció
  flexiPatientId?: string | null;
  onUploadStart?: () => void;
  onJobStarted?: (jobId: string) => void;
  onJobComplete?: (jobId: string, result: any) => void;
  onJobError?: (jobId: string, error: any) => void;
  className?: string;
}
```

### Felvétel módok (`RecordingMode`)

| Mód | Leírás |
|-----|--------|
| `'treatnote'` | Kezelési terv generálás |
| `'voxis'` | Fogászati státuszfelvétel (AI-alapú) |
| `'ambulans'` | Ambuláns lap kitöltés |

### Folyamat

1. `useVoiceRecorder` hook kezeli a `MediaRecorder` API-t
2. Felvétel `stopRecording()` → WebM blob keletkezik
3. `handleUpload()`: a blobból `File`, feltöltés Supabase Storage-ba
4. Edge Function meghívása: `native-voice-webhook`
5. Job ID visszakapása → `onJobStarted(jobId)` callback
6. `pollJob(jobId)` polling a státuszra
7. Befejezésnél `onJobComplete(jobId, result)` callback

---

## 7. Hangjob lista: `NativeVoiceJobHistory`

**Útvonal:** `src/components/voice/NativeVoiceJobHistory.tsx`

### Props

```ts
interface NativeVoiceJobHistoryProps {
  jobs: VoiceJob[];
  isLoading: boolean;
  selectedJobId: string | null;
  onSelectJob: (job: VoiceJob) => void;
  onJobTerminated?: () => void;
  className?: string;
}
```

### Megjelenítés

- Legfeljebb 10 job (`SIDEBAR_CAP = 10`) látszik, utána "Több..." dialog
- Minden jobhoz: státusz ikon, mód badge, dátum, időtartam
- Kiválasztott job kiemelve (`bg-primary/10` háttér)
- `processing` státuszú jobon "Megszakítás" gomb jelenik meg

### `VoiceJob` típus (unified)

A `useUnifiedVoiceHistory` hook által visszaadott típus egyesíti a `native_voice_jobs` és `voice_jobs` (FlexiDent) táblákat:

```ts
type UnifiedVoiceJob = {
  id: string;
  status: 'processing' | 'completed' | 'error';
  mode: 'treatnote' | 'voxis' | 'ambulans';
  created_at: string;
  completed_at?: string | null;
  result?: any;
  error?: string | null;
  duration_seconds?: number | null;
  complaint?: string | null;
  progress_percent?: number;
  progress_message?: string;
  raw_audio_text?: string;
  claude_cleaned_text?: string;
  treatnote_patient_id?: string;
  isFlexi?: boolean;
};
```

---

## 8. Job eredmény megjelenítése: `VerdiktDisplay`

**Útvonal:** `src/components/voice/VerdiktDisplay.tsx`

Teljes szélességű, a fogászati státusz alatt jelenik meg. Csak akkor renderelődik, ha `selectedNativeJobId !== null`.

### Props (legfontosabbak)

```ts
{
  isLoading: boolean;
  responseData: any;              // A job result JSON
  isSelectedJob: boolean;
  selectedJobMode: string;        // 'treatnote' | 'voxis' | 'ambulans'
  selectedJobPaciensId: string;
  selectedJobError?: string | null;
  selectedJobStatus: string;
  jobId: string;
  userComplaint?: string;
  progressPercent: number;        // 0-100
  progressMessage: string;
  rawAudioText?: string;          // Whisper output
  claudeCleanedText?: string;     // Claude által megtisztított szöveg
  onComplaintSubmitted?: () => void;
  onClose?: () => void;
  onTerminate?: () => Promise<void>;
  voxisReviewPanelNode?: ReactNode; // VoxisReviewPanel node
}
```

Ha a job `voxis` módú és `completed`, a `voxisReviewPanelNode`-ba egy `VoxisReviewPanel` kerül, amely az AI által kinyert fogstátuszokat jeleníti meg áttekintésre/elfogadásra.

---

## 9. Kezelési tervek

**Táblák:**
- `patient_treatment_plans` – terv fejléce (`id`, `patient_id`, `user_id`, `created_at`, stb.)
- `patient_treatment_plan_items` – tételek (`id`, `plan_id`, `fog`, `name`, `szakterulet`, `quantity`, `vizit`, stb.)

A `PatientHistoryPanel` lekéri és megjeleníti ezeket a naplóban. A részletek nézetben ülések (`vizit` szám) szerint vannak csoportosítva.

---

## 10. Voxis (AI fogstátusz) pipeline

**Voxis folyamat összefoglaló:**

1. Felhasználó felvesz egy hangot `voxis` módban
2. `native-voice-webhook` Edge Function fut:
   - Whisper API → transzkript
   - Claude API → fogszámok + státuszok kinyerése
   - `voxisMapper.ts` → FDI fogszámokra + status ID-kre mappolás
3. A job `completed` állapotba kerül, `result` JSON-ban a fogstátusz adatok
4. `VoxisReviewPanel` megjelenik: az orvos átnézi az AI javaslatait
5. Elfogadáskor a `dental_chart` táblába kerül mentés
6. A mentés triggereli a `dental_chart_history` rekordokat is

**`voxisMapper.ts`** (`src/components/patients/dental-chart/voxisMapper.ts`) – az AI szöveg-kimenetét `ToothModel` objektumokká alakítja, statikus mapping táblák alapján.

---

## 11. Szerepkörök és jogosultságok

A `useUserRole` hook adja meg az `isAdmin` értéket. Az oldal viselkedése:

| Funkció | User | Admin |
|---------|------|-------|
| Páciens adatok megtekintése | ✅ | ✅ |
| Szerkesztés | ✅ | ✅ |
| Fogstátusz szerkesztése | ✅ | ✅ |
| Hangfelvétel | ✅ | ✅ |
| "Clean user" (fogstátusz törlése) | ❌ | ✅ |

---

## 12. Fontos hook-ok

| Hook | Fájl | Leírás |
|------|------|--------|
| `useProfile` | `src/hooks/useProfile.ts` | Bejelentkezett felhasználó profilja (company_id, voice_recording_preference, stb.) |
| `useUserRole` | `src/hooks/useUserRole.ts` | `isAdmin`, `isKlinikaAdmin` flag-ek |
| `useUnifiedVoiceHistory` | `src/hooks/useUnifiedVoiceHistory.ts` | Egyesített native + flexi job lista + polling |
| `useVoiceRecorder` | `src/hooks/useVoiceRecorder.ts` | MediaRecorder kezelés, pause/resume |
| `useSzotar` | `src/hooks/useSzotar.ts` | Klinikai szótár, FlexiDent domain |

---

## 13. Custom Events

| Event neve | Mikor tüzel | Ki figyeli |
|------------|------------|------------|
| `dental-chart-updated` | Fog mentés után | `DentalChart.useEffect` |

```ts
window.dispatchEvent(new Event('dental-chart-updated'));
```

---

## 14. Ismert korlátok / TO-DO

- A `PatientProfile.tsx`-ben a `leftColumnRef` / `rightColumnRef` alapú magasság-szinkronizáció (`ResizeObserver`) részben még jelen van a kódban, de a grid `items-stretch` miatt már nem szükséges – refaktorálható.
- A `NativeVoiceRecordingPanel` `className` prop fogadásra kész, de a komponens signature-ban külön kell destructuring-olni (`& { className?: string }`).
- A "Tooth" ikon nem létezik a jelenlegi `lucide-react` verzióban – fogszámokhoz a `Hash` ikont kell használni helyette.
- `ScrollArea` (shadcn) flexibilis konténerben nem működik megbízhatóan – helyette natív `overflow-y-auto` div ajánlott.

---

## 15. Fájlstruktúra összefoglaló

```
src/
├── pages/
│   └── PatientProfile.tsx              # Fő oldal
├── components/
│   ├── patients/
│   │   ├── NewPatientWizard.tsx        # Szerkesztő wizard
│   │   ├── NewPatientForm.tsx          # Szerkesztő form
│   │   ├── dental-chart/
│   │   │   ├── DentalChart.tsx         # Zsigmondy fogív
│   │   │   ├── ZsigmondyCross.tsx      # Fogív SVG/HTML render
│   │   │   ├── Tooth.tsx               # Egyedi fog komponens
│   │   │   ├── ToothEditorPanel.tsx    # Fog szerkesztő panel
│   │   │   ├── ToothDialog.tsx         # Fog részletek dialógus
│   │   │   ├── ToothHistoryDialog.tsx  # Fog egyéni előzmény
│   │   │   ├── VoxisReviewPanel.tsx    # AI státusz jóváhagyás
│   │   │   ├── TreatnoteReviewPanel.tsx# Kezelési terv jóváhagyás
│   │   │   ├── voxisMapper.ts          # AI output → ToothModel
│   │   │   ├── statuses.json           # Összes fogstátusz definíció
│   │   │   ├── types.ts                # ToothModel, DentalStatusDef
│   │   │   └── constants.ts
│   │   └── history/
│   │       └── PatientHistoryPanel.tsx # Előzmény napló
│   └── voice/
│       ├── NativeVoiceJobHistory.tsx   # Job lista sidebar
│       ├── NativeVoiceRecordingPanel.tsx # Felvétel panel
│       ├── VerdiktDisplay.tsx          # Job eredmény nézet
│       └── CustomAudioPlayer.tsx       # Egyedi lejátszó
├── hooks/
│   ├── useProfile.ts
│   ├── useUserRole.ts
│   ├── useUnifiedVoiceHistory.ts
│   ├── useVoiceRecorder.ts
│   └── useSzotar.ts
└── stores/
    └── dentalStore.ts                  # Zustand store (fogadat lokális state)
```
