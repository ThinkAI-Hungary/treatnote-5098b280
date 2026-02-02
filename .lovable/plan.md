

# BNO Kódok Karakterkódolási Hiba Javítása

## Probléma Azonosítása

Az adatbázisban lévő BNO kód nevek hibás karakterkódolással kerültek be:

| Hibás karakter | Helyes karakter | Érintett rekordok |
|----------------|-----------------|-------------------|
| ï | ő | 3,044 |
| ¹ | ű | 1,067 |
| **Összesen** | | **3,750** |

Példák:
- `fertïzés` → `fertőzés`
- `Tüdïgümïkór` → `Tüdőgümőkór`  
- `eredet¹` → `eredetű`

A többi magyar ékezetes karakter (á, é, í, ó, ö, ü) helyesen lett tárolva.

## Megoldás

Két lépéses javítás:

### 1. lépés: bno_codes tábla javítása

```sql
UPDATE bno_codes
SET name = REPLACE(REPLACE(name, 'ï', 'ő'), '¹', 'ű')
WHERE name LIKE '%ï%' OR name LIKE '%¹%';
```

### 2. lépés: bno_embeddings újragenerálása

A hibás szövegből generált embeddings-ek is hibásak. Két lehetőség:

**A) Teljes újragenerálás (ajánlott):**
- Töröljük az összes embeddinget
- A cron job újra legenerálja az összeset helyes szöveggel
- ~4 óra az összes 11,698 rekordhoz

**B) Csak az érintettek újragenerálása:**
- Töröljük csak azokat az embeddingeket, ahol a bno_code_id olyan rekordhoz tartozik, ami javítva lett
- A cron job csak ezeket generálja újra

## Fájlok és Változások

| Fájl | Művelet | Leírás |
|------|---------|--------|
| SQL Migration | Létrehozás | UPDATE a karaktercserékhez + DELETE a régi embeddingekhez |

## Technikai Részletek

### SQL Migration

```sql
-- 1. Javítsuk a karakterkódolási hibákat
UPDATE bno_codes
SET name = REPLACE(REPLACE(name, 'ï', 'ő'), '¹', 'ű')
WHERE name LIKE '%ï%' OR name LIKE '%¹%';

-- 2. Töröljük a meglévő embeddingeket, hogy újrageneráljuk helyes szöveggel
-- (A cron job automatikusan újragenerálja)
DELETE FROM bno_embeddings;
```

### Várt Eredmény

- 3,750 rekord javítva a bno_codes táblában
- A cron job újragenerálja az összes embeddinget helyes magyar karakterekkel
- A szemantikus keresés pontosabb lesz, mert "fertőzés" helyett nem "fertïzés"-t keres

### Alternatív: Csak érintett embeddings törlése

Ha nem akarod az összes embeddinget törölni:

```sql
-- Csak az érintett embeddings-ek törlése
DELETE FROM bno_embeddings 
WHERE bno_code_id IN (
  SELECT id FROM bno_codes 
  WHERE name LIKE '%ï%' OR name LIKE '%¹%'
);

-- Ezután a karakterek javítása
UPDATE bno_codes
SET name = REPLACE(REPLACE(name, 'ï', 'ő'), '¹', 'ű')
WHERE name LIKE '%ï%' OR name LIKE '%¹%';
```

Ez gyorsabb újragenerálást eredményez (~75 perc a 3,750 rekordhoz), de kockázatosabb, mert a többi embedding is a potenciálisan hibás szövegből készült.

