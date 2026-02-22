-- Hibakezelés: error logging system for script debugging
-- Table for error log records
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  script_name TEXT NOT NULL,
  domain TEXT,
  severity TEXT DEFAULT 'error' CHECK (severity IN ('info', 'warning', 'error')),
  summary TEXT NOT NULL,
  full_log TEXT NOT NULL,
  screenshot_urls TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'
);

-- Storage bucket for screenshots (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('error-screenshots', 'error-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- RLS on error_logs
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read error logs
CREATE POLICY "Admins can read error_logs" ON error_logs
  FOR SELECT USING (
    (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
  );

-- Admins can delete error logs
CREATE POLICY "Admins can delete error_logs" ON error_logs
  FOR DELETE USING (
    (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
  );

-- Service role can insert (Python script uses service role key)
CREATE POLICY "Service can insert error_logs" ON error_logs
  FOR INSERT WITH CHECK (true);

-- Storage: admins can read screenshots
CREATE POLICY "Admins can read error screenshots"
ON storage.objects FOR SELECT USING (
  bucket_id = 'error-screenshots'
  AND (SELECT role FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') = 'admin'
);

-- Storage: service role can upload screenshots
CREATE POLICY "Service can upload error screenshots"
ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'error-screenshots'
);
