import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Trash2, Check, X, Loader2, ChevronRight,
  ClipboardList, GripVertical, Ban
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProfile } from '@/hooks/useProfile';
import { TreatmentItemPicker, type ClinicTreatmentItem } from './TreatmentItemPicker';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlanItem {
  id?: string;
  plan_id?: string;
  vizit: number;
  szakterulet: string;
  fog: string | null;
  hidtag: string | null;
  name: string;
  quantity: number;
  scaling: string | null;
  talalat: boolean;
  treatment_item_id: string | null;
  price_snapshot: number | null;
  status: string;
  notes: string | null;
}

interface TreatmentPlan {
  id: string;
  patient_id: string;
  user_id: string | null;
  telephely_id: string | null;
  voice_job_id: string | null;
  created_at: string;
  items: PlanItem[];
}

interface TreatmentPlanEditorProps {
  patientId: string;
}

// ─── Tooth options (Zsigmondy) ───────────────────────────────────────────────

const TEETH = [
  '18','17','16','15','14','13','12','11',
  '21','22','23','24','25','26','27','28',
  '48','47','46','45','44','43','42','41',
  '31','32','33','34','35','36','37','38',
];

// ─── Component ───────────────────────────────────────────────────────────────

export function TreatmentPlanEditor({ patientId }: TreatmentPlanEditorProps) {
  const { profile } = useProfile();
  const [plan, setPlan] = useState<TreatmentPlan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState(1);
  const [saving, setSaving] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const telephelyId = profile?.current_telephely_id || profile?.telephely_id || '';

  // ─── Load existing plan ──────────────────────────────────────────────────

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      // Get the most recent plan for this patient
      const { data: plans, error: planErr } = await supabase
        .from('patient_treatment_plans')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (planErr) throw planErr;

      if (plans && plans.length > 0) {
        const p = plans[0];
        const { data: planItems, error: itemsErr } = await supabase
          .from('patient_treatment_plan_items')
          .select('*')
          .eq('plan_id', p.id)
          .order('vizit')
          .order('id');

        if (itemsErr) throw itemsErr;

        setPlan({ ...p, items: [] } as TreatmentPlan);
        setItems((planItems || []).map(i => ({
          ...i,
          treatment_item_id: i.treatment_item_id || null,
          price_snapshot: i.price_snapshot || null,
          status: i.status || 'planned',
          notes: i.notes || null,
        })) as PlanItem[]);

        // Select the first visit
        if (planItems && planItems.length > 0) {
          setSelectedVisit(planItems[0].vizit || 1);
        }
      } else {
        setPlan(null);
        setItems([]);
      }
    } catch (err: any) {
      console.error('Error loading treatment plan:', err);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  // ─── Derived data ────────────────────────────────────────────────────────

  const visits = useMemo(() => {
    const visitNums = new Set(items.map(i => i.vizit));
    if (visitNums.size === 0) visitNums.add(1);
    return Array.from(visitNums).sort((a, b) => a - b);
  }, [items]);

  const visitItems = useMemo(() => {
    return items.filter(i => i.vizit === selectedVisit);
  }, [items, selectedVisit]);

  const visitTotal = useMemo(() => {
    return visitItems.reduce((sum, i) => sum + (i.price_snapshot || 0) * i.quantity, 0);
  }, [visitItems]);

  const grandTotal = useMemo(() => {
    return items.reduce((sum, i) => sum + (i.price_snapshot || 0) * i.quantity, 0);
  }, [items]);

  // ─── Create new plan ─────────────────────────────────────────────────────

  const createPlan = async () => {
    try {
      const { data, error } = await supabase
        .from('patient_treatment_plans')
        .insert({
          patient_id: patientId,
          user_id: profile?.user_id,
          telephely_id: telephelyId,
        })
        .select()
        .single();

      if (error) throw error;
      setPlan({ ...data, items: [] } as TreatmentPlan);
      setItems([]);
      setSelectedVisit(1);
      toast.success('Új kezelési terv létrehozva');
    } catch (err: any) {
      console.error('Error creating plan:', err);
      toast.error('Hiba a terv létrehozásakor');
    }
  };

  // ─── Auto-save (debounced) ───────────────────────────────────────────────

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!plan) return;
      setSaving(true);
      try {
        // Delete all existing items and re-insert
        await supabase
          .from('patient_treatment_plan_items')
          .delete()
          .eq('plan_id', plan.id);

        if (items.length > 0) {
          const payload = items.map(i => ({
            plan_id: plan.id,
            vizit: i.vizit,
            szakterulet: i.szakterulet || '',
            fog: i.fog,
            hidtag: i.hidtag,
            name: i.name,
            quantity: i.quantity,
            scaling: i.scaling,
            talalat: i.talalat,
            treatment_item_id: i.treatment_item_id,
            price_snapshot: i.price_snapshot,
            status: i.status,
            notes: i.notes,
          }));

          const { error } = await supabase
            .from('patient_treatment_plan_items')
            .insert(payload);

          if (error) throw error;
        }
      } catch (err: any) {
        console.error('Error saving plan items:', err);
        toast.error('Hiba a mentéskor');
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [plan, items]);

  // ─── Item operations ─────────────────────────────────────────────────────

  const addItem = (catalogItem: ClinicTreatmentItem) => {
    const newItem: PlanItem = {
      vizit: selectedVisit,
      szakterulet: catalogItem.category,
      fog: catalogItem.is_per_tooth ? null : null,
      hidtag: null,
      name: catalogItem.name,
      quantity: 1,
      scaling: null,
      talalat: true,
      treatment_item_id: catalogItem.id,
      price_snapshot: catalogItem.price,
      status: 'planned',
      notes: null,
    };
    setItems(prev => [...prev, newItem]);
    scheduleSave();
  };

  const removeItem = (index: number) => {
    const globalIdx = items.findIndex((item, i) => {
      // Find the Nth item in current visit
      const visitItemsBeforeThis = items.slice(0, i + 1).filter(x => x.vizit === selectedVisit);
      return visitItemsBeforeThis.length === index + 1;
    });
    if (globalIdx >= 0) {
      setItems(prev => prev.filter((_, i) => i !== globalIdx));
      scheduleSave();
    }
  };

  const updateItemField = (index: number, field: keyof PlanItem, value: any) => {
    let count = -1;
    const globalIdx = items.findIndex(item => {
      if (item.vizit === selectedVisit) count++;
      return count === index;
    });
    if (globalIdx >= 0) {
      setItems(prev => prev.map((item, i) => i === globalIdx ? { ...item, [field]: value } : item));
      scheduleSave();
    }
  };

  const toggleItemStatus = (index: number) => {
    const statusCycle: Record<string, string> = { planned: 'completed', completed: 'cancelled', cancelled: 'planned' };
    let count = -1;
    const globalIdx = items.findIndex(item => {
      if (item.vizit === selectedVisit) count++;
      return count === index;
    });
    if (globalIdx >= 0) {
      setItems(prev => prev.map((item, i) =>
        i === globalIdx ? { ...item, status: statusCycle[item.status] || 'planned' } : item
      ));
      scheduleSave();
    }
  };

  const addVisit = () => {
    const maxVisit = Math.max(0, ...visits);
    setSelectedVisit(maxVisit + 1);
    // Add a placeholder so the visit shows up
    setItems(prev => [...prev]);
  };

  // ─── Status display helpers ──────────────────────────────────────────────

  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    planned: { label: 'Tervezett', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: <ClipboardList className="h-3 w-3" /> },
    completed: { label: 'Kész', color: 'bg-green-100 text-green-700 border-green-200', icon: <Check className="h-3 w-3" /> },
    cancelled: { label: 'Törölve', color: 'bg-red-100 text-red-700 border-red-200', icon: <Ban className="h-3 w-3" /> },
  };

  const formatPrice = (p: number | null) => p != null ? p.toLocaleString('hu-HU') + ' Ft' : '–';

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card className="border-border/50 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
          <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nincs aktív kezelési terv</p>
          <Button size="sm" onClick={createPlan}>
            <Plus className="h-4 w-4 mr-1.5" /> Új kezelési terv
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="pb-3 border-b bg-muted/5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Kezelési Terv
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-2" />}
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">
              {formatPrice(grandTotal)}
            </span>
          </div>
        </div>
      </CardHeader>

      <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x min-h-[300px]">
        {/* LEFT: Visit list */}
        <div className="md:col-span-3 flex flex-col bg-muted/5">
          <div className="px-3 py-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Ülések ({visits.length})
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {visits.map(v => {
                const vItems = items.filter(i => i.vizit === v);
                const vTotal = vItems.reduce((s, i) => s + (i.price_snapshot || 0) * i.quantity, 0);
                return (
                  <button
                    key={v}
                    onClick={() => setSelectedVisit(v)}
                    className={cn(
                      "w-full flex items-center justify-between p-2.5 rounded-md text-left transition-all",
                      selectedVisit === v
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted/50 border border-transparent"
                    )}
                  >
                    <div>
                      <div className="text-sm font-medium">{v}. Ülés</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {vItems.length} tétel • {formatPrice(vTotal)}
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      "h-3.5 w-3.5",
                      selectedVisit === v ? "text-primary" : "text-muted-foreground"
                    )} />
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          <div className="p-2 border-t">
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={addVisit}>
              <Plus className="h-3 w-3 mr-1" /> Új ülés
            </Button>
          </div>
        </div>

        {/* RIGHT: Items for selected visit */}
        <div className="md:col-span-9 flex flex-col">
          <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {selectedVisit}. Ülés — Tételek ({visitItems.length})
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{formatPrice(visitTotal)}</span>
              <TreatmentItemPicker telephelyId={telephelyId} onSelect={addItem} />
            </div>
          </div>

          <ScrollArea className="flex-1 max-h-[400px]">
            {visitItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <p className="text-sm">Nincs tétel ebben az ülésben</p>
                <TreatmentItemPicker telephelyId={telephelyId} onSelect={addItem} />
              </div>
            ) : (
              <div className="divide-y">
                {visitItems.map((item, idx) => {
                  const sc = statusConfig[item.status] || statusConfig.planned;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 group transition-colors hover:bg-muted/30",
                        item.status === 'cancelled' && "opacity-50"
                      )}
                    >
                      {/* Status toggle */}
                      <button
                        onClick={() => toggleItemStatus(idx)}
                        className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all", sc.color)}
                        title="Státusz váltás"
                      >
                        {sc.icon}
                        {sc.label}
                      </button>

                      {/* Tooth selector */}
                      <Select
                        value={item.fog || '__szajureg__'}
                        onValueChange={v => updateItemField(idx, 'fog', v === '__szajureg__' ? null : v)}
                      >
                        <SelectTrigger className="w-[80px] h-7 text-xs font-mono">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__szajureg__">—</SelectItem>
                          {TEETH.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <span className={cn("text-sm font-medium truncate block", item.status === 'completed' && "line-through")}>
                          {item.name}
                        </span>
                      </div>

                      {/* Quantity */}
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => updateItemField(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-[55px] h-7 text-xs text-center font-mono"
                      />

                      {/* Price */}
                      <span className="text-xs font-mono text-muted-foreground whitespace-nowrap w-[90px] text-right">
                        {formatPrice((item.price_snapshot || 0) * item.quantity)}
                      </span>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                        onClick={() => removeItem(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </Card>
  );
}
