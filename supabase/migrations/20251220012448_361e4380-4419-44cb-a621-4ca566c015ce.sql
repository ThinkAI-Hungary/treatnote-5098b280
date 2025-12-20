-- Add telephely column to profiles table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'profiles' 
                   AND column_name = 'telephely') THEN
        ALTER TABLE public.profiles ADD COLUMN telephely text;
    END IF;
END $$;