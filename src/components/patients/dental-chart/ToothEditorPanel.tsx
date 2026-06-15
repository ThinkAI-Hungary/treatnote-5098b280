import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Check, X, CheckCircle2, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { ToothModel } from './types';
import { DENTAL_STATUSES } from './constants';
import { SurfaceId } from './toothColors';

type Props = {
  toothNumber: string;
  initialData?: ToothModel;
  onSave: (data: ToothModel) => void;
  onCancel: () => void;
  className?: string;
};

// --- VISUAL SURFACE SELECTOR ---
function SurfaceDiagram({ 
  activeSurfaces, 
  onToggle, 
  baseColor = 'hsl(var(--primary))' 
}: { 
  activeSurfaces: string[]; 
  onToggle: (s: SurfaceId) => void;
  baseColor?: string;
}) {
  // SVG points for the 5-zone occlusal layout
  const zones: Record<SurfaceId, { d: string, label: string, cx: number, cy: number }> = {
    V: { d: "M 10 10 L 40 10 L 30 20 L 20 20 Z", label: "V", cx: 25, cy: 13 },
    L: { d: "M 20 30 L 30 30 L 40 40 L 10 40 Z", label: "L", cx: 25, cy: 37 },
    M: { d: "M 10 10 L 20 20 L 20 30 L 10 40 Z", label: "M", cx: 13, cy: 25 },
    D: { d: "M 40 10 L 30 20 L 30 30 L 40 40 Z", label: "D", cx: 37, cy: 25 },
    O: { d: "M 20 20 L 30 20 L 30 30 L 20 30 Z", label: "O", cx: 25, cy: 25 },
    C: { d: "M 5 5 L 45 5 L 45 45 L 5 45 Z", label: "C", cx: 25, cy: 25 } // Background ring for C
  };

  return (
    <div className="relative w-24 h-24 mx-auto select-none">
      <svg viewBox="0 0 50 50" className="w-full h-full drop-shadow-sm">
        {/* Cervical ring (drawn as background behind others if active) */}
        <path 
          d="M 5 5 L 45 5 L 45 45 L 5 45 Z" 
          fill={activeSurfaces.includes('C') ? baseColor : 'transparent'} 
          stroke="hsl(var(--border))" 
          strokeWidth="1"
          className="cursor-pointer transition-colors"
          onClick={() => onToggle('C')}
        />
        <text x={5} y={8} fontSize="4" fill="hsl(var(--muted-foreground))">C</text>
        
        {/* Inner 5 zones */}
        {(['V', 'D', 'L', 'M', 'O'] as SurfaceId[]).map(s => {
          const isActive = activeSurfaces.includes(s);
          const zone = zones[s];
          return (
            <g key={s} onClick={() => onToggle(s)} className="cursor-pointer group">
              <path 
                d={zone.d} 
                fill={isActive ? baseColor : 'hsl(var(--background))'} 
                stroke="rgba(0,0,0,0.15)" 
                strokeWidth="1"
                className="transition-colors group-hover:opacity-80"
              />
              <text 
                x={zone.cx} 
                y={zone.cy} 
                textAnchor="middle" 
                dominantBaseline="middle"
                fontSize="6"
                fontWeight="bold"
                fill={isActive ? 'white' : 'hsl(var(--muted-foreground))'}
              >
                {zone.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --- MAIN COMPONENT ---
export function ToothEditorPanel({ toothNumber, initialData, onSave, onCancel, className }: Props) {
  const [data, setData] = useState<Partial<ToothModel>>({
    status: 'healthy',
    surfaces: null,
  });
  const [surfaceMap, setSurfaceMap] = useState<Record<string, string[]>>({});
  
  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Caries': true,
    'Tömés': true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    if (initialData) {
      setData({ ...initialData });
      const initialMap: Record<string, string[]> = {};
      if (initialData.surfaces) {
        if (initialData.surfaces.includes(':')) {
          initialData.surfaces.split('|').forEach(part => {
             const [sId, sVals] = part.split(':');
             if (sId && sVals) initialMap[sId] = sVals.split(',');
          });
        } else {
          const stArray = initialData.status ? initialData.status.split(',') : [];
          const firstNeed = stArray.find(id => DENTAL_STATUSES.find(s => s.id === id)?.hasSurfaces);
          if (firstNeed) {
             initialMap[firstNeed] = initialData.surfaces.split(',');
          }
        }
      }
      setSurfaceMap(initialMap);
    } else {
      setData({ status: 'healthy', surfaces: null });
      setSurfaceMap({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toothNumber]);

  // --- Debounced save: only fires from explicit user actions ---
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const buildAndSave = useCallback((
    nextData: Partial<ToothModel>,
    nextSurfaceMap: Record<string, string[]>
  ) => {
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      try {
        let finalData = { ...nextData, tooth_number: toothNumber } as ToothModel;
        const act = finalData.status ? finalData.status.split(',') : [];
        finalData.status = act.length > 0 ? act.join(',') : 'healthy';

        const surfaceParts: string[] = [];
        act.forEach(id => {
          if (nextSurfaceMap[id] && nextSurfaceMap[id].length > 0) {
            surfaceParts.push(`${id}:${nextSurfaceMap[id].join(',')}`);
          }
        });
        finalData.surfaces = surfaceParts.length > 0 ? surfaceParts.join('|') : null;

        onSaveRef.current(finalData);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    }, 600);
  }, [toothNumber]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  const activeStatuses = data.status ? data.status.split(',').filter(s => s !== 'healthy') : [];

  const toggleStatus = (id: string) => {
    if (id === 'healthy') {
      const next = { ...data, status: 'healthy', surfaces: null };
      setData(next);
      setSurfaceMap({});
      buildAndSave(next, {});
      return;
    }
    const act = activeStatuses;
    let newStatuses = act.includes(id) ? act.filter(s => s !== id) : [...act, id];
    if (newStatuses.length === 0) newStatuses = ['healthy'];

    const next = { ...data, status: newStatuses.join(',') };
    let nextMap = surfaceMap;

    if (act.includes(id)) {
      nextMap = {...surfaceMap};
      delete nextMap[id];
    } else {
      const def = DENTAL_STATUSES.find(s => s.id === id);
      if (def && !expandedSections[def.group]) {
        setExpandedSections(prev => ({ ...prev, [def.group]: true }));
      }
    }

    setData(next);
    setSurfaceMap(nextMap);
    buildAndSave(next, nextMap);
  };

  const toggleSurface = (statusId: string, surfaceId: SurfaceId) => {
    const currentForStatus = surfaceMap[statusId] || [];
    const newArr = currentForStatus.includes(surfaceId)
      ? currentForStatus.filter(s => s !== surfaceId)
      : [...currentForStatus, surfaceId];
    const nextMap = { ...surfaceMap, [statusId]: newArr };
    setSurfaceMap(nextMap);
    buildAndSave(data, nextMap);
  };

  // Helper to update data fields with auto-save
  const updateField = <K extends keyof ToothModel>(field: K, value: ToothModel[K]) => {
    const next = { ...data, [field]: value };
    setData(next);
    buildAndSave(next, surfaceMap);
  };

  const groupedStatuses = DENTAL_STATUSES.reduce((acc, curr) => {
    if (!acc[curr.group]) acc[curr.group] = [];
    acc[curr.group].push(curr);
    return acc;
  }, {} as Record<string, typeof DENTAL_STATUSES>);



  return (
    <div className={cn("w-full bg-card rounded-xl border shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200 flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-4 bg-muted/20 rounded-t-xl sticky top-0 z-10 backdrop-blur-sm">
        <div>
          <h3 className="text-lg font-bold">Fog: <span className="text-primary">{toothNumber}</span></h3>
          <p className="text-muted-foreground text-xs">A változások automatikusan mentésre kerülnek.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 min-w-[100px] justify-end">
            {saveStatus === 'saving' && <span className="flex items-center text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin mr-1"/> Mentés...</span>}
            {saveStatus === 'saved' && <span className="flex items-center text-xs text-green-600 font-medium"><CheckCircle2 className="w-3.5 h-3.5 mr-1"/> Mentve</span>}
            {saveStatus === 'error' && <span className="flex items-center text-xs text-red-600 font-medium">Hiba a mentés során</span>}
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8 rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-0 divide-y md:divide-y-0 md:divide-x flex-1 min-h-0">
        
        {/* Left Col: Status Picker (Chips) */}
        <div className="md:col-span-8 p-5 md:h-full md:max-h-none overflow-y-auto custom-scrollbar-purple">
          
          <div className="mb-6">
            <Button 
              variant={activeStatuses.length === 0 ? "default" : "outline"}
              className={cn(
                "w-full justify-start font-bold h-auto py-2.5 whitespace-normal text-left flex items-center", 
                activeStatuses.length === 0 && "bg-green-600 hover:bg-green-700"
              )}
              onClick={() => toggleStatus('healthy')}
            >
              {activeStatuses.length === 0 && <Check className="w-4 h-4 mr-2 shrink-0" />}
              <span className="whitespace-normal break-words leading-tight text-left">Egészséges / Nincs eltérés (Minden törlése)</span>
            </Button>
          </div>

          <div className="space-y-2">
            {Object.entries(groupedStatuses).map(([groupName, statuses]) => {
              const isExpanded = expandedSections[groupName];
              const groupActiveStatuses = statuses.filter(s => activeStatuses.includes(s.id));
              const hasActiveInGroup = groupActiveStatuses.length > 0;

              return (
                <div key={groupName} className={cn("border rounded-lg overflow-hidden transition-all", hasActiveInGroup ? "border-primary/30 bg-primary/5" : "border-border/60")}>
                  <button 
                    className={cn(
                      "flex items-center justify-between w-full px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted/50",
                      hasActiveInGroup && "bg-primary/10"
                    )}
                    onClick={() => toggleSection(groupName)}
                  >
                    <span className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {groupName}
                      {hasActiveInGroup && (
                        <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full ml-2">
                          {groupActiveStatuses.length}
                        </span>
                      )}
                    </span>
                  </button>
                  
                  {isExpanded && (
                    <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                      {statuses.map(item => {
                        const isActive = activeStatuses.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            onClick={() => toggleStatus(item.id)}
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border",
                              isActive 
                                ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                                : "bg-card hover:bg-muted border-border/60 text-foreground"
                            )}
                          >
                            {item.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Surfaces & Context */}
        <div className="md:col-span-4 p-5 bg-muted/10 flex flex-col gap-6 md:h-full md:overflow-y-auto">
          
          {/* Active Statuses & Surfaces Summary */}
          <div>
            <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Felületek</h4>
            
            {activeStatuses.length === 0 ? (
               <p className="text-sm text-muted-foreground italic">Egészséges fog.</p>
            ) : (
               <div className="space-y-4">
                 {activeStatuses.map(id => {
                   const def = DENTAL_STATUSES.find(s => s.id === id);
                   if (!def?.hasSurfaces) return null; // Only show surface UI for statuses that need it
                   
                   const selectedSurfs = surfaceMap[id] || [];
                   
                   // Find a reasonable color for this status group to use in the diagram
                   let groupColor = 'hsl(var(--primary))';
                   if (def.group === 'Caries' || def.group.includes('Caries')) groupColor = '#ef4444';
                   if (def.group === 'Tömés') groupColor = '#3b82f6';
                   if (def.group === 'Betétek') groupColor = '#14b8a6';
                   if (def.group === 'Csonkfelépítés') groupColor = '#64748b';

                   return (
                     <div key={id} className="bg-card border rounded-lg p-3 shadow-sm">
                       <div className="font-semibold text-sm mb-2">{def.name}</div>
                       <SurfaceDiagram 
                         activeSurfaces={selectedSurfs} 
                         onToggle={(s) => toggleSurface(id, s as SurfaceId)} 
                         baseColor={groupColor}
                       />
                       <div className="mt-2 text-center text-xs text-muted-foreground font-medium h-4">
                         {selectedSurfs.length > 0 ? selectedSurfs.join(', ') : 'Válasszon felületet!'}
                       </div>
                     </div>
                   );
                 })}
                 
                 {!activeStatuses.some(id => DENTAL_STATUSES.find(s => s.id === id)?.hasSurfaces) && (
                    <p className="text-sm text-muted-foreground italic">A kiválasztott állapotokhoz nem tartozik felület.</p>
                 )}
               </div>
            )}
          </div>
          
          <div className="mt-auto space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Megjegyzés</Label>
            <Textarea 
              className="resize-none h-24 text-sm"
              placeholder="Foghoz tartozó egyedi megjegyzés..."
              value={data.notes || ''}
              onChange={(e) => updateField('notes', e.target.value || null)}
            />
          </div>

        </div>
      </div>


    </div>
  );
}
