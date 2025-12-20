import { createClient } from '@supabase/supabase-js';

// Lovable projects should not rely on VITE_* at runtime.
const SUPABASE_URL = 'https://bpjzgapmoyhtgryglcke.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
