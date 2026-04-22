import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ChevronRight, Save, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProfile } from '@/hooks/useProfile';

interface TreatnoteReviewPanelProps {
  jobId: string;
  patientId: string;
  resultJson: any;
  isNewest: boolean;
}

interface ProcessedItem {
  fog: string | null;
  name: string;
  vizit: number;
  hidtag: string | null;
  scaling: string | null;
  talalat: boolean;
  quantity: number;
  szakterulet: string;
  eredeti_szoveg?: string;
}

export function TreatnoteReviewPanel({
  jobId,
  patientId,
  resultJson,
  isNewest
}: TreatnoteReviewPanelProps) {
  const { profile } = useProfile();
  const [isSaving, setIsSaving] = useState(false);

  // Parse items from the flattened vizitek array
  const allItems: ProcessedItem[] = useMemo(() => {
    if (!resultJson || !Array.isArray(resultJson.vizitek)) return [];
    return resultJson.vizitek;
  }, [resultJson]);

  // Group items by visit number
  const visits = useMemo(() => {
    const grouped = new Map<number, ProcessedItem[]>();
    for (const item of allItems) {
      const v = item.vizit || 1;
      if (!grouped.has(v)) grouped.set(v, []);
      grouped.get(v)!.push(item);
    }
    // Convert to sorted array of [visitNumber, items]
    return Array.from(grouped.entries()).map(([v, items]) => {
      // Sort items within visit: fog null (szájüreg) items first, then by tooth number
      const sortedItems = [...items].sort((a, b) => {
        const aIsSzajureg = !a.fog || a.fog === 'szájüreg';
        const bIsSzajureg = !b.fog || b.fog === 'szájüreg';
        if (aIsSzajureg && !bIsSzajureg) return -1;
        if (!aIsSzajureg && bIsSzajureg) return 1;
        if (a.fog && b.fog && !aIsSzajureg && !bIsSzajureg) {
          return parseInt(a.fog) - parseInt(b.fog);
        }
        return 0;
      });
      return [v, sortedItems] as [number, ProcessedItem[]];
    }).sort((a, b) => a[0] - b[0]);
  }, [allItems]);

  const [selectedVisit, setSelectedVisit] = useState<number | null>(null);

  // Set initial selected visit
  useMemo(() => {
    if (selectedVisit === null && visits.length > 0) {
      setSelectedVisit(visits[0][0]);
    }
  }, [visits, selectedVisit]);

  const handleConfirm = async () => {
    if (allItems.length === 0) return;
    setIsSaving(true);
    try {
      // 1. Create plan
      const { data: planData, error: planError } = await supabase
        .from('patient_treatment_plans')
        .insert({
          patient_id: patientId,
          user_id: profile?.user_id,
          telephely_id: profile?.current_telephely_id,
          voice_job_id: jobId
        })
        .select()
        .single();

      if (planError) throw planError;

      // 2. Prepare and insert items
      const itemsToInsert = allItems.map(item => ({
        plan_id: planData.id,
        vizit: item.vizit,
        szakterulet: item.szakterulet,
        fog: item.fog,
        hidtag: item.hidtag,
        name: item.name,
        quantity: item.quantity,
        scaling: item.scaling,
        talalat: item.talalat || false
      }));

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from('patient_treatment_plan_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      toast.success('Kezelési terv sikeresen mentve!');
      window.dispatchEvent(new CustomEvent('dental-chart-updated'));
      
    } catch (err: any) {
      console.error('Error saving treatment plan:', err);
      toast.error('Hiba a mentés során: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setIsSaving(false);
    }
  };

  const selectedVisitData = visits.find(v => v[0] === selectedVisit)?.[1] || [];

  const mainCard = (
    <Card className="mt-6 border-primary/20 shadow-sm overflow-hidden bg-background">
      <CardHeader className="px-6 py-4 border-b bg-muted/10">
        <CardTitle className="text-xl flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Kezelési Terv Áttekintés
        </CardTitle>
        <CardDescription>
          {isNewest 
            ? "Kérjük, ellenőrizze az összeállított kezelési tervet ülések (vizitek) szerint." 
            : "Egy korábbi kezelési terv archívuma. Mentés már nem lehetséges."}
        </CardDescription>
      </CardHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x border-b">
        {/* Panel 1: List of visits */}
        <div className="flex flex-col h-72 md:h-[600px] overflow-hidden bg-muted/5 md:col-span-1">
          <div className="px-4 py-3 border-b bg-muted/10 font-medium text-sm text-muted-foreground uppercase tracking-wider">
            Ülések ({visits.length})
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {visits.length === 0 && (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  Nem található érvényes kezelési terv adathalmaz.
                </p>
              )}
              {visits.map(([visitNumber, items]) => {
                return (
                <button
                  key={visitNumber}
                  onClick={() => setSelectedVisit(visitNumber)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-md border transition-all text-left group",
                    selectedVisit === visitNumber 
                      ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" 
                      : "bg-card hover:bg-muted/50 border-border/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold",
                      selectedVisit === visitNumber 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted text-muted-foreground"
                    )}>
                      {visitNumber}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium leading-none">
                        {visitNumber}. Ülés
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">{items.length} kezelési tétel</span>
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "h-4 w-4 transition-colors",
                    selectedVisit === visitNumber 
                      ? "text-primary" 
                      : "text-muted-foreground group-hover:text-foreground"
                  )} />
                </button>
              )})}
            </div>
          </ScrollArea>
        </div>

        {/* Panel 2: Visit details */}
        <div className="flex flex-col h-[400px] md:h-[600px] overflow-hidden md:col-span-2">
          <div className="px-4 py-3 border-b bg-muted/10 font-medium text-sm text-muted-foreground uppercase tracking-wider flex justify-between items-center">
            <span>Ülés Részletei</span>
            {selectedVisit !== null && (
               <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary">
                  {selectedVisit}. Ülés
               </Badge>
            )}
          </div>
          <ScrollArea className="flex-1 bg-card">
            {selectedVisit !== null ? (
              <div className="p-4 space-y-4">
                 {selectedVisitData.length === 0 ? (
                    <div className="text-center text-muted-foreground p-8">Nincsenek kezelések ebben az ülésben.</div>
                 ) : (
                    selectedVisitData.map((item, idx) => {
                       const isPontic = item.hidtag === 'pontic_only';
                       const isPillar = item.hidtag === 'pillar_only';
                       
                       return (
                          <div key={idx} className="border border-border/50 rounded-lg p-4 bg-muted/5 space-y-3 shadow-sm">
                             <div className="flex items-center justify-between border-b pb-2">
                                <div className="flex items-center gap-2">
                                   <Badge variant="secondary" className="uppercase text-[10px] tracking-wider">{item.szakterulet}</Badge>
                                   {!item.talalat && (
                                      <Badge variant="destructive" className="uppercase text-[10px] tracking-wider">Nincs pontos árlista találat</Badge>
                                   )}
                                </div>
                                {item.fog && item.fog !== 'szájüreg' ? (
                                   <div className="flex gap-1 flex-wrap justify-end">
                                      <Badge variant="outline" className={cn(
                                         "font-mono font-bold text-xs",
                                         isPontic && "border-blue-300 text-blue-600 bg-blue-50",
                                         isPillar && "border-emerald-300 text-emerald-600 bg-emerald-50"
                                      )}>
                                         {item.fog}
                                         {isPontic && <span className="ml-1 opacity-60">(hídtag)</span>}
                                         {isPillar && <span className="ml-1 opacity-60">(pillér)</span>}
                                      </Badge>
                                   </div>
                                ) : (
                                   <div className="flex gap-1 flex-wrap justify-end">
                                      <Badge variant="outline" className="font-mono font-bold text-xs border-purple-300 text-purple-600 bg-purple-50">
                                         SZÁJÜREG
                                      </Badge>
                                   </div>
                                )}
                             </div>
                             
                             <div className="space-y-2 pt-1">
                                <div className="flex items-start gap-2">
                                   <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                                   <span className="text-sm font-medium">{item.name}</span>
                                   {item.quantity > 1 && (
                                      <span className="text-sm font-bold text-muted-foreground ml-2">x{item.quantity}</span>
                                   )}
                                </div>
                                {item.eredeti_szoveg && (
                                   <div className="mt-2 pl-3 ml-3 border-l-2 border-primary/30 text-xs italic text-muted-foreground">
                                      "{item.eredeti_szoveg}"
                                   </div>
                                )}
                             </div>
                          </div>
                       );
                    })
                 )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-6 text-center">
                Válasszon ki egy ülést a bal oldali listából.
              </div>
            )}
          </ScrollArea>
        </div>

      </div>
    </Card>
  );

  const footerContent = isNewest && allItems.length > 0 ? (
    <CardFooter className="px-6 py-4 bg-muted/10 justify-end rounded-b-xl border-t border-primary/20">
      <Button onClick={handleConfirm} disabled={isSaving} className="gap-2 bg-sparkle-blue hover:bg-sparkle-blue/90">
        {isSaving ? (
          <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span> Mentés...</span>
        ) : (
          <><Save className="h-4 w-4" /> Mentés a kartonba</>
        )}
      </Button>
    </CardFooter>
  ) : null;

  const portalTarget = document.getElementById('voxis-save-portal');

  if (portalTarget && footerContent) {
    return (
      <>
        {mainCard}
        {createPortal(footerContent, portalTarget)}
      </>
    );
  }

  return (
    <>
      {mainCard}
      {footerContent && (
        <div className="mt-[-1px]">
          {footerContent}
        </div>
      )}
    </>
  );
}
