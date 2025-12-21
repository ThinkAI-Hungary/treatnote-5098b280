-- Add webhook_status column to feltoltott_pdf table
ALTER TABLE public.feltoltott_pdf 
ADD COLUMN webhook_status text NOT NULL DEFAULT 'idle';

-- Add comment for clarity
COMMENT ON COLUMN public.feltoltott_pdf.webhook_status IS 'Webhook status: idle, feldolgozas_alatt, feldolgozva, hiba';