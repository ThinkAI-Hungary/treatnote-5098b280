import { useDentalStore, FDI_UPPER_RIGHT, FDI_UPPER_LEFT, FDI_LOWER_LEFT, FDI_LOWER_RIGHT } from '@/stores/dentalStore';
import { ToothIcon } from './ToothIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DentalChart() {
  const { teeth, selectedTooth, selectTooth } = useDentalStore();

  const renderQuadrant = (toothNumbers: number[], label: string) => (
    <div className="flex flex-col items-center">
      <span className="text-xs text-muted-foreground mb-1">{label}</span>
      <div className="flex gap-0.5">
        {toothNumbers.map((num) => {
          const tooth = teeth[num];
          return (
            <ToothIcon
              key={num}
              toothNumber={num}
              status={tooth?.status || 'healthy'}
              isSelected={selectedTooth === num}
              present={tooth?.present ?? true}
              onClick={() => selectTooth(num)}
              size="md"
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">FDI Fogstátusz</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {/* Upper jaw */}
          <div className="flex justify-center gap-8">
            {renderQuadrant(FDI_UPPER_RIGHT, 'Jobb felső')}
            <div className="w-px bg-border" />
            {renderQuadrant(FDI_UPPER_LEFT, 'Bal felső')}
          </div>

          {/* Midline */}
          <div className="h-px bg-border mx-8" />

          {/* Lower jaw */}
          <div className="flex justify-center gap-8">
            {renderQuadrant(FDI_LOWER_RIGHT.slice().reverse(), 'Jobb alsó')}
            <div className="w-px bg-border" />
            {renderQuadrant(FDI_LOWER_LEFT.slice().reverse(), 'Bal alsó')}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2">Jelmagyarázat:</p>
          <div className="flex flex-wrap gap-3">
            <LegendItem color="hsl(var(--primary))" label="Egészséges" />
            <LegendItem color="#ef4444" label="Szuvas" />
            <LegendItem color="#3b82f6" label="Tömött" />
            <LegendItem color="#f59e0b" label="Korona" />
            <LegendItem color="#8b5cf6" label="Híd" />
            <LegendItem color="#9ca3af" label="Hiányzó" />
            <LegendItem color="#10b981" label="Implantátum" />
            <LegendItem color="#ec4899" label="Gyökérkezelt" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-3 h-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
