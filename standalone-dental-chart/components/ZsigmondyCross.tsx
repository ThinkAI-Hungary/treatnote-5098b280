import {
  useDentalStore,
  FDI_UPPER_RIGHT, FDI_UPPER_LEFT, FDI_LOWER_LEFT, FDI_LOWER_RIGHT,
  FDI_ALL_UPPER, FDI_ALL_LOWER, FDI_ALL,
  STATUS_COLORS,
} from '../store/dentalStore';
import type { ToothStatus } from '../store/dentalStore';
import { ZsigmondyToothCell } from './ZsigmondyToothCell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Maximize2, ArrowUp, ArrowDown, Link2, X, MousePointerClick } from 'lucide-react';

const LEGEND_ITEMS: { status: ToothStatus; label: string }[] = [
  { status: 'healthy', label: 'Egészséges' },
  { status: 'caries', label: 'Szuvas' },
  { status: 'filled', label: 'Tömött' },
  { status: 'crown', label: 'Korona' },
  { status: 'bridge_anchor', label: 'Híd pillér' },
  { status: 'bridge_pontic', label: 'Híd pótfog' },
  { status: 'missing', label: 'Hiányzó' },
  { status: 'implant', label: 'Implantátum' },
  { status: 'root_canal', label: 'Gyökérkezelt' },
  { status: 'extraction_planned', label: 'Extrakció terv.' },
];

export function ZsigmondyCross() {
  const {
    teeth, selectedTeeth, selectTooth, toggleToothSelection,
    selectMultipleTeeth, clearSelection, createBridge,
  } = useDentalStore();

  const isMultiSelect = selectedTeeth.length > 1;

  const handleToothClick = (num: number, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      toggleToothSelection(num);
    } else {
      selectTooth(num);
    }
  };

  const handleCreateBridge = () => {
    if (selectedTeeth.length < 2) return;
    const quadrants = new Set(selectedTeeth.map((n) => Math.floor(n / 10)));
    if (quadrants.size > 1) return;
    createBridge(selectedTeeth);
  };

  const renderQuadrant = (toothNumbers: number[], isUpper: boolean) => (
    <div className="flex gap-0.5">
      {toothNumbers.map((num) => {
        const tooth = teeth[num];
        if (!tooth) return null;
        return (
          <ZsigmondyToothCell
            key={num}
            toothNumber={num}
            tooth={tooth}
            isSelected={selectedTeeth.includes(num)}
            isMultiSelected={isMultiSelect && selectedTeeth.includes(num)}
            onClick={(e) => handleToothClick(num, e)}
            isUpper={isUpper}
          />
        );
      })}
    </div>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20" className="text-primary">
              <line x1="10" y1="2" x2="10" y2="18" stroke="currentColor" strokeWidth="2" />
              <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="2" />
            </svg>
            Zsigmondy-kereszt
          </CardTitle>
          {selectedTeeth.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedTeeth.length === 1 ? `Fog: ${selectedTeeth[0]}` : `${selectedTeeth.length} fog kijelölve`}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearSelection}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selection toolbar */}
        <div className="flex flex-wrap gap-1.5 p-2 bg-muted/30 rounded-lg border border-border/50">
          <span className="text-xs text-muted-foreground self-center mr-1 font-medium">Kijelölés:</span>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
            onClick={() => selectMultipleTeeth(FDI_ALL)}>
            <Maximize2 className="h-3 w-3" />Teljes szájüreg
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
            onClick={() => selectMultipleTeeth(FDI_ALL_UPPER)}>
            <ArrowUp className="h-3 w-3" />Felső
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
            onClick={() => selectMultipleTeeth(FDI_ALL_LOWER)}>
            <ArrowDown className="h-3 w-3" />Alsó
          </Button>
          <div className="w-px h-5 bg-border self-center mx-0.5" />
          <Button variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => selectMultipleTeeth(FDI_UPPER_RIGHT)}>Q1</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => selectMultipleTeeth(FDI_UPPER_LEFT)}>Q2</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => selectMultipleTeeth(FDI_LOWER_LEFT.slice().reverse())}>Q3</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => selectMultipleTeeth(FDI_LOWER_RIGHT)}>Q4</Button>
          {selectedTeeth.length >= 2 && (
            <>
              <div className="w-px h-5 bg-border self-center mx-0.5" />
              <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={handleCreateBridge}>
                <Link2 className="h-3 w-3" />Híd létrehozás
              </Button>
            </>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
          <MousePointerClick className="h-3 w-3" />
          Ctrl + kattintás = több fog kijelölése egyenként
        </p>

        <TooltipProvider delayDuration={200}>
          <div className="flex flex-col items-center">
            <div className="relative inline-flex flex-col">
              <div className="flex justify-between px-2 mb-1">
                <span className="text-[10px] text-muted-foreground/60 font-medium">Jobb felső (Q1)</span>
                <span className="text-[10px] text-muted-foreground/60 font-medium">Bal felső (Q2)</span>
              </div>
              <div className="flex items-end justify-center">
                <div className="border-r-2 border-b-2 border-foreground/20 pr-2 pb-2">
                  {renderQuadrant(FDI_UPPER_RIGHT, true)}
                </div>
                <div className="border-b-2 border-foreground/20 pl-2 pb-2">
                  {renderQuadrant(FDI_UPPER_LEFT, true)}
                </div>
              </div>
              <div className="flex items-start justify-center">
                <div className="border-r-2 border-foreground/20 pr-2 pt-2">
                  {renderQuadrant(FDI_LOWER_RIGHT, false)}
                </div>
                <div className="pl-2 pt-2">
                  {renderQuadrant(FDI_LOWER_LEFT.slice().reverse(), false)}
                </div>
              </div>
              <div className="flex justify-between px-2 mt-1">
                <span className="text-[10px] text-muted-foreground/60 font-medium">Jobb alsó (Q4)</span>
                <span className="text-[10px] text-muted-foreground/60 font-medium">Bal alsó (Q3)</span>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-border/50 w-full">
              <p className="text-xs text-muted-foreground mb-2">Jelmagyarázat:</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {LEGEND_ITEMS.map((item) => (
                  <div key={item.status} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm border border-border/50"
                      style={{ backgroundColor: STATUS_COLORS[item.status] }} />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
