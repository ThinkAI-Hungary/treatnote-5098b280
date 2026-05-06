import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/contexts/AuthContext';

export interface ShareRequest {
  id: string;
  patient_id: string;
  from_telephely_id: string;
  to_telephely_id: string;
  requested_by: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  message: string | null;
  created_at: string;
  // Joined:
  patient_name?: string;
  from_telephely_name?: string;
  from_company_name?: string;
  to_telephely_name?: string;
  to_company_name?: string;
}

/** Build a "Cég neve / Telephely neve" display string */
export function formatSender(req: ShareRequest) {
  const company = req.from_company_name;
  const telephely = req.from_telephely_name;
  if (company && telephely) return `${company} / ${telephely}`;
  return telephely || company || 'Ismeretlen telephely';
}

export function formatTarget(req: ShareRequest) {
  const company = req.to_company_name;
  const telephely = req.to_telephely_name;
  if (company && telephely) return `${company} / ${telephely}`;
  return telephely || company || 'Ismeretlen telephely';
}

/** Fetch company display name for a given telephely row (which includes company_id) */
async function enrichWithCompany(
  telephelyRows: any[]
): Promise<Map<string, { name: string; companyName: string | null }>> {
  const companyIds = [...new Set(telephelyRows.map((t) => t.company_id).filter(Boolean))];

  let companyMap = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, display_name')
      .in('id', companyIds);
    companyMap = new Map((companies || []).map((c: any) => [c.id, c.display_name || c.id]));
  }

  const result = new Map<string, { name: string; companyName: string | null }>();
  for (const t of telephelyRows) {
    result.set(t.id, {
      name: t.display_name || t.name || t.id,
      companyName: t.company_id ? (companyMap.get(t.company_id) || null) : null,
    });
  }
  return result;
}

export function useShareRequests() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [incoming, setIncoming] = useState<ShareRequest[]>([]);
  const [outgoing, setOutgoing] = useState<ShareRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const activeTelephelyId = (profile as any)?.current_telephely_id || (profile as any)?.telephely_id;

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // KEY FIX: Do NOT filter by activeTelephelyId — let the RLS SELECT policy handle it.
      // The RLS ensures the user only sees requests for telephelyek they're a member of.
      const [incomingRes, outgoingRes] = await Promise.all([
        supabase
          .from('patient_share_requests')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        // For outgoing: only show what the current user sent
        supabase
          .from('patient_share_requests')
          .select('*')
          .eq('requested_by', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);

      // Split by direction using activeTelephelyId as hint (may not always be set)
      const allReqs = incomingRes.data || [];

      // Incoming = requests TO any of the user's telephelyek (RLS already filtered)
      // We exclude ones the current user sent themselves
      const incomingData = allReqs.filter((r: any) => r.requested_by !== user.id);
      const outgoingData = outgoingRes.data || [];

      // Collect all telephely IDs for enrichment
      const allTelephelyIds = [
        ...incomingData.map((r: any) => r.from_telephely_id),
        ...incomingData.map((r: any) => r.to_telephely_id),
        ...outgoingData.map((r: any) => r.from_telephely_id),
        ...outgoingData.map((r: any) => r.to_telephely_id),
      ].filter(Boolean);

      const allPatientIds = [
        ...incomingData.map((r: any) => r.patient_id),
        ...outgoingData.map((r: any) => r.patient_id),
      ].filter(Boolean);

      const [patientsRes, telephelyRes] = await Promise.all([
        allPatientIds.length > 0
          ? supabase
              .from('patient_alap_adatok')
              .select('id, vezeteknev, keresztnev, titulus')
              .in('id', [...new Set(allPatientIds)])
          : Promise.resolve({ data: [] }),
        allTelephelyIds.length > 0
          ? supabase
              .from('telephely')
              .select('id, name, display_name, company_id')
              .in('id', [...new Set(allTelephelyIds)])
          : Promise.resolve({ data: [] }),
      ]);

      const patientMap = new Map(
        (patientsRes.data || []).map((p: any) => [
          p.id,
          [p.titulus, p.vezeteknev, p.keresztnev].filter(Boolean).join(' '),
        ])
      );

      const telephelyMap = await enrichWithCompany(telephelyRes.data || []);

      const enrich = (req: any): ShareRequest => {
        const fromT = telephelyMap.get(req.from_telephely_id);
        const toT = telephelyMap.get(req.to_telephely_id);
        return {
          ...req,
          // Prefer snapshot data (set by sender at request time) over live lookup
          patient_name: req.patient_name_snapshot || patientMap.get(req.patient_id) || 'Ismeretlen páciens',
          from_telephely_name: req.from_telephely_name_snapshot || fromT?.name || 'Ismeretlen telephely',
          from_company_name: req.from_company_name_snapshot || fromT?.companyName || null,
          to_telephely_name: toT?.name || 'Ismeretlen telephely',
          to_company_name: toT?.companyName || null,
        };
      };

      setIncoming(incomingData.map(enrich));
      setOutgoing(outgoingData.map(enrich));
    } catch (err) {
      console.error('Error fetching share requests:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Realtime: re-fetch on any change to patient_share_requests
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`share_requests_user_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patient_share_requests' },
        () => { fetchRequests(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchRequests]);

  const acceptRequest = async (requestId: string, patientId: string) => {
    if (!user) return false;
    try {
      const req = incoming.find(r => r.id === requestId);
      const toTelephelyId = req?.to_telephely_id || activeTelephelyId;

      const { error: updateErr } = await supabase
        .from('patient_share_requests')
        .update({ status: 'accepted', resolved_by: user.id, resolved_at: new Date().toISOString() })
        .eq('id', requestId);
      if (updateErr) throw updateErr;

      // Add this telephely to patient's telephely_ids
      const { data: patient } = await supabase
        .from('patient_alap_adatok')
        .select('telephely_ids')
        .eq('id', patientId)
        .single();

      const currentIds: string[] = patient?.telephely_ids || [];
      if (toTelephelyId && !currentIds.includes(toTelephelyId)) {
        await supabase
          .from('patient_alap_adatok')
          .update({ telephely_ids: [...currentIds, toTelephelyId] })
          .eq('id', patientId);
      }

      await supabase.from('patient_share_log').insert({
        patient_id: patientId,
        from_telephely_id: req?.from_telephely_id || activeTelephelyId,
        to_telephely_id: toTelephelyId,
        action: 'share_accepted',
        performed_by: user.id,
        request_id: requestId,
        message: req?.message || null,
      });

      fetchRequests();
      return true;
    } catch (err: any) {
      console.error('Accept error:', err);
      return false;
    }
  };

  const rejectRequest = async (requestId: string, patientId: string) => {
    if (!user) return false;
    try {
      const req = incoming.find(r => r.id === requestId);

      const { error } = await supabase
        .from('patient_share_requests')
        .update({ status: 'rejected', resolved_by: user.id, resolved_at: new Date().toISOString() })
        .eq('id', requestId);
      if (error) throw error;

      await supabase.from('patient_share_log').insert({
        patient_id: patientId,
        from_telephely_id: req?.from_telephely_id || activeTelephelyId,
        to_telephely_id: req?.to_telephely_id || activeTelephelyId,
        action: 'share_rejected',
        performed_by: user.id,
        request_id: requestId,
        message: req?.message || null,
      });

      fetchRequests();
      return true;
    } catch (err: any) {
      console.error('Reject error:', err);
      return false;
    }
  };

  const cancelRequest = async (requestId: string, patientId: string) => {
    if (!user) return false;
    try {
      const req = outgoing.find(r => r.id === requestId);

      const { error } = await supabase
        .from('patient_share_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .eq('requested_by', user.id)
        .eq('status', 'pending');
      if (error) throw error;

      await supabase.from('patient_share_log').insert({
        patient_id: patientId,
        from_telephely_id: req?.from_telephely_id || activeTelephelyId,
        to_telephely_id: req?.to_telephely_id || activeTelephelyId,
        action: 'share_cancelled',
        performed_by: user.id,
        request_id: requestId,
        message: req?.message || null,
      });

      fetchRequests();
      return true;
    } catch (err: any) {
      console.error('Cancel error:', err);
      return false;
    }
  };

  return { incoming, outgoing, loading, fetchRequests, acceptRequest, rejectRequest, cancelRequest };
}
