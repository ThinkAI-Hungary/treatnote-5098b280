

# BNO Embedding Backfill Javítás - API Limit Megkerülése

## Probléma Összefoglalása

A jelenlegi edge function **két helyen** is a Supabase 1000-es API limitbe ütközik:

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         HIBÁS LEKÉRDEZÉSEK                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. supabase.from("bno_embeddings").select("bno_code_id")          │
│     → Max 1000 sor (pedig 1000+ van)                               │
│                                                                     │
│  2. supabase.from("bno_codes").select("id, code, name")            │
│     → Max 1000 sor (pedig 11,698 van)                              │
│                                                                     │
│  Eredmény: A függvény azt hiszi, hogy 1000 kód van, mind           │
│            rendelkezik embedding-gel → "job complete!"              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Jelenlegi állapot az adatbázisban:**
- `bno_codes`: 11,698 sor
- `bno_embeddings`: 1,000 sor (1,000 distinct bno_code_id)
- **Hiányzó embeddings: 10,698**

## Meglévő Infrastruktúra (nem kell módosítani)

A `bno_embeddings` tábla már rendelkezik:
- ✅ UNIQUE constraint: `(bno_code_id, text_source, source_type)` - ez biztosítja az UPSERT működést
- ✅ `upsert_bno_embedding` RPC függvény - ON CONFLICT-tal működik
- ✅ Foreign key a `bno_codes` táblához

## Megoldás: SQL RPC Függvények

Új SQL függvények létrehozása, amelyek a szűrést és számolást **adatbázis oldalon** végzik:

```text
┌─────────────────────────────────────────────────────────────────────┐
│                      JAVÍTOTT ARCHITEKTÚRA                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Edge Function                                                      │
│       │                                                             │
│       ├─▶ supabase.rpc("get_bno_codes_without_embeddings",         │
│       │                 { p_limit: 50 })                            │
│       │   → Visszaad max 50 kódot, aminek NINCS embedding-je       │
│       │                                                             │
│       ├─▶ supabase.rpc("count_bno_codes_without_embeddings")       │
│       │   → Visszaadja a hiányzó embeddings számát (pl. 10648)     │
│       │                                                             │
│       ├─▶ OpenAI embeddings generálás                              │
│       │                                                             │
│       └─▶ supabase.rpc("upsert_bno_embedding", {...})              │
│           → Mentés (már létezik, működik)                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementációs Lépések

### 1. lépés: SQL Migration - Új RPC Függvények

```sql
-- Batch lekérdezés: hiányzó embedding-ek
CREATE OR REPLACE FUNCTION get_bno_codes_without_embeddings(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (id UUID, code TEXT, name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT bc.id, bc.code, bc.name
  FROM bno_codes bc
  LEFT JOIN bno_embeddings be ON bc.id = be.bno_code_id
  WHERE be.id IS NULL
  ORDER BY bc.code
  LIMIT p_limit;
$$;

-- Számláló: hány embedding hiányzik még
CREATE OR REPLACE FUNCTION count_bno_codes_without_embeddings()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COUNT(*)
  FROM bno_codes bc
  LEFT JOIN bno_embeddings be ON bc.id = be.bno_code_id
  WHERE be.id IS NULL;
$$;
```

### 2. lépés: Edge Function Módosítása

A `supabase/functions/generate-bno-embeddings/index.ts` átírása:

**RÉGI kód (hibás):**
```typescript
// 1000-es limitbe ütközik mindkét lekérdezés
const { data: existingEmbeddings } = await supabase
  .from("bno_embeddings")
  .select("bno_code_id");

const { data: allCodes } = await supabase
  .from("bno_codes")
  .select("id, code, name");

const codesToProcess = allCodes.filter(...).slice(0, 50);
```

**ÚJ kód (javított):**
```typescript
// RPC hívások - nincs API limit
const { data: codesToProcess } = await supabase.rpc(
  "get_bno_codes_without_embeddings", 
  { p_limit: BATCH_SIZE }
);

const { data: totalRemaining } = await supabase.rpc(
  "count_bno_codes_without_embeddings"
);
```

## Változtatások Összefoglalása

| Fájl | Művelet | Leírás |
|------|---------|--------|
| SQL Migration | Létrehozás | `get_bno_codes_without_embeddings()` és `count_bno_codes_without_embeddings()` RPC függvények |
| `supabase/functions/generate-bno-embeddings/index.ts` | Módosítás | Client-side szűrés cseréje RPC hívásokra |

## Embedding Szöveg Formátum

A jelenlegi implementáció a `name` mezőt használja embedding forrásként:
```typescript
const texts = codesToProcess.map(c => c.name);
```

Ez megfelelő, mert:
- A `name` mező tartalmazza a BNO kód magyar nevét (pl. "Hastífusz")
- A szemantikus keresés a betegség nevére keres
- A `code` mező (pl. "A01.0") nem ad hozzá szemantikus jelentést

## Biztonsági Jellemzők

- **UPSERT**: A meglévő `upsert_bno_embedding` RPC ON CONFLICT-tal működik
- **Idempotens**: Újrafuttatás nem hoz létre duplikátumokat
- **Konkurencia-biztos**: Párhuzamos futtatások nem zavarják egymást
- **Service Role**: Az edge function service role kulcsot használ (nincs RLS limit)

## Várt Eredmény

A javítás után:
- A job helyesen detektálja a ~10,698 hiányzó embeddinget
- Percenként 50 kódot dolgoz fel
- ~214 perc (~3.5 óra) alatt befejeződik a backfill
- A logokban: `Remaining: 10648 → 10598 → ...` csökkenő értékek

## Technikai Részletek

### Edge Function Új Logika

```typescript
serve(async (req) => {
  // ... CORS, env vars ...
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Lekérdezés: hiányzó kódok (max BATCH_SIZE)
  const { data: codesToProcess, error: fetchError } = await supabase.rpc(
    "get_bno_codes_without_embeddings",
    { p_limit: BATCH_SIZE }
  );

  // 2. Számláló: összes hiányzó
  const { data: totalRemaining } = await supabase.rpc(
    "count_bno_codes_without_embeddings"
  );

  console.log(`Total remaining: ${totalRemaining}, Processing: ${codesToProcess?.length || 0}`);

  // 3. Ha nincs mit feldolgozni, kész
  if (!codesToProcess || codesToProcess.length === 0) {
    console.log("All BNO codes have embeddings - job complete!");
    return new Response(JSON.stringify({ complete: true }));
  }

  // 4. OpenAI embedding generálás
  const texts = codesToProcess.map(c => c.name);
  const embeddings = await generateEmbeddings(texts, openaiApiKey);

  // 5. Upsert az adatbázisba
  for (let i = 0; i < codesToProcess.length; i++) {
    await supabase.rpc("upsert_bno_embedding", {
      p_bno_code_id: codesToProcess[i].id,
      p_text_source: codesToProcess[i].name,
      p_source_type: "name",
      p_embedding: `[${embeddings[i].join(",")}]`
    });
  }

  return new Response(JSON.stringify({
    processed: codesToProcess.length,
    remaining: totalRemaining - codesToProcess.length
  }));
});
```

### Cron Job

A cron job már be van állítva és fut percenként. A javítás után automatikusan folytatja a feldolgozást a helyes logikával.

