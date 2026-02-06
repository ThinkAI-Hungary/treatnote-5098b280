import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';

export interface VoiceJob {
  id: string;
  user_id: string;
  company_id: string | null;
  telephely_id: string | null;
  mode: string;
  paciens_id: string | null;
  status: 'processing' | 'completed' | 'error';
  result: Json | null;
  error: string | null;
  audio_filename: string | null;
  duration_seconds: number | null;
  created_at: string;
  completed_at: string | null;
}

interface UseVoiceJobHistoryReturn {
  jobs: VoiceJob[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  pollJob: (jobId: string) => Promise<VoiceJob | null>;
}

const MAX_HISTORY_ITEMS = 10;

export function useVoiceJobHistory(): UseVoiceJobHistoryReturn {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<VoiceJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!user) {
      setJobs([]);
      setIsLoading(false);
      return;
    }

    try {
      // First, delete stale jobs (processing for more than 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      await supabase
        .from('voice_jobs')
        .delete()
        .eq('user_id', user.id)
        .eq('status', 'processing')
        .lt('created_at', fiveMinutesAgo);

      // Then fetch remaining jobs
      const { data, error: fetchError } = await supabase
        .from('voice_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(MAX_HISTORY_ITEMS);

      if (fetchError) throw fetchError;

      setJobs((data as VoiceJob[]) || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching voice jobs:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const pollJob = useCallback(async (jobId: string): Promise<VoiceJob | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('voice_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (fetchError) throw fetchError;

      const job = data as VoiceJob;

      // Update local state with the polled job
      setJobs(prev => {
        const existingIndex = prev.findIndex(j => j.id === jobId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = job;
          return updated;
        } else {
          // Add new job at the beginning
          return [job, ...prev].slice(0, MAX_HISTORY_ITEMS);
        }
      });

      return job;
    } catch (err) {
      console.error('Error polling job:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Subscribe to realtime updates for the user's jobs
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('voice_jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'voice_jobs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setJobs(prev => [payload.new as VoiceJob, ...prev].slice(0, MAX_HISTORY_ITEMS));
          } else if (payload.eventType === 'UPDATE') {
            setJobs(prev => prev.map(job => 
              job.id === (payload.new as VoiceJob).id ? (payload.new as VoiceJob) : job
            ));
          } else if (payload.eventType === 'DELETE') {
            setJobs(prev => prev.filter(job => job.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return {
    jobs,
    isLoading,
    error,
    refetch: fetchJobs,
    pollJob,
  };
}
