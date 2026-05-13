import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface MappingProgress {
  isRunning: boolean;
  progressPct: number | null;
  progressMsg: string;
}

export function useMappingProgress(telephelyId: string | null, isStdl: boolean, shouldPoll: boolean): MappingProgress {
  const [isRunning, setIsRunning] = useState(false);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!telephelyId || !shouldPoll) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setIsRunning(false);
      setProgressPct(null);
      setProgressMsg('');
      return;
    }

    const checkStatus = async () => {
      try {
        const funcName = isStdl ? 'v2-onboarding-stdl' : 'v2-onboarding';
        const { data } = await supabase.functions.invoke(funcName, {
          body: { operation: 'check-status', telephelyId },
        });

        if (data?.status === 'running') {
          setIsRunning(true);
          setProgressPct(data.details?.progress_percent ?? 0);
          setProgressMsg(data.details?.progress_message ?? 'Folyamatban...');
        } else {
          setIsRunning(false);
          setProgressPct(null);
          setProgressMsg('');
        }
      } catch (err) {
        // ignore errors during polling
      }
    };

    // Check immediately, then poll every 3 seconds
    checkStatus();
    pollRef.current = setInterval(checkStatus, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [telephelyId, isStdl, shouldPoll]);

  return { isRunning, progressPct, progressMsg };
}
