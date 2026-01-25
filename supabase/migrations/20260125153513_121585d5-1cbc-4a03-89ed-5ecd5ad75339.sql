-- Update match_treatment_embedding to support source_type filtering
-- Default to semantic_description only for rule-based matching
CREATE OR REPLACE FUNCTION public.match_treatment_embedding(
    query_embedding extensions.vector,
    match_threshold double precision DEFAULT 0.40,
    match_count integer DEFAULT 5,
    p_clinic_id uuid DEFAULT NULL::uuid,
    p_source_types text[] DEFAULT ARRAY['semantic_description']::text[]
)
RETURNS TABLE(
    treatment_rule_id uuid,
    rule_name text,
    similarity double precision,
    matched_text text,
    source_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        te.treatment_rule_id,
        tr.name AS rule_name,
        (1 - (te.embedding <=> query_embedding))::FLOAT AS similarity,
        te.text_source AS matched_text,
        te.source_type
    FROM treatment_embeddings te
    JOIN treatment_rules tr ON tr.id = te.treatment_rule_id
    WHERE 
        (p_clinic_id IS NULL OR tr.clinic_id = p_clinic_id)
        AND te.source_type = ANY(p_source_types)
        AND (1 - (te.embedding <=> query_embedding)) > match_threshold
    ORDER BY te.embedding <=> query_embedding
    LIMIT match_count;
END;
$function$;

-- Update match_szotar_embedding for consistency
CREATE OR REPLACE FUNCTION public.match_szotar_embedding(
    query_embedding extensions.vector,
    match_threshold double precision DEFAULT 0.40,
    match_count integer DEFAULT 10,
    p_telephely_id uuid DEFAULT NULL::uuid,
    p_source_types text[] DEFAULT ARRAY['semantic_description']::text[]
)
RETURNS TABLE(
    szotar_kezeles_id uuid,
    name text,
    category text,
    similarity double precision,
    matched_text text,
    source_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        se.szotar_kezeles_id,
        sk.name,
        sk.category,
        (1 - (se.embedding <=> query_embedding))::FLOAT AS similarity,
        se.text_source AS matched_text,
        se.source_type
    FROM szotar_embeddings se
    JOIN szotar_kezelesek sk ON sk.id = se.szotar_kezeles_id
    WHERE 
        (p_telephely_id IS NULL OR sk.telephely_id = p_telephely_id)
        AND se.source_type = ANY(p_source_types)
        AND (1 - (se.embedding <=> query_embedding)) > match_threshold
    ORDER BY se.embedding <=> query_embedding
    LIMIT match_count;
END;
$function$;