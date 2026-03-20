-- Add user_complaint columns to voice_jobs
ALTER TABLE public.voice_jobs
ADD COLUMN user_complaint TEXT DEFAULT NULL,
ADD COLUMN user_complaint_date TIMESTAMPTZ DEFAULT NULL;

-- Create an RPC to securely submit a complaint (once only)
CREATE OR REPLACE FUNCTION public.submit_voice_job_complaint(
    p_job_id UUID,
    p_complaint_text TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Validate input
    IF p_complaint_text IS NULL OR trim(p_complaint_text) = '' THEN
        RAISE EXCEPTION 'Complaint text cannot be empty.';
    END IF;

    -- Check if the job belongs to the current user
    IF NOT EXISTS (
        SELECT 1 FROM public.voice_jobs
        WHERE id = p_job_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Job not found or access denied.';
    END IF;

    -- Check if it already has a complaint
    IF EXISTS (
        SELECT 1 FROM public.voice_jobs
        WHERE id = p_job_id AND user_complaint IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Complaint already submitted for this job. It cannot be edited.';
    END IF;

    -- Update the job
    UPDATE public.voice_jobs
    SET 
        user_complaint = p_complaint_text,
        user_complaint_date = timezone('utc'::text, now())
    WHERE id = p_job_id;
END;
$$;
