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