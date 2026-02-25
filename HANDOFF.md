# TreatNote – Session Handoff Document
**Generated:** 2026-02-24 18:28 (CET)

---

## 🗂️ Project

| Field | Value |
|---|---|
| **Project name** | TreatNote |
| **Local path** | `c:\Users\Zombo\Desktop\Antigrav\TreatNote\treatnote` |
| **Dev server** | `npm run dev` → http://localhost:8080 |
| **Stack** | React + Vite + TypeScript + TailwindCSS + Supabase |

---

## 🔑 Supabase Credentials

| Field | Value |
|---|---|
| **Project ID** | `bpjzgapmoyhtgryglcke` |
| **Supabase URL** | `https://bpjzgapmoyhtgryglcke.supabase.co` |
| **Anon/Publishable Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw` |
| **Service Role Key** | Stored inside Supabase edge functions env (not in `.env`). Available in Supabase Dashboard → Settings → API |
| **Dashboard** | https://supabase.com/dashboard/project/bpjzgapmoyhtgryglcke |
| **SQL Editor** | https://supabase.com/dashboard/project/bpjzgapmoyhtgryglcke/sql |
| **Edge Functions** | https://supabase.com/dashboard/project/bpjzgapmoyhtgryglcke/functions |

> [!IMPORTANT]
> Service Role Key is **NOT** in the `.env` file. It only lives in the Supabase Dashboard and inside the edge function runtime as `SUPABASE_SERVICE_ROLE_KEY`.

---

## 🌐 Deployed App

| Environment | URL |
|---|---|
| Production (Lovable) | `https://bpjzgapmoyhtgryglcke.lovable.app` |
| Local dev | `http://localhost:8080` |

---

## ⚙️ Edge Functions (deployed to Supabase)

| Function | Purpose |
|---|---|
| `invitation-handler` | Handles all invitation operations: `verify-token`, `send-invitation-email`, `respond-invitation`, `register-invited-user`, `check-user` |
| `szabalyepito-teszt-webhook` | Receives PDF uploads, calls n8n webhook synchronously, stores extracted rules |

### How to deploy edge functions

```powershell
cd c:\Users\Zombo\Desktop\Antigrav\TreatNote\treatnote
npx supabase functions deploy invitation-handler
npx supabase functions deploy szabalyepito-teszt-webhook
```

---

## 🗃️ Key Database Tables

| Table | Purpose |
|---|---|
| `invitations` | Stores pending/accepted/declined invitations with tokens |
| `profiles` | User profiles with `company_id`, `telephely_id`, `current_telephely_id`, `full_name` |
| `telephely_memberships` | Many-to-many: user ↔ telephely with role (`user` / `klinika_admin`) |
| `user_roles` | Legacy role table (`admin` / `klinika_admin` / `user`) — synced on every membership change |
| `companies` | Company records |
| `telephely` | Site/location records belonging to a company |
| `rule_generation_jobs` | PDF processing job queue (`pending` → `processing` → `done` / `error`) |
| `szabalyepito_teszt_extractions` | Extracted rules from PDF uploads |
| `licenses` | License seats assigned per company/user |

---

## 🔧 What We Did This Session

### 1. PDF Upload Timeout Fix
**Problem:** Edge function used `EdgeRuntime.waitUntil()` for background PDF processing. Background tasks were killed after ~30s, but n8n takes 1–2 min per PDF → jobs stuck as `processing`.

**Fix applied:**
- **`supabase/functions/szabalyepito-teszt-webhook/index.ts`** — Removed `EdgeRuntime.waitUntil()`, replaced with synchronous `await processPdf(...)`. Now returns `{ inserted, duplicates, embeddings }` directly to frontend.
- **`src/components/klinika/SzabalyepitoTesztTab.tsx`** — Replaced `Promise.all` parallel uploads with a sequential `for...of` loop. Shows progress `"Feldolgozás: 3/8 PDF..."`. 1s delay between PDFs. Added `uploadProgress` state.

**SQL to clear stuck jobs (run in Supabase SQL Editor if needed):**
```sql
UPDATE rule_generation_jobs
SET status = 'error',
    error_message = 'Background task killed by runtime timeout',
    completed_at = NOW(),
    updated_at = NOW()
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '10 minutes';
```

---

### 2. Invitation / Registration Flow Fix
**Problem:** When a new user clicked an invitation link, they saw a login-only form ("Meghívás elfogadása" with just Felhasználónév + Jelszó). The registration form changes had been made to `Register.tsx` but users land on `AcceptInvitation.tsx`.

**Fix applied:**
- **`src/pages/AcceptInvitation.tsx`** — Rewrote to handle 3 flows:
  1. **New user** (email not in Supabase auth) → shows **Teljes név** + locked/read-only invited email + **Jelszó** + **Jelszó megerősítése** → "Regisztráció és elfogadás" button. Calls `register-invited-user` operation.
  2. **Existing user, not logged in** → shows login form (Felhasználónév + Jelszó).
  3. **Already logged in** → shows Accept / Decline buttons.
- Detection: after `verify-token`, calls `check-user` operation to detect if email exists.
- **`supabase/functions/invitation-handler/index.ts`** — Changed invitation URL to always route to `/accept-invitation` (previously new users went to `/register`, existing to `/accept-invitation`).

---

### 3. PDF Upload Abort Button (IN PROGRESS — not yet working)
**Goal:** A red **"Feltöltés leállítása"** button should appear during PDF uploads so the user can cancel remaining files.

**What was implemented:**
- `abortUploadRef = useRef(false)` added
- Loop checks `abortUploadRef.current` between each PDF and breaks
- Button conditionally rendered with `{uploading && <Button variant="destructive">...`

**Current issue:** Button code is in the file (verified lines 352–365 of `SzabalyepitoTesztTab.tsx`) but not appearing in the UI. The `uploading` state appears to not be triggering a re-render for the button. **This needs debugging in the next session.**

---

## 📁 Key Files Modified This Session

| File | What changed |
|---|---|
| `supabase/functions/szabalyepito-teszt-webhook/index.ts` | Sync PDF processing, removed waitUntil |
| `supabase/functions/invitation-handler/index.ts` | Always routes to `/accept-invitation`, `invited_email` returned from `verify-token` |
| `src/components/klinika/SzabalyepitoTesztTab.tsx` | Sequential uploads, progress state, abort ref + stop button |
| `src/pages/AcceptInvitation.tsx` | 3-way flow: new user registration / existing login / logged-in accept-decline |
| `src/pages/Register.tsx` | Has similar registration form but is NOT used by the invitation flow — can be ignored |

---

## 🔁 How to Start the Dev Server

```powershell
cd c:\Users\Zombo\Desktop\Antigrav\TreatNote\treatnote
npm run dev
# → http://localhost:8080
```

## 🔁 How to Deploy Edge Functions

```powershell
cd c:\Users\Zombo\Desktop\Antigrav\TreatNote\treatnote
npx supabase functions deploy invitation-handler
npx supabase functions deploy szabalyepito-teszt-webhook
```

---

## ⏭️ What to Do Next (Open Items)

1. **Debug the abort button** — The `{uploading && ...}` button is in the file but not rendering. Likely a re-render / state issue. Try adding a `console.log(uploading)` inside the render to verify the state actually changes.
2. **Test new user invitation flow** — Send a new invitation to an email that doesn't exist in Supabase yet and verify the registration form shows correctly.
3. **Test PDF upload with 3+ files** — Verify sequential processing, progress counter, and success toast with inserted/duplicate counts.
