import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import type { Json } from '@/integrations/supabase/types';

export interface NativeVoiceJob {
  id: string;
  user_id: string;
  company_id: string | null;
  telephely_id: string | null;
  mode: string;
  treatnote_patient_id: string | null;
  status: 'processing' | 'completed' | 'error';
  result: Json | null;
  error: string | null;
  audio_filename: string | null;
  duration_seconds: number | null;
  created_at: string;
  completed_at: string | null;
  progress_percent: number | null;
  progress_message: string | null;
}

interface UseNativeVoiceJobHistoryReturn {
  jobs: NativeVoiceJob[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  pollJob: (jobId: string) => Promise<NativeVoiceJob | null>;
}

const MAX_HISTORY_ITEMS = 200;

export function useNativeVoiceJobHistory(treatnotePatientId?: string): UseNativeVoiceJobHistoryReturn {
  const { user } = useAuth();
  const { profile } = useProfile();
  const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id || null;
  const [jobs, setJobs] = useState<NativeVoiceJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!user) {
      setJobs([]);
      setIsLoading(false);
      return;
    }

    try {
      // Delete stale jobs (processing for more than 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      await supabase
        .from('native_voice_jobs')
        .delete()
        .eq('user_id', user.id)
        .eq('status', 'processing')
        .lt('created_at', tenMinutesAgo);

      let query = supabase
        .from('native_voice_jobs')
        .select('*')
        .eq('user_id', user.id);

      if (activeTelephelyId) {
        query = query.eq('telephely_id', activeTelephelyId);
      }
      
      if (treatnotePatientId) {
        query = query.eq('treatnote_patient_id', treatnotePatientId);
      } else {
        query = query.is('treatnote_patient_id', null);
      }

      const { data, error: fetchError } = await query
        .order('created_at', { ascending: false })
        .limit(MAX_HISTORY_ITEMS);

      if (fetchError) throw fetchError;

      setJobs((data as NativeVoiceJob[]) || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching native voice jobs:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [user, activeTelephelyId, treatnotePatientId]);

  const pollJob = useCallback(async (jobId: string): Promise<NativeVoiceJob | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('native_voice_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (fetchError) throw fetchError;

      const job = data as NativeVoiceJob;

      setJobs(prev => {
        const existingIndex = prev.findIndex(j => j.id === jobId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = job;
          return updated;
        } else {
          return [job, ...prev].slice(0, MAX_HISTORY_ITEMS);
        }
      });

      return job;
    } catch (err) {
      console.error('Error polling native job:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (!user) return;

    let filterString = `user_id=eq.${user.id}`;

    const channel = supabase
      .channel(`native_voice_jobs_changes_${treatnotePatientId || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'native_voice_jobs',
          filter: filterString,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newJob = payload.new as NativeVoiceJob;
            const matchesTelephely = !activeTelephelyId || newJob.telephely_id === activeTelephelyId;
            const matchesPatient = treatnotePatientId 
              ? newJob.treatnote_patient_id === treatnotePatientId 
              : newJob.treatnote_patient_id === null;
            
            if (matchesTelephely && matchesPatient) {
              setJobs(prev => [newJob, ...prev].slice(0, MAX_HISTORY_ITEMS));
            }
          } else if (payload.eventType === 'UPDATE') {
            setJobs(prev => prev.map(job =>
              job.id === (payload.new as NativeVoiceJob).id ? (payload.new as NativeVoiceJob) : job
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
  }, [user, activeTelephelyId, treatnotePatientId]);

  return {
    jobs,
    isLoading,
    error,
    refetch: fetchJobs,
    pollJob,
  };
}
