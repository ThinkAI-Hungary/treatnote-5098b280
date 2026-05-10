-- Add RPA tracking columns to native_voice_jobs
ALTER TABLE native_voice_jobs 
  ADD COLUMN IF NOT EXISTS rpa_result jsonb,
  ADD COLUMN IF NOT EXISTS rpa_url text,
  ADD COLUMN IF NOT EXISTS rpa_status text DEFAULT 'pending';

-- Add a comment for clarity
COMMENT ON COLUMN native_voice_jobs.rpa_result IS 'JSON result from treatnote.py RPA execution';
COMMENT ON COLUMN native_voice_jobs.rpa_url IS 'FlexiDent URL where the offer was created';
COMMENT ON COLUMN native_voice_jobs.rpa_status IS 'RPA status: pending, completed, error';
