-- Create voice_jobs table to store recording history
CREATE TABLE public.voice_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID,
  telephely_id UUID,
  mode TEXT NOT NULL,
  paciens_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  result JSONB,
  error TEXT,
  audio_filename TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create index for user queries (history lookup)
CREATE INDEX idx_voice_jobs_user_id ON public.voice_jobs(user_id);
CREATE INDEX idx_voice_jobs_created_at ON public.voice_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE public.voice_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs
CREATE POLICY "Users can view their own voice jobs"
  ON public.voice_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own jobs
CREATE POLICY "Users can insert their own voice jobs"
  ON public.voice_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can update jobs (for webhook callback)
CREATE POLICY "Service role can update voice jobs"
  ON public.voice_jobs
  FOR UPDATE
  USING (true)
  WITH CHECK (true);