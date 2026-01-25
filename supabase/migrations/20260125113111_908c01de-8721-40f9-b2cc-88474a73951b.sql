-- Create treatment_embeddings table (3072 dimensions, no vector index)
CREATE TABLE IF NOT EXISTS public.treatment_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  treatment_rule_id UUID NOT NULL REFERENCES public.treatment_rules(id) ON DELETE CASCADE,
  text_source TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'name' CHECK (source_type IN ('name', 'trigger_word', 'item_name', 'full_rule')),
  embedding vector(3072) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(treatment_rule_id, text_source, source_type)
);

-- Standard B-tree indexes for lookups
CREATE INDEX idx_treatment_embeddings_rule_id ON public.treatment_embeddings(treatment_rule_id);
CREATE INDEX idx_treatment_embeddings_source_type ON public.treatment_embeddings(source_type);

-- Trigger for updated_at
CREATE TRIGGER update_treatment_embeddings_updated_at
  BEFORE UPDATE ON public.treatment_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.treatment_embeddings ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access"
  ON public.treatment_embeddings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read embeddings for their clinic
CREATE POLICY "Authenticated users can read embeddings"
  ON public.treatment_embeddings
  FOR SELECT
  TO authenticated
  USING (
    treatment_rule_id IN (
      SELECT tr.id FROM treatment_rules tr
      WHERE tr.clinic_id IN (
        SELECT p.telephely_id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
  );

-- Vector similarity search function (sequential scan without index)
CREATE OR REPLACE FUNCTION public.match_treatment_embedding(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  p_clinic_id uuid DEFAULT NULL
)
RETURNS TABLE (
  treatment_rule_id uuid,
  rule_name text,
  similarity float,
  source_type text,
  matched_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    te.treatment_rule_id,
    tr.name as rule_name,
    (1 - (te.embedding <=> query_embedding))::float as similarity,
    te.source_type,
    te.text_source as matched_text
  FROM treatment_embeddings te
  JOIN treatment_rules tr ON tr.id = te.treatment_rule_id
  WHERE 
    (p_clinic_id IS NULL OR tr.clinic_id = p_clinic_id)
    AND (1 - (te.embedding <=> query_embedding)) > match_threshold
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Upsert function for embeddings
CREATE OR REPLACE FUNCTION public.upsert_treatment_embedding(
  p_treatment_rule_id uuid,
  p_text_source text,
  p_source_type text,
  p_embedding vector(3072)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO treatment_embeddings (treatment_rule_id, text_source, source_type, embedding)
  VALUES (p_treatment_rule_id, p_text_source, p_source_type, p_embedding)
  ON CONFLICT (treatment_rule_id, text_source, source_type)
  DO UPDATE SET 
    embedding = EXCLUDED.embedding,
    updated_at = now()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Cleanup orphaned embeddings
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_embeddings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM treatment_embeddings te
    WHERE NOT EXISTS (
      SELECT 1 FROM treatment_rules tr WHERE tr.id = te.treatment_rule_id
    )
    RETURNING *
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Stats view
CREATE OR REPLACE VIEW public.treatment_embeddings_stats AS
SELECT 
  tr.clinic_id,
  COUNT(DISTINCT te.treatment_rule_id) as rules_with_embeddings,
  COUNT(te.id) as total_embeddings,
  COUNT(CASE WHEN te.source_type = 'name' THEN 1 END) as name_embeddings,
  COUNT(CASE WHEN te.source_type = 'trigger_word' THEN 1 END) as trigger_embeddings,
  COUNT(CASE WHEN te.source_type = 'item_name' THEN 1 END) as item_embeddings,
  MAX(te.updated_at) as last_updated
FROM treatment_rules tr
LEFT JOIN treatment_embeddings te ON te.treatment_rule_id = tr.id
GROUP BY tr.clinic_id;