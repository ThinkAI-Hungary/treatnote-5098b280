

# BNO Kódok Tábla és Vektor Store Létrehozása

## Összefoglalás

Létrehozunk egy új, klinika- és telephely-független táblát a BNO (Betegségek Nemzetközi Osztályozása) kódok tárolására, vektor embedding támogatással a szemantikus kereséshez.

## Adatstruktúra Elemzése

A feltöltött Excel fájl alapján:
- **KOD10**: 5 karakteres BNO kód (pl. "A0000", "A0100")
- **NEV**: Diagnózis neve magyarul (pl. "Cholera (Vibrio cholerae 01, cholera biovariáns okozta)")

## Technikai Terv

### 1. Adatbázis Táblák

#### `bno_codes` - Fő tábla
| Oszlop | Típus | Leírás |
|--------|-------|--------|
| id | UUID | Elsődleges kulcs |
| code | TEXT | BNO kód (pl. "A0000") - UNIQUE |
| name | TEXT | Diagnózis neve magyarul |
| created_at | TIMESTAMPTZ | Létrehozás időpontja |
| updated_at | TIMESTAMPTZ | Módosítás időpontja |

#### `bno_embeddings` - Vektor tábla
| Oszlop | Típus | Leírás |
|--------|-------|--------|
| id | UUID | Elsődleges kulcs |
| bno_code_id | UUID | FK a bno_codes táblához |
| text_source | TEXT | Az embedding alapja (name) |
| source_type | TEXT | Típus (pl. "name") |
| embedding | vector(3072) | OpenAI text-embedding-3-large vektor |
| created_at | TIMESTAMPTZ | Létrehozás időpontja |
| updated_at | TIMESTAMPTZ | Módosítás időpontja |

### 2. SQL Függvények

#### `upsert_bno_embedding`
BNO kód embedding beszúrása/frissítése (a szotar minta alapján).

#### `match_bno_embedding`
Szemantikus keresés a BNO kódok között vektor hasonlóság alapján.

### 3. RLS Policies

Mivel a BNO kódok globálisak (nem telephely-specifikusak):
- **SELECT**: Minden autentikált felhasználó olvashatja
- **INSERT/UPDATE/DELETE**: Csak admin role

### 4. Edge Function (opcionális)

`generate-bno-embeddings` - Háttérben futó embedding generálás az összes BNO kódhoz.

## Fájlok és Műveletek

| Fájl/Objektum | Művelet |
|---------------|---------|
| Migration: `bno_codes` tábla | Létrehozás |
| Migration: `bno_embeddings` tábla | Létrehozás |
| Migration: RLS policies | Létrehozás |
| Migration: `upsert_bno_embedding` function | Létrehozás |
| Migration: `match_bno_embedding` function | Létrehozás |
| `src/integrations/supabase/types.ts` | Automatikus frissítés |

## Migration SQL

```sql
-- 1. BNO kódok fő tábla
CREATE TABLE bno_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. BNO embeddings tábla
CREATE TABLE bno_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bno_code_id UUID NOT NULL REFERENCES bno_codes(id) ON DELETE CASCADE,
  text_source TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'name',
  embedding vector(3072),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bno_code_id, text_source, source_type)
);

-- 3. Indexek
CREATE INDEX idx_bno_codes_code ON bno_codes(code);
CREATE INDEX idx_bno_embeddings_bno_code_id ON bno_embeddings(bno_code_id);
CREATE INDEX idx_bno_embeddings_source_type ON bno_embeddings(source_type);

-- 4. RLS engedélyezés
ALTER TABLE bno_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bno_embeddings ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies - bno_codes
CREATE POLICY "Authenticated users can read BNO codes"
  ON bno_codes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage BNO codes"
  ON bno_codes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. RLS policies - bno_embeddings
CREATE POLICY "Authenticated users can read BNO embeddings"
  ON bno_embeddings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to BNO embeddings"
  ON bno_embeddings FOR ALL
  USING (true)
  WITH CHECK (true);

-- 7. Upsert function
CREATE OR REPLACE FUNCTION upsert_bno_embedding(
  p_bno_code_id UUID,
  p_text_source TEXT,
  p_source_type TEXT,
  p_embedding TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  result_id UUID;
BEGIN
  INSERT INTO bno_embeddings (bno_code_id, text_source, source_type, embedding, updated_at)
  VALUES (p_bno_code_id, p_text_source, p_source_type, p_embedding::vector(3072), NOW())
  ON CONFLICT (bno_code_id, text_source, source_type)
  DO UPDATE SET
    embedding = EXCLUDED.embedding,
    updated_at = NOW()
  RETURNING id INTO result_id;
  
  RETURN result_id;
END;
$$;

-- 8. Match function
CREATE OR REPLACE FUNCTION match_bno_embedding(
  query_embedding TEXT,
  match_threshold DOUBLE PRECISION DEFAULT 0.5,
  match_count INTEGER DEFAULT 10,
  p_source_types TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  bno_code_id UUID,
  code TEXT,
  name TEXT,
  similarity DOUBLE PRECISION,
  matched_text TEXT,
  source_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bc.id as bno_code_id,
    bc.code,
    bc.name,
    1 - (be.embedding <=> query_embedding::vector(3072)) as similarity,
    be.text_source as matched_text,
    be.source_type
  FROM bno_embeddings be
  JOIN bno_codes bc ON bc.id = be.bno_code_id
  WHERE 
    (p_source_types IS NULL OR be.source_type = ANY(p_source_types))
    AND 1 - (be.embedding <=> query_embedding::vector(3072)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
```

## Adatbetöltés

A teljes BNO kód lista betöltéséhez a jövőben:
1. Excel/CSV fájl feldolgozása
2. Bulk insert a `bno_codes` táblába
3. Edge function futtatása az embedding generáláshoz

## Következő Lépések

1. Migration végrehajtása a táblák létrehozásához
2. Teljes BNO kód lista betöltése (Excel fájl alapján)
3. Embedding generálás az összes BNO névhez
4. Opcionális: Admin UI a BNO kódok kezeléséhez

