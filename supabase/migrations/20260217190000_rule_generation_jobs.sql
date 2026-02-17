-- Create rule_generation_jobs table for tracking webhook jobs with auto-retry
CREATE TABLE public.rule_generation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL,
  telephely_id UUID NOT NULL REFERENCES public.telephely(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'protocol' CHECK (source IN ('protocol', 'pdf_upload')),
  protocol_id INTEGER,
  protocol_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  extractions_count INTEGER DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for common queries
CREATE INDEX idx_rule_generation_jobs_batch_id ON public.rule_generation_jobs(batch_id);
CREATE INDEX idx_rule_generation_jobs_telephely_id ON public.rule_generation_jobs(telephely_id);
CREATE INDEX idx_rule_generation_jobs_status ON public.rule_generation_jobs(status);
CREATE INDEX idx_rule_generation_jobs_created_at ON public.rule_generation_jobs(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_rule_generation_jobs_updated_at
  BEFORE UPDATE ON public.rule_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.rule_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view jobs for telephelys they are members of
CREATE POLICY "Users can view their telephely jobs"
  ON public.rule_generation_jobs
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM telephely_memberships
      WHERE telephely_id = rule_generation_jobs.telephely_id
    )
    OR
    (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
  );

-- Service role full access (edge functions use service role)
CREATE POLICY "Service role full access on rule_generation_jobs"
  ON public.rule_generation_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Enable realtime for this table so the frontend can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE public.rule_generation_jobs;

-- Also enable realtime for treatment_rules if not already enabled
-- This allows the KezelesiSzabalyokTab to subscribe to INSERT events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'treatment_rules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.treatment_rules;
  END IF;
END $$;
