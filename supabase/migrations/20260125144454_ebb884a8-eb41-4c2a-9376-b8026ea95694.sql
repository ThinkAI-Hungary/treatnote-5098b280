-- Fix match_treatment_embedding function: add 'extensions' to search_path for pgvector operators
CREATE OR REPLACE FUNCTION public.match_treatment_embedding(
    query_embedding extensions.vector,
    match_threshold FLOAT DEFAULT 0.75,
    match_count INT DEFAULT 5,
    p_clinic_id UUID DEFAULT NULL
)
RETURNS TABLE (
    treatment_rule_id UUID,
    rule_name TEXT,
    similarity FLOAT,
    matched_text TEXT,
    source_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
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
        AND (1 - (te.embedding <=> query_embedding)) > match_threshold
    ORDER BY te.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Fix match_szotar_embedding function: add 'extensions' to search_path for pgvector operators
CREATE OR REPLACE FUNCTION public.match_szotar_embedding(
    query_embedding extensions.vector,
    match_threshold FLOAT DEFAULT 0.75,
    match_count INT DEFAULT 10,
    p_telephely_id UUID DEFAULT NULL
)
RETURNS TABLE (
    szotar_kezeles_id UUID,
    name TEXT,
    category TEXT,
    similarity FLOAT,
    matched_text TEXT,
    source_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
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
        AND (1 - (se.embedding <=> query_embedding)) > match_threshold
    ORDER BY se.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;