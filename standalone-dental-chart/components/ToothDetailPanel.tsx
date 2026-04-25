import {
  useDentalStore,
  STATUS_COLORS, STATUS_LABELS,
} from '../store/dentalStore';
import type { ToothStatus, ToothSurface } from '../store/dentalStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { X, Users } from 'lucide-react';

const STATUSES: ToothStatus[] = [
  'healthy', 'caries', 'filled', 'crown', 'bridge_anchor',
  'bridge_pontic', 'missing', 'implant', 'root_canal', 'extraction_planned',
];

const SURFACES: { key: ToothSurface; label: string }[] = [
  { key: 'mesial', label: 'M' },
  { key: 'distal', label: 'D' },
  { key: 'occlusal', label: 'O' },
  { key: 'buccal', label: 'B' },
  { key: 'lingual', label: 'L' },
];

export function ToothDetailPanel() {
  const {
    teeth, selectedTeeth, clearSelection,
    updateTooth, updateSurface, updateMultipleTeeth, updateMultipleSurfaces,
  } = useDentalStore();

  const isMultiSelect = selectedTeeth.length > 1;

  if (selectedTeeth.length === 0) {
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

  // Multi-selection mode
  if (isMultiSelect) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-4 w-4" />
              {selectedTeeth.length} fog kijelölve
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={clearSelection}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Fogak: {selectedTeeth.sort((a, b) => a - b).join(', ')}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Állapot módosítása (összes kijelölt fogra)</Label>
            <Select
              onValueChange={(value: ToothStatus) => {
                updateMultipleTeeth(selectedTeeth, { status: value });
                if (value === 'missing') {
                  updateMultipleTeeth(selectedTeeth, { present: false });
                } else {
                  const missing = selectedTeeth.filter((n) => !teeth[n]?.present);
                  if (missing.length > 0) updateMultipleTeeth(missing, { present: true });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Válasszon állapotot..." />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: STATUS_COLORS[status] }} />
                      {STATUS_LABELS[status]}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Felületek (összes kijelölt fogra)</Label>
            <div className="grid grid-cols-5 gap-2">
              {SURFACES.map(({ key, label }) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <span className="text-xs font-medium">{label}</span>
                  <button
                    className="w-8 h-8 rounded border-2 transition-all duration-150 hover:scale-110 bg-muted"
                    style={{ borderColor: 'hsl(var(--border))' }}
                    onClick={() => {
                      const first = teeth[selectedTeeth[0]];
                      if (first) {
                        const cur = first.surfaces[key];
                        const next = cur === 'healthy' ? 'caries' : cur === 'caries' ? 'filled' : 'healthy';
                        updateMultipleSurfaces(selectedTeeth, key, next);
                      }
                    }}
                    title={`${label}: állapotváltás`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Fogak jelen vannak</Label>
            <Switch
              checked={selectedTeeth.every((n) => teeth[n]?.present)}
              onCheckedChange={(checked) => updateMultipleTeeth(selectedTeeth, { present: checked })}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Single selection
  const tooth = teeth[selectedTeeth[0]];
  if (!tooth) return null;
  const sel = selectedTeeth[0];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Fog #{sel}</CardTitle>
          <Button variant="ghost" size="icon" onClick={clearSelection}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <Label htmlFor="present">Fog jelen van</Label>
          <Switch id="present" checked={tooth.present}
            onCheckedChange={(checked) => updateTooth(sel, { present: checked })} />
        </div>

        <div className="space-y-2">
          <Label>Állapot</Label>
          <Select value={tooth.status}
            onValueChange={(value: ToothStatus) => updateTooth(sel, { status: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: STATUS_COLORS[status] }} />
                    {STATUS_LABELS[status]}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Felületek</Label>
          <p className="text-xs text-muted-foreground mb-1">
            Kattintson a felületre — a kiválasztott állapotot alkalmazza.
          </p>
          <div className="grid grid-cols-5 gap-2">
            {SURFACES.map(({ key, label }) => (
              <div key={key} className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium">{label}</span>
                <button
                  className={`w-8 h-8 rounded border-2 transition-all duration-150 hover:scale-110 ${
                    tooth.surfaces[key] === tooth.status && tooth.status !== 'healthy'
                      ? 'ring-2 ring-offset-1 ring-primary' : ''
                  }`}
                  style={{
                    backgroundColor: STATUS_COLORS[tooth.surfaces[key]],
                    borderColor: tooth.surfaces[key] !== 'healthy'
                      ? STATUS_COLORS[tooth.surfaces[key]] : 'hsl(var(--border))',
                  }}
                  onClick={() => {
                    const newStatus = tooth.surfaces[key] === tooth.status ? 'healthy' : tooth.status;
                    updateSurface(sel, key, newStatus);
                  }}
                  title={`${label}: ${STATUS_LABELS[tooth.surfaces[key]]}`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Mozgathatóság</Label>
            <span className="text-sm font-medium">{tooth.mobility}</span>
          </div>
          <Slider value={[tooth.mobility]}
            onValueChange={([v]) => updateTooth(sel, { mobility: v })} max={3} step={1} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0</span><span>1</span><span>2</span><span>3</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Endodontia</Label>
          <Select value={tooth.endoStatus}
            onValueChange={(value: typeof tooth.endoStatus) => updateTooth(sel, { endoStatus: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nincs</SelectItem>
              <SelectItem value="treated">Gyökérkezelt</SelectItem>
              <SelectItem value="retreatment">Újrakezelés</SelectItem>
              <SelectItem value="planned">Tervezett</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Megjegyzések</Label>
          <Textarea id="notes" value={tooth.notes}
            onChange={(e) => updateTooth(sel, { notes: e.target.value })}
            placeholder="Írjon megjegyzést..." rows={3} />
        </div>
      </CardContent>
    </Card>
  );
}
