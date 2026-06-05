import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Rows3, ArrowUp, ArrowDown, Grid2X2, MousePointerClick, Link2, X, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/hooks/useToastMessage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { WheelDatePicker } from '@/components/ui/wheel-date-picker';

import { ToothModel } from './types';
import { ZsigmondyCross } from './ZsigmondyCross';
import { ToothEditorPanel } from './ToothEditorPanel';
import { ADULT_TEETH, DENTAL_STATUSES } from './constants';
import { BridgeConfigurator, type BridgeConfig } from './BridgeConfigurator';
import { fetchCombinedTreatmentItems } from '@/lib/treatmentItems';

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

// Client-side cache to prevent flickering during tab transitions
const dentalChartCache: Record<string, Record<string, ToothModel>> = {};
const treatmentMarkersCache: Record<string, Record<string, Array<{ visual_icon: string; visual_color: string; status: string }>>> = {};

export function DentalChart({
  patientId,
  toothScale = 1.5,
  readonly = false,
  onSelectionChange,
  overrideData,
}: {
  patientId: string;
  toothScale?: number;
  readonly?: boolean;
  onSelectionChange?: (selectedTeeth: string[]) => void;
  overrideData?: Record<string, ToothModel>;
}) {
  const { profile } = useProfile();

  // Initialize from cache if available to prevent flicker on mount
  const [data, setData] = useState<Record<string, ToothModel>>(() => {
    return dentalChartCache[patientId] || {};
  });
  const [loading, setLoading] = useState(() => {
    return !dentalChartCache[patientId];
  });
  const [showBabyTeeth, setShowBabyTeeth] = useState(false);

  console.log("[DentalChart] Render. loading:", loading, "patientId:", patientId);

  // Selection state
  const [selectedTooth, setSelectedTooth] = useState<string | null>(() => {
    if (readonly || !patientId) return null;
    try {
      return localStorage.getItem(`selected_tooth_${patientId}`);
    } catch (e) {
      return null;
    }
  });

  const [selectedTeeth, setSelectedTeeth] = useState<string[]>(() => {
    if (readonly || !patientId) return [];
    try {
      const saved = localStorage.getItem(`selected_tooth_${patientId}`);
      return saved ? [saved] : [];
    } catch (e) {
      return [];
    }
  });

  // Treatment plan markers
  const [treatmentMarkersMap, setTreatmentMarkersMap] = useState<Record<string, Array<{ visual_icon: string; visual_color: string; status: string }>>>(() => {
    return treatmentMarkersCache[patientId] || {};
  });

  // Bridge configurator state
  const [bridgeConfigMode, setBridgeConfigMode] = useState(false);
  const [bridgePreview, setBridgePreview] = useState<BridgeConfig | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Restore selected tooth from localStorage on patient change
  useEffect(() => {
    if (!readonly && patientId) {
      const savedTooth = localStorage.getItem(`selected_tooth_${patientId}`);
      if (savedTooth) {
        setSelectedTooth(savedTooth);
        setSelectedTeeth([savedTooth]);
      } else {
        setSelectedTooth(null);
        setSelectedTeeth([]);
      }
    } else {
      setSelectedTooth(null);
      setSelectedTeeth([]);
    }
  }, [patientId, readonly]);

  // Persist selected tooth to localStorage
  useEffect(() => {
    if (!readonly && patientId) {
      if (selectedTooth) {
        localStorage.setItem(`selected_tooth_${patientId}`, selectedTooth);
      } else {
        localStorage.removeItem(`selected_tooth_${patientId}`);
      }
    }
  }, [selectedTooth, patientId, readonly]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Apply overrideData when provided (voice extraction result - displayed without saving to DB)
  useEffect(() => {
    if (overrideData !== undefined) {
      setData(overrideData);
      // Also update the cache so that if fetchChart runs after, it won't immediately overwrite
      dentalChartCache[patientId] = overrideData;
    }
  }, [overrideData, patientId]);

  // Dynamic height tracking for Left Column
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const crossWrapperRef = useRef<HTMLDivElement>(null);
  const crossInnerRef = useRef<HTMLDivElement>(null);
  const crossPrevRect = useRef<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [dynamicScale, setDynamicScale] = useState<number>(toothScale * 1.95);
  const [rightHeight, setRightHeight] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1400);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (readonly) return;
    const element = rightColumnRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setRightHeight(entry.target.getBoundingClientRect().height);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedTooth, readonly]);

  const updateToothField = (field: keyof ToothModel, value: any) => {
    if (!selectedTooth) return;
    const existing = data[selectedTooth] || { tooth_number: selectedTooth } as ToothModel;
    const updated = { ...existing, [field]: value };

    // Update local state immediately for instant feedback
    setData(prev => ({
      ...prev,
      [selectedTooth]: updated
    }));

    // Debounce database save to 600ms
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      handleSaveTooth(updated, true);
    }, 600);
  };

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
      dentalChartCache[patientId] = map;
      setData(map);
    } catch (err: any) {
      console.error('Error fetching dental chart:', err);
      toast.error('Hiba történt a státuszok betöltésekor.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    let active = true;
    console.log("[DentalChart] useEffect loadAll start for patient:", patientId);

    // If we have cached data, don't show full loading indicator to avoid flicker
    const hasCache = !!dentalChartCache[patientId];
    if (!hasCache) {
      setLoading(true);
    }

    const loadAll = async () => {
      try {
        console.log("[DentalChart] Starting parallel fetchChart and fetchMarkers...");
        await Promise.all([
          fetchChart(false),
          fetchMarkers()
        ]);
        console.log("[DentalChart] Parallel fetch completed.");
      } catch (err) {
        console.error('[DentalChart] Error loading dental data:', err);
      } finally {
        if (active) {
          setLoading(false);
          console.log("[DentalChart] Parallel fetch loadAll finished, loading set to false.");
        }
      }
    };
    loadAll();
    return () => {
      console.log("[DentalChart] useEffect loadAll cleanup for patient:", patientId);
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

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
        const telephelyId = profile?.current_telephely_id || profile?.telephely_id;
        if (telephelyId) {
          try {
            const allItems = await fetchCombinedTreatmentItems(telephelyId);
            const catalogItems = allItems.filter(item => itemIds.includes(item.id));

            catalogItems.forEach(ci => {
              cueMap[ci.id] = { visual_icon: ci.visual_icon, visual_color: ci.visual_color };
            });
          } catch (error) {
            console.error('Failed to fetch combined items for markers:', error);
          }
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

      treatmentMarkersCache[patientId] = map;
      setTreatmentMarkersMap(map);
    } catch (err) {
      console.error('Error fetching treatment markers:', err);
    }
  }, [patientId, profile]);

  // Refresh markers silently when profile loads or updates (e.g. telephely context is resolved)
  useEffect(() => {
    if (profile) {
      fetchMarkers();
    }
  }, [profile, fetchMarkers]);

  useEffect(() => {
    const handleUpdate = () => {
      fetchChart();
      fetchMarkers();
    };

    window.addEventListener('dental-chart-updated', handleUpdate);
    return () => window.removeEventListener('dental-chart-updated', handleUpdate);
  }, [fetchChart, fetchMarkers]);

  // ─── Supabase Realtime: keep all users in sync ───
  useEffect(() => {
    if (!patientId) return;

    const channel = supabase
      .channel(`dental_chart_patient_${patientId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'dental_chart',
          filter: `patient_id=eq.${patientId}`,
        },
        () => {
          fetchChart();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [patientId, fetchChart]);

  // ============ Click handling with multi-select ============

  const handleToothClick = useCallback((toothNum: string, event: React.MouseEvent) => {
    // FLIP: capture cross position BEFORE any state change so the FLIP animation
    // can animate from the true current position (e.g., centered) to the new one.
    if (crossInnerRef.current) {
      crossPrevRect.current = crossInnerRef.current.getBoundingClientRect();
    }

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
    // FLIP: capture cross position BEFORE state change
    if (crossInnerRef.current) {
      crossPrevRect.current = crossInnerRef.current.getBoundingClientRect();
    }
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

  // IMPORTANT: Hooks must be called before any early returns (Rules of Hooks).
  const isMultiSelect = selectedTeeth.length > 1;
  const isEditorOpen = ((isMultiSelect && !readonly) || (selectedTooth && !isMultiSelect && !readonly));
  const isSingleEditorOpen = !!(selectedTooth && !isMultiSelect && !readonly);

  // crossAtSide controls the cross's visual state (position, scale, padding).
  // Opening: set to true immediately via useEffect.
  // Closing: set to false ONLY after the panel exits the DOM (onExitComplete),
  // so margin:auto centers in the 100%-wide column, not the 62%-wide column.
  const [crossAtSide, setCrossAtSide] = useState(!!isEditorOpen);
  useEffect(() => {
    if (isEditorOpen) {
      setCrossAtSide(true);
    }
    // Closing is handled by onExitComplete below
  }, [isEditorOpen]);

  // The ideal (maximum) scale at which the teeth render.
  const idealScale = toothScale * 1.95;

  // Dynamically compute scale from container width.
  // Each tooth = 30px * scale, 16 teeth + gaps + divider + padding
  // Total width ≈ 480*scale + 88. Solving: scale = (availableWidth - 88) / 480
  useEffect(() => {
    const rightCol = rightColumnRef.current;
    if (!rightCol) return;

    const calcScale = () => {
      const margin = crossAtSide ? 20 : 0;
      const availableWidth = rightCol.clientWidth - margin;
      if (availableWidth <= 0) return;

      const maxScale = (availableWidth - 88) / 480;
      const newScale = Math.max(0.5, Math.min(idealScale, maxScale));
      setDynamicScale(newScale);
    };

    // Double-rAF ensures the browser has completed layout (including
    // animated panels entering/exiting) before we measure the container.
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(calcScale);
    });

    const observer = new ResizeObserver(calcScale);
    observer.observe(rightCol);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [loading, crossAtSide, isEditorOpen, idealScale]); // re-run when editor opens/closes

  // FLIP animation: after crossAtSide changes, measure position delta
  // and animate from old position to new.
  useLayoutEffect(() => {
    const el = crossInnerRef.current;
    const prevRect = crossPrevRect.current;
    if (!el || !prevRect) return;

    const newRect = el.getBoundingClientRect();
    const deltaX = prevRect.left - newRect.left;
    const deltaY = prevRect.top - newRect.top;

    if (Math.abs(deltaX) < 2 && Math.abs(deltaY) < 2) {
      crossPrevRect.current = null;
      return;
    }

    el.style.transition = 'none';
    el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.55s cubic-bezier(0.33, 1, 0.68, 1)';
        el.style.transform = '';
        crossPrevRect.current = null;
      });
    });
  }, [crossAtSide]);

  // Smooth Card height animation: FLIP approach to detect both growing AND shrinking.
  // Only activates after the first content change (not on initial render).
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const updateHeight = () => {
      const currentHeight = card.offsetHeight;
      // Temporarily remove explicit height to measure natural content height
      const prevTransition = card.style.transition;
      card.style.transition = 'none';
      card.style.height = 'auto';
      const naturalHeight = card.offsetHeight;

      if (Math.abs(naturalHeight - currentHeight) > 1) {
        // FLIP: restore old height, force reflow, then animate to new
        card.style.height = `${currentHeight}px`;
        void card.offsetHeight; // force reflow
        card.style.transition = 'height 0.4s cubic-bezier(0.33, 1, 0.68, 1)';
        card.style.height = `${naturalHeight}px`;
      } else {
        card.style.height = `${naturalHeight}px`;
        card.style.transition = 'height 0.4s cubic-bezier(0.33, 1, 0.68, 1)';
      }
    };

    // Initial measurement with a delay to let AnimatePresence animations settle
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(updateHeight);
    });

    // Also re-measure after a longer delay (for framer-motion animations ~350ms)
    const timeout = setTimeout(updateHeight, 400);

    const observer = new ResizeObserver(updateHeight);
    Array.from(card.children).forEach(child => observer.observe(child));

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [isEditorOpen, crossAtSide, selectedTooth]);

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
    <Card ref={cardRef} className="w-full border-border/50 shadow-sm" style={{ transition: 'height 0.4s cubic-bezier(0.33, 1, 0.68, 1)', overflow: 'clip' }}>
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

      <CardContent className={`w-full p-4 flex gap-6 justify-start ${isDesktop ? 'flex-row items-stretch' : 'flex-col-reverse'}`}>
        {/* Left Side: Editors */}
        <AnimatePresence mode="wait" onExitComplete={() => {
          // Panel is now fully removed from DOM. Column is 100% wide.
          // NOW it's safe to center the cross — margin:auto will center
          // in the full-width column, not the 62% column.
          if (!isEditorOpen) {
            if (crossInnerRef.current) {
              crossPrevRect.current = crossInnerRef.current.getBoundingClientRect();
            }
            setCrossAtSide(false);
          }
        }}>
          {isEditorOpen && (
            <motion.div
              key={selectedTooth || 'bulk'}
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              className={`flex flex-col gap-4 ${isDesktop ? 'w-[38%] shrink-0 min-h-0' : 'w-full'}`}
              style={isDesktop && rightHeight ? { height: `${rightHeight}px` } : undefined}
            >
              {/* Multi-select bulk toolbar */}
              {isMultiSelect && !readonly && (
                <div className="animate-in slide-in-from-left-2 fade-in duration-200">
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-blue-700 dark:text-blue-400">
                          {selectedTeeth.length} fog kijelölve
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5 break-all">
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
                            Híd
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
                <div className="h-full flex flex-col min-h-0">
                  <ToothEditorPanel
                    key={selectedTooth}
                    toothNumber={selectedTooth}
                    initialData={data[selectedTooth]}
                    onSave={(d) => {
                      // Auto-save silently, do not close the editor
                      handleSaveTooth(d, true);
                    }}
                    onCancel={() => {
                      // FLIP: capture cross position BEFORE state change
                      if (crossInnerRef.current) {
                        crossPrevRect.current = crossInnerRef.current.getBoundingClientRect();
                      }
                      setSelectedTooth(null);
                      setSelectedTeeth([]);
                    }}
                    className="h-full mt-0 flex-1 min-h-0"
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Side: The chart itself */}
        <div
          ref={rightColumnRef}
          className={`w-full min-w-0 flex flex-col gap-4 ${isDesktop ? 'flex-1' : ''} ${isSingleEditorOpen && isDesktop ? 'min-h-[880px]' : ''}`}
        >
          {readonly ? (
            <div className="w-full pt-4 pb-2 flex justify-center">
              <ZsigmondyCross
                data={data}
                onToothClick={handleToothClick}
                showBabyTeeth={showBabyTeeth}
                selectedTooth={selectedTooth}
                selectedTeeth={selectedTeeth}
                treatmentMarkersMap={treatmentMarkersMap}
                bridgePreview={bridgePreview}
                scale={dynamicScale}
              />
            </div>
          ) : (
            <div
              ref={crossWrapperRef}
              className="w-full flex justify-center"
              style={{
                paddingTop: crossAtSide ? '10px' : '16px',
                paddingBottom: crossAtSide ? '10px' : '8px',
                paddingLeft: crossAtSide ? '10px' : '0',
                paddingRight: crossAtSide ? '10px' : '0',
              }}
            >
              <div
                ref={crossInnerRef}
                style={{
                  marginLeft: crossAtSide ? '0' : 'auto',
                  marginRight: crossAtSide ? undefined : 'auto',
                }}
              >
                <ZsigmondyCross
                  data={data}
                  onToothClick={handleToothClick}
                  showBabyTeeth={showBabyTeeth}
                  selectedTooth={selectedTooth}
                  selectedTeeth={selectedTeeth}
                  treatmentMarkersMap={treatmentMarkersMap}
                  bridgePreview={bridgePreview}
                  scale={dynamicScale}
                />
              </div>
            </div>
          )}

          {/* Spacer to push clinical detail cards to the bottom on desktop */}
          {isSingleEditorOpen && isDesktop && (
            <div className="flex-1" />
          )}

          {/* Parodontológia & Protetika panels statically below the teeth when selected */}
          <AnimatePresence>
            {isSingleEditorOpen && (
              <motion.div
                key={`clinical-details-${selectedTooth}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="w-full flex flex-col gap-4 mt-4"
              >
                {/* Parodontológia & Tesztek Card */}
                <Card className="border shadow-sm overflow-hidden">
                  <div className="p-3 bg-muted/20 border-b">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Parodontológia & Tesztek</h4>
                  </div>
                  <CardContent className="p-5 bg-card grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Mobilitás (0-3)</Label>
                          <Select
                            value={data[selectedTooth]?.mobility?.toString() || '0'}
                            onValueChange={(v) => updateToothField('mobility', parseInt(v) || null)}
                          >
                            <SelectTrigger className="h-8"><SelectValue placeholder="-" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0 (Normál)</SelectItem>
                              <SelectItem value="1">I. fokú</SelectItem>
                              <SelectItem value="2">II. fokú</SelectItem>
                              <SelectItem value="3">III. fokú</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Tasakmélység (mm)</Label>
                          <Input
                            type="number" min="0" max="15" className="h-8"
                            value={data[selectedTooth]?.pocket_depth_mm || ''}
                            onChange={(e) => updateToothField('pocket_depth_mm', parseFloat(e.target.value) || null)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Ínyvisszahúzódás (mm)</Label>
                          <Input
                            type="number" min="0" max="15" className="h-8"
                            value={data[selectedTooth]?.gum_recession_mm || ''}
                            onChange={(e) => updateToothField('gum_recession_mm', parseFloat(e.target.value) || null)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="percuss"
                          checked={!!data[selectedTooth]?.percussion_sensitive}
                          onCheckedChange={(c) => updateToothField('percussion_sensitive', !!c)}
                        />
                        <Label htmlFor="percuss" className="cursor-pointer text-sm font-medium">Kopogtatás-érzékeny</Label>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Kopogtatási megjegyzés</Label>
                        <Input
                          className="h-8" placeholder="Pl. Érzékeny, tompa hang..."
                          value={data[selectedTooth]?.percussion || ''}
                          onChange={(e) => updateToothField('percussion', e.target.value || null)}
                        />
                      </div>
                      <div className="flex items-center space-x-2 pt-1">
                        <Checkbox
                          id="periap"
                          checked={!!data[selectedTooth]?.periapical_lesion}
                          onCheckedChange={(c) => updateToothField('periapical_lesion', !!c)}
                        />
                        <Label htmlFor="periap" className="cursor-pointer text-sm font-medium">Periapikális elváltozás látható</Label>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Érzékenység (Hideg, Meleg)</Label>
                        <Input
                          className="h-8" placeholder="Pl. Hidegre..."
                          value={data[selectedTooth]?.sensitivity || ''}
                          onChange={(e) => updateToothField('sensitivity', e.target.value || null)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Fogászati jelek (Kopás, Erózió)</Label>
                        <Input
                          className="h-8"
                          value={(data[selectedTooth]?.dental_signs || []).join(', ')}
                          onChange={(e) => {
                            const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                            updateToothField('dental_signs', arr.length > 0 ? arr : null);
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Protetika & Implantátum Card */}
                <Card className="border shadow-sm overflow-hidden">
                  <div className="p-3 bg-muted/20 border-b">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Protetika & Implantátum</h4>
                  </div>
                  <CardContent className="p-5 bg-card grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3 bg-muted/10 p-4 rounded-lg border">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase">Protetika</h4>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Típus</Label>
                        <Input
                          className="h-8" placeholder="Pl. Monolit Cirkon..."
                          value={data[selectedTooth]?.prosthetic_type || ''}
                          onChange={(e) => updateToothField('prosthetic_type', e.target.value || null)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Anyag</Label>
                          <Input
                            className="h-8"
                            value={data[selectedTooth]?.prosthetic_material || ''}
                            onChange={(e) => updateToothField('prosthetic_material', e.target.value || null)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Fogszín</Label>
                          <Input
                            className="h-8" placeholder="A2..."
                            value={data[selectedTooth]?.prosthetic_shade || ''}
                            onChange={(e) => updateToothField('prosthetic_shade', e.target.value || null)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 bg-blue-500/5 p-4 rounded-lg border border-blue-500/20">
                      <h4 className="text-xs font-bold text-blue-700/70 uppercase">Implantátum</h4>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Rendszer</Label>
                        <Input
                          className="h-8" placeholder="Pl. Straumann BLX"
                          value={data[selectedTooth]?.implant_system || ''}
                          onChange={(e) => updateToothField('implant_system', e.target.value || null)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Átmérő (mm)</Label>
                          <Input
                            className="h-8" type="number" step="0.1"
                            value={data[selectedTooth]?.implant_diameter || ''}
                            onChange={(e) => updateToothField('implant_diameter', parseFloat(e.target.value) || null)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Hossz (mm)</Label>
                          <Input
                            className="h-8" type="number" step="0.5"
                            value={data[selectedTooth]?.implant_length || ''}
                            onChange={(e) => updateToothField('implant_length', parseFloat(e.target.value) || null)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Beültetés dátuma</Label>
                        <WheelDatePicker
                          value={data[selectedTooth]?.implant_date || null}
                          onChange={(d) => updateToothField('implant_date', d)}
                          placeholder="Válasszon dátumot..."
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CardContent>
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
