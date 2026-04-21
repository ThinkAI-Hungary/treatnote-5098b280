import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle2, ChevronRight, Save, Loader2 } from 'lucide-react';
import { ToothModel } from './types';
import { DENTAL_STATUSES } from './constants';
import { cn } from '@/lib/utils';
import { mapVoxisToModels } from './voxisMapper';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProfile } from '@/hooks/useProfile';

interface VoxisReviewPanelProps {
  jobId: string;
  patientId: string;
  resultJson: any;
  isNewest: boolean;
}

export function VoxisReviewPanel({
  jobId,
  patientId,
  resultJson,
  isNewest
}: VoxisReviewPanelProps) {
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [originalData, setOriginalData] = useState<Record<string, ToothModel>>({});
  const [updates, setUpdates] = useState<Partial<ToothModel>[]>([]);
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);

  const megjegyzesFo = resultJson?.MEGJEGYZES_FO || resultJson?.Megjegyzes_fo || '';

  const getStatusName = (id?: string) => {
    if (!id) return 'Egészséges';
    return DENTAL_STATUSES.find(s => s.id === id)?.name || id;
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data: list, error } = await supabase
          .from('dental_chart')
          .select('*')
          .eq('patient_id', patientId);

        if (error) throw error;

        const map: Record<string, ToothModel> = {};
        if (list) {
          list.forEach(item => {
            map[item.tooth_number] = item as ToothModel;
          });
        }
        setOriginalData(map);
        
        const mappedUpdates = mapVoxisToModels(resultJson, map, patientId);
        setUpdates(mappedUpdates);
        if (mappedUpdates.length > 0) {
          setSelectedTooth(mappedUpdates[0].tooth_number!);
        }

      } catch (err) {
        console.error('Error fetching tooth statuses:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [patientId, jobId, resultJson]);

  const handleConfirm = async () => {
    if (updates.length === 0) return;
    setIsSaving(true);
    try {
      // Upsert into Supabase
      const { error } = await supabase
        .from('dental_chart')
        .upsert(
          updates.map(u => {
            const targetId = u.id || originalData[u.tooth_number!]?.id;
            const payload: any = {
              patient_id: patientId,
              company_id: profile?.company_id,
              tooth_number: u.tooth_number,
              status: u.status,
              surfaces: u.surfaces,
              notes: u.notes,
              last_updated_at: new Date().toISOString()
            };
            if (targetId) payload.id = targetId;
            return payload;
          }),
          { onConflict: 'patient_id,tooth_number', ignoreDuplicates: false }
        );

      if (error) throw error;

      toast.success('Fogászati státusz sikeresen frissítve!');
      
      // Dispatch event to force DentalChart to refetch
      window.dispatchEvent(new CustomEvent('dental-chart-updated'));
      
      // Optionally re-fetch locally to reflect changes
      const map = { ...originalData };
      updates.forEach(u => {
        if (u.tooth_number) {
          map[u.tooth_number] = { ...(map[u.tooth_number] || {}), ...u } as ToothModel;
        }
      });
      setOriginalData(map);
      setUpdates([]);
      
    } catch (err: any) {
      console.error('Error saving multiple teeth:', err);
      toast.error('Hiba a mentés során: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="mt-6 border-primary/20 shadow-sm animate-pulse">
        <CardContent className="p-12 flex justify-center items-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const selectedUpdate = updates.find(u => u.tooth_number === selectedTooth);
  const selectedOriginal = selectedTooth ? originalData[selectedTooth] : null;

  const mainCard = (
    <Card className="mt-6 border-primary/20 shadow-sm overflow-hidden bg-background">
      <CardHeader className="px-6 py-4 border-b bg-muted/10">
        <CardTitle className="text-xl flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          AI Státuszfelvétel Áttekintés
        </CardTitle>
        <CardDescription>
          {isNewest 
            ? "Kérjük, ellenőrizze és hagyja jóvá a fogászati státusz módosításait." 
            : "Egy korábbi státuszfelvétel módosításainak archívuma. Mentés már nem lehetséges."}
        </CardDescription>
      </CardHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x border-b">
        {/* Panel 1: List of changes */}
        <div className="flex flex-col h-72 md:h-[600px] overflow-hidden bg-muted/5">
          <div className="px-4 py-3 border-b bg-muted/10 font-medium text-sm text-muted-foreground uppercase tracking-wider">
            Érintett fogak ({updates.length})
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {updates.length === 0 && (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  Nincs regisztrált vagy frissíthető módosítás.
                </p>
              )}
              {updates.map((update) => (
                <button
                  key={update.tooth_number}
                  onClick={() => setSelectedTooth(update.tooth_number!)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-md border transition-all text-left group",
                    selectedTooth === update.tooth_number 
                      ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" 
                      : "bg-card hover:bg-muted/50 border-border/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold",
                      selectedTooth === update.tooth_number ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {update.tooth_number}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium leading-none">{getStatusName(update.status)}</span>
                      {update.surfaces && (
                        <span className="text-xs text-muted-foreground mt-1">Felszín: {update.surfaces}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "h-4 w-4 transition-colors",
                    selectedTooth === update.tooth_number ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )} />
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Panel 2: Before/After detail */}
        <div className="flex flex-col h-72 md:h-[600px] overflow-hidden col-span-1 border-r">
          <div className="px-4 py-3 border-b bg-muted/10 font-medium text-sm text-muted-foreground uppercase tracking-wider">
            Változások Részletei
          </div>
          <ScrollArea className="flex-1 bg-card">
            {selectedUpdate ? (
              <div className="p-6 space-y-6">
                <div className="flex flex-col xl:flex-row items-center justify-center gap-4">
                  {/* Before Card */}
                  <div className="flex-1 flex flex-col items-center w-full p-2 md:p-3 xl:p-4 rounded-xl border border-border/50 bg-muted/20 opacity-70 min-w-0">
                    <span className="text-xs font-semibold text-muted-foreground uppercase mb-2 text-center w-full break-words">Korábbi állapot</span>
                    <span className="text-base font-medium text-center w-full break-words">
                      {getStatusName(selectedOriginal?.status)}
                    </span>
                    {selectedOriginal?.surfaces && (
                      <Badge variant="outline" className="mt-2">{selectedOriginal.surfaces}</Badge>
                    )}
                  </div>
                  
                  <ArrowRight className="hidden xl:block h-6 w-6 text-muted-foreground" />

                  {/* After Card */}
                  <div className="flex-1 flex flex-col items-center w-full p-2 md:p-3 xl:p-4 rounded-xl border-2 border-primary/20 bg-primary/5 min-w-0">
                    <span className="text-xs font-semibold text-primary uppercase mb-2 text-center w-full break-words">Új állapot</span>
                    <span className="text-base font-medium text-primary text-center w-full break-words">
                      {getStatusName(selectedUpdate.status)}
                    </span>
                    {selectedUpdate.surfaces && (
                      <Badge variant="default" className="mt-2">{selectedUpdate.surfaces}</Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-border/50">
                  <div className="grid gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase">AI Megjegyzés</span>
                    <div className="p-3 bg-muted/30 rounded-md text-sm whitespace-pre-wrap text-foreground min-h-[80px]">
                      {selectedUpdate.notes || "Nincs extra megjegyzés forrás az AI-tól."}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-6 text-center">
                Válasszon ki egy fogat a bal oldali listából a részletekhez.
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Panel 3: Global text and notes */}
        <div className="flex flex-col h-72 md:h-[600px] overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/10 font-medium text-sm text-muted-foreground uppercase tracking-wider">
            Általános
          </div>
          <ScrollArea className="flex-1 p-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Páciens Közös Megjegyzés</h4>
                <div className="p-4 bg-muted/30 rounded-md text-sm whitespace-pre-wrap text-foreground min-h-[120px] leading-relaxed border border-border/50">
                  {megjegyzesFo || "Nincs általános megjegyzés rögzítve."}
                </div>
              </div>
              
              {isNewest && updates.length > 0 && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">Automatikus Rögzítés</p>
                  <p>A Mentés gombra kattintva bekerül a páciens Zsigmondy-keresztjébe.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </Card>
  );

  const footerContent = isNewest && updates.length > 0 ? (
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
