import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { subscribeToRulesChanges } from '@/lib/rulesEvents';

interface UseSzotarStdlReturn {
  hasSzotarNative: boolean;
  hasNativeRules: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useSzotarStdl(): UseSzotarStdlReturn {
  const { profile, loading: profileLoading } = useProfile();
  const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id || null;

  const [hasSzotarNative, setHasSzotarNative] = useState(false);
  const [hasNativeRules, setHasNativeRules] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNativeData = useCallback(async () => {
    if (!activeTelephelyId) {
      setHasSzotarNative(false);
      setHasNativeRules(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [telephelyRes, szotarRes, rulesRes, lockedRes] = await Promise.all([
        supabase
          .from('telephely')
          .select('use_default_library')
          .eq('id', activeTelephelyId)
          .single(),
        supabase
          .from('clinic_treatment_items_stdl')
          .select('id', { count: 'exact', head: true })
          .eq('telephely_id', activeTelephelyId),
        supabase
          .from('treatment_rules_stdl')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', activeTelephelyId)
          .eq('aktiv', true),
        supabase
          .from('clinic_item_overrides')
          .select('id', { count: 'exact', head: true })
          .eq('telephely_id', activeTelephelyId)
          .eq('is_locked', true)
      ]);

      const useDefault = telephelyRes.data?.use_default_library || false;
      const hasCustomItems = (szotarRes.count || 0) > 0;
      const hasLockedItems = (lockedRes.count || 0) > 0;
      
      setHasSzotarNative(useDefault || hasCustomItems || hasLockedItems);
      setHasNativeRules((rulesRes.count || 0) > 0);
    } catch (err) {
      console.error('Error fetching native szotar/rules:', err);
      setHasSzotarNative(false);
      setHasNativeRules(false);
    } finally {
      setIsLoading(false);
    }
  }, [activeTelephelyId]);

  useEffect(() => {
    if (!profileLoading) {
      fetchNativeData();
    }
  }, [profileLoading, fetchNativeData]);

  useEffect(() => {
    if (!activeTelephelyId) return;

    const channel = supabase
      .channel(`szotar-stdl-${activeTelephelyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'telephely', filter: `id=eq.${activeTelephelyId}` }, fetchNativeData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_treatment_items_stdl', filter: `telephely_id=eq.${activeTelephelyId}` }, fetchNativeData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'treatment_rules_stdl', filter: `clinic_id=eq.${activeTelephelyId}` }, fetchNativeData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_item_overrides', filter: `telephely_id=eq.${activeTelephelyId}` }, fetchNativeData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTelephelyId, fetchNativeData]);

  // Subscribe to manual trigger events
  useEffect(() => {
    const handleDataChanged = () => {
      fetchNativeData();
    };
    
    window.addEventListener('SZOTAR_DATA_CHANGED', handleDataChanged);
    const unsubscribeRules = subscribeToRulesChanges(handleDataChanged);

    return () => {
      window.removeEventListener('SZOTAR_DATA_CHANGED', handleDataChanged);
      unsubscribeRules();
    };
  }, [fetchNativeData]);

  return {
    hasSzotarNative,
    hasNativeRules,
    isLoading: isLoading || profileLoading,
    refresh: fetchNativeData,
  };
}
