import { useDentalStore, ToothStatus, ToothSurface } from '@/stores/dentalStore';
import { STATUS_LABELS, STATUS_COLORS } from './ToothIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { X } from 'lucide-react';

const STATUSES: ToothStatus[] = [
  'healthy',
  'caries',
  'filled',
  'crown',
  'bridge_anchor',
  'bridge_pontic',
  'missing',
  'implant',
  'root_canal',
  'extraction_planned',
];

const SURFACES: { key: ToothSurface; label: string }[] = [
  { key: 'mesial', label: 'M' },
  { key: 'distal', label: 'D' },
  { key: 'occlusal', label: 'O' },
  { key: 'buccal', label: 'B' },
  { key: 'lingual', label: 'L' },
];

export function ToothDetailPanel() {
  const { teeth, selectedTooth, selectTooth, updateTooth, updateSurface } = useDentalStore();

  if (!selectedTooth) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground text-center">
            Válasszon egy fogat a részletek megtekintéséhez
          </p>
        </CardContent>
      </Card>
    );
  }

  const tooth = teeth[selectedTooth];
  if (!tooth) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Fog #{selectedTooth}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => selectTooth(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Present toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="present">Fog jelen van</Label>
          <Switch
            id="present"
            checked={tooth.present}
            onCheckedChange={(checked) =>
              updateTooth(selectedTooth, { present: checked })
            }
          />
        </div>

        {/* Main status */}
        <div className="space-y-2">
          <Label>Állapot</Label>
          <Select
            value={tooth.status}
            onValueChange={(value: ToothStatus) =>
              updateTooth(selectedTooth, { status: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: STATUS_COLORS[status] }}
                    />
                    {STATUS_LABELS[status]}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Surface statuses */}
        <div className="space-y-2">
          <Label>Felületek</Label>
          <div className="grid grid-cols-5 gap-2">
            {SURFACES.map(({ key, label }) => (
              <div key={key} className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium">{label}</span>
                <button
                  className="w-8 h-8 rounded border-2 transition-colors"
                  style={{
                    backgroundColor: STATUS_COLORS[tooth.surfaces[key]],
                    borderColor:
                      tooth.surfaces[key] !== 'healthy'
                        ? STATUS_COLORS[tooth.surfaces[key]]
                        : 'hsl(var(--border))',
                  }}
                  onClick={() => {
                    const currentIndex = STATUSES.indexOf(tooth.surfaces[key]);
                    const nextIndex = (currentIndex + 1) % STATUSES.length;
                    updateSurface(selectedTooth, key, STATUSES[nextIndex]);
                  }}
                  title={`${label}: ${STATUS_LABELS[tooth.surfaces[key]]}`}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Kattintson a felületre az állapot váltásához
          </p>
        </div>

        {/* Mobility */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Mozgathatóság</Label>
            <span className="text-sm font-medium">{tooth.mobility}</span>
          </div>
          <Slider
            value={[tooth.mobility]}
            onValueChange={([value]) =>
              updateTooth(selectedTooth, { mobility: value })
            }
            max={3}
            step={1}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0</span>
            <span>1</span>
            <span>2</span>
            <span>3</span>
          </div>
        </div>

        {/* Endo status */}
        <div className="space-y-2">
          <Label>Endodontia</Label>
          <Select
            value={tooth.endoStatus}
            onValueChange={(value: typeof tooth.endoStatus) =>
              updateTooth(selectedTooth, { endoStatus: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nincs</SelectItem>
              <SelectItem value="treated">Gyökérkezelt</SelectItem>
              <SelectItem value="retreatment">Újrakezelés</SelectItem>
              <SelectItem value="planned">Tervezett</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Megjegyzések</Label>
          <Textarea
            id="notes"
            value={tooth.notes}
            onChange={(e) =>
              updateTooth(selectedTooth, { notes: e.target.value })
            }
            placeholder="Írjon megjegyzést..."
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
