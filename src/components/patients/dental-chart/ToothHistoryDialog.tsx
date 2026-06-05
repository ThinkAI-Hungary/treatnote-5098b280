import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, History, RotateCcw, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import DENTAL_STATUSES from '@/components/patients/dental-chart/statuses.json';

interface ToothHistoryDialogProps {
  patientId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface HistoryRecord {
  id: string;
  tooth_number: string;
  operation: string;
  old_state: any;
  new_state: any;
  changed_by: string;
  changed_at: string;
  profile?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export function ToothHistoryDialog({ patientId, isOpen, onOpenChange }: ToothHistoryDialogProps) {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, patientId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data: historyData, error } = await supabase
        .from('dental_chart_history')
        .select('*')
        .eq('patient_id', patientId)
        .order('changed_at', { ascending: false });

      if (error) throw error;

      if (historyData && historyData.length > 0) {
        const userIds = Array.from(new Set(historyData.map(h => h.changed_by).filter(Boolean)));
        
        let profilesMap: Record<string, any> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, full_name, avatar_url')
            .in('user_id', userIds);
            
          if (profiles) {
            profiles.forEach(p => {
              profilesMap[p.user_id] = p;
            });
          }
        }

        const enriched = historyData.map(h => ({
          ...h,
          profile: profilesMap[h.changed_by] || { full_name: 'Ismeretlen felhasználó', avatar_url: null }
        }));

        setHistory(enriched);
      } else {
        setHistory([]);
      }
    } catch (err: any) {
      console.error('Error fetching tooth history:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusName = (statusCode: string) => {
    if (!statusCode || statusCode === 'healthy') return 'Egészséges';
    const flatStatuses = (DENTAL_STATUSES as any[]);
    const codes = statusCode.split(',').map(c => c.trim()).filter(Boolean);
    return codes.map(code => {
      const def = flatStatuses.find(s => s.id === code);
      return def ? def.name : code;
    }).join(', ');
  };

  const renderChanges = (record: HistoryRecord) => {
    if (record.operation === 'INSERT') {
      return <div className="text-sm text-muted-foreground mt-1">Új fog bejegyzés rögzítve (Státusz: <span className="font-medium text-foreground">{getStatusName(record.new_state?.status || '')}</span>)</div>;
    }
    if (record.operation === 'DELETE') {
      return <div className="text-sm text-destructive mt-1">Fog bejegyzés törölve.</div>;
    }

    const oldState = record.old_state || {};
    const newState = record.new_state || {};
    const changes: JSX.Element[] = [];

    // Fields to monitor
    const fieldsToTrack: Record<string, string> = {
      status: 'Státusz',
      surfaces: 'Felszínek',
      notes: 'Megjegyzés',
      mobility: 'Mozgathatóság',
      pocket_depth_mm: 'Tasakmélység',
      gum_recession_mm: 'Ínyvisszahúzódás',
      percussion_sensitive: 'Kopogtatás-érzékeny',
      periapical_lesion: 'Periapikális elváltozás',
      dental_signs: 'Jelek (BNO)',
      prosthetic_type: 'Protetika típusa',
      prosthetic_material: 'Protetika anyaga',
      implant_system: 'Implantátum',
      implant_date: 'Implantálás dátuma',
    };

    Object.keys(fieldsToTrack).forEach(key => {
      const oldVal = oldState[key];
      const newVal = newState[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        const displayOld = key === 'status' ? getStatusName(String(oldVal || '')) : formatValue(oldVal);
        const displayNew = key === 'status' ? getStatusName(String(newVal || '')) : formatValue(newVal);
        changes.push(
          <div key={key} className="text-sm mt-1 grid grid-cols-[140px_1fr] gap-2 items-center">
            <span className="font-medium text-muted-foreground text-xs">{fieldsToTrack[key]}:</span>
            <span className="flex items-center gap-2">
              <span className="line-through text-muted-foreground/60">{displayOld}</span>
              <span className="text-xs">→</span>
              <span className="font-semibold">{displayNew}</span>
            </span>
          </div>
        );
      }
    });

    if (changes.length === 0) {
      return <div className="text-sm text-muted-foreground mt-1 italic">Nincs érdemi változás tárolva.</div>;
    }

    return <div className="space-y-1 bg-muted/20 p-2 rounded-md border border-border/50 mt-2">{changes}</div>;
  };

  const formatValue = (val: any) => {
    if (val === null || val === undefined || val === '') return 'Nincs';
    if (typeof val === 'boolean') return val ? 'Igen' : 'Nem';
    if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : 'Üres';
    if (typeof val === 'object') return 'Bonyolult adat';
    return String(val);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Zsigmondy-kereszt Napló (Változástörténet)
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
             <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-3">
               <Loader2 className="w-8 h-8 animate-spin" />
               <p>Történet betöltése...</p>
             </div>
          ) : history.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-3 p-8 text-center">
               <RotateCcw className="w-12 h-12 opacity-20" />
               <p>Még nem történt naplózott módosítás a fogászati státuszokon ennél a páciensnél.</p>
             </div>
          ) : (
            <ScrollArea className="h-full rounded-md px-6 py-4" style={{ maxHeight: 'calc(85vh - 80px)' }}>
              <div className="relative border-l-2 border-primary/20 ml-4 pb-8 space-y-8">
                {history.map((record) => (
                  <div key={record.id} className="relative pl-6">
                    {/* Timeline dot */}
                    <div className="absolute w-4 h-4 rounded-full bg-primary ring-4 ring-background -left-[9px] top-1" />
                    
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border">
                          <AvatarImage src={record.profile?.avatar_url || ''} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {record.profile?.full_name?.charAt(0) || <User className="w-4 h-4"/>}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold text-sm leading-none">{record.profile?.full_name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(record.changed_at), 'yyyy. MMMM d. HH:mm', { locale: hu })}
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-bold border border-primary/20 shadow-sm flex items-center gap-1.5">
                         <span className="opacity-70 font-medium">Fog:</span> {record.tooth_number}
                      </div>
                    </div>

                    <div className="mt-3">
                      {renderChanges(record)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
