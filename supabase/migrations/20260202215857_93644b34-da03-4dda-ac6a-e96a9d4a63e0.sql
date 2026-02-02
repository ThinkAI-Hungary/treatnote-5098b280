-- 1. Fix character encoding issues in bno_codes
UPDATE bno_codes
SET name = REPLACE(REPLACE(name, 'ï', 'ő'), '¹', 'ű')
WHERE name LIKE '%ï%' OR name LIKE '%¹%';

-- 2. Delete all embeddings so they can be regenerated with correct text
DELETE FROM bno_embeddings;