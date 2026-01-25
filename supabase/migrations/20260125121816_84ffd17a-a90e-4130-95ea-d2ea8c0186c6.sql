-- 1. Add semantic_description column to treatment_rules
ALTER TABLE public.treatment_rules 
ADD COLUMN IF NOT EXISTS semantic_description TEXT;

COMMENT ON COLUMN public.treatment_rules.semantic_description IS 
'AI-generált szemantikus leírás a kezelésről (~40-50 szó). Tartalmazza: definíció, szinonimák, típusok, magyar és latin/angol megfelelők.';

-- 2. Delete any existing embeddings with old source_type values (if any)
DELETE FROM public.treatment_embeddings 
WHERE source_type NOT IN ('semantic_description', 'item_name');

-- 3. Update source_type constraint
ALTER TABLE public.treatment_embeddings 
DROP CONSTRAINT IF EXISTS treatment_embeddings_source_type_check;

ALTER TABLE public.treatment_embeddings 
ADD CONSTRAINT treatment_embeddings_source_type_check 
CHECK (source_type IN ('semantic_description', 'item_name'));

-- 4. Drop and recreate match_treatment_embedding function
DROP FUNCTION IF EXISTS public.match_treatment_embedding(extensions.vector, double precision, integer, uuid);

CREATE FUNCTION public.match_treatment_embedding(
    query_embedding extensions.vector,
    match_threshold double precision DEFAULT 0.75,
    match_count integer DEFAULT 5,
    p_clinic_id uuid DEFAULT NULL
)
RETURNS TABLE (
    treatment_rule_id uuid,
    rule_name text,
    similarity double precision,
    matched_text text,
    source_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        te.treatment_rule_id,
        tr.name AS rule_name,
        (1 - (te.embedding <=> query_embedding))::float AS similarity,
        te.text_source AS matched_text,
        te.source_type
    FROM treatment_embeddings te
    JOIN treatment_rules tr ON tr.id = te.treatment_rule_id
    WHERE 
        (p_clinic_id IS NULL OR tr.clinic_id = p_clinic_id)
        AND (1 - (te.embedding <=> query_embedding)) > match_threshold
    ORDER BY te.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 5. Update treatment_embeddings_stats view
DROP VIEW IF EXISTS public.treatment_embeddings_stats;

CREATE VIEW public.treatment_embeddings_stats 
WITH (security_invoker = true)
AS
SELECT 
  tr.clinic_id,
  COUNT(DISTINCT te.treatment_rule_id) as rules_with_embeddings,
  COUNT(te.id) as total_embeddings,
  COUNT(CASE WHEN te.source_type = 'semantic_description' THEN 1 END) as semantic_embeddings,
  COUNT(CASE WHEN te.source_type = 'item_name' THEN 1 END) as item_embeddings,
  MAX(te.updated_at) as last_updated
FROM treatment_rules tr
LEFT JOIN treatment_embeddings te ON te.treatment_rule_id = tr.id
GROUP BY tr.clinic_id;