-- ============================================================
-- statusz_embeddings: Vector table for Flexi-dent status markers
-- Mirrors the szotar_embeddings pattern
-- ============================================================

-- 1. Main table: one row per marker
CREATE TABLE IF NOT EXISTS public.statusz_embeddings (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The Hungarian key used in the JSON (e.g. "Occlusalis_-_Caries")
    marker_key  text NOT NULL UNIQUE,
    -- Human-readable Hungarian label (e.g. "Occlusalis caries")
    label_hu    text NOT NULL,
    -- The internal Flexi-dent data-name (e.g. "caries_o")
    data_name   text NOT NULL,
    -- Category grouping (e.g. "Caries", "Korona", "Implant")
    category    text NOT NULL DEFAULT 'Altalanos',
    -- The text that was embedded (usually label_hu + category)
    text_source text NOT NULL,
    -- The actual vector (1536 dims = text-embedding-3-large with dimensions param)
    embedding   extensions.vector(1536),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. IVFFlat index for cosine similarity search
CREATE INDEX IF NOT EXISTS statusz_embeddings_embedding_idx
    ON public.statusz_embeddings
    USING ivfflat (embedding extensions.vector_cosine_ops)
    WITH (lists = 50);

-- 3. Upsert RPC (mirrors upsert_szotar_embedding)
CREATE OR REPLACE FUNCTION public.upsert_statusz_embedding(
    p_marker_key  text,
    p_label_hu    text,
    p_data_name   text,
    p_category    text,
    p_text_source text,
    p_embedding   extensions.vector(1536)
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.statusz_embeddings
        (marker_key, label_hu, data_name, category, text_source, embedding, updated_at)
    VALUES
        (p_marker_key, p_label_hu, p_data_name, p_category, p_text_source, p_embedding, now())
    ON CONFLICT (marker_key) DO UPDATE SET
        label_hu    = EXCLUDED.label_hu,
        data_name   = EXCLUDED.data_name,
        category    = EXCLUDED.category,
        text_source = EXCLUDED.text_source,
        embedding   = EXCLUDED.embedding,
        updated_at  = now();
END;
$$;

