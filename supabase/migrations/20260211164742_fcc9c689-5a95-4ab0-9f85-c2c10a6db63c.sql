-- Add DELETE policy so users can terminate their own voice jobs
CREATE POLICY "Users can delete their own voice jobs"
ON public.voice_jobs
FOR DELETE
USING (auth.uid() = user_id);