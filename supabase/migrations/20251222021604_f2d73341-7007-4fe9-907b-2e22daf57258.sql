-- Phase 1A: Add checksum column to feltoltott_pdf
ALTER TABLE feltoltott_pdf 
ADD COLUMN IF NOT EXISTS file_hash_sha256 text;

-- Phase 1B: Create pdf_extractions table
CREATE TABLE pdf_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES feltoltott_pdf(id) ON DELETE CASCADE,
  event_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  raw_json jsonb,
  items_count integer,
  error_message text,
  retry_count integer DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now(),
  
  -- Require raw_json only when status is 'completed'
  CONSTRAINT raw_json_required_on_completed 
    CHECK (status != 'completed' OR raw_json IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_pdf_extractions_document_id ON pdf_extractions(document_id);
CREATE INDEX idx_pdf_extractions_created_at ON pdf_extractions(created_at DESC);

-- Phase 1C: Enable RLS with SELECT policy
ALTER TABLE pdf_extractions ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Users can view extractions for PDFs they have access to
CREATE POLICY "Users can view extractions for accessible PDFs"
ON pdf_extractions
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (
    has_role(auth.uid(), 'klinika_admin'::app_role) 
    AND EXISTS (
      SELECT 1 FROM feltoltott_pdf pdf
      JOIN profiles p ON p.user_id = auth.uid()
      WHERE pdf.id = pdf_extractions.document_id
        AND p.company_id = pdf.company_id
        AND p.telephely_id = pdf.telephely_id
    )
  )
);