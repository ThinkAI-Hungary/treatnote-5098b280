import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { TreatmentRule } from '@/types/treatmentRules';

interface RuleDetailsPopupProps {
  ruleId: string;
  ruleName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RuleDetailsPopup({ ruleId, ruleName, open, onOpenChange }: RuleDetailsPopupProps) {
  const [rule, setRule] = useState<TreatmentRule | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchRule() {
      if (!open || !ruleId) {
        setRule(null);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('treatment_rules')
          .select(`*, visits:rule_visits(*, items:rule_items(*))`)
          .eq('id', ruleId)
          .single();

        if (error) throw error;
        
        // Sort visits and items
        const processedRule = {
            ...data,
            visits: (data.visits || [])
              .sort((a: any, b: any) => a.display_order - b.display_order)
              .map((v: any) => ({
                ...v,
                items: (v.items || []).sort((a: any, b: any) => a.display_order - b.display_order)
              }))
        } as TreatmentRule;

        setRule(processedRule);
      } catch (err) {
        console.error('Error fetching rule details:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRule();
  }, [ruleId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-xl text-primary font-bold">
            {ruleName || 'Szabály Részletei'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
            </div>
          ) : rule ? (
            <div className="space-y-8">
              {rule.visits && rule.visits.length > 0 ? (
                rule.visits.map((visit, vIdx) => (
                  <div key={visit.id || vIdx} className="space-y-4">
                    <div className="flex items-center gap-3 border-b pb-2">
                      <div className="flex items-center justify-center bg-primary/10 text-primary font-bold rounded-full h-8 w-8 shrink-0">
                        {visit.visit_number}
                      </div>
                      <h3 className="font-semibold text-foreground text-lg">
                        Vizit {visit.visit_number}
                      </h3>
                      {(visit.duration_days > 0 || visit.healing_months > 0) && (
                        <span className="text-sm px-2 py-0.5 rounded-md bg-muted text-muted-foreground ml-auto">
                          {visit.duration_days > 0 && `${visit.duration_days} nap időtartam`}
                          {visit.healing_months > 0 && (visit.duration_days > 0 ? ' | ' : '') + `${visit.healing_months} hónap gyógyulás`}
                        </span>
                      )}
                    </div>
                    
                    {visit.items && visit.items.length > 0 ? (
                      <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 text-muted-foreground border-b border-border">
                            <tr>
                              <th className="px-4 py-3 font-medium text-left">Kezelés</th>
                              <th className="px-4 py-3 font-medium text-right w-24">Mennyiség</th>
                              <th className="px-4 py-3 font-medium text-center w-24">Egység</th>
                              <th className="px-4 py-3 font-medium text-center w-36">Alkalmazás</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {visit.items.map((item, iIdx) => (
                              <tr key={item.id || iIdx} className="hover:bg-muted/30 transition-colors group">
                                <td className="px-4 py-3 font-medium text-foreground group-hover:text-primary transition-colors">
                                  {item.name}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                                <td className="px-4 py-3 text-center text-muted-foreground">{item.unit}</td>
                                <td className="px-4 py-3 text-center text-xs text-muted-foreground flex flex-col items-center gap-1">
                                  <span className="bg-primary/5 px-2 py-0.5 rounded-full whitespace-nowrap">
                                    {item.scaling === 'per_tooth' ? 'Foganként' : item.scaling === 'per_case' ? 'Esetenként' : 'Fix'}
                                  </span>
                                  {item.target_tooth_type !== 'all' && (
                                    <span className="text-[10px] uppercase tracking-wider opacity-80">
                                      {item.target_tooth_type === 'pillar_only' ? 'Csak pillér' : 'Csak pótfog'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic pl-4 py-2 opacity-70">
                        Nincsenek tételek ebben a vizitben...
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                  <p className="text-lg mb-2">Üres Szabály</p>
                  <p className="text-sm">Nincsenek vizitek rögzítve ehhez a szabályhoz.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-destructive bg-destructive/5 rounded-xl border border-destructive/20">
              <p className="text-lg font-medium mb-1">Hiba történt</p>
              <p className="text-sm">A szabály nem található, vagy törölve lett időközben.</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
