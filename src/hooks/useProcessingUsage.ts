import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MonthlyUsage {
  total: number;
  byType: { ambulans: number; voxis: number; treatnote: number };
  estimatedHuf: number;
}

export function useProcessingUsage(companyId: string | null) {
  const [usage, setUsage] = useState<MonthlyUsage | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data, error } = await supabase
        .from('processing_usage')
        .select('job_type')
        .eq('company_id', companyId)
        .gte('created_at', monthStart);

      if (error) throw error;

      const rows = data || [];
      const byType = {
        ambulans: rows.filter((r) => r.job_type === 'ambulans').length,
        voxis: rows.filter((r) => r.job_type === 'voxis').length,
        treatnote: rows.filter((r) => r.job_type === 'treatnote').length,
      };
      const total = byType.ambulans + byType.voxis + byType.treatnote;

      setUsage({ total, byType, estimatedHuf: total * 1 });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { usage, loading, refresh };
}
