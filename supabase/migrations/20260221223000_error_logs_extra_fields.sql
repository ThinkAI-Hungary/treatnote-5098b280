-- Add company/telephely/user fields to error_logs
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS telephely_name TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS user_id TEXT;
