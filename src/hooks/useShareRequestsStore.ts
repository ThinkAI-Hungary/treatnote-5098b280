import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface ShareRequest {
  id: string;
  patient_id: string;
  from_telephely_id: string;
  to_telephely_id: string;
  requested_by: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  message: string | null;
  created_at: string;
  // Snapshots (set by sender)
  patient_name_snapshot?: string | null;
  from_telephely_name_snapshot?: string | null;
  from_company_name_snapshot?: string | null;
  // Enriched
  patient_name?: string;
  from_telephely_name?: string;
  from_company_name?: string | null;
  to_telephely_name?: string;
  to_company_name?: string | null;
}

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

interface ShareRequestsState {
  incoming: ShareRequest[];
  outgoing: ShareRequest[];
  loading: boolean;
  initialized: boolean;
  currentUserId: string | null;
  dismissedIds: Set<string>;
  fetchRequests: (userId: string) => Promise<void>;
  dismissBanner: (id: string) => void;
  acceptRequest: (requestId: string, patientId: string, userId: string) => Promise<boolean>;
  rejectRequest: (requestId: string, patientId: string, userId: string) => Promise<boolean>;
  cancelRequest: (requestId: string, patientId: string, userId: string) => Promise<boolean>;
}

async function enrichWithCompany(
  telephelyRows: any[]
): Promise<Map<string, { name: string; companyName: string | null }>> {
  if (telephelyRows.length === 0) return new Map();
  const companyIds = [...new Set(telephelyRows.map((t) => t.company_id).filter(Boolean))];
  let companyMap = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, display_name, name')
      .in('id', companyIds);
    companyMap = new Map((companies || []).map((c: any) => [c.id, c.display_name || c.name || null]));
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

export const useShareRequestsStore = create<ShareRequestsState>((set, get) => ({
  incoming: [],
  outgoing: [],
  loading: false,
  initialized: false,
  currentUserId: null,
  dismissedIds: new Set<string>(),

  dismissBanner: (id: string) => {
    set((state) => ({ dismissedIds: new Set([...state.dismissedIds, id]) }));
  },

  fetchRequests: async (userId: string) => {
    set({ loading: true });
    try {
      const [allRes, outgoingRes] = await Promise.all([
        // ALL pending requests the user can see (RLS filters by telephely membership)
        supabase
          .from('patient_share_requests')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        // Outgoing: only what this user sent
        supabase
          .from('patient_share_requests')
          .select('*')
          .eq('requested_by', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);

      const allReqs = allRes.data || [];
      const incomingData = allReqs.filter((r: any) => r.requested_by !== userId);
      const outgoingData = outgoingRes.data || [];

      // Collect IDs for enrichment
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
          patient_name: req.patient_name_snapshot || patientMap.get(req.patient_id) || 'Ismeretlen páciens',
          from_telephely_name: req.from_telephely_name_snapshot || fromT?.name || 'Ismeretlen telephely',
          from_company_name: req.from_company_name_snapshot || fromT?.companyName || null,
          to_telephely_name: toT?.name || 'Ismeretlen telephely',
          to_company_name: toT?.companyName || null,
        };
      };

      set({
        incoming: incomingData.map(enrich),
        outgoing: outgoingData.map(enrich),
        initialized: true,
        currentUserId: userId,
      });
    } catch (err) {
      console.error('Error fetching share requests:', err);
    } finally {
      set({ loading: false });
    }
  },

  acceptRequest: async (requestId, patientId, userId) => {
    const { fetchRequests } = get();
    try {
      const { data, error } = await supabase.rpc('accept_share_request', {
        p_request_id: requestId,
        p_resolver_id: userId,
      });

      if (error) throw error;
      if (data && !data.ok) throw new Error(data.error || 'Accept failed');

      await fetchRequests(userId);
      return true;
    } catch (err) {
      console.error('Accept error:', err);
      return false;
    }
  },

  rejectRequest: async (requestId, patientId, userId) => {
    const { incoming, fetchRequests } = get();
    try {
      const req = incoming.find(r => r.id === requestId);
      const { error } = await supabase
        .from('patient_share_requests')
        .update({ status: 'rejected', resolved_by: userId, resolved_at: new Date().toISOString() })
        .eq('id', requestId);
      if (error) throw error;

      await supabase.from('patient_share_log').insert({
        patient_id: patientId,
        from_telephely_id: req?.from_telephely_id,
        to_telephely_id: req?.to_telephely_id,
        action: 'share_rejected',
        performed_by: userId,
        request_id: requestId,
        message: req?.message || null,
      });

      await fetchRequests(userId);
      return true;
    } catch (err) {
      console.error('Reject error:', err);
      return false;
    }
  },

  cancelRequest: async (requestId, patientId, userId) => {
    const { outgoing, fetchRequests } = get();
    try {
      const req = outgoing.find(r => r.id === requestId);
      const { error } = await supabase
        .from('patient_share_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .eq('requested_by', userId)
        .eq('status', 'pending');
      if (error) throw error;

      await supabase.from('patient_share_log').insert({
        patient_id: patientId,
        from_telephely_id: req?.from_telephely_id,
        to_telephely_id: req?.to_telephely_id,
        action: 'share_cancelled',
        performed_by: userId,
        request_id: requestId,
        message: req?.message || null,
      });

      await fetchRequests(userId);
      return true;
    } catch (err) {
      console.error('Cancel error:', err);
      return false;
    }
  },
}));
