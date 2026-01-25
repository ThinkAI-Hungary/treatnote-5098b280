-- Create szotar_embeddings table for dictionary item embeddings
CREATE TABLE public.szotar_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    szotar_kezeles_id UUID NOT NULL REFERENCES szotar_kezelesek(id) ON DELETE CASCADE,
    text_source TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('name', 'category')),
    embedding vector(3072),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(szotar_kezeles_id, text_source, source_type)
);

-- Indexes for performance
CREATE INDEX idx_szotar_embeddings_kezeles_id ON szotar_embeddings(szotar_kezeles_id);
CREATE INDEX idx_szotar_embeddings_source_type ON szotar_embeddings(source_type);

-- Enable RLS
ALTER TABLE szotar_embeddings ENABLE ROW LEVEL SECURITY;

-- Service role full access (for Edge Functions)
CREATE POLICY "Service role full access" ON szotar_embeddings
    FOR ALL USING (true) WITH CHECK (true);

-- Users can read embeddings for their telephely
CREATE POLICY "Users can read own telephely embeddings" ON szotar_embeddings
    FOR SELECT USING (
        szotar_kezeles_id IN (
            SELECT sk.id FROM szotar_kezelesek sk
            WHERE sk.telephely_id IN (
                SELECT p.telephely_id FROM profiles p WHERE p.user_id = auth.uid()
            )
        )
    );

-- Upsert function for szotar embeddings (similar to treatment_embeddings)
CREATE OR REPLACE FUNCTION public.upsert_szotar_embedding(
    p_szotar_kezeles_id UUID,
    p_text_source TEXT,
    p_source_type TEXT,
    p_embedding vector(3072)
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result_id UUID;
BEGIN
    INSERT INTO szotar_embeddings (szotar_kezeles_id, text_source, source_type, embedding, updated_at)
    VALUES (p_szotar_kezeles_id, p_text_source, p_source_type, p_embedding, NOW())
    ON CONFLICT (szotar_kezeles_id, text_source, source_type)
    DO UPDATE SET
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    RETURNING id INTO result_id;
    
    RETURN result_id;
END;
$$;

-- Match function for semantic search on szotar embeddings
CREATE OR REPLACE FUNCTION public.match_szotar_embedding(
    query_embedding vector(3072),
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
SET search_path = public
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