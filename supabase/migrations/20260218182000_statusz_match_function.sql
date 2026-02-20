-- Fix match_statusz_marker function
SET search_path = extensions, public;

CREATE OR REPLACE FUNCTION public.match_statusz_marker(
    query_embedding extensions.vector,
    match_threshold float DEFAULT 0.5,
    match_count     int   DEFAULT 5
)
RETURNS TABLE (
    marker_key text,
    label_hu   text,
    data_name  text,
    category   text,
    similarity float
)
LANGUAGE sql STABLE
SET search_path = extensions, public
AS $$
    SELECT
        se.marker_key,
        se.label_hu,
        se.data_name,
        se.category,
        1 - (se.embedding <=> query_embedding) AS similarity
    FROM public.statusz_embeddings se
    WHERE 1 - (se.embedding <=> query_embedding) > match_threshold
    ORDER BY se.embedding <=> query_embedding
    LIMIT match_count;
$$;
