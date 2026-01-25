-- Drop existing functions first (both overloaded versions)
DROP FUNCTION IF EXISTS match_szotar_embedding(text, uuid, double precision, integer);
DROP FUNCTION IF EXISTS match_szotar_embedding(text, uuid, double precision, integer, text[]);

-- Recreate the function with rule_name alias for n8n compatibility
CREATE OR REPLACE FUNCTION match_szotar_embedding(
    query_embedding text,
    p_telephely_id uuid DEFAULT NULL,
    match_threshold double precision DEFAULT 0.5,
    match_count integer DEFAULT 10,
    p_source_types text[] DEFAULT NULL
)
RETURNS TABLE (
    szotar_kezeles_id uuid,
    name text,
    rule_name text,
    category text,
    similarity double precision,
    matched_text text,
    source_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sk.id as szotar_kezeles_id,
        sk.name,
        sk.name as rule_name,
        sk.category,
        1 - (se.embedding::vector(3072) <=> query_embedding::vector(3072)) as similarity,
        se.text_source as matched_text,
        se.source_type
    FROM szotar_embeddings se
    JOIN szotar_kezelesek sk ON sk.id = se.szotar_kezeles_id
    WHERE 
        (p_telephely_id IS NULL OR sk.telephely_id = p_telephely_id)
        AND (p_source_types IS NULL OR se.source_type = ANY(p_source_types))
        AND 1 - (se.embedding::vector(3072) <=> query_embedding::vector(3072)) > match_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;