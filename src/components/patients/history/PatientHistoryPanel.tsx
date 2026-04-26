import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, History, Stethoscope, User, Search, Maximize2, X, Hash, Filter } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { hu } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import statusesData from '@/components/patients/dental-chart/statuses.json';

const statusNames: Record<string, string> = {};
statusesData.forEach((s: any) => {
  statusNames[s.id] = s.name;
});

interface PatientHistoryPanelProps {
  patientId: string;
  filterType?: 'status' | 'treatment_plan' | 'all';
}

type EventType = 'status_change' | 'treatment_plan' | 'batched_status_change';

interface UnifiedEvent {
  id: string;
  type: EventType;
  date: string;
  userId: string | null;
  profile?: {
    full_name: string;
    avatar_url: string | null;
  };
  summary: string;
  icon: JSX.Element;
  rawData: any;
  batchedEvents?: any[];
  relatedTeeth?: string[];
}

export function PatientHistoryPanel({ patientId, filterType = 'all' }: PatientHistoryPanelProps) {
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail popup state
  const [selectedEvent, setSelectedEvent] = useState<UnifiedEvent | null>(null);

  // Full screen history state
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [filterTooth, setFilterTooth] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [strictToothMatch, setStrictToothMatch] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [patientId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data: statusHistory, error: statusError } = await supabase
        .from('dental_chart_history')
        .select('*')
        .eq('patient_id', patientId);

      if (statusError) throw statusError;

      const { data: treatmentPlans, error: plansError } = await supabase
        .from('patient_treatment_plans')
        .select(`
          *,
          items:patient_treatment_plan_items (*)
        `)
        .eq('patient_id', patientId);

      if (plansError) throw plansError;

      const userIds = new Set<string>();
      statusHistory?.forEach(h => { if (h.changed_by) userIds.add(h.changed_by); });
      treatmentPlans?.forEach(p => { if (p.user_id) userIds.add(p.user_id); });

      const profilesMap: Record<string, any> = {};
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', Array.from(userIds));

        if (profiles) {
          profiles.forEach(p => { profilesMap[p.user_id] = p; });
        }
      }

      const unified: UnifiedEvent[] = [];

      // Process Status History into Batches
      const statusEvents: any[] = (statusHistory || []).filter(h => h.operation !== 'DELETE');
      statusEvents.sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());

      let currentBatch: any[] = [];
      const createBatchEvent = (batch: any[]): UnifiedEvent => {
        if (batch.length === 1) {
          const h = batch[0];
          const isInsert = h.operation === 'INSERT';
          let summary = `Fogstátusz módosítva (${h.tooth_number}. fog)`;
          if (isInsert) summary = `Új fogstátusz rögzítve (${h.tooth_number}. fog)`;

          return {
            id: h.id,
            type: 'status_change',
            date: h.changed_at,
            userId: h.changed_by,
            profile: profilesMap[h.changed_by],
            summary,
            icon: <span className="text-blue-500 font-bold font-serif">W</span>,
            rawData: h,
            relatedTeeth: [String(h.tooth_number)]
          };
        }

        const first = batch[0];
        const last = batch[batch.length - 1];
        const uniqueTeeth = Array.from(new Set(batch.map(b => String(b.tooth_number))));

        return {
          id: `batch_${first.id}`,
          type: 'batched_status_change',
          date: last.changed_at,
          userId: first.changed_by,
          profile: profilesMap[first.changed_by],
          summary: `${batch.length} fogstátusz módosítás rögzítve`,
          icon: <span className="text-blue-500 font-bold font-serif">W</span>,
          rawData: null,
          batchedEvents: batch.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()),
          relatedTeeth: uniqueTeeth
        };
      };

      for (const ev of statusEvents) {
        if (currentBatch.length === 0) {
          currentBatch.push(ev);
        } else {
          const lastEv = currentBatch[currentBatch.length - 1];
          const isSameUser = ev.changed_by === lastEv.changed_by;
          const timeDiff = Math.abs(differenceInMinutes(new Date(ev.changed_at), new Date(lastEv.changed_at)));

          if (isSameUser && timeDiff <= 15) {
            currentBatch.push(ev);
          } else {
            unified.push(createBatchEvent(currentBatch));
            currentBatch = [ev];
          }
        }
      }
      if (currentBatch.length > 0) {
        unified.push(createBatchEvent(currentBatch));
      }

      // Add treatment plans
      treatmentPlans?.forEach(p => {
        const itemsCount = p.items?.length || 0;
        const relatedTeeth = p.items ? Array.from(new Set(p.items.map((i: any) => String(i.fog)).filter(Boolean))) : [];
        unified.push({
          id: p.id,
          type: 'treatment_plan',
          date: p.created_at,
          userId: p.user_id,
          profile: profilesMap[p.user_id],
          summary: `Kezelési terv rögzítve (${itemsCount} tétel)`,
          icon: <Stethoscope className="w-5 h-5 text-emerald-500" />,
          rawData: p,
          relatedTeeth: relatedTeeth as string[]
        });
      });

      unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEvents(unified);

    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (val: any, fieldKey?: string) => {
    if (val === null || val === undefined || val === '') return 'Üres';
    if (typeof val === 'boolean') return val ? 'Igen' : 'Nem';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'Üres';
      if (fieldKey === 'status') {
        return val.map(v => statusNames[v] || v).join(', ');
      }
      return val.join(', ');
    }
    if (typeof val === 'object') return 'Bonyolult adat';
    if (fieldKey === 'status' && typeof val === 'string') {
      return statusNames[val] || val;
    }
    return String(val);
  };

  const renderStatusChangeFields = (record: any) => {
    // Treat INSERT as transitioning from an empty object
    const oldState = record.operation === 'INSERT' ? {} : (record.old_state || {});
    const newState = record.new_state || {};
    const changes: JSX.Element[] = [];

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
      prosthetic_type: 'Protetika',
      implant_system: 'Implantátum',
    };

    Object.keys(fieldsToTrack).forEach(key => {
      const oldVal = oldState[key];
      const newVal = newState[key];

      const isEmpty = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

      // If both are empty (or both didn't exist), don't show anything
      if (isEmpty(oldVal) && isEmpty(newVal)) return;

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push(
          <div key={key} className="grid grid-cols-[140px_1fr] gap-2 py-1 border-b last:border-0 text-sm items-center">
            <span className="font-medium text-muted-foreground">{fieldsToTrack[key]}:</span>
            <span className="flex items-center gap-2 flex-wrap">
              <span className="line-through text-muted-foreground opacity-60">{formatValue(oldVal, key)}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-semibold text-primary">{formatValue(newVal, key)}</span>
            </span>
          </div>
        );
      }
    });

    if (changes.length === 0) return null;
    return <div className="space-y-1 bg-muted/20 p-3 rounded-md border mt-2">{changes}</div>;
  };

  const renderStatusChanges = (record: any) => {
    const fields = renderStatusChangeFields(record);
    if (!fields && record.operation !== 'INSERT') return <p className="text-sm text-muted-foreground italic">Nincs érdemi változás.</p>;
    return fields;
  };

  const renderTreatmentPlanDetails = (plan: any, filterToothStr?: string) => {
    let items = plan.items || [];
    if (filterToothStr && strictToothMatch) {
      items = items.filter((i: any) => String(i.fog) === filterToothStr);
    }
    if (items.length === 0) return <p className="text-sm text-muted-foreground italic">Nincs a szűrésnek megfelelő tétel.</p>;

    const visits = new Map<number, any[]>();
    items.forEach((item: any) => {
      const v = item.vizit || 1;
      if (!visits.has(v)) visits.set(v, []);
      visits.get(v)!.push(item);
    });

    const sortedVisits = Array.from(visits.entries()).sort((a, b) => a[0] - b[0]);

    return (
      <div className="space-y-4">
        {sortedVisits.map(([visitNumber, visitItems]) => (
          <div key={visitNumber} className="border rounded-md overflow-hidden">
            <div className="bg-muted/30 px-4 py-2 border-b font-medium text-sm flex justify-between">
              <span>{visitNumber}. Ülés</span>
              <span className="text-muted-foreground text-xs">{visitItems.length} tétel</span>
            </div>
            <div className="p-2 space-y-2">
              {visitItems.map((item: any) => (
                <div key={item.id} className="flex justify-between items-start p-2 hover:bg-muted/10 rounded-sm text-sm">
                  <div>
                    <div className="font-medium">{item.name} {item.quantity > 1 ? `(x${item.quantity})` : ''}</div>
                    <div className="text-xs text-muted-foreground capitalize mt-0.5">{item.szakterulet}</div>
                  </div>
                  <div className="font-mono text-xs px-2 py-1 bg-primary/5 text-primary rounded border border-primary/20 whitespace-nowrap">
                    {item.fog ? `${item.fog}. fog` : 'SZÁJÜREG'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const baseEvents = useMemo(() => {
    return events.filter(ev => {
      if (filterType === 'status' && ev.type === 'treatment_plan') return false;
      if (filterType === 'treatment_plan' && ev.type !== 'treatment_plan') return false;
      return true;
    });
  }, [events, filterType]);

  const filteredEvents = useMemo(() => {
    return baseEvents.filter(ev => {
      if (filterDoctor !== 'all' && ev.userId !== filterDoctor) return false;
      if (filterDate && !ev.date.startsWith(filterDate)) return false;
      if (filterTooth) {
        if (!ev.relatedTeeth?.includes(filterTooth)) return false;
      }
      return true;
    });
  }, [events, filterDoctor, filterDate, filterTooth, filterType]);

  const uniqueDoctors = useMemo(() => {
    const docs = new Map();
    baseEvents.forEach(e => {
      if (e.userId && e.profile) {
        docs.set(e.userId, e.profile.full_name);
      }
    });
    return Array.from(docs.entries());
  }, [baseEvents]);

  const EventRow = ({ ev }: { ev: UnifiedEvent }) => (
    <div className="relative pl-6">
      <div className="absolute w-6 h-6 rounded-full bg-background border-2 border-primary shadow-sm -left-[13px] top-0 flex items-center justify-center z-10">
        <div className="w-2.5 h-2.5 rounded-full bg-primary" />
      </div>

      <div className="bg-card border shadow-sm rounded-lg overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group" onClick={() => setSelectedEvent(ev)}>
        <div className="px-4 py-3 flex items-center justify-between bg-muted/5 group-hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {ev.icon}
            </div>
            <div>
              <div className="font-semibold text-sm group-hover:text-primary transition-colors">{ev.summary}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                <span>{format(new Date(ev.date), 'yyyy. MMMM d. HH:mm', { locale: hu })}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  {ev.profile?.full_name || 'Ismeretlen'}
                </span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-8">
            Részletek
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Card className="flex flex-col h-full w-full border-border/50 shadow-sm overflow-hidden bg-background">
      <CardHeader className="px-6 py-4 border-b bg-muted/10 pb-3 shrink-0 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          {filterType === 'status' ? 'Státusz Napló' : filterType === 'treatment_plan' ? 'Kezelési Terv Napló' : 'Történet (Napló)'}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setShowFullHistory(true)} className="h-8 text-xs font-medium">
          <Maximize2 className="h-3.5 w-3.5 mr-1.5" />
          Teljes Napló
        </Button>
      </CardHeader>

      <div className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full w-full absolute inset-0">
          <div className="p-4 md:p-6">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : baseEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-3">
                <History className="w-12 h-12 opacity-20" />
                <p>Még nincsenek rögzített előzmények.</p>
              </div>
            ) : (
              <div className="relative border-l-2 border-primary/20 ml-4 pb-4 space-y-6">
                {baseEvents.map((ev) => (
                  <EventRow key={ev.id} ev={ev} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Részletek Popup */}
      <Dialog open={!!selectedEvent && !showFullHistory} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 py-4 border-b bg-muted/5">
            <DialogTitle className="flex items-center gap-2">
              {selectedEvent?.icon}
              {selectedEvent?.summary}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4 border-b bg-muted/10 flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <Avatar className="w-6 h-6 border">
                <AvatarImage src={selectedEvent?.profile?.avatar_url || ''} />
                <AvatarFallback className="text-[10px]"><User className="w-3 h-3" /></AvatarFallback>
              </Avatar>
              <span className="font-medium">{selectedEvent?.profile?.full_name || 'Ismeretlen rögzítő'}</span>
            </div>
            <span className="text-muted-foreground">
              {selectedEvent?.date && format(new Date(selectedEvent.date), 'yyyy. MMMM d. HH:mm', { locale: hu })}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {selectedEvent?.type === 'status_change' && renderStatusChanges(selectedEvent.rawData)}
            {selectedEvent?.type === 'batched_status_change' && (
              <div className="space-y-6">
                {selectedEvent.batchedEvents?.map((ev: any, i: number) => (
                  <div key={ev.id} className="relative">
                    <div className="font-medium text-primary mb-2 flex items-center gap-2">
                      <Hash className="h-4 w-4" /> {ev.tooth_number}. fog
                      <span className="text-xs text-muted-foreground font-normal ml-auto">
                        {format(new Date(ev.changed_at), 'HH:mm')}
                      </span>
                    </div>
                    {renderStatusChanges(ev)}
                    {i < (selectedEvent.batchedEvents?.length || 0) - 1 && <div className="h-px bg-border my-4" />}
                  </div>
                ))}
              </div>
            )}
            {selectedEvent?.type === 'treatment_plan' && renderTreatmentPlanDetails(selectedEvent.rawData, filterTooth)}
          </div>
        </DialogContent>
      </Dialog>

      {/* Teljes Napló Popup (Nagyképernyős) */}
      <Dialog open={showFullHistory} onOpenChange={setShowFullHistory}>
        <DialogContent className="max-w-5xl w-[90vw] h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b shrink-0 flex flex-row items-center justify-between bg-muted/5">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <History className="h-6 w-6 text-primary" />
              Teljes Történet Napló
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* Filters Sidebar */}
            <div className="w-64 border-r bg-muted/10 p-4 shrink-0 flex flex-col gap-6 overflow-y-auto">
              <div>
                <h3 className="font-medium flex items-center gap-2 mb-3 text-sm">
                  <Filter className="h-4 w-4" /> Szűrők
                </h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Fogszám</Label>
                    <Input
                      placeholder="Pl. 11, 24"
                      value={filterTooth}
                      onChange={(e) => setFilterTooth(e.target.value)}
                      className="h-8 text-sm"
                    />
                    {filterTooth && (
                      <div className="flex items-center space-x-2 mt-2 bg-muted/30 p-2 rounded-md border">
                        <Switch id="strict-tooth" checked={strictToothMatch} onCheckedChange={setStrictToothMatch} />
                        <Label htmlFor="strict-tooth" className="text-xs cursor-pointer">
                          Kezelési tervben csak ezt a fogat mutassa
                        </Label>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Orvos</Label>
                    <Select value={filterDoctor} onValueChange={setFilterDoctor}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Mindenki" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Mindenki</SelectItem>
                        {uniqueDoctors.map(([id, name]) => (
                          <SelectItem key={id} value={id}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Dátum</Label>
                    <Input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {(filterTooth || filterDoctor !== 'all' || filterDate) && (
                  <Button
                    variant="ghost"
                    className="w-full mt-4 text-xs h-8 text-muted-foreground"
                    onClick={() => { setFilterTooth(''); setFilterDoctor('all'); setFilterDate(''); }}
                  >
                    Szűrők törlése
                  </Button>
                )}
              </div>
            </div>

            {/* Main List */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto">
                  {filteredEvents.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-3">
                      <Search className="w-12 h-12 opacity-20" />
                      <p>Nincs a szűrésnek megfelelő előzmény.</p>
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-primary/20 ml-4 pb-4 space-y-6">
                      {filteredEvents.map(ev => (
                        <div key={ev.id} className="relative pl-6 group">
                          {/* Timeline dot */}
                          <div className="absolute w-6 h-6 rounded-full bg-background border-2 border-primary shadow-sm -left-[13px] top-0 flex items-center justify-center z-10">
                            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                          </div>

                          <div className="bg-card border shadow-sm rounded-lg overflow-hidden">
                            <div className="px-5 py-4 border-b bg-muted/5 flex justify-between items-center cursor-pointer hover:bg-muted/10 transition-colors" onClick={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  {ev.icon}
                                </div>
                                <div>
                                  <div className="font-semibold text-sm">{ev.summary}</div>
                                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                    <span>{format(new Date(ev.date), 'yyyy. MMMM d. HH:mm', { locale: hu })}</span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                      <Avatar className="w-4 h-4 border">
                                        <AvatarImage src={ev.profile?.avatar_url || ''} />
                                        <AvatarFallback className="text-[8px]"><User className="w-2 h-2" /></AvatarFallback>
                                      </Avatar>
                                      {ev.profile?.full_name || 'Ismeretlen'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" className="h-8">
                                {selectedEvent?.id === ev.id ? 'Kevesebb' : 'Részletek'}
                              </Button>
                            </div>

                            {/* Expandable Content */}
                            {selectedEvent?.id === ev.id && (
                              <div className="p-5 animate-in slide-in-from-top-2 duration-200">
                                {ev.type === 'status_change' && renderStatusChanges(ev.rawData)}
                                {ev.type === 'batched_status_change' && (
                                  <div className="space-y-6">
                                    {ev.batchedEvents?.map((bev: any, i: number) => (
                                      <div key={bev.id} className="relative">
                                        <div className="font-medium text-primary mb-2 flex items-center gap-2">
                                          <Hash className="h-4 w-4" /> {bev.tooth_number}. fog
                                          <span className="text-xs text-muted-foreground font-normal ml-auto">
                                            {format(new Date(bev.changed_at), 'HH:mm')}
                                          </span>
                                        </div>
                                        {renderStatusChanges(bev)}
                                        {i < (ev.batchedEvents?.length || 0) - 1 && <div className="h-px bg-border my-4" />}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {ev.type === 'treatment_plan' && renderTreatmentPlanDetails(ev.rawData, filterTooth)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
