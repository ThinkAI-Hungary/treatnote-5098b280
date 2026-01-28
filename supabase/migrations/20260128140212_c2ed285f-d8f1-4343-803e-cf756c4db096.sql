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
  embedding extensions.vector(3072),
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

-- 9. Trigger for updated_at
CREATE TRIGGER update_bno_codes_updated_at
  BEFORE UPDATE ON bno_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();