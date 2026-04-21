import { useState, useEffect, useCallback } from 'react';
import { useNativeVoiceJobHistory } from './useNativeVoiceJobHistory';
import { useVoiceJobHistory } from './useVoiceJobHistory';
import type { NativeVoiceJob } from './useNativeVoiceJobHistory';
import type { VoiceJob } from './useVoiceJobHistory';

export type UnifiedVoiceJob = (NativeVoiceJob & { isFlexi?: false }) | (VoiceJob & { isFlexi: true });

export function useUnifiedVoiceHistory(treatnotePatientId?: string) {
  const native = useNativeVoiceJobHistory(treatnotePatientId);
  const flexi = useVoiceJobHistory(treatnotePatientId);

  const [jobs, setJobs] = useState<UnifiedVoiceJob[]>([]);

  useEffect(() => {
    const unified: UnifiedVoiceJob[] = [
      ...native.jobs.map(j => ({ ...j, isFlexi: false as const })),
      ...flexi.jobs.map(j => ({ ...j, isFlexi: true as const }))
    ];
    
    // Sort globally by created_at DESC
    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    setJobs(unified);
  }, [native.jobs, flexi.jobs]);

  const refetch = useCallback(async () => {
    await Promise.all([native.refetch(), flexi.refetch()]);
  }, [native.refetch, flexi.refetch]);

  const pollJob = useCallback(async (jobId: string, isFlexi: boolean = false) => {
    if (isFlexi) {
        const job = await flexi.pollJob(jobId);
        return job ? { ...job, isFlexi: true as const } : null;
    } else {
        const job = await native.pollJob(jobId);
        return job ? { ...job, isFlexi: false as const } : null;
    }
  }, [native.pollJob, flexi.pollJob]);

  // If both have errors, return the native one for simplicity
  const error = native.error || flexi.error;

  return {
    jobs,
    isLoading: native.isLoading || flexi.isLoading,
    error,
    refetch,
    pollJob
  };
}
