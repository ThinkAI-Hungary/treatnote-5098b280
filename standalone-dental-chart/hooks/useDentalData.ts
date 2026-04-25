/**
 * Hook for loading/saving teeth from/to Supabase.
 *
 * INTEGRATION NOTE: Replace the `supabase` import below with your project's
 * Supabase client path.
 */

import { useState, useEffect, useCallback } from 'react';
// TODO: Update this import to your Supabase client path
// import { supabase } from '@/integrations/supabase/client';
import { useDentalStore } from '../store/dentalStore';
import { dbRowToToothData, toothDataToDbRow } from '../lib/dentalMapping';
import type { TeethRow } from '../lib/dentalMapping';

interface UseDentalDataOptions {
  examinationId: string | null;
  /** Pass your Supabase client instance */
  supabaseClient: any;
}

export function useDentalData({ examinationId, supabaseClient }: UseDentalDataOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasDbData, setHasDbData] = useState(false);

  const { teeth, setTeethFromDatabase, setExaminationId, initializeTeeth } = useDentalStore();

  const loadTeeth = useCallback(async () => {
    if (!examinationId || !supabaseClient) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('teeth')
        .select('*')
        .eq('examination_id', examinationId)
        .order('tooth_number', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        setTeethFromDatabase((data as TeethRow[]).map(dbRowToToothData));
        setExaminationId(examinationId);
        setHasDbData(true);
      } else {
        initializeTeeth();
        setExaminationId(examinationId);
        setHasDbData(false);
      }
    } catch (error: any) {
      console.error('Error loading teeth:', error);
    } finally {
      setIsLoading(false);
    }
  }, [examinationId, supabaseClient, setTeethFromDatabase, setExaminationId, initializeTeeth]);

  useEffect(() => {
    if (examinationId) loadTeeth();
  }, [examinationId, loadTeeth]);

  const saveTeeth = useCallback(async () => {
    if (!examinationId || !supabaseClient) return false;
    setIsSaving(true);
    try {
      const rows = Object.values(teeth).map((tooth) => toothDataToDbRow(tooth, examinationId));
      if (hasDbData) {
        const { error } = await supabaseClient.from('teeth').delete().eq('examination_id', examinationId);
        if (error) throw error;
      }
      const { error } = await supabaseClient.from('teeth').insert(rows);
      if (error) throw error;
      setHasDbData(true);
      return true;
    } catch (error: any) {
      console.error('Error saving teeth:', error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [examinationId, supabaseClient, teeth, hasDbData]);

  return { isLoading, isSaving, hasDbData, loadTeeth, saveTeeth };
}
