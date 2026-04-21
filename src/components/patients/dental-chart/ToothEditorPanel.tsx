import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToothModel } from './types';
import { DENTAL_STATUSES, SURFACES } from './constants';

type Props = {
  toothNumber: string;
  initialData?: ToothModel;
  onSave: (data: ToothModel) => void;
  onCancel: () => void;
};

export function ToothEditorPanel({ toothNumber, initialData, onSave, onCancel }: Props) {
  const [data, setData] = useState<Partial<ToothModel>>({
    status: 'healthy',
    surfaces: null,
  });
  
  const [surfaceMap, setSurfaceMap] = useState<Record<string, string[]>>({});

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
          // legacy backwards compatibility
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
  }, [toothNumber, initialData]);

  const activeStatuses = data.status ? data.status.split(',') : [];
  const selectedStatusDef = DENTAL_STATUSES.find(s => s.id === (activeStatuses[0] || 'healthy'));
  // Removed global showSurfaces since it's now tracked per item
  
  // Decide which extra field groups to show based on group type
  // (Alternatively, show them all, but it looks cleaner to group them)
  const isImplant = selectedStatusDef?.group === 'Implant';
  const isProsthesis = ['Korona', 'Protézis', 'Híd'].includes(selectedStatusDef?.group || '');

  const groupedStatuses = DENTAL_STATUSES.reduce((acc, curr) => {
    if (!acc[curr.group]) acc[curr.group] = [];
    acc[curr.group].push(curr);
    return acc;
  }, {} as Record<string, typeof DENTAL_STATUSES>);

  const [lockedCategory, setLockedCategory] = useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<string>('');

  const displayCategory = lockedCategory !== null ? lockedCategory : hoveredCategory;

  const handleCategoryClick = (cat: string) => {
     if (lockedCategory === cat) {
        setLockedCategory(null); // Unlock
     } else {
        setLockedCategory(cat); // Lock
     }
     setHoveredCategory(cat);
  };

  const handleCategoryHover = (cat: string) => {
     if (lockedCategory === null) {
        setHoveredCategory(cat);
     }
  };

  const toggleStatus = (id: string) => {
    if (id === 'healthy') {
      setData({ ...data, status: 'healthy', surfaces: null });
      setSurfaceMap({});
      return;
    }
    const act = data.status ? data.status.split(',').filter(s => s !== 'healthy') : [];
    let newStatuses = act.includes(id) ? act.filter(s => s !== id) : [...act, id];
    
    if (newStatuses.length === 0) newStatuses = ['healthy'];
    setData({ ...data, status: newStatuses.join(',') });
    
    if (act.includes(id)) {
      const nm = {...surfaceMap};
      delete nm[id];
      setSurfaceMap(nm);
    }
  };

  const toggleSurface = (statusId: string, surfaceId: string) => {
     const currentForStatus = surfaceMap[statusId] || [];
     const newArr = currentForStatus.includes(surfaceId) 
        ? currentForStatus.filter(s => s !== surfaceId)
        : [...currentForStatus, surfaceId];
     setSurfaceMap({...surfaceMap, [statusId]: newArr});
  };

  const handleSave = () => {
    let finalData = { ...data, tooth_number: toothNumber } as ToothModel;
    
    const act = finalData.status ? finalData.status.split(',') : [];
    const validStatuses = act.filter(id => {
       const def = DENTAL_STATUSES.find(s => s.id === id);
       if (def?.hasSurfaces && (!surfaceMap[id] || surfaceMap[id].length === 0)) {
         return false;
       }
       return true;
    });

    finalData.status = validStatuses.length > 0 ? validStatuses.join(',') : 'healthy';

    const surfaceParts: string[] = [];
    validStatuses.forEach(id => {
       if (surfaceMap[id] && surfaceMap[id].length > 0) {
          surfaceParts.push(`${id}:${surfaceMap[id].join(',')}`);
       }
    });

    finalData.surfaces = surfaceParts.length > 0 ? surfaceParts.join('|') : null;
    onSave(finalData);
  };

  return (
    <div className="w-full bg-card rounded-xl border shadow-sm p-4 sm:p-6 mt-6 animate-in slide-in-from-bottom-2 fade-in duration-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 mb-4 gap-4">
        <div>
          <h3 className="text-xl font-bold">Fog szerkesztése: {toothNumber}</h3>
          <p className="text-muted-foreground text-sm">Részletes klinikai állapot és beavatkozások</p>
        </div>
        <div className="flex space-x-2 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={onCancel}>Bezárás</Button>
          <Button className="flex-1 sm:flex-none" onClick={handleSave}>Mentés</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Alap állapot */}
        <div className="space-y-6 col-span-1 border-r pr-6 border-border/40">
          <div className="space-y-4">
            <Label className="text-base">Kiválasztott Állapotok ({activeStatuses.includes('healthy') || activeStatuses.length === 0 ? 0 : activeStatuses.length})</Label>
            
            <div className="flex flex-col gap-3 p-4 bg-muted/20 border rounded-lg min-h-24 max-h-[460px] overflow-y-auto custom-scrollbar-purple">
              {activeStatuses.length === 0 || activeStatuses.includes('healthy') ? (
                 <div className="px-4 py-2 rounded-md bg-green-500/10 border-green-500/20 text-green-700 font-semibold inline-block w-fit">Egészséges</div>
              ) : (
                 activeStatuses.map(id => {
                    const sDef = DENTAL_STATUSES.find(s => s.id === id);
                    const isPending = sDef?.hasSurfaces && (!surfaceMap[id] || surfaceMap[id].length === 0);
                    const surfs = surfaceMap[id] ? surfaceMap[id].join(', ') : '';
                    return (
                      <div key={id} className={cn(
                        "px-4 py-3 rounded-md border font-semibold flex flex-col gap-1 w-full whitespace-normal break-words",
                        isPending ? "bg-orange-500/10 text-orange-700 border-orange-500/30" : "bg-card shadow-sm border-border"
                      )}>
                        <span className="text-[15px]">{sDef?.name || id} {isPending && <span className="text-orange-600 font-bold ml-1">(Hiányzó Felület!)</span>}</span>
                        {surfs && <span className="text-sm font-normal text-muted-foreground mt-1 tracking-wider uppercase">Felületek: <strong className="text-foreground">{surfs}</strong></span>}
                      </div>
                    )
                 })
              )}
            </div>

            <Dialog onOpenChange={(isOpen) => {
               if (!isOpen) {
                  setLockedCategory(null);
                  setHoveredCategory('');
               }
            }}>
              <DialogTrigger asChild>
                <Button className="w-full font-bold h-12 text-md mt-2 shadow-sm" variant="default">Állapotok Módosítása</Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl h-[90vh] overflow-hidden flex flex-col p-0 border shadow-lg sm:rounded-xl">
                <DialogHeader className="px-6 py-4 border-b bg-muted/30 shrink-0">
                  <DialogTitle className="text-xl">Állapotok és Felületek Részletes Kiválasztása</DialogTitle>
                </DialogHeader>
                
                <div className="relative flex-1 bg-muted/5">
                  <div className="absolute inset-0 flex">
                    {/* Bal Oldali Kategorizáló Menü */}
                    <div className="w-[35%] h-full overflow-y-auto border-r bg-muted/10 flex flex-col custom-scrollbar-purple">
                      <div 
                        className={cn(
                          "px-5 py-3 border-b cursor-pointer transition-all duration-200", 
                          displayCategory === '' ? "bg-green-500/20 border-r-4 border-r-green-600" : "hover:bg-green-500/10 hover:pr-3",
                          lockedCategory === '' && "bg-green-500/30"
                        )}
                        onClick={() => handleCategoryClick('')}
                        onMouseEnter={() => handleCategoryHover('')}
                      >
                        <div className="flex justify-between items-center">
                          <h4 className="font-bold text-green-700 text-[13px] tracking-wide uppercase">Alapállapot</h4>
                          {lockedCategory === '' && <Lock className="w-3.5 h-3.5 text-green-700" />}
                        </div>
                      </div>

                      {Object.keys(groupedStatuses).map(cat => (
                        <div 
                          key={cat}
                          className={cn(
                            "px-5 py-3 border-b cursor-pointer transition-all duration-200", 
                            displayCategory === cat ? "bg-background border-r-4 border-r-primary text-primary font-bold shadow-sm" : "hover:bg-muted/50 hover:pl-7 text-muted-foreground font-semibold",
                            lockedCategory === cat && "bg-primary/5"
                          )}
                          onClick={() => handleCategoryClick(cat)}
                          onMouseEnter={() => handleCategoryHover(cat)}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-[13px] tracking-wide uppercase">{cat}</span>
                            {lockedCategory === cat && <Lock className="w-3.5 h-3.5 text-primary" />}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Jobb Oldali Részletes Érték Választó */}
                    <div className="w-[65%] h-full overflow-y-auto bg-background/50 p-6 custom-scrollbar-purple">
                      {displayCategory === '' ? (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-200">
                          <h3 className="text-xl font-bold border-b pb-2 mb-6 text-green-700">Egészséges / Nincs eltérés</h3>
                          <div className="break-inside-avoid bg-green-50 rounded-lg border border-green-200 p-5 shadow-sm">
                             <div className="flex items-center space-x-3 p-1.5 rounded transition-colors">
                               <Checkbox 
                                 id="d-stat-healthy-main" 
                                 checked={activeStatuses.includes('healthy') || activeStatuses.length === 0} 
                                 onCheckedChange={() => toggleStatus('healthy')} 
                                 className="h-5 w-5 border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600" 
                               />
                               <Label htmlFor="d-stat-healthy-main" className="font-bold text-green-800 cursor-pointer text-base">Egészséges Fog (Minden mást töröl)</Label>
                             </div>
                             <p className="text-sm text-green-600/80 mt-2 ml-8">Ennek kiválasztásával a fogra regisztrált összes többi státusz és felület eltávolításra kerül.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-200 space-y-4">
                          <h3 className="text-xl font-bold border-b pb-2 mb-6">{displayCategory}</h3>
                          
                          {groupedStatuses[displayCategory]?.map(item => {
                            const isActive = activeStatuses.includes(item.id);
                            return (
                              <div key={item.id} className="bg-card rounded-lg border border-border/60 p-4 shadow-sm transition-all">
                                <div className={cn("flex items-start space-x-3 p-1.5 rounded transition-colors", isActive ? "bg-primary/5" : "hover:bg-muted/30")}>
                                  <Checkbox 
                                    id={`d-stat-main-${item.id}`} 
                                    checked={isActive} 
                                    onCheckedChange={() => toggleStatus(item.id)}
                                    className="h-5 w-5 mt-0.5" 
                                  />
                                  <Label htmlFor={`d-stat-main-${item.id}`} className={cn("font-semibold text-base cursor-pointer leading-tight", isActive && "font-bold text-primary")}>
                                    {item.name}
                                  </Label>
                                </div>
                                
                                {isActive && item.hasSurfaces && (
                                  <div className="animate-in slide-in-from-top-2 fade-in duration-200 ml-8 mt-3 p-3 bg-muted/20 shadow-inner rounded-md border border-border/70">
                                    <Label className="text-xs font-bold text-muted-foreground block mb-2 uppercase tracking-wider">Érintett Felületek:</Label>
                                    <div className="flex flex-wrap gap-3">
                                      {SURFACES.map((surf) => {
                                        const isChecked = surfaceMap[item.id]?.includes(surf.id);
                                        return (
                                          <div key={surf.id} className="flex items-center space-x-2 bg-background px-3 py-1.5 rounded shadow-sm border border-border/50 transition-colors hover:border-primary/50">
                                            <Checkbox 
                                              id={`d-surf-main-${item.id}-${surf.id}`}
                                              checked={isChecked}
                                              onCheckedChange={() => toggleSurface(item.id, surf.id)}
                                              className="h-4 w-4 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                            />
                                            <Label htmlFor={`d-surf-main-${item.id}-${surf.id}`} className="text-sm font-bold cursor-pointer">
                                              {surf.id}
                                            </Label>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2 pt-2">
            <Label>Megjegyzés (szabadon szöveges)</Label>
            <Textarea 
              className="resize-none h-20"
              placeholder="Ide írhatja a foggal kapcsolatos egyéb megjegyzéseket..."
              value={data.notes || ''}
              onChange={(e) => setData({...data, notes: e.target.value})}
            />
          </div>
        </div>

        {/* Parodontológia / Klinikai tesztek */}
        <div className="space-y-4 col-span-1">
          <h4 className="font-semibold border-b pb-1">Parodontológia és Tesztek</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Mobilitás (0-3)</Label>
              <Select value={data.mobility?.toString() || '0'} onValueChange={(v) => setData({...data, mobility: parseInt(v) || null })}>
                <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 (Normál)</SelectItem>
                  <SelectItem value="1">I. fokú</SelectItem>
                  <SelectItem value="2">II. fokú</SelectItem>
                  <SelectItem value="3">III. fokú</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Tasakmélység (mm)</Label>
              <Input 
                type="number" 
                min="0" max="15" 
                value={data.pocket_depth_mm || ''}
                onChange={(e) => setData({...data, pocket_depth_mm: parseFloat(e.target.value) || null})}
                placeholder="Pl. 3"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ínyvisszahúzódás (mm)</Label>
              <Input 
                type="number" 
                min="0" max="15" 
                value={data.gum_recession_mm || ''}
                onChange={(e) => setData({...data, gum_recession_mm: parseFloat(e.target.value) || null})}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center space-x-2 bg-muted/20 p-2 rounded border">
              <Checkbox id="percuss" checked={!!data.percussion_sensitive} onCheckedChange={(c) => setData({...data, percussion_sensitive: !!c})} />
              <Label htmlFor="percuss" className="cursor-pointer">Kopogtatás-érzékeny</Label>
            </div>
            {data.percussion_sensitive && (
              <Input 
                className="ml-6 w-[calc(100%-1.5rem)]"
                placeholder="Részletek (pl. axiális/horizontális)..." 
                value={data.percussion || ''}
                onChange={(e) => setData({...data, percussion: e.target.value || null})}
              />
            )}

            <div className="flex flex-col gap-2 mt-2">
              <Label>Érzékenység (Hideg, Meleg, Ráharapás)</Label>
              <Input 
                placeholder="Pl. Hidegre érzékeny..." 
                value={data.sensitivity || ''}
                onChange={(e) => setData({...data, sensitivity: e.target.value || null})}
              />
            </div>

            <div className="flex items-center space-x-2 bg-muted/20 p-2 rounded border mt-2">
              <Checkbox id="periap" checked={!!data.periapical_lesion} onCheckedChange={(c) => setData({...data, periapical_lesion: !!c})} />
              <Label htmlFor="periap" className="cursor-pointer">Periapikális elváltozás látható</Label>
            </div>
            
            <div className="flex flex-col gap-2 mt-2">
              <Label>Egyéb fogászati jelek (vesszővel elválasztva)</Label>
              <Input 
                placeholder="Pl. Kopás, Erózió..." 
                value={(data.dental_signs || []).join(', ')}
                onChange={(e) => {
                  const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                  setData({...data, dental_signs: arr.length > 0 ? arr : null});
                }}
              />
            </div>
          </div>
        </div>

        {/* Fogpótlás és Implantátum (Feltételes) */}
        <div className="space-y-4 col-span-1">
          <h4 className="font-semibold border-b pb-1">Specifikus adatok (Pótlás / Implant)</h4>
          
          <div className="space-y-4 bg-muted/10 p-3 rounded-lg border">
            <div className="space-y-2">
              <Label>Protetika Típusa</Label>
              <Input 
                placeholder="Pl. Monolit Cirkon..."
                value={data.prosthetic_type || ''}
                onChange={(e) => setData({...data, prosthetic_type: e.target.value || null})}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Anyag</Label>
                <Input value={data.prosthetic_material || ''} onChange={(e) => setData({...data, prosthetic_material: e.target.value || null})} />
              </div>
              <div className="space-y-2">
                <Label>Fogszín</Label>
                <Input value={data.prosthetic_shade || ''} placeholder="A2, A3..." onChange={(e) => setData({...data, prosthetic_shade: e.target.value || null})} />
              </div>
            </div>
          </div>
          
          <div className="space-y-4 bg-blue-500/5 p-3 rounded-lg border border-blue-500/20">
            <div className="space-y-2">
              <Label>Implantátum Rendszer</Label>
              <Input 
                placeholder="Pl. Straumann BLX"
                value={data.implant_system || ''}
                onChange={(e) => setData({...data, implant_system: e.target.value || null})}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Átmérő (mm)</Label>
                <Input type="number" step="0.1" value={data.implant_diameter || ''} onChange={(e) => setData({...data, implant_diameter: parseFloat(e.target.value) || null})} />
              </div>
              <div className="space-y-2">
                <Label>Hossz (mm)</Label>
                <Input type="number" step="0.5" value={data.implant_length || ''} onChange={(e) => setData({...data, implant_length: parseFloat(e.target.value) || null})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Beültetés dátuma</Label>
              <Input type="date" value={data.implant_date || ''} onChange={(e) => setData({...data, implant_date: e.target.value || null})} />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
