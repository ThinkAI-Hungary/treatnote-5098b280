-- 1. Clear existing incompatible 3072-dim embeddings
TRUNCATE TABLE bno_embeddings;

-- 2. Alter column to 1536 dimensions
ALTER TABLE bno_embeddings 
  ALTER COLUMN embedding TYPE extensions.vector(1536);

-- 3. Update RPC functions to use 1536 dimensions
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
  VALUES (p_bno_code_id, p_text_source, p_source_type, p_embedding::vector(1536), NOW())
  ON CONFLICT (bno_code_id, text_source, source_type)
  DO UPDATE SET
    embedding = EXCLUDED.embedding,
    updated_at = NOW()
  RETURNING id INTO result_id;
  
  RETURN result_id;
END;
$$;

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
    1 - (be.embedding <=> query_embedding::vector(1536)) as similarity,
    be.text_source as matched_text,
    be.source_type
  FROM bno_embeddings be
  JOIN bno_codes bc ON bc.id = be.bno_code_id
  WHERE 
    (p_source_types IS NULL OR be.source_type = ANY(p_source_types))
    AND 1 - (be.embedding <=> query_embedding::vector(1536)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- 4. Increase global timeout for this search function
ALTER FUNCTION match_bno_embedding(TEXT, DOUBLE PRECISION, INTEGER, TEXT[]) 
SET statement_timeout = '30s';

-- 5. Successfully create HNSW index for 1536-dim vectors
CREATE INDEX idx_bno_embeddings_vector_hnsw ON bno_embeddings 
USING hnsw (embedding extensions.vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
