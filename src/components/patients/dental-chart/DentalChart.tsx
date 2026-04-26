import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Rows3, ArrowUp, ArrowDown, Grid2X2, MousePointerClick, Link2, X } from 'lucide-react';
import { toast } from 'sonner';

import { ToothModel } from './types';
import { ZsigmondyCross } from './ZsigmondyCross';
import { ToothEditorPanel } from './ToothEditorPanel';
import { ADULT_TEETH } from './constants';
import { BridgeConfigurator, type BridgeConfig } from './BridgeConfigurator';

// ============ Preset tooth selections ============

const QUADRANT_TEETH: Record<string, string[]> = {
  Q1: ADULT_TEETH.upperRight,    // 18-11
  Q2: ADULT_TEETH.upperLeft,     // 21-28
  Q3: ADULT_TEETH.lowerLeft,     // 31-38
  Q4: ADULT_TEETH.lowerRight,    // 48-41
};

const UPPER_ALL = [...ADULT_TEETH.upperRight, ...ADULT_TEETH.upperLeft];
const LOWER_ALL = [...ADULT_TEETH.lowerRight, ...ADULT_TEETH.lowerLeft];
const ALL_TEETH = [...UPPER_ALL, ...LOWER_ALL];

// ============ Main Component ============

export function DentalChart({ 
  patientId, 
  toothScale = 1,
  readonly = false,
  onSelectionChange
}: { 
  patientId: string;
  toothScale?: number;
  readonly?: boolean;
  onSelectionChange?: (selectedTeeth: string[]) => void;
}) {
  const { profile } = useProfile();
  const [data, setData] = useState<Record<string, ToothModel>>({});
  const [loading, setLoading] = useState(true);
  const [showBabyTeeth, setShowBabyTeeth] = useState(false);

  // Selection state
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);

  // Treatment plan markers
  const [treatmentMarkersMap, setTreatmentMarkersMap] = useState<Record<string, Array<{ visual_icon: string; visual_color: string; status: string }>>>({});

  // Bridge configurator state
  const [bridgeConfigMode, setBridgeConfigMode] = useState(false);
  const [bridgePreview, setBridgePreview] = useState<BridgeConfig | null>(null);

  // ============ Data fetching ============

  const fetchChart = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
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
      if (showLoading) setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchChart(true);
  }, [fetchChart]);

  // Fetch treatment plan markers
  const fetchMarkers = useCallback(async () => {
    try {
      // Get the most recent treatment plan
      const { data: plans } = await supabase
        .from('patient_treatment_plans')
        .select('id')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!plans || plans.length === 0) { setTreatmentMarkersMap({}); return; }

      // Get plan items with their visual cues from the catalog
      const { data: items } = await supabase
        .from('patient_treatment_plan_items')
        .select('fog, status, treatment_item_id')
        .eq('plan_id', plans[0].id);

      if (!items || items.length === 0) { setTreatmentMarkersMap({}); return; }

      // Get visual cues for referenced treatment items
      const itemIds = [...new Set(items.filter(i => i.treatment_item_id).map(i => i.treatment_item_id!))];
      let cueMap: Record<string, { visual_icon: string; visual_color: string }> = {};

      if (itemIds.length > 0) {
        const { data: catalogItems } = await supabase
          .from('clinic_treatment_items_stdl' as any)
          .select('id, visual_icon, visual_color')
          .in('id', itemIds);

        if (catalogItems) {
          (catalogItems as any[]).forEach(ci => {
            cueMap[ci.id] = { visual_icon: ci.visual_icon, visual_color: ci.visual_color };
          });
        }
      }

      // Build per-tooth markers map
      const map: Record<string, Array<{ visual_icon: string; visual_color: string; status: string }>> = {};
      for (const item of items) {
        if (!item.fog) continue;
        const cue = item.treatment_item_id ? cueMap[item.treatment_item_id] : null;
        if (!map[item.fog]) map[item.fog] = [];
        map[item.fog].push({
          visual_icon: cue?.visual_icon || 'dot_outline',
          visual_color: cue?.visual_color || '#64748b',
          status: item.status || 'planned',
        });
      }

      setTreatmentMarkersMap(map);
    } catch (err) {
      console.error('Error fetching treatment markers:', err);
    }
  }, [patientId]);

  useEffect(() => {
    fetchMarkers();
  }, [fetchMarkers]);

  useEffect(() => {
    const handleUpdate = () => {
      fetchChart();
      fetchMarkers();
    };

    window.addEventListener('dental-chart-updated', handleUpdate);
    return () => window.removeEventListener('dental-chart-updated', handleUpdate);
  }, [fetchChart, fetchMarkers]);

  // ============ Click handling with multi-select ============

  const handleToothClick = useCallback((toothNum: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Multi-select toggle
      setSelectedTeeth(prev => {
        const next = prev.includes(toothNum)
          ? prev.filter(t => t !== toothNum)
          : [...prev, toothNum];
        // If only one tooth in multi-select, also set as primary selected
        if (next.length === 1) setSelectedTooth(next[0]);
        else if (next.length === 0) setSelectedTooth(null);
        return next;
      });
    } else {
      // Single select
      if (selectedTooth === toothNum && selectedTeeth.length <= 1) {
        // Deselect
        setSelectedTooth(null);
        setSelectedTeeth([]);
      } else {
        setSelectedTooth(toothNum);
        setSelectedTeeth([toothNum]);
      }
    }
  }, [selectedTooth, selectedTeeth]);

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selectedTeeth);
    }
  }, [selectedTeeth, onSelectionChange]);

  // ============ Preset selections ============

  const handlePresetSelect = useCallback((teeth: string[]) => {
    setSelectedTeeth(prev => {
      // If already exactly this preset is selected, deselect
      if (prev.length === teeth.length && teeth.every(t => prev.includes(t))) {
        setSelectedTooth(null);
        return [];
      }
      setSelectedTooth(teeth[0]);
      return [...teeth];
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTooth(null);
    setSelectedTeeth([]);
  }, []);

  // ============ Save tooth ============

  const handleSaveTooth = async (t: ToothModel, silent = false) => {
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

      if (!silent) {
        toast.success(`${t.tooth_number}. fog státusza mentve.`);
      }
      await fetchChart();

    } catch (err: any) {
      console.error('Error saving tooth status:', err);
      if (!silent) {
        toast.error('Hiba a mentés során: ' + (err.message || 'Ismeretlen hiba'));
      }
    }
  };

  // ============ Bulk operations ============

  const handleBulkStatusChange = async (status: string) => {
    if (selectedTeeth.length < 2) return;
    const companyId = profile?.company_id;
    if (!companyId) {
      toast.error('Nincs aktív company context');
      return;
    }

    try {
      for (const toothNum of selectedTeeth) {
        const existing = data[toothNum];
        const payload = {
          patient_id: patientId,
          company_id: companyId,
          tooth_number: toothNum,
          status: status,
          surfaces: null as string | null,
          last_updated_at: new Date().toISOString(),
          updated_by: profile?.user_id,
        };

        if (existing?.id) {
          await supabase.from('dental_chart').update(payload).eq('id', existing.id);
        } else {
          await supabase.from('dental_chart').insert([payload]);
        }
      }

      toast.success(`${selectedTeeth.length} fog státusza frissítve: ${status}`);
      await fetchChart();
      clearSelection();
    } catch (err: any) {
      console.error('Bulk update error:', err);
      toast.error('Hiba a tömeges frissítés során.');
    }
  };

  const handleCreateBridge = async (config: BridgeConfig) => {
    if (config.teeth.length < 2) {
      toast.error('Legalább 2 fogat válasszon ki a hídhoz.');
      return;
    }

    const companyId = profile?.company_id;
    if (!companyId) {
      toast.error('Nincs aktív company context');
      return;
    }

    const bridgeType = config.bridgeType;

    try {
      for (const { toothNumber, role } of config.teeth) {
        const existing = data[toothNumber];
        const currentStatuses = existing?.status ? existing.status.split(',').filter(s => s !== 'healthy') : [];

        // Pillars: keep existing statuses + add bridge type
        // Pontics: missing + bridge type
        const bridgeStatuses = role === 'pillar'
          ? [...new Set([...currentStatuses, bridgeType])]
          : ['missing', bridgeType];

        const payload = {
          patient_id: patientId,
          company_id: companyId,
          tooth_number: toothNumber,
          status: bridgeStatuses.join(','),
          surfaces: existing?.surfaces || null,
          last_updated_at: new Date().toISOString(),
          updated_by: profile?.user_id,
        };

        if (existing?.id) {
          await supabase.from('dental_chart').update(payload).eq('id', existing.id);
        } else {
          await supabase.from('dental_chart').insert([payload]);
        }
      }

      const sorted = config.teeth.map(t => t.toothNumber).sort((a, b) => parseInt(a) - parseInt(b));
      toast.success(`Híd létrehozva: ${sorted.join(' → ')}`);
      setBridgeConfigMode(false);
      setBridgePreview(null);
      await fetchChart();
      clearSelection();
    } catch (err: any) {
      console.error('Bridge creation error:', err);
      toast.error('Hiba a híd létrehozásakor.');
    }
  };

  // ============ Render ============

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-12 flex justify-center items-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isMultiSelect = selectedTeeth.length > 1;

  return (
    <Card className="w-full border-border/50 shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/20 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            Fogászati Státusz (Zsigmondy-kereszt)
          </CardTitle>
          <CardDescription>
            Kattintson egy fogra a szerkesztéshez. <span className="font-medium">Ctrl+klikk</span> = többszörös kijelölés.
          </CardDescription>
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

      {/* Preset selection toolbar */}
      <div className="px-4 pt-3 pb-1 flex flex-wrap items-center gap-2 border-b bg-muted/5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">
          <MousePointerClick className="w-3.5 h-3.5 inline mr-1" />
          Kijelölés:
        </span>

        <PresetButton
          label="Teljes"
          icon={<Rows3 className="w-3.5 h-3.5" />}
          active={selectedTeeth.length === ALL_TEETH.length}
          onClick={() => handlePresetSelect(ALL_TEETH)}
        />
        <PresetButton
          label="Felső"
          icon={<ArrowUp className="w-3.5 h-3.5" />}
          active={selectedTeeth.length === UPPER_ALL.length && UPPER_ALL.every(t => selectedTeeth.includes(t))}
          onClick={() => handlePresetSelect(UPPER_ALL)}
        />
        <PresetButton
          label="Alsó"
          icon={<ArrowDown className="w-3.5 h-3.5" />}
          active={selectedTeeth.length === LOWER_ALL.length && LOWER_ALL.every(t => selectedTeeth.includes(t))}
          onClick={() => handlePresetSelect(LOWER_ALL)}
        />

        <div className="w-px h-5 bg-border mx-1" />

        {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(q => (
          <PresetButton
            key={q}
            label={q}
            icon={<Grid2X2 className="w-3.5 h-3.5" />}
            active={QUADRANT_TEETH[q].every(t => selectedTeeth.includes(t)) && selectedTeeth.length === QUADRANT_TEETH[q].length}
            onClick={() => handlePresetSelect(QUADRANT_TEETH[q])}
          />
        ))}

        {selectedTeeth.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <button
              onClick={clearSelection}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors rounded"
            >
              <X className="w-3.5 h-3.5" />
              Törlés ({selectedTeeth.length})
            </button>
          </>
        )}
      </div>

      {/* The chart itself */}
      <CardContent className="w-full overflow-x-auto pb-4">
        <div className="w-full mx-auto px-2 sm:px-6 pt-4 pb-2">
          <ZsigmondyCross 
            data={data} 
            onToothClick={handleToothClick} 
            showBabyTeeth={showBabyTeeth}
            selectedTooth={selectedTooth}
            selectedTeeth={selectedTeeth}
            treatmentMarkersMap={treatmentMarkersMap}
            bridgePreview={bridgePreview}
            scale={toothScale}
          />
        </div>
      </CardContent>

      {/* Multi-select bulk toolbar */}
      {isMultiSelect && !readonly && (
        <div className="px-4 pb-4 sm:px-6 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-blue-700 dark:text-blue-400">
                  {selectedTeeth.length} fog kijelölve
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Fogak: {selectedTeeth.sort((a, b) => parseInt(a) - parseInt(b)).join(', ')}
                </p>
              </div>
              {!bridgeConfigMode && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusChange('missing')}
                    className="text-xs border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    Foghiány
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusChange('healthy')}
                    className="text-xs border-green-200 hover:bg-green-50 hover:text-green-700"
                  >
                    Egészséges
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setBridgeConfigMode(true)}
                    className="text-xs gap-1 bg-purple-600 hover:bg-purple-700"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Híd konfigurálása
                  </Button>
                </div>
              )}
            </div>

            {/* Bridge Configurator Panel */}
            {bridgeConfigMode && (
              <div className="mt-4 pt-4 border-t border-purple-200/30">
                <BridgeConfigurator
                  selectedTeeth={selectedTeeth}
                  toothData={data}
                  onConfirm={handleCreateBridge}
                  onCancel={() => { setBridgeConfigMode(false); setBridgePreview(null); }}
                  onPreviewChange={setBridgePreview}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Single tooth editor */}
      {selectedTooth && !isMultiSelect && !readonly && (
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <ToothEditorPanel 
            key={selectedTooth}
            toothNumber={selectedTooth}
            initialData={data[selectedTooth]}
            onSave={(d) => {
              // Auto-save silently, do not close the editor
              handleSaveTooth(d, true);
            }}
            onCancel={() => {
              setSelectedTooth(null);
              setSelectedTeeth([]);
            }}
          />
        </div>
      )}
    </Card>
  );
}

// ============ Preset Button ============

function PresetButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md
        transition-all duration-150 border
        ${active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm scale-[1.03]'
          : 'bg-card text-muted-foreground border-border/60 hover:bg-muted/50 hover:text-foreground hover:border-border'}
      `}
    >
      {icon}
      {label}
    </button>
  );
}
