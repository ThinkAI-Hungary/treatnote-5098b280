-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Enable pg_net extension for HTTP requests from within Postgres
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage on cron schema to postgres
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule the BNO embedding generation job to run every minute
SELECT cron.schedule(
  'generate-bno-embeddings-job',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1/generate-bno-embeddings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);