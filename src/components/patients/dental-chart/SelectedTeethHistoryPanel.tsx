import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, History, Clock, User, Building2, ChevronDown, ChevronUp, Stethoscope } from 'lucide-react';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Tooth } from '@/components/patients/dental-chart/Tooth';
import { ToothModel } from '@/components/patients/dental-chart/types';
import DENTAL_STATUSES from '@/components/patients/dental-chart/statuses.json';

interface SelectedTeethHistoryPanelProps {
  patientId: string;
  selectedTeeth: string[];
}

export interface UnifiedHistoryRecord {
  id: string;
  type: 'status_change' | 'treatment_plan';
  tooth_number: string;
  date: string;
  user_name: string;
  user_avatar: string | null;
  company_name: string | null;
  clinic_name: string;
  
  // Status Change specific
  operation?: string;
  old_state?: any;
  new_state?: any;
  
  // Treatment Plan specific
  treatment_name?: string;
  treatment_status?: string;
  plan_id?: string;
}

export function SelectedTeethHistoryPanel({ patientId, selectedTeeth }: SelectedTeethHistoryPanelProps) {
  const [history, setHistory] = useState<UnifiedHistoryRecord[]>([]);
  const [currentTeethData, setCurrentTeethData] = useState<Record<string, ToothModel>>({});
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [latestPlanId, setLatestPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTeeth.length > 0) {
      loadData();
    } else {
      setShowHistory(false); // Reset when no teeth selected
    }

    const handleUpdate = () => {
      if (selectedTeeth.length > 0) {
        loadData();
      }
    };

    window.addEventListener('dental-chart-updated', handleUpdate);
    return () => window.removeEventListener('dental-chart-updated', handleUpdate);
  }, [patientId, selectedTeeth]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 0. Fetch Current Dental Chart Data
      const { data: chartData, error: chartErr } = await supabase
        .from('dental_chart')
        .select('*')
        .eq('patient_id', patientId)
        .in('tooth_number', selectedTeeth);
        
      if (chartErr) throw chartErr;
      
      const chartMap: Record<string, ToothModel> = {};
      selectedTeeth.forEach(tooth => {
        const found = chartData?.find(d => d.tooth_number === tooth);
        chartMap[tooth] = found || { tooth_number: tooth, status: 'healthy', surfaces: null };
      });
      setCurrentTeethData(chartMap);

      // 1. Fetch dental_chart_history
      const { data: statusHistory, error: statusErr } = await supabase
        .from('dental_chart_history')
        .select('*')
        .eq('patient_id', patientId)
        .in('tooth_number', selectedTeeth);

      if (statusErr) throw statusErr;

      // 2. Fetch patient_treatment_plan_items
      const { data: treatmentItems, error: treatErr } = await supabase
        .from('patient_treatment_plan_items')
        .select(`
          id,
          fog,
          name,
          status,
          created_at,
          plan_id,
          patient_treatment_plans!inner (
            user_id,
            telephely_id,
            patient_id,
            created_at
          )
        `)
        .eq('patient_treatment_plans.patient_id', patientId)
        .in('fog', selectedTeeth);

      if (treatErr) throw treatErr;
      
      // Get the latest plan id for the patient to filter "Current Planned" correctly
      const { data: latestPlan } = await supabase
        .from('patient_treatment_plans')
        .select('id')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
        
      setLatestPlanId(latestPlan?.id || null);

      const userIds = new Set<string>();
      const telephelyIds = new Set<string>();

      if (statusHistory) {
        statusHistory.forEach(h => {
          if (h.changed_by) userIds.add(h.changed_by);
        });
      }

      const validTreatmentItems = (treatmentItems || []).filter(item => item.patient_treatment_plans !== null);
      validTreatmentItems.forEach(item => {
        const plan = item.patient_treatment_plans as any;
        if (plan.user_id) userIds.add(plan.user_id);
        if (plan.telephely_id) telephelyIds.add(plan.telephely_id);
      });

      // Fetch Profiles (with company_name)
      const profilesMap: Record<string, any> = {};
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url, current_telephely_id, telephely_id, company_name')
          .in('user_id', Array.from(userIds));
        if (profiles) {
          profiles.forEach(p => {
            profilesMap[p.user_id] = p;
            if (p.current_telephely_id) telephelyIds.add(p.current_telephely_id);
            else if (p.telephely_id) telephelyIds.add(p.telephely_id);
          });
        }
      }

      // Fetch Telephely
      const telephelyMap: Record<string, string> = {};
      if (telephelyIds.size > 0) {
        const { data: telephelys } = await supabase
          .from('telephely')
          .select('id, name')
          .in('id', Array.from(telephelyIds));
        if (telephelys) {
          telephelys.forEach(t => {
            telephelyMap[t.id] = t.name;
          });
        }
      }

      const unifiedRecords: UnifiedHistoryRecord[] = [];

      // Build Status Change Records
      if (statusHistory) {
        statusHistory.forEach(h => {
          const profile = profilesMap[h.changed_by] || {};
          const tId = profile.current_telephely_id || profile.telephely_id;
          const clinicName = tId ? telephelyMap[tId] : 'Ismeretlen rendelő';
          
          unifiedRecords.push({
            id: `status_${h.id}`,
            type: 'status_change',
            tooth_number: h.tooth_number,
            date: h.changed_at,
            user_name: profile.full_name || 'Ismeretlen felhasználó',
            user_avatar: profile.avatar_url || null,
            company_name: profile.company_name || null,
            clinic_name: clinicName || 'Ismeretlen rendelő',
            operation: h.operation,
            old_state: h.old_state,
            new_state: h.new_state
          });
        });
      }

      // Build Treatment Plan Records
      validTreatmentItems.forEach(item => {
        const plan = item.patient_treatment_plans as any;
        const profile = profilesMap[plan.user_id] || {};
        const clinicName = plan.telephely_id ? telephelyMap[plan.telephely_id] : 'Ismeretlen rendelő';

        unifiedRecords.push({
          id: `treat_${item.id}`,
          type: 'treatment_plan',
          tooth_number: item.fog!,
          date: item.created_at,
          user_name: profile.full_name || 'Ismeretlen felhasználó',
          user_avatar: profile.avatar_url || null,
          company_name: profile.company_name || null,
          clinic_name: clinicName || 'Ismeretlen rendelő',
          treatment_name: item.name,
          treatment_status: item.status,
          plan_id: item.plan_id
        });
      });

      // Sort by date descending
      unifiedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setHistory(unifiedRecords);
    } catch (err: any) {
      console.error('Error fetching unified tooth data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusName = (statusCode: string) => {
    if (!statusCode || statusCode === 'healthy') return 'Egészséges';
    const flatStatuses = Object.values(DENTAL_STATUSES).flat();
    // Handle comma-separated status codes
    const codes = statusCode.split(',').map(c => c.trim()).filter(Boolean);
    const names = codes.map(code => {
      const statusDef = flatStatuses.find(s => s.id === code);
      return statusDef ? statusDef.name : code;
    });
    return names.join(', ');
  };

  const formatValue = (val: any) => {
    if (val === null || val === undefined || val === '') return '-';
    if (typeof val === 'boolean') return val ? 'Igen' : 'Nem';
    if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : '-';
    if (typeof val === 'object') return '...';
    return String(val);
  };

  const renderConciseStatusChanges = (record: UnifiedHistoryRecord) => {
    if (record.operation === 'INSERT') {
      return <div className="text-sm">Új státusz rögzítve: <span className="font-semibold">{getStatusName(record.new_state?.status)}</span></div>;
    }
    if (record.operation === 'DELETE') {
      return <div className="text-sm text-destructive">Fog bejegyzés törölve.</div>;
    }

    const oldState = record.old_state || {};
    const newState = record.new_state || {};
    const changes: JSX.Element[] = [];

    const fieldsToTrack: Record<string, string> = {
      status: 'Státusz',
      surfaces: 'Felszínek',
      notes: 'Megjegyzés'
    };

    Object.keys(fieldsToTrack).forEach(key => {
      const oldVal = oldState[key];
      const newVal = newState[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        let oldStr = key === 'status' ? getStatusName(oldVal) : formatValue(oldVal);
        let newStr = key === 'status' ? getStatusName(newVal) : formatValue(newVal);
        changes.push(
          <span key={key} className="mr-3">
            <span className="text-muted-foreground">{fieldsToTrack[key]}: </span>
            <span className="line-through opacity-70 text-xs">{oldStr}</span>
            <span className="mx-1">→</span>
            <span className="font-semibold">{newStr}</span>
          </span>
        );
      }
    });

    if (changes.length === 0) {
      return <div className="text-sm text-muted-foreground italic">Kisebb módosítás (pl. jelek/státusz finomhangolása)</div>;
    }

    return <div className="text-sm">{changes}</div>;
  };

  if (selectedTeeth.length === 0) return null;

  return (
    <Card className="flex flex-col border-primary/30 shadow-md animate-in fade-in slide-in-from-bottom-4 bg-background">
      <CardHeader className="pb-4 border-b bg-primary/5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary" />
            {selectedTeeth.length === 1 ? 'Kijelölt fog adatai' : 'Kijelölt fogak adatai'}
          </CardTitle>
          <Button 
            variant={showHistory ? "default" : "outline"}
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 transition-all"
          >
            <History className="w-4 h-4" />
            {showHistory ? 'Előélet elrejtése' : 'Előélet megtekintése'}
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex flex-col">
        {loading && !showHistory ? (
          <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-muted/5">
            {selectedTeeth.map(toothNum => {
              const data = currentTeethData[toothNum];
              if (!data) return null;
              
              return (
                <div key={toothNum} className="flex items-center gap-6 bg-background p-4 rounded-xl border shadow-sm hover:shadow-md transition-all">
                  {/* Visual Tooth representation - using CSS transform to scale it up slightly */}
                  <div className="shrink-0 scale-125 transform-origin-center p-2">
                    <Tooth number={toothNum} data={data} selected={false} onClick={() => {}} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="text-xs font-bold text-muted-foreground mb-1">
                      {toothNum}. FOG
                    </div>
                    <div className="font-semibold text-foreground text-sm flex flex-col gap-1">
                      <span>{getStatusName(data.status)}</span>
                      
                      {data.dental_signs && data.dental_signs.length > 0 && (
                        <span className="text-xs font-normal text-amber-600">Jelek: {data.dental_signs.join(', ')}</span>
                      )}
                      
                      {(() => {
                        const planned = history.filter(h => 
                          h.tooth_number === toothNum && 
                          h.type === 'treatment_plan' && 
                          h.treatment_status === 'planned' &&
                          h.plan_id === latestPlanId
                        );
                        if (planned.length > 0) {
                          return (
                            <div className="flex flex-col gap-0.5 mt-1">
                              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Tervezett kezelés:</span>
                              {planned.map((p, idx) => (
                                <span key={idx} className="text-xs font-normal text-indigo-700 truncate" title={p.treatment_name}>
                                  • {p.treatment_name}
                                </span>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    {data.surfaces && (
                      <div className="text-xs font-mono text-primary bg-primary/10 w-fit px-1.5 py-0.5 rounded mt-1">
                        {data.surfaces}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* History Timeline - Collapsible */}
        {showHistory && (
          <div className="border-t bg-background/50">
            <ScrollArea className="max-h-[500px]">
              {loading ? (
                 <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-3">
                   <Loader2 className="w-8 h-8 animate-spin" />
                   <p>Előélet betöltése...</p>
                 </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-3 text-center">
                   <History className="w-10 h-10 opacity-20" />
                   <p>Még nem történt naplózott módosítás vagy kezelés a kijelölt fogaknál.</p>
                 </div>
              ) : (
                <div className="relative border-l-2 border-primary/20 ml-6 pb-8 pt-6 space-y-6 px-6">
                  {history.map((record) => (
                    <div key={record.id} className="relative pl-6">
                      {/* Timeline dot */}
                      <div className={`absolute w-3 h-3 rounded-full ring-4 ring-background -left-[30px] top-1.5 ${record.type === 'treatment_plan' ? 'bg-indigo-500' : 'bg-primary'}`} />
                      
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border shadow-sm">
                            <AvatarImage src={record.user_avatar || ''} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {record.user_name?.charAt(0) || <User className="w-3 h-3"/>}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col justify-center">
                            <div className="font-semibold text-sm leading-none flex items-center gap-2">
                              {record.user_name}
                              {record.company_name && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider">
                                  {record.company_name}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(record.date), 'yyyy. MM. dd. HH:mm', { locale: hu })}
                              </span>
                              <span className="flex items-center gap-1 text-primary/70">
                                <Building2 className="w-3 h-3" />
                                {record.clinic_name}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center bg-muted/50 text-muted-foreground px-2 py-0.5 rounded text-xs font-bold border gap-1.5 whitespace-nowrap">
                           FOG: <span className="text-foreground">{record.tooth_number}</span>
                        </div>
                      </div>

                      <div className="mt-1.5 p-2.5 rounded-md border bg-muted/20">
                        {record.type === 'status_change' ? renderConciseStatusChanges(record) : (
                           <div className="flex items-center gap-2 text-sm">
                             <span className="font-semibold text-indigo-700">Kezelési terv:</span>
                             <span>{record.treatment_name}</span>
                             <span className="text-xs opacity-60 ml-2">({record.treatment_status === 'completed' ? 'Elvégezve' : 'Tervezett'})</span>
                           </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
