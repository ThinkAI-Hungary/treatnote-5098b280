import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ToothModel } from './types';
import { ZsigmondyCross } from './ZsigmondyCross';
import { ToothEditorPanel } from './ToothEditorPanel';
import { ToothHistoryDialog } from './ToothHistoryDialog';
import { mapVoxisToModels } from './voxisMapper';
import { History } from 'lucide-react';

export function DentalChart({ patientId }: { patientId: string }) {
  const { profile } = useProfile();
  const [data, setData] = useState<Record<string, ToothModel>>({});
  const [loading, setLoading] = useState(true);
  const [showBabyTeeth, setShowBabyTeeth] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);

  const fetchChart = async () => {
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
      setData(map);
    } catch (err: any) {
      console.error('Error fetching dental chart:', err);
      toast.error('Hiba történt a státuszok betöltésekor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChart();
  }, [patientId]);

  useEffect(() => {
    const handleUpdate = () => {
      fetchChart();
    };

    window.addEventListener('dental-chart-updated', handleUpdate);
    return () => window.removeEventListener('dental-chart-updated', handleUpdate);
  }, [patientId]);

  const handleToothClick = (toothNum: string) => {
    if (selectedTooth === toothNum) {
      setSelectedTooth(null);
    } else {
      setSelectedTooth(toothNum);
      // Wait for React to render, then scroll to panel
      setTimeout(() => {
        window.scrollBy({ top: 300, behavior: 'smooth' });
      }, 100);
    }
  };

  const handleSaveTooth = async (t: ToothModel) => {
    try {
      const companyId = profile?.company_id;
      if (!companyId) throw new Error('Nincs aktív company context');

      const payload = {
        patient_id: patientId,
        company_id: companyId,
        tooth_number: t.tooth_number,
        status: t.status,
        surfaces: t.surfaces,
        notes: t.notes,
        mobility: t.mobility,
        percussion_sensitive: t.percussion_sensitive,
        periapical_lesion: t.periapical_lesion,
        gum_recession_mm: t.gum_recession_mm,
        pocket_depth_mm: t.pocket_depth_mm,
        prosthetic_type: t.prosthetic_type,
        prosthetic_material: t.prosthetic_material || null,
        prosthetic_shade: t.prosthetic_shade || null,
        implant_system: t.implant_system || null,
        implant_diameter: t.implant_diameter || null,
        implant_length: t.implant_length || null,
        implant_date: t.implant_date || null,
        percussion: t.percussion || null,
        sensitivity: t.sensitivity || null,
        dental_signs: t.dental_signs || null,
        last_updated_at: new Date().toISOString(),
        updated_by: profile?.user_id
      };

      if (t.id || data[t.tooth_number]?.id) {
        // Update
        const targetId = t.id || data[t.tooth_number].id;
        const { error } = await supabase
          .from('dental_chart')
          .update(payload)
          .eq('id', targetId);
        
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('dental_chart')
          .insert([payload]);
        
        if (error) throw error;
      }

      toast.success(`${t.tooth_number}. fog státusza mentve.`);
      await fetchChart();

    } catch (err: any) {
      console.error('Error saving tooth status:', err);
      toast.error('Hiba a mentés során: ' + (err.message || 'Ismeretlen hiba'));
    }
  };


  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-12 flex justify-center items-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full border-border/50 shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/20 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            Fogászati Státusz (Zsigmondy-kereszt)
          </CardTitle>
          <CardDescription>
            Kattintson egy fogra az állapot és felületek módosításához.
          </CardDescription>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => setShowHistory(true)} className="text-muted-foreground hover:text-primary h-8">
              <History className="w-3.5 h-3.5 mr-2" />
              Történet
            </Button>
          </div>
        </div>
        <div className="flex items-center space-x-2 bg-card p-2 rounded-lg border shadow-sm">
          <Switch 
            id="baby-teeth" 
            checked={showBabyTeeth} 
            onCheckedChange={setShowBabyTeeth} 
          />
          <Label htmlFor="baby-teeth" className="cursor-pointer font-medium">Tejfogak mutatása</Label>
        </div>
      </CardHeader>
      <CardContent className="w-full overflow-x-auto pb-4">
        <div className="w-max mx-auto px-6 pt-4 pb-2">
          <ZsigmondyCross 
            data={data} 
            onToothClick={handleToothClick} 
            showBabyTeeth={showBabyTeeth} 
          />
        </div>
      </CardContent>

      <ToothHistoryDialog 
        patientId={patientId} 
        isOpen={showHistory} 
        onOpenChange={setShowHistory} 
      />

      {selectedTooth && (
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <ToothEditorPanel 
            toothNumber={selectedTooth}
            initialData={data[selectedTooth]}
            onSave={(d) => {
              handleSaveTooth(d);
              setSelectedTooth(null);
            }}
            onCancel={() => setSelectedTooth(null)}
          />
        </div>
      )}
    </Card>
  );
}
