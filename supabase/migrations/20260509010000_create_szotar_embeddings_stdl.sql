-- 20260509010000_create_szotar_embeddings_stdl.sql

-- 1. Add embedding_status to clinic_treatment_items_stdl
ALTER TABLE public.clinic_treatment_items_stdl 
ADD COLUMN IF NOT EXISTS embedding_status TEXT DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'ready', 'error'));

-- 2. Create szotar_embeddings_stdl table
CREATE TABLE IF NOT EXISTS public.szotar_embeddings_stdl (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  szotar_kezeles_id UUID NOT NULL REFERENCES public.clinic_treatment_items_stdl(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  embedding extensions.vector(3072) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(szotar_kezeles_id, source_type)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_szotar_embeddings_stdl_szotar_id 
  ON public.szotar_embeddings_stdl(szotar_kezeles_id);

-- No vector index for 3072 dimensions as it exceeds 2000 dim limit for HNSW

-- 4. RLS
ALTER TABLE public.szotar_embeddings_stdl ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telephely_members_read_szotar_embeddings_stdl"
  ON public.szotar_embeddings_stdl
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_treatment_items_stdl i
      JOIN public.telephely_memberships tm ON i.telephely_id = tm.telephely_id
      WHERE i.id = szotar_embeddings_stdl.szotar_kezeles_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "klinika_admin_manage_szotar_embeddings_stdl"
  ON public.szotar_embeddings_stdl
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_treatment_items_stdl i
      JOIN public.telephely_memberships tm ON i.telephely_id = tm.telephely_id
      WHERE i.id = szotar_embeddings_stdl.szotar_kezeles_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('klinika_admin', 'admin')
    )
  );

-- 5. RPC Function to upsert embedding and set status to ready
DROP FUNCTION IF EXISTS public.upsert_szotar_embedding_stdl;

CREATE OR REPLACE FUNCTION public.upsert_szotar_embedding_stdl(
  p_szotar_kezeles_id UUID,
  p_text_source TEXT,
  p_source_type TEXT,
  p_embedding extensions.vector(3072)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert or update the embedding
  INSERT INTO public.szotar_embeddings_stdl (szotar_kezeles_id, text_source, source_type, embedding, created_at)
  VALUES (p_szotar_kezeles_id, p_text_source, p_source_type, p_embedding, NOW())
  ON CONFLICT (szotar_kezeles_id, text_source, source_type) 
  DO UPDATE SET 
    embedding = EXCLUDED.embedding,
    created_at = NOW();

  -- Mark the item's embedding_status as 'ready'
  UPDATE public.clinic_treatment_items_stdl
  SET embedding_status = 'ready'
  WHERE id = p_szotar_kezeles_id;
END;
$$;
