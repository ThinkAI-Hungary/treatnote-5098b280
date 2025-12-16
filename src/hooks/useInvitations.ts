import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PendingInvitation {
  id: string;
  created_at: string;
  company_name: string;
  telephely_name: string;
  invited_by_name: string;
}

export function useInvitations() {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    if (!user) {
      setInvitations([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'get-pending-invitations' },
      });

      if (error) throw error;
      setInvitations(data.invitations || []);
    } catch (error) {
      console.error('Error loading invitations:', error);
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const respondToInvitation = async (invitationId: string, response: 'accepted' | 'declined') => {
    setResponding(invitationId);
    try {
      const { data, error } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'respond-invitation', invitationId, response },
      });

      if (error) throw error;
      
      // Reload invitations after responding
      await loadInvitations();
      return { success: true, response: data.response };
    } catch (error: any) {
      console.error('Error responding to invitation:', error);
      throw error;
    } finally {
      setResponding(null);
    }
  };

  return {
    invitations,
    loading,
    responding,
    respondToInvitation,
    refresh: loadInvitations,
    hasInvitations: invitations.length > 0,
  };
}