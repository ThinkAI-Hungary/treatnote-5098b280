# TreatNote – Teljes Rendszer Dokumentáció

> **AI Tesztelőnek:** Az oldalt mindig ezzel a felhasználóval teszteld:
> - **Email:** zsolt@gmail.com
> - **Jelszó:** Zsolt123

---

## 1. Alapinfók

| Mező | Érték |
|---|---|
| **Local dev** | `npm run dev` → http://localhost:8080 |
| **Prod (Lovable)** | https://bpjzgapmoyhtgryglcke.lovable.app |
| **Stack** | React + Vite + TypeScript + TailwindCSS + Supabase |
| **Projekt mappa** | `c:\Users\Zombo\Desktop\Antigrav\TreatNote\treatnote` |

---

## 2. Supabase

| Mező | Érték |
|---|---|
| **Project ID** | `bpjzgapmoyhtgryglcke` |
| **URL** | https://bpjzgapmoyhtgryglcke.supabase.co |
| **Dashboard** | https://supabase.com/dashboard/project/bpjzgapmoyhtgryglcke |
| **SQL Editor** | https://supabase.com/dashboard/project/bpjzgapmoyhtgryglcke/sql |
| **Edge Functions** | https://supabase.com/dashboard/project/bpjzgapmoyhtgryglcke/functions |
| **Anon Key** | `.env.local`-ban: `VITE_SUPABASE_PUBLISHABLE_KEY` |
| **Service Role Key** | Csak a Supabase Dashboard-on + edge function runtime-ban él (`SUPABASE_SERVICE_ROLE_KEY`) |

### Edge function deploy parancs
```powershell
cd c:\Users\Zombo\Desktop\Antigrav\TreatNote\treatnote
npx supabase functions deploy <function-neve>
```

---

## 3. Szerepkörök & Jogosultságok

| Szerepkör | Mit tud |
|---|---|
| `admin` | Mindent – globális szuperadmin (csak `user_roles` táblában) |
| `klinika_admin` | Saját telephely kezelése, meghívók küldése, billing, PDF upload |
| `user` | Betegek, hangfelvétel, dental chart |

A szerepkör kéthelyen él: `user_roles` (legacy/global) + `telephely_memberships` (modern, telephely-szintű). Mindig mindkettőt szinkronizálni kell.

---

## 4. Oldal Route-ok

| Route | Oldal | Hozzáférés |
|---|---|---|
| `/` | Landing / Index | Public |
| `/auth` | Bejelentkezés | Public |
| `/solo-register` | Egyéni regisztráció | Public |
| `/register` | Meghívott felhasználó regisztrációja | Public |
| `/accept-invitation?token=...` | Meghívó elfogadás | Public |
| `/dashboard` | Főoldal – statisztikák | Auth |
| `/patients` | Beteg lista | Auth |
| `/patients/:id` | Beteg profil (dental chart, hangfelvétel, history) | Auth |
| `/voice-recording` | Hangfelvétel oldal (Voxis / TreatNote mód) | Auth |
| `/klinika-admin` | Klinika admin panel (tagok, billing, PDF, szótár) | klinika_admin |
| `/admin` | Globális admin panel (összes user, hibák, captcha) | admin |
| `/billing` | Előfizetés kezelés | klinika_admin |
| `/profile` | Profil, Flexi-Dent kapcsolat | Auth |
| `/downloads` | Letöltések | Auth |

---

## 5. Edge Functions – Részletes Leírás

### 5.1 `invitation-handler`
**Cél:** Minden meghívással kapcsolatos művelet egyetlen function-ban.

**Operációk** (JSON body-ban `operation` mező):
| Operáció | Mit csinál |
|---|---|
| `verify-token` | Token alapján visszaadja a meghívó adatait (cég, telephely, meghívó neve) |
| `send-invitation-email` | Létrehozza/frissíti a meghívó rekordot DB-ben, visszaadja az invitation URL-t. **Nem küld emailt magától** – az emailt külön rendszer kezeli (Brevo). Csak `klinika_admin` vagy `admin` hívhatja. |
| `respond-invitation` | Elfogad / elutasít egy meghívót (bejelentkezett usernek). Elfogadásnál: `telephely_memberships` + `user_roles` + `profiles` frissítés. |
| `register-invited-user` | Új user létrehozása meghívóval (token + jelszó + teljes név). Auto-assign elérhető licenc. |
| `check-user` | Email alapján megnézi, hogy létezik-e már a user Supabase Auth-ban. |
| `delete-user-by-email` | **Kikapcsolva** (403 visszatér). |

**DB táblák:** `invitations`, `profiles`, `telephely_memberships`, `user_roles`, `licenses`

---

### 5.2 `solo-register`
**Cél:** Egyéni (solo) regisztráció – új user + új company + telephely + trial licenc egyszerre.

**Flow:**
1. Rate limit check (3 req / 60 perc / IP)
2. `supabase.auth.signUp()` → új user
3. Egyedi slug generálás (ghost company cleanup-pal)
4. `companies` + `telephely` létrehozás
5. `profiles` upsert (`is_solo: true`)
6. `telephely_memberships` → `klinika_admin` szerepkör
7. 14 napos trial `licenses` rekord

**DB táblák:** `companies`, `telephely`, `profiles`, `telephely_memberships`, `user_roles`, `licenses`

---

### 5.3 `native-voice-webhook`
**Cél:** Hangfelvétel fogadása és feldolgozása NATÍVAN (n8n megkerülve), két módban.

**Módok:**
| Mód | Funkció |
|---|---|
| `voxis` | Fogászati státuszfelvétel (dental chart adatok kinyerése) |
| `treatnote` | Kezelési terv generálás |

**Flow:**
1. Rate limit check (30 req / 15 perc / user) – de jelenleg BYPASS van rajta teszteléshez
2. Profil lekérése (`company_id`, `telephely_id`)
3. Stale job cleanup (10 percnél régebbi `processing` jobokat töröl)
4. Aktív job check – ha már fut valami, 409 visszatér
5. `native_voice_jobs` rekord létrehozás (`status: processing`)
6. `EdgeRuntime.waitUntil()` – háttérben futtatja:
   - **voxis mód** → `processVoxisInternally()` (OpenAI GPT-4o + ElevenLabs STT + Claude)
   - **treatnote mód** → `processTreatnoteInternally()` (ugyanaz, más prompt)
7. Azonnali `{ success: true, job_id }` válasz a frontendnek

**Frontend polling:** A frontend a `native_voice_jobs` táblát pollozza Supabase Realtime-on keresztül, `progress_percent` + `progress_message` alapján mutatja a folyamatot.

**API kulcsok amik kellenek:** `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`

**DB táblák:** `native_voice_jobs`, `profiles`, `dental_chart`, `dental_chart_history`, `patient_treatment_plans`, `patient_treatment_plan_items`

---

### 5.4 `voice-recording-webhook`
**Cél:** Régi pipeline – hangfelvételt továbbítja n8n-nek (nem natív). Párhuzamosan él a natív pipeline-nal.

**Flow:**
1. Rate limit (10 req / 15 perc)
2. Profil + Flexi-Dent adatok lekérése (`flexi_auth` tábla, AES-256-GCM dekriptálással)
3. `telephely.flexi_domain` + `feltoltott_pdf` szabályok lekérése
4. `treatment_rules` lekérése (treatnote módban)
5. `voice_jobs` rekord létrehozás
6. n8n webhook hívás háttérben (`EdgeRuntime.waitUntil`)
   - Voxis mód → `N8N_VOXIS_WEBHOOK_URL`
   - TreatNote mód → `N8N_TREATNOTE_WEBHOOK_URL`
   - Ambuláns mód → `TREATNOTE_AMBULANSLAP`
7. Azonnali job_id visszaadás

**DB táblák:** `voice_jobs`, `profiles`, `flexi_auth`, `telephely`, `feltoltott_pdf`, `treatment_rules`

---

### 5.5 `treatnote-callback`
**Cél:** n8n befejezéskor értesíti a Supabase-t (webhook endpoint n8n felé).

**Flow:** n8n `POST`-ol ide → `voice_jobs` tábla frissül `completed`/`error`-ra → frontend polling észleli.

---

### 5.6 `extraction-callback`
**Cél:** PDF feldolgozás callback n8n-től. HMAC-SHA256 aláírással védett.

**Flow:** n8n kész a PDF kinyeréssel → `pdf_extractions` rekord insert → `feltoltott_pdf.webhook_status` frissítés (`processed`/`error`).

---

### 5.7 `szabalyepito-teszt-webhook`
**Cél:** PDF feltöltés → szabályok (treatment_rules) generálása n8n-en keresztül.

**Flow:**
1. `szotar` + `szotar_kezelesek` lekérése (kontextushoz)
2. HMAC-SHA256 aláírással elküldi n8n-nek
3. **Szinkron** `await processPdf(...)` – max 4 kísérlet (retry 30s/60s/90s)
4. n8n visszaad `extractions[]` → `treatment_rules` + `rule_visits` + `rule_items` insert
5. OpenAI `text-embedding-3-large` embeddings generálása → `treatment_embeddings`

**Fontos:** Ez NEM használ `EdgeRuntime.waitUntil()` – szinkron, a frontend várja a választ.

**DB táblák:** `rule_generation_jobs`, `treatment_rules`, `rule_visits`, `rule_items`, `treatment_embeddings`, `szotar`, `szotar_kezelesek`

---

### 5.8 `flexi-connect`
**Cél:** Flexi-Dent bejelentkezési adatok elmentése (email + jelszó AES-256-GCM titkosítással).

**Flow:**
1. n8n-nek elküldi a Flexi credentials-t → visszaad 1 (OK) vagy 0 (hiba)
2. Ha OK: jelszó titkosítás → `flexi_auth` upsert (telephely-szintű)
3. Globális uniqueness check: egy Flexi fiók csak egy TreatNote userhez kötődhet

**DB táblák:** `flexi_auth`, `profiles`, `telephely`

---

### 5.9 Stripe billing functions

| Function | Mit csinál |
|---|---|
| `create-checkout-session` | Stripe Checkout session létrehozás (embedded vagy redirect). Csak `klinika_admin`. |
| `stripe-webhook` | Stripe eventeket dolgoz fel (payment_succeeded, subscription.updated, subscription.deleted). Licencek szinkronizálása. Számlázz.hu integráció. |
| `create-portal-session` | Stripe Customer Portal link generálás |
| `create-setup-intent` | Új kártya hozzáadáshoz setup intent |
| `get-subscription` | Aktív előfizetés lekérése |
| `get-billing-details` | Számlázási adatok |
| `list-invoices` | Számlák listája |
| `cancel-subscription` | Előfizetés lemondás |
| `cancel-license` | Egy licenc lemondása |
| `switch-plan` | Csomag váltás |
| `switch-license-interval` | Havi/éves váltás |
| `update-seats` | Licensz szám módosítás |
| `set-default-payment-method` | Alapértelmezett fizetési mód |
| `delete-payment-method` | Kártya törlés |
| `get-stripe-publishable-key` | Stripe public key kiadása frontendnek |
| `get-prices` | Stripe árlisták |

**Stripe Price ID-k:**
- Havi: `price_1TABODDG9IVOU80sYHim2VsD`
- (Éves lejárt, már nem aktív)

**Külső integráció:** Számlázz.hu – sikeres Stripe fizetésnél XML számla küldés (`SZAMLA_AGENT_KEY`)

---

### 5.10 User management functions

| Function | Mit csinál |
|---|---|
| `create-user` | Admin által user létrehozás |
| `delete-user` | Admin által user törlés |
| `get-all-users` | Összes user listája (admin) |
| `get-klinika-admins` | Klinika admin-ok listája |
| `klinika-admin` | Klinika admin műveletek |

---

### 5.11 AI / Embedding functions

| Function | Mit csinál |
|---|---|
| `generate-bno-embeddings` | BNO kódok embedding generálás (OpenAI) → `bno_embeddings` |
| `generate-statusz-embeddings` | Fogászati státusz enum értékek embeddingje → `statusz_embeddings` |
| `generate-szotar-embeddings` | Szótár kezelések embeddingje → `szotar_embeddings` |
| `search-bno-codes` | Szemantikus BNO kód keresés (vektor alapú) |
| `regenerate-rule-embedding` | Egy treatment_rule embedding újragenerálása |
| `import-bno-codes` | BNO kódok batch importálása |

---

### 5.12 Egyéb functions

| Function | Mit csinál |
|---|---|
| `admin-file-manager` | Admin fájlkezelés (Storage) |
| `db-cleanup` | Régi jobokat, árva rekordokat töröl |
| `debug-schema` | Séma debug (fejlesztési) |
| `fix-flexi-constraints` | Flexi constraint javítás (egyszeri migrációs function) |
| `get-file-metadata` | Fájl metaadat lekérése |
| `list-version-files` | Verzió fájlok listája (Downloads oldalhoz) |
| `read-captcha` | Captcha megoldás AI-val (belső tesztelés) |
| `szabalyok-webhook` | Szabályok webhook (régebbi pipeline) |
| `szabalyepito-teszt-callback` | Szabályépítő callback |
| `szotar-webhook` | Szótár feltöltés webhook |
| `szotar-callback` | Szótár callback n8n-től |
| `szotar-rules-webhook` | Szótár szabályok webhook |

---

## 6. Adatbázis Táblák

### Felhasználói rendszer
| Tábla | Leírás | Sorok |
|---|---|---|
| `companies` | Cégek (company_id mindenhol a gyökér) | 15 |
| `telephely` | Telephelyek (cég alá tartoznak, `flexi_domain` itt van) | 17 |
| `profiles` | User profilok (`company_id`, `current_telephely_id`, `is_solo`) | 23 |
| `telephely_memberships` | User ↔ Telephely kapcsolat + szerepkör | 18 |
| `user_roles` | Legacy szerepkör tábla (`admin`/`klinika_admin`/`user`) | 21 |
| `invitations` | Meghívók (token, status, expires_at) | 7 |
| `licenses` | Licenszek (Stripe-hoz kötve, `trial`/`paid`) | 2 |

### Beteg adatok
| Tábla | Leírás | Sorok |
|---|---|---|
| `patient_alap_adatok` | Beteg törzsadatok (főtábla, FDI-s fogászati rendszerrel) | 31 |
| `dental_chart` | Fogészat állapot foganként (`tooth_number` FDI kód) | 960 |
| `dental_chart_history` | Minden dental chart változás naplója | 18 |
| `patient_treatment_plans` | Kezelési tervek (voice job-hoz kötve) | 1 |
| `patient_treatment_plan_items` | Kezelési terv sorok (vizit, fog, kezelés neve) | 21 |

### Hangfelvétel / AI pipeline
| Tábla | Leírás | Sorok |
|---|---|---|
| `native_voice_jobs` | Natív (n8n nélküli) hangfelvétel jobok. `progress_percent`, `progress_message`, `trace_logs` | 149 |
| `voice_jobs` | Régi n8n pipeline jobjai. `result` JSONB-ben az n8n válasz | 149 |
| `voice_job_complaints` | Felhasználói visszajelzések hibás jobokról | 0 |

### Szabályok / AI tudásbázis
| Tábla | Leírás | Sorok |
|---|---|---|
| `treatment_rules` | Kezelési szabályok (clinic_id = telephely_id) | 208 |
| `rule_visits` | Vizit-leírások egy szabályhoz | 399 |
| `rule_items` | Egy viziten belüli tételek (név, mennyiség, skálázás) | 1159 |
| `treatment_embeddings` | Treatment rule vektorok (OpenAI text-embedding-3-large) | 1296 |
| `statusz_embeddings` | Fogászati státusz enum labelek vektorai | 158 |
| `szotar` | Szótár tartalom (telephely-szintű, JSONB) | 1 |
| `szotar_kezelesek` | Szótár kezelések listája | 6902 |
| `szotar_embeddings` | Szótár vektorok | 6902 |
| `bno_codes` | BNO diagnosztikai kódok | 11698 |
| `bno_embeddings` | BNO vektorok | 11698 |
| `rule_generation_jobs` | PDF feldolgozás job queue | 627 |
| `feltoltott_pdf` | Feltöltött PDF-ek nyilvántartása | 0 |
| `pdf_extractions` | PDF feldolgozás eredménye | 0 |
| `szabalyepito_teszt_extractions` | Szabályépítő teszt extrakciók | 0 |

### Billing / Flexi
| Tábla | Leírás | Sorok |
|---|---|---|
| `stripe_events` | Stripe webhook idempotency (event_id unique) | 209 |
| `szamlazz_invoices` | Számlázz.hu számlák állapota | 0 |
| `flexi_auth` | Flexi-Dent bejelentkezési adatok (AES titkosított jelszóval) | 7 |

### Monitoring / Misc
| Tábla | Leírás | Sorok |
|---|---|---|
| `error_logs` | Alkalmazás hibanaplók (severity: info/warning/error) | 149 |
| `rate_limits` | Rate limiting nyilvántartás | 10 |
| `captcha_vector` | Captcha megoldási vectorok (belső AI tesztelés) | 194 |

---

## 7. Hangfelvétel Pipeline – Voxis mód (natív)

```
User → [NativeVoiceRecordingPanel] → POST /native-voice-webhook
                                          ↓
                              native_voice_jobs (status: processing)
                                          ↓ EdgeRuntime.waitUntil()
                              processVoxisInternally()
                                ├── ElevenLabs STT (audio → szöveg)
                                ├── Claude (szöveg tisztítás + FDI konverzió)
                                ├── OpenAI GPT-4o (structured JSON kinyerés)
                                │   (TOOTH_ENUM_VALUES enum alapján)
                                ├── dental_chart UPDATE per fog
                                └── dental_chart_history INSERT

Frontend ← Supabase Realtime polling ← native_voice_jobs.progress_percent
```

**Kulcspont:** A `process-statusz-internal.ts` fájl tartalmaz egy **1500+ soros prompt**-ot amely az FDI fogszámozást, híd logikát, és az összes dental chart enum értéket kezeli.

---

## 8. Hangfelvétel Pipeline – TreatNote mód (natív)

```
User → [PatientVoiceRecording] → POST /native-voice-webhook (mode=treatnote)
                                          ↓
                              processTreatnoteInternally()
                                ├── ElevenLabs STT
                                ├── Claude szöveg tisztítás
                                ├── OpenAI: kezelés ↔ treatment_rules matching
                                │   (szotar_kezelesek + treatment_embeddings alapján)
                                ├── patient_treatment_plans INSERT
                                └── patient_treatment_plan_items INSERT

Frontend ← native_voice_jobs polling → VerdiktDisplay komponens
```

---

## 9. PDF → Szabályok Pipeline

```
KlinikaAdmin oldal → PDF base64 → POST /szabalyepito-teszt-webhook
                                          ↓
                              rule_generation_jobs (pending)
                                          ↓ (szinkron, await-el)
                              n8n webhook (N8N_SZABALYEPITO_TESZT_WEBHOOK_URL)
                              + secondary fallback URL
                                          ↓ 4 retry logika
                              extractions[] visszakapva
                                ├── treatment_rules INSERT (fogalom, kategoria)
                                ├── rule_visits INSERT
                                ├── rule_items INSERT
                                └── treatment_embeddings (OpenAI text-embedding-3-large)
```

---

## 10. Meghívó Flow

```
KlinikaAdmin → [InvitationForm] → POST invitation-handler (send-invitation-email)
                                         ↓
                               invitations rekord létrehozás/frissítés
                               + invitation_url visszaadva
                                         ↓
                               [Külső email küldés – Brevo]
                                         ↓
User kap emailt → /accept-invitation?token=...
    ├── verify-token → invitation adatok
    ├── check-user → létezik-e a user?
    │
    ├── ÚJ USER → register-invited-user (jelszó beállítás)
    │              → auth user létrehozás + profile + membership + license
    │
    ├── LÉTEZŐ USER, nem bejelentkezve → login form
    │
    └── BEJELENTKEZETT USER → respond-invitation (accept/decline)
                              → telephely_memberships + user_roles sync
```

---

## 11. Külső Szolgáltatások

| Szolgáltatás | Mire használják | Env változó |
|---|---|---|
| **OpenAI** | GPT-4o (AI extraction), text-embedding-3-large (vektorok) | `OPENAI_API_KEY` |
| **ElevenLabs** | STT – audio → szöveg átirat | `ELEVENLABS_API_KEY` |
| **Anthropic Claude** | Szöveg tisztítás, FDI konverzió | `ANTHROPIC_API_KEY` |
| **Stripe** | Előfizetés, billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SIGNING_SECRET` |
| **Számlázz.hu** | Magyar számla generálás Stripe fizetés után | `SZAMLA_AGENT_KEY` |
| **n8n** | AI workflow automation (PDF feldolgozás, régi voice pipeline) | Több `N8N_*` URL |
| **Brevo** | Email küldés (meghívók) | `BREVO_API_KEY` |
| **Flexi-Dent** | Fogászati szoftver integráció (beteg adatok szinkron) | `N8N_FLEXI_WEBHOOK_URL`, `FLEXI_ENCRYPTION_KEY` |
| **Frankfurter API** | MNB árfolyam lekérés (Számlázz.hu-hoz) | Nincs kulcs, nyilvános |

---

## 12. Gyors Debugging Guide

### Ha egy voice job beragad `processing`-ban
```sql
-- native pipeline
UPDATE native_voice_jobs
SET status = 'error', error = 'Manual reset', completed_at = NOW()
WHERE status = 'processing' AND created_at < NOW() - INTERVAL '10 minutes';

-- régi n8n pipeline
UPDATE voice_jobs
SET status = 'error', error = 'Manual reset', completed_at = NOW()
WHERE status = 'processing' AND created_at < NOW() - INTERVAL '10 minutes';
```

### Ha egy PDF job beragad
```sql
UPDATE rule_generation_jobs
SET status = 'error', error_message = 'Manual reset', completed_at = NOW()
WHERE status = 'processing' AND created_at < NOW() - INTERVAL '10 minutes';
```

### Hiba logok megnézése
```sql
SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 50;
```

### User szerepkör ellenőrzése
```sql
SELECT ur.user_id, ur.role, p.full_name
FROM user_roles ur
JOIN profiles p ON p.user_id = ur.user_id
ORDER BY p.full_name;
```

---

## 13. Kulcsfontosságú Fájlok

| Fájl | Mi van benne |
|---|---|
| `supabase/functions/native-voice-webhook/process-statusz-internal.ts` | 1500+ soros Voxis AI feldolgozó (TOOTH_ENUM_VALUES, cleaner prompt, JSON extraction) |
| `supabase/functions/native-voice-webhook/process-treatnote-internal.ts` | TreatNote kezelési terv generálás |
| `supabase/functions/stripe-webhook/index.ts` | Teljes Stripe + Számlázz.hu integráció |
| `src/pages/VoiceRecording.tsx` | Hangfelvétel oldal UI |
| `src/components/patients/PatientVoiceRecording.tsx` | Beteg oldalon lévő hangfelvétel panel |
| `src/components/voice/NativeVoiceRecordingPanel.tsx` | Natív hangfelvétel UI komponens |
| `src/pages/KlinikaAdmin.tsx` | Klinika admin panel (billing, PDF, szótár, tagok) |
| `src/pages/Admin.tsx` | Globális admin panel |
| `src/pages/PatientProfile.tsx` | Beteg profil oldal |
| `src/components/patients/dental-chart/` | Dental chart komponensek |
| `.env.local` | Összes API kulcs lokálisan |
